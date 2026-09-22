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
  STORE_PRONUNCIATION_SCORE,
  STORE_RECORDING,
  STORE_RECORDING_BLOB,
  STORE_REFERENCE_PROSODY_PROFILE,
  STORE_SOURCE_WORD_ALIGNMENT,
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
        STORE_PRONUNCIATION_SCORE,
        STORE_REFERENCE_PROSODY_PROFILE,
        STORE_SOURCE_WORD_ALIGNMENT,
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

    const { loadMediaForPlayback } = await import('../lib/media-loader.js');
    const loaded = await loadMediaForPlayback('media-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.segments).toHaveLength(2);
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

    const { loadMediaForPlayback } = await import('../lib/media-loader.js');
    await expect(loadMediaForPlayback('media-1')).resolves.not.toBeNull();
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

describe('referenceProsodyProfile store migration', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('adds referenceProsodyProfile store when upgrading from v14', async () => {
    const v14 = await openDB(DB_NAME, 14, {
      upgrade(db) {
        createLegacyStores(db, { withByMediaId: true });
        const scoreStore = db.createObjectStore(STORE_PRONUNCIATION_SCORE, { keyPath: 'id' });
        scoreStore.createIndex('byRecordId', 'recordId', { unique: true });
        scoreStore.createIndex('byCreatedAt', 'createdAt');
      },
    });
    expect([...v14.objectStoreNames]).not.toContain(STORE_REFERENCE_PROSODY_PROFILE);
    v14.close();

    const { getDB } = await import('./index.js');
    const db = await getDB();

    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toContain(STORE_REFERENCE_PROSODY_PROFILE);
    expect([
      ...db
        .transaction(STORE_REFERENCE_PROSODY_PROFILE)
        .objectStore(STORE_REFERENCE_PROSODY_PROFILE).indexNames,
    ]).toContain('byMediaId');
  });
});

describe('sourceWordAlignment store migration', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('adds sourceWordAlignment store when upgrading from v15', async () => {
    const v15 = await openDB(DB_NAME, 15, {
      upgrade(db) {
        createLegacyStores(db, { withByMediaId: true });
        const scoreStore = db.createObjectStore(STORE_PRONUNCIATION_SCORE, { keyPath: 'id' });
        scoreStore.createIndex('byRecordId', 'recordId', { unique: true });
        scoreStore.createIndex('byCreatedAt', 'createdAt');
        const profileStore = db.createObjectStore(STORE_REFERENCE_PROSODY_PROFILE, {
          keyPath: 'id',
        });
        profileStore.createIndex('byMediaId', 'mediaId');
      },
    });
    expect([...v15.objectStoreNames]).not.toContain(STORE_SOURCE_WORD_ALIGNMENT);
    v15.close();

    const { getDB } = await import('./index.js');
    const db = await getDB();

    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toContain(STORE_SOURCE_WORD_ALIGNMENT);

    // Symptom the UI hits after align API success: put/get on this store.
    await expect(
      db.put(STORE_SOURCE_WORD_ALIGNMENT, {
        id: 'media-1:seg-a',
        mediaId: 'media-1',
        segmentId: 'seg-a',
        words: [{ word: 'hi', start: 0, end: 0.2 }],
        referenceText: 'hi',
        language: 'en',
        source: 'segment',
        createdAt: 1,
        updatedAt: 1,
      }),
    ).resolves.toBeDefined();
    expect([
      ...db
        .transaction(STORE_SOURCE_WORD_ALIGNMENT)
        .objectStore(STORE_SOURCE_WORD_ALIGNMENT).indexNames,
    ]).toContain('byMediaId');
  });

  it('repairs a stuck DB already at current version but missing the store', async () => {
    // v15 with full stores, then empty bump to 16 — version rises without the store
    // (local builds briefly did this). getDB at 17 must create it.
    const v15 = await openDB(DB_NAME, 15, {
      upgrade(db) {
        createLegacyStores(db, { withByMediaId: true });
        const errorLogStore = db.createObjectStore(STORE_ERROR_LOG, { keyPath: 'id' });
        errorLogStore.createIndex('byCreatedAt', 'createdAt');
        const playlistStore = db.createObjectStore('playlist', { keyPath: 'id' });
        playlistStore.createIndex('bySortOrder', 'sortOrder');
        const sentenceStore = db.createObjectStore('sentenceBank', { keyPath: 'id' });
        sentenceStore.createIndex('byContentHash', 'contentHash', { unique: true });
        sentenceStore.createIndex('byCreatedAt', 'createdAt');
        sentenceStore.createIndex('bySourceMediaId', 'sourceMediaId');
        db.createObjectStore('sentenceBankBlob', { keyPath: 'entryId' });
        const noiseStore = db.createObjectStore('noise', { keyPath: 'id' });
        noiseStore.createIndex('byCreatedAt', 'createdAt');
        noiseStore.createIndex('byContentHash', 'contentHash', { unique: true });
        db.createObjectStore('noiseBlob', { keyPath: 'noiseId' });
        const scoreStore = db.createObjectStore(STORE_PRONUNCIATION_SCORE, { keyPath: 'id' });
        scoreStore.createIndex('byRecordId', 'recordId', { unique: true });
        scoreStore.createIndex('byCreatedAt', 'createdAt');
        const profileStore = db.createObjectStore(STORE_REFERENCE_PROSODY_PROFILE, {
          keyPath: 'id',
        });
        profileStore.createIndex('byMediaId', 'mediaId');
      },
    });
    v15.close();

    const stuckAt16 = await openDB(DB_NAME, 16, {
      upgrade() {
        // Empty upgrade: version rises, sourceWordAlignment is still missing.
      },
    });
    expect([...stuckAt16.objectStoreNames]).not.toContain(STORE_SOURCE_WORD_ALIGNMENT);
    stuckAt16.close();

    const { getDB } = await import('./index.js');
    const db = await getDB();

    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toContain(STORE_SOURCE_WORD_ALIGNMENT);

    // Exact UI failure after align API success when the store is missing.
    await expect(
      db.put(STORE_SOURCE_WORD_ALIGNMENT, {
        id: 'media-1:seg-a',
        mediaId: 'media-1',
        segmentId: 'seg-a',
        words: [{ word: 'hi', start: 0, end: 0.2 }],
        referenceText: 'hi',
        language: 'en',
        source: 'segment',
        createdAt: 1,
        updatedAt: 1,
      }),
    ).resolves.toBeDefined();
  });
});
