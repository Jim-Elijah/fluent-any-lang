/* eslint-disable @typescript-eslint/no-unused-vars */
import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { MediaBlob, MediaItem } from '../types/models.js';

function makeMediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'media-1',
    title: 'Lesson 1',
    filename: 'lesson-1.mp3',
    size: 1024,
    type: 'audio',
    mimeType: 'audio/mpeg',
    duration: 120,
    createdAt: 1_000,
    hasSubtitles: false,
    ...overrides,
  };
}

describe('media-loader', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('returns null when media item is missing', async () => {
    const { loadMediaForPlayback } = await import('./media-loader.js');
    await expect(loadMediaForPlayback('missing')).resolves.toBeNull();
  });

  it('returns null when media blob is missing', async () => {
    const { addMedia } = await import('../db/media.js');
    const item = makeMediaItem();
    const db = await import('../db/index.js');
    const database = await db.getDB();
    await database.put('media', item);

    const { loadMediaForPlayback } = await import('./media-loader.js');
    await expect(loadMediaForPlayback(item.id)).resolves.toBeNull();
  });

  it('loads media with subtitle segments', async () => {
    const { addMedia } = await import('../db/media.js');
    const { addSubtitle } = await import('../db/subtitle.js');
    const item = makeMediaItem();
    const blob: MediaBlob = { mediaId: item.id, blob: new Blob(['audio'], { type: 'audio/mpeg' }) };

    await addMedia(item, blob);
    await addSubtitle({
      id: 'sub-1',
      title: item.title,
      filename: 'lesson-1.srt',
      type: 'srt',
      segments: [{ id: 's1', startTime: 0, endTime: 2, text: 'hello' }],
    });

    const { loadMediaForPlayback, loadPlaylistForPlayback } = await import('./media-loader.js');
    const loaded = await loadMediaForPlayback(item.id);

    expect(loaded?.item).toEqual(item);
    expect(loaded?.segments).toHaveLength(1);
    expect(await loadPlaylistForPlayback()).toHaveLength(1);
  });
});
