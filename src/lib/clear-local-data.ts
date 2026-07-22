import {
  countMedia,
  countNoise,
  countSentenceBankEntries,
  getAllPracticeSessions,
  getAllSubtitles,
  getPlaylistList,
  getRecordingList,
} from '../db/service.js';
import { getDB } from '../db/index.js';
import {
  STORE_MEDIA,
  STORE_MEDIA_BLOB,
  STORE_NOISE,
  STORE_NOISE_BLOB,
  STORE_PLAYLIST,
  STORE_PRACTICE_SESSION,
  STORE_RECORDING,
  STORE_RECORDING_BLOB,
  STORE_SENTENCE_BANK,
  STORE_SENTENCE_BANK_BLOB,
  STORE_SUBTITLE,
} from '../db/schema.js';
import { FAVORITES_PLAYLIST_ID, type Playlist } from '../types/models.js';

export type LocalDataCounts = {
  media: number;
  subtitles: number;
  recordings: number;
  sessions: number;
  playlists: number;
  sentenceBank: number;
  noise: number;
};

export function isLocalDataEmpty(counts: LocalDataCounts): boolean {
  return (
    counts.media === 0 &&
    counts.subtitles === 0 &&
    counts.recordings === 0 &&
    counts.sessions === 0 &&
    counts.playlists === 0 &&
    counts.sentenceBank === 0 &&
    counts.noise === 0
  );
}

export async function getLocalDataCounts(): Promise<LocalDataCounts> {
  const [media, subtitles, recordings, sessions, playlists, sentenceBank, noise] =
    await Promise.all([
      countMedia(),
      getAllSubtitles().then((rows) => rows.length),
      getRecordingList().then((rows) => rows.length),
      getAllPracticeSessions().then((rows) => rows.length),
      getPlaylistList().then((rows) => rows.filter((p) => p.id !== FAVORITES_PLAYLIST_ID).length),
      countSentenceBankEntries(),
      countNoise(),
    ]);

  return { media, subtitles, recordings, sessions, playlists, sentenceBank, noise };
}

const LEARNING_DATA_STORES = [
  STORE_MEDIA,
  STORE_MEDIA_BLOB,
  STORE_SUBTITLE,
  STORE_RECORDING,
  STORE_RECORDING_BLOB,
  STORE_PRACTICE_SESSION,
  STORE_PLAYLIST,
  STORE_SENTENCE_BANK,
  STORE_SENTENCE_BANK_BLOB,
  STORE_NOISE,
  STORE_NOISE_BLOB,
] as const;

async function seedFavoritesPlaylist(): Promise<void> {
  const db = await getDB();
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

/** Clears all learning library data. Keeps app settings, locale, and error logs. */
export async function clearAllLearningData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([...LEARNING_DATA_STORES], 'readwrite');
  await Promise.all(LEARNING_DATA_STORES.map((name) => tx.objectStore(name).clear()));
  await tx.done;
  await seedFavoritesPlaylist();
}
