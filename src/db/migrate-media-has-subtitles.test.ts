import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { MediaItem, SubtitleTrack } from '../types/models.js';
import { STORE_MEDIA, STORE_SUBTITLE } from './schema.js';

function makeMedia(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'media-1',
    title: 'Lesson',
    filename: 'lesson.mp3',
    size: 100,
    type: 'audio',
    mimeType: 'audio/mpeg',
    duration: 10,
    createdAt: 1,
    contentHash: 'hash',
    hasSubtitles: false,
    ...overrides,
  };
}

function makeSubtitle(overrides: Partial<SubtitleTrack> = {}): SubtitleTrack {
  return {
    id: 'sub-1',
    mediaId: 'media-1',
    title: 'Lesson',
    filename: 'lesson.srt',
    type: 'srt',
    contentHash: 'sub-hash',
    segments: [{ id: 's1', startTime: 0, endTime: 1, text: 'hi' }],
    ...overrides,
  };
}

describe('migrateMediaHasSubtitles', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('sets hasSubtitles true when Subtitle Track exists with segments', async () => {
    const { getDB } = await import('./index.js');
    const { migrateMediaHasSubtitles } = await import('./migrate-media-has-subtitles.js');
    const db = await getDB();

    await db.put(STORE_MEDIA, makeMedia({ hasSubtitles: false }));
    await db.put(STORE_SUBTITLE, makeSubtitle());

    await migrateMediaHasSubtitles(db);

    const media = await db.get(STORE_MEDIA, 'media-1');
    expect(media?.hasSubtitles).toBe(true);
  });

  it('sets hasSubtitles false when Subtitle Track is missing', async () => {
    const { getDB } = await import('./index.js');
    const { migrateMediaHasSubtitles } = await import('./migrate-media-has-subtitles.js');
    const db = await getDB();

    await db.put(STORE_MEDIA, makeMedia({ hasSubtitles: true }));

    await migrateMediaHasSubtitles(db);

    const media = await db.get(STORE_MEDIA, 'media-1');
    expect(media?.hasSubtitles).toBe(false);
  });

  it('sets hasSubtitles false when Subtitle Track has no segments', async () => {
    const { getDB } = await import('./index.js');
    const { migrateMediaHasSubtitles } = await import('./migrate-media-has-subtitles.js');
    const db = await getDB();

    await db.put(STORE_MEDIA, makeMedia({ hasSubtitles: true }));
    await db.put(STORE_SUBTITLE, makeSubtitle({ segments: [] }));

    await migrateMediaHasSubtitles(db);

    const media = await db.get(STORE_MEDIA, 'media-1');
    expect(media?.hasSubtitles).toBe(false);
  });

  it('is idempotent when already in sync', async () => {
    const { getDB } = await import('./index.js');
    const { migrateMediaHasSubtitles } = await import('./migrate-media-has-subtitles.js');
    const db = await getDB();

    await db.put(STORE_MEDIA, makeMedia({ hasSubtitles: true }));
    await db.put(STORE_SUBTITLE, makeSubtitle());

    await migrateMediaHasSubtitles(db);
    await migrateMediaHasSubtitles(db);

    const media = await db.get(STORE_MEDIA, 'media-1');
    expect(media?.hasSubtitles).toBe(true);
  });
});
