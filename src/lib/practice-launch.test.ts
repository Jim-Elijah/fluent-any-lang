import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { MediaItem } from '../types/models.js';

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

describe('practice-launch', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('resolvePracticeRouteQuery drops playlist when media is not in list', async () => {
    const { addMedia } = await import('../db/media.js');
    const { createPlaylist, addMediaToPlaylist } = await import('../db/playlist.js');
    const item = makeMediaItem({ id: 'solo' });
    await addMedia(item, { mediaId: item.id, blob: new Blob(['a'], { type: 'audio/mpeg' }) });
    const playlist = await createPlaylist('List');
    await addMediaToPlaylist(playlist.id, item.id);

    const { resolvePracticeRouteQuery, isMediaActiveInPlaylist } =
      await import('./practice-launch.js');
    const pl = await (await import('../db/playlist.js')).getPlaylist(playlist.id);
    expect(pl && isMediaActiveInPlaylist(pl, 'other')).toBe(false);

    await expect(resolvePracticeRouteQuery('solo', playlist.id)).resolves.toEqual({
      mediaId: 'solo',
      playlistId: playlist.id,
    });

    const { removeMediaFromPlaylist } = await import('../db/playlist.js');
    await removeMediaFromPlaylist(playlist.id, item.id);
    await expect(resolvePracticeRouteQuery('solo', playlist.id)).resolves.toEqual({
      mediaId: 'solo',
    });
  });

  it('resolvePracticeRouteQuery returns null when media is deleted', async () => {
    const { addMedia, deleteMedia } = await import('../db/media.js');
    const item = makeMediaItem();
    await addMedia(item, { mediaId: item.id, blob: new Blob(['a'], { type: 'audio/mpeg' }) });
    const { resolvePracticeRouteQuery } = await import('./practice-launch.js');
    await expect(resolvePracticeRouteQuery(item.id)).resolves.toEqual({ mediaId: item.id });
    await deleteMedia(item.id);
    await expect(resolvePracticeRouteQuery(item.id)).resolves.toBeNull();
  });

  it('resolvePracticeLoadPlan downgrades stale playlist to single', async () => {
    const { addMedia } = await import('../db/media.js');
    const { createPlaylist } = await import('../db/playlist.js');
    const item = makeMediaItem({ id: 'm1' });
    await addMedia(item, { mediaId: item.id, blob: new Blob(['a'], { type: 'audio/mpeg' }) });
    const playlist = await createPlaylist('P');

    const { resolvePracticeLoadPlan } = await import('./practice-launch.js');
    await expect(
      resolvePracticeLoadPlan({ mediaId: 'm1', playlistId: playlist.id }),
    ).resolves.toEqual({
      plan: { kind: 'single', mediaId: 'm1' },
    });
  });

  it('resolvePracticeLoadPlan fails when media is missing even with playlistId', async () => {
    const { createPlaylist, addMediaToPlaylist } = await import('../db/playlist.js');
    const { addMedia, deleteMedia } = await import('../db/media.js');
    const item = makeMediaItem({ id: 'gone' });
    await addMedia(item, { mediaId: item.id, blob: new Blob(['a'], { type: 'audio/mpeg' }) });
    const playlist = await createPlaylist('P');
    await addMediaToPlaylist(playlist.id, item.id);
    await deleteMedia(item.id);

    const { resolvePracticeLoadPlan } = await import('./practice-launch.js');
    await expect(
      resolvePracticeLoadPlan({ mediaId: 'gone', playlistId: playlist.id }),
    ).resolves.toEqual({ failure: 'media-missing' });
  });

  it('resolveContinuePracticeTarget skips deleted media sessions', async () => {
    const { addMedia, deleteMedia } = await import('../db/media.js');
    const gone = makeMediaItem({ id: 'gone' });
    const live = makeMediaItem({ id: 'live', title: 'Live' });
    await addMedia(gone, { mediaId: gone.id, blob: new Blob(['a'], { type: 'audio/mpeg' }) });
    await addMedia(live, { mediaId: live.id, blob: new Blob(['b'], { type: 'audio/mpeg' }) });

    const sessions = [
      {
        id: 's-new',
        mediaId: 'gone',
        mediaTitle: 'Gone',
        mediaType: 'audio' as const,
        mediaFilename: 'gone.mp3',
        mode: 'free' as const,
        startedAt: 200,
        endedAt: 201,
        activeMs: 1000,
        dateKey: '2026-01-01',
      },
      {
        id: 's-old',
        mediaId: 'live',
        mediaTitle: 'Live',
        mediaType: 'audio' as const,
        mediaFilename: 'live.mp3',
        mode: 'free' as const,
        startedAt: 100,
        endedAt: 101,
        activeMs: 500,
        dateKey: '2026-01-01',
      },
    ];

    const { resolveContinuePracticeTarget } = await import('./practice-launch.js');
    let target = await resolveContinuePracticeTarget(sessions);
    expect(target?.session.mediaId).toBe('gone');

    await deleteMedia('gone');
    target = await resolveContinuePracticeTarget(sessions);
    expect(target?.session.mediaId).toBe('live');
  });

  it('practicePathFromQuery omits playlistId when not set', async () => {
    const { practicePathFromQuery } = await import('./practice-launch.js');
    expect(practicePathFromQuery({ mediaId: 'a' })).toBe('/practice?mediaId=a');
    expect(practicePathFromQuery({ mediaId: 'a', playlistId: 'pl' })).toBe(
      '/practice?mediaId=a&playlistId=pl',
    );
  });
});
