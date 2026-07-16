/* eslint-disable @typescript-eslint/no-unused-vars */
import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import { FAVORITES_PLAYLIST_ID, type MediaBlob, type MediaItem } from '../types/models.js';

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
      mediaId: item.id,
      title: item.title,
      filename: 'lesson-1.srt',
      type: 'srt',
      contentHash: 'sub-hash',
      segments: [{ id: 's1', startTime: 0, endTime: 2, text: 'hello' }],
    });

    const { loadMediaForPlayback, loadPlaylistForPlayback } = await import('./media-loader.js');
    const loaded = await loadMediaForPlayback(item.id);

    expect(loaded?.item).toEqual(item);
    expect(loaded?.segments).toHaveLength(1);

    // Playlist loader should return empty (no favorites entries).
    expect(await loadPlaylistForPlayback(FAVORITES_PLAYLIST_ID)).toHaveLength(0);
  });

  it('loads playlist with removed entries filtered out', async () => {
    const { addMedia } = await import('../db/media.js');
    const { addMediaToPlaylist, removeMediaFromPlaylist } = await import('../db/playlist.js');
    const { FAVORITES_PLAYLIST_ID } = await import('../types/models.js');

    const item1 = makeMediaItem({ id: 'media-1', title: 'Track 1' });
    const item2 = makeMediaItem({ id: 'media-2', title: 'Track 2' });
    const blob1: MediaBlob = { mediaId: item1.id, blob: new Blob(['audio']) };
    const blob2: MediaBlob = { mediaId: item2.id, blob: new Blob(['audio']) };

    await addMedia(item1, blob1);
    await addMedia(item2, blob2);
    await addMediaToPlaylist(FAVORITES_PLAYLIST_ID, item1.id);
    await addMediaToPlaylist(FAVORITES_PLAYLIST_ID, item2.id);

    // Remove item1 (soft).
    await removeMediaFromPlaylist(FAVORITES_PLAYLIST_ID, item1.id);

    const { loadPlaylistForPlayback } = await import('./media-loader.js');
    const playlist = await loadPlaylistForPlayback(FAVORITES_PLAYLIST_ID);

    expect(playlist).toHaveLength(1);
    expect(playlist[0]?.item.id).toBe(item2.id);
  });
});
