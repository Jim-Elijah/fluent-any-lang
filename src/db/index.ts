import { openDB, type IDBPTransaction } from 'idb';

import {
  DB_NAME,
  DB_VERSION,
  STORE_ERROR_LOG,
  STORE_MEDIA,
  STORE_MEDIA_BLOB,
  STORE_PLAYLIST,
  STORE_PRACTICE_SESSION,
  STORE_RECORDING_BLOB,
  STORE_RECORDING,
  STORE_SUBTITLE,
  type AppDatabase,
  type FluentAnyLangDB,
} from './schema.js';
import type { MediaItem, Playlist, SubtitleTrack } from '../types/models.js';
import { FAVORITES_PLAYLIST_ID } from '../types/models.js';

let dbPromise: Promise<AppDatabase> | null = null;
let favoritesSeeded = false;

/** Reset dbPromise and favoritesSeeded for tests. */
export function resetDbPromise() {
  dbPromise = null;
  favoritesSeeded = false;
}

export function resetDbSingleton() {
  dbPromise = null;
  favoritesSeeded = false;
}

function preferSubtitle(a: SubtitleTrack, b: SubtitleTrack): SubtitleTrack {
  if (a.segments.length !== b.segments.length) {
    return a.segments.length > b.segments.length ? a : b;
  }
  if (a.type !== b.type) {
    return a.type === 'srt' ? a : b;
  }
  return a;
}

async function migrateSubtitlesToMediaId(
  // idb types the upgrade transaction store names loosely as string[]
  tx: IDBPTransaction<FluentAnyLangDB, ArrayLike<string>, 'versionchange'>,
): Promise<void> {
  const subtitleStore = tx.objectStore(STORE_SUBTITLE);
  const mediaStore = tx.objectStore(STORE_MEDIA);
  const titleIndex = mediaStore.index('byTitle');

  const existing = (await subtitleStore.getAll()) as Array<SubtitleTrack & { mediaId?: string }>;
  const chosen = new Map<string, SubtitleTrack>();

  for (const track of existing) {
    const candidates: SubtitleTrack[] = [];

    if (track.mediaId) {
      candidates.push(track as SubtitleTrack);
    } else {
      const mediaList = (await titleIndex.getAll(track.title)) as MediaItem[];
      for (const media of mediaList) {
        candidates.push({
          ...track,
          id: mediaList.length === 1 ? track.id : `${track.id}::${media.id}`,
          mediaId: media.id,
        });
      }
    }

    for (const candidate of candidates) {
      const prev = chosen.get(candidate.mediaId);
      chosen.set(candidate.mediaId, prev ? preferSubtitle(prev, candidate) : candidate);
    }
  }

  for (const track of existing) {
    await subtitleStore.delete(track.id);
  }
  for (const track of chosen.values()) {
    await subtitleStore.put(track);
  }

  if (![...subtitleStore.indexNames].includes('byMediaId')) {
    subtitleStore.createIndex('byMediaId', 'mediaId', { unique: true });
  }
}

export function getDB(): Promise<AppDatabase> {
  if (!dbPromise) {
    dbPromise = openDB<FluentAnyLangDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        // media metadata
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
          mediaStore.createIndex('byCreatedAt', 'createdAt');
          mediaStore.createIndex('byTitle', 'title', { unique: false });
        }
        // media blob

        if (!db.objectStoreNames.contains(STORE_MEDIA_BLOB)) {
          db.createObjectStore(STORE_MEDIA_BLOB, { keyPath: 'mediaId' });
        }

        // subtitle
        if (!db.objectStoreNames.contains(STORE_SUBTITLE)) {
          const subtitleStore = db.createObjectStore(STORE_SUBTITLE, { keyPath: 'id' });
          subtitleStore.createIndex('byTitle', 'title', { unique: false });
          subtitleStore.createIndex('byMediaId', 'mediaId', { unique: true });
        }

        // recording metadata
        if (!db.objectStoreNames.contains(STORE_RECORDING)) {
          const recordingsStore = db.createObjectStore(STORE_RECORDING, { keyPath: 'id' });
          recordingsStore.createIndex('byMediaId', 'mediaId');
          recordingsStore.createIndex('byCreatedAt', 'createdAt');
        }
        // recording blob
        if (!db.objectStoreNames.contains(STORE_RECORDING_BLOB)) {
          db.createObjectStore(STORE_RECORDING_BLOB, { keyPath: 'recordId' });
        }

        // practice time sessions (analytics)
        if (!db.objectStoreNames.contains(STORE_PRACTICE_SESSION)) {
          const sessionStore = db.createObjectStore(STORE_PRACTICE_SESSION, { keyPath: 'id' });
          sessionStore.createIndex('byDateKey', 'dateKey');
          sessionStore.createIndex('byMediaId', 'mediaId');
          sessionStore.createIndex('byMode', 'mode');
          sessionStore.createIndex('byStartedAt', 'startedAt');
        }

        // error / exception diagnostics
        if (!db.objectStoreNames.contains(STORE_ERROR_LOG)) {
          const errorLogStore = db.createObjectStore(STORE_ERROR_LOG, { keyPath: 'id' });
          errorLogStore.createIndex('byCreatedAt', 'createdAt');
        }

        // playlist
        if (!db.objectStoreNames.contains(STORE_PLAYLIST)) {
          const playlistStore = db.createObjectStore(STORE_PLAYLIST, { keyPath: 'id' });
          playlistStore.createIndex('bySortOrder', 'sortOrder');
        }

        // v3 briefly shipped without byMediaId for some upgrades; re-run through v4.
        if (oldVersion > 0 && oldVersion < 4 && transaction) {
          await migrateSubtitlesToMediaId(transaction);
        }
      },
    })
      .then(async (db) => {
        // Seed empty favorites once after opening v7 DB.
        if (!favoritesSeeded) {
          const existing = await db.get(STORE_PLAYLIST, FAVORITES_PLAYLIST_ID);
          if (!existing) {
            const favorites: Playlist = {
              id: FAVORITES_PLAYLIST_ID,
              name: '喜欢',
              kind: 'favorites',
              sortOrder: 0,
              entries: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            await db.put(STORE_PLAYLIST, favorites);
          }
          favoritesSeeded = true;
        }
        return db;
      })
      .catch((error) => {
        dbPromise = null;
        throw error;
      });
  }

  return dbPromise;
}
