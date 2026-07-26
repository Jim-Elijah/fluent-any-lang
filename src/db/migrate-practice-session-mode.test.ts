import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';

import { resetDatabase } from '../test/db-helpers.js';
import { migratePracticeSessionListeningToFreeDb } from './migrate-practice-session-mode.js';
import { getDB, resetDbPromise } from './index.js';
import {
  DB_NAME,
  DB_VERSION,
  STORE_MEDIA,
  STORE_MEDIA_BLOB,
  STORE_PRACTICE_SESSION,
  STORE_RECORDING,
  STORE_RECORDING_BLOB,
  STORE_SUBTITLE,
} from './schema.js';

describe('migratePracticeSessionListeningToFree', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('rewrites listening → free outside upgrade', async () => {
    const db = await getDB();
    await db.put(STORE_PRACTICE_SESSION, {
      id: 'legacy-1',
      mediaId: 'm1',
      mediaTitle: 'Song',
      mediaType: 'audio',
      mediaFilename: 'Song.mp3',
      mode: 'listening',
      startedAt: 1,
      endedAt: 2,
      activeMs: 1000,
      dateKey: '2026-07-12',
    } as never);
    await db.put(STORE_PRACTICE_SESSION, {
      id: 'ok-1',
      mediaId: 'm1',
      mediaTitle: 'Song',
      mediaType: 'audio',
      mediaFilename: 'Song.mp3',
      mode: 'echo',
      startedAt: 3,
      endedAt: 4,
      activeMs: 1000,
      dateKey: '2026-07-12',
    });

    await migratePracticeSessionListeningToFreeDb(db);

    expect((await db.get(STORE_PRACTICE_SESSION, 'legacy-1'))?.mode).toBe('free');
    expect((await db.get(STORE_PRACTICE_SESSION, 'ok-1'))?.mode).toBe('echo');
    expect(
      (await db.getAllFromIndex(STORE_PRACTICE_SESSION, 'byMode', 'free')).map((s) => s.id),
    ).toEqual(['legacy-1']);
  });

  it('migrates on upgrade from v12 to current', async () => {
    const v12 = await openDB(DB_NAME, 12, {
      upgrade(db) {
        const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
        mediaStore.createIndex('byCreatedAt', 'createdAt');
        mediaStore.createIndex('byTitle', 'title', { unique: false });
        db.createObjectStore(STORE_MEDIA_BLOB, { keyPath: 'mediaId' });
        const subtitleStore = db.createObjectStore(STORE_SUBTITLE, { keyPath: 'id' });
        subtitleStore.createIndex('byTitle', 'title', { unique: false });
        subtitleStore.createIndex('byMediaId', 'mediaId', { unique: true });
        const recordingsStore = db.createObjectStore(STORE_RECORDING, { keyPath: 'id' });
        recordingsStore.createIndex('byMediaId', 'mediaId');
        recordingsStore.createIndex('byCreatedAt', 'createdAt');
        db.createObjectStore(STORE_RECORDING_BLOB, { keyPath: 'recordId' });
        const sessionStore = db.createObjectStore(STORE_PRACTICE_SESSION, { keyPath: 'id' });
        sessionStore.createIndex('byDateKey', 'dateKey');
        sessionStore.createIndex('byMediaId', 'mediaId');
        sessionStore.createIndex('byMode', 'mode');
        sessionStore.createIndex('byStartedAt', 'startedAt');
      },
    });

    await v12.put(STORE_PRACTICE_SESSION, {
      id: 'from-v12',
      mediaId: 'm1',
      mediaTitle: 'Old',
      mediaType: 'audio',
      mediaFilename: 'Old.mp3',
      mode: 'listening',
      startedAt: 10,
      endedAt: 20,
      activeMs: 5000,
      dateKey: '2026-07-01',
    });
    v12.close();
    resetDbPromise();

    const db = await getDB();
    expect(db.version).toBe(DB_VERSION);
    expect((await db.get(STORE_PRACTICE_SESSION, 'from-v12'))?.mode).toBe('free');
  });
});
