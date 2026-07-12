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
    contentHash: 'hash',
    ...overrides,
  };
}

function makeMediaBlob(mediaId: string): MediaBlob {
  return {
    mediaId,
    blob: new Blob(['audio-data'], { type: 'audio/mpeg' }),
  };
}

describe('media db', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('adds and retrieves media with blob', async () => {
    const { addMedia, getMedia, getMediaBlob } = await import('./media.js');
    const item = makeMediaItem();
    const blob = makeMediaBlob(item.id);

    await addMedia(item, blob);

    expect(await getMedia(item.id)).toEqual(item);
    const storedBlob = await getMediaBlob(item.id);
    expect(storedBlob).toBeDefined();
    expect(storedBlob?.type).toBe('audio/mpeg');
  });

  it('lists media ordered by createdAt descending', async () => {
    const { addMedia, getMediaList } = await import('./media.js');
    const older = makeMediaItem({ id: 'older', createdAt: 100, title: 'Older' });
    const newer = makeMediaItem({ id: 'newer', createdAt: 200, title: 'Newer' });

    await addMedia(older, makeMediaBlob(older.id));
    await addMedia(newer, makeMediaBlob(newer.id));

    const list = await getMediaList();
    expect(list.map((item) => item.id)).toEqual(['newer', 'older']);
  });

  it('deletes media and its blob', async () => {
    const { addMedia, deleteMedia, getMedia, getMediaBlob, countMedia } =
      await import('./media.js');
    const item = makeMediaItem();

    await addMedia(item, makeMediaBlob(item.id));
    expect(await countMedia()).toBe(1);

    await deleteMedia(item.id);

    expect(await getMedia(item.id)).toBeUndefined();
    expect(await getMediaBlob(item.id)).toBeUndefined();
    expect(await countMedia()).toBe(0);
  });
});
