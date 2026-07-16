import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import {
  DB_NAME,
  DB_VERSION,
  STORE_ERROR_LOG,
  STORE_MEDIA,
  STORE_MEDIA_BLOB,
  STORE_PRACTICE_SESSION,
  STORE_RECORDING,
  STORE_RECORDING_BLOB,
  STORE_SUBTITLE,
} from './schema.js';

function createLegacyStores(
  db: Parameters<NonNullable<Parameters<typeof openDB>[2]>['upgrade']>[0],
  options: { withByMediaId?: boolean } = {},
): void {
  const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
  mediaStore.createIndex('byCreatedAt', 'createdAt');
  mediaStore.createIndex('byTitle', 'title', { unique: false });
  db.createObjectStore(STORE_MEDIA_BLOB, { keyPath: 'mediaId' });
  const subtitleStore = db.createObjectStore(STORE_SUBTITLE, { keyPath: 'id' });
  subtitleStore.createIndex('byTitle', 'title', { unique: false });
  if (options.withByMediaId) {
    subtitleStore.createIndex('byMediaId', 'mediaId', { unique: true });
  }
  const recordingsStore = db.createObjectStore(STORE_RECORDING, { keyPath: 'id' });
  recordingsStore.createIndex('byMediaId', 'mediaId');
  recordingsStore.createIndex('byCreatedAt', 'createdAt');
  db.createObjectStore(STORE_RECORDING_BLOB, { keyPath: 'recordId' });
  const sessionStore = db.createObjectStore(STORE_PRACTICE_SESSION, { keyPath: 'id' });
  sessionStore.createIndex('byDateKey', 'dateKey');
  sessionStore.createIndex('byMediaId', 'mediaId');
  sessionStore.createIndex('byMode', 'mode');
  sessionStore.createIndex('byStartedAt', 'startedAt');
}

describe('getDB', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('opens database with expected stores and indexes', async () => {
    const { getDB } = await import('./index.js');
    const db = await getDB();

    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toEqual(
      expect.arrayContaining([
        STORE_MEDIA,
        STORE_MEDIA_BLOB,
        STORE_SUBTITLE,
        STORE_RECORDING,
        STORE_RECORDING_BLOB,
        STORE_PRACTICE_SESSION,
        STORE_ERROR_LOG,
      ]),
    );

    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const store = tx.objectStore(STORE_MEDIA);
    expect([...store.indexNames]).toEqual(expect.arrayContaining(['byCreatedAt', 'byTitle']));
    await tx.done;

    const subtitleTx = db.transaction(STORE_SUBTITLE, 'readonly');
    const subtitleStore = subtitleTx.objectStore(STORE_SUBTITLE);
    expect([...subtitleStore.indexNames]).toEqual(expect.arrayContaining(['byTitle', 'byMediaId']));
    await subtitleTx.done;

    const sessionTx = db.transaction(STORE_PRACTICE_SESSION, 'readonly');
    const sessionStore = sessionTx.objectStore(STORE_PRACTICE_SESSION);
    expect([...sessionStore.indexNames]).toEqual(
      expect.arrayContaining(['byDateKey', 'byMediaId', 'byMode', 'byStartedAt']),
    );
    await sessionTx.done;
  });

  it('returns the same singleton promise', async () => {
    const { getDB } = await import('./index.js');
    expect(getDB()).toBe(getDB());
  });
});

describe('subtitle mediaId migration', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('migrates v2 same-title subtitles onto one mediaId', async () => {
    const v2 = await openDB(DB_NAME, 2, {
      upgrade(db) {
        createLegacyStores(db);
      },
    });

    await v2.put(STORE_MEDIA, {
      id: 'media-1',
      title: 'Lesson 1',
      filename: 'lesson-1.mp3',
      size: 10,
      type: 'audio',
      mimeType: 'audio/mpeg',
      duration: 1,
      createdAt: 1,
      hasSubtitles: true,
    });
    await v2.put(STORE_MEDIA_BLOB, { mediaId: 'media-1', blob: new Blob(['x']) });
    await v2.put(STORE_SUBTITLE, {
      id: 'sub-srt',
      title: 'Lesson 1',
      filename: 'lesson-1.srt',
      type: 'srt',
      segments: [
        { id: 's1', startTime: 0, endTime: 1, text: 'hi' },
        { id: 's2', startTime: 1, endTime: 2, text: 'there' },
      ],
    });
    await v2.put(STORE_SUBTITLE, {
      id: 'sub-lrc',
      title: 'Lesson 1',
      filename: 'lesson-1.lrc',
      type: 'lrc',
      segments: [{ id: 's1', startTime: 0, endTime: 1, text: 'hi' }],
    });
    v2.close();

    const { getDB } = await import('./index.js');
    const db = await getDB();

    expect(db.version).toBe(DB_VERSION);
    expect([...db.transaction(STORE_SUBTITLE).objectStore(STORE_SUBTITLE).indexNames]).toContain(
      'byMediaId',
    );

    const track = await db.getFromIndex(STORE_SUBTITLE, 'byMediaId', 'media-1');
    expect(track?.mediaId).toBe('media-1');
    expect(track?.type).toBe('srt');
    expect(track?.segments).toHaveLength(2);
    expect(await db.getAll(STORE_SUBTITLE)).toHaveLength(1);

    const { loadPlaylistForPlayback } = await import('../lib/media-loader.js');
    const playlist = await loadPlaylistForPlayback();
    expect(playlist).toHaveLength(1);
    expect(playlist[0]?.segments).toHaveLength(2);
  });

  it('repairs stuck v3 DB that is missing byMediaId index', async () => {
    const stuck = await openDB(DB_NAME, 3, {
      upgrade(db) {
        createLegacyStores(db);
      },
    });

    await stuck.put(STORE_MEDIA, {
      id: 'media-1',
      title: 'Lesson 1',
      filename: 'lesson-1.mp3',
      size: 10,
      type: 'audio',
      mimeType: 'audio/mpeg',
      duration: 1,
      createdAt: 1,
      hasSubtitles: true,
    });
    await stuck.put(STORE_MEDIA_BLOB, { mediaId: 'media-1', blob: new Blob(['x']) });
    await stuck.put(STORE_SUBTITLE, {
      id: 'sub-1',
      title: 'Lesson 1',
      filename: 'lesson-1.srt',
      type: 'srt',
      segments: [{ id: 's1', startTime: 0, endTime: 1, text: 'hi' }],
    });
    stuck.close();

    const { getDB } = await import('./index.js');
    const db = await getDB();

    expect(db.version).toBe(DB_VERSION);
    expect([...db.transaction(STORE_SUBTITLE).objectStore(STORE_SUBTITLE).indexNames]).toContain(
      'byMediaId',
    );

    const { getSubtitle } = await import('./subtitle.js');
    const track = await getSubtitle('media-1');
    expect(track?.segments).toHaveLength(1);

    const { loadPlaylistForPlayback } = await import('../lib/media-loader.js');
    expect(await loadPlaylistForPlayback()).toHaveLength(1);
  });
});

describe('errorLog store migration', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('adds errorLog store when upgrading from v5 without it', async () => {
    const v5 = await openDB(DB_NAME, 5, {
      upgrade(db) {
        createLegacyStores(db, { withByMediaId: true });
      },
    });
    expect([...v5.objectStoreNames]).not.toContain(STORE_ERROR_LOG);
    v5.close();

    const { getDB } = await import('./index.js');
    const db = await getDB();

    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toContain(STORE_ERROR_LOG);
    expect([...db.transaction(STORE_ERROR_LOG).objectStore(STORE_ERROR_LOG).indexNames]).toContain(
      'byCreatedAt',
    );
  });
});
