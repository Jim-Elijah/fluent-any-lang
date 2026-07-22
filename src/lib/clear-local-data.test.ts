import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getDB, resetDbPromise } from '../db/index.js';
import { STORE_MEDIA, STORE_PLAYLIST, STORE_RECORDING, STORE_SENTENCE_BANK } from '../db/schema.js';
import { addMedia, addPracticeSession, createPlaylist, saveRecording } from '../db/service.js';
import {
  FAVORITES_PLAYLIST_ID,
  type MediaItem,
  type PracticeRecord,
  type PracticeSession,
} from '../types/models.js';
import { clearAllLearningData, getLocalDataCounts, isLocalDataEmpty } from './clear-local-data.js';

function makeMedia(id = 'media-1'): MediaItem {
  return {
    id,
    title: 'Lesson',
    filename: 'lesson.mp3',
    size: 10,
    type: 'audio',
    mimeType: 'audio/mpeg',
    duration: 12,
    createdAt: 1,
    contentHash: 'hash-media',
    hasSubtitles: true,
  };
}

function makeRecording(id = 'rec-1', mediaId = 'media-1'): PracticeRecord {
  return {
    id,
    mediaId,
    mediaTitle: 'Lesson',
    mediaFilename: 'lesson.mp3',
    mode: 'shadowing',
    mimeType: 'audio/webm',
    createdAt: 2,
    sourceDuration: 1,
    recordingDuration: 1,
    segments: [],
  };
}

function makeSession(id = 'sess-1', mediaId = 'media-1'): PracticeSession {
  return {
    id,
    mediaId,
    mediaTitle: 'Lesson',
    mediaType: 'audio',
    mediaFilename: 'lesson.mp3',
    mode: 'shadowing',
    startedAt: 3,
    endedAt: 8,
    activeMs: 5,
    dateKey: '2026-01-01',
  };
}

describe('clear-local-data', () => {
  beforeEach(async () => {
    resetDbPromise();
    const db = await getDB();
    const stores = [STORE_MEDIA, STORE_RECORDING, STORE_SENTENCE_BANK, STORE_PLAYLIST] as const;
    const tx = db.transaction(stores, 'readwrite');
    await Promise.all(stores.map((name) => tx.objectStore(name).clear()));
    await tx.done;
  });

  afterEach(() => {
    resetDbPromise();
  });

  it('reports counts and clears learning data while keeping favorites playlist', async () => {
    await addMedia(makeMedia(), { mediaId: 'media-1', blob: new Blob(['audio']) });
    await saveRecording(makeRecording(), new Blob(['rec']));
    await addPracticeSession(makeSession());
    await createPlaylist('My list');

    const before = await getLocalDataCounts();
    expect(before.media).toBe(1);
    expect(before.recordings).toBe(1);
    expect(before.sessions).toBe(1);
    expect(before.playlists).toBe(1);
    expect(isLocalDataEmpty(before)).toBe(false);

    await clearAllLearningData();

    const after = await getLocalDataCounts();
    expect(after.media).toBe(0);
    expect(after.recordings).toBe(0);
    expect(after.sessions).toBe(0);
    expect(after.playlists).toBe(0);
    expect(isLocalDataEmpty(after)).toBe(true);

    const db = await getDB();
    const favorites = await db.get(STORE_PLAYLIST, FAVORITES_PLAYLIST_ID);
    expect(favorites?.kind).toBe('favorites');
  });
});
