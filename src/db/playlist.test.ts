import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { MediaBlob, MediaItem } from '../types/models.js';
import { FAVORITES_PLAYLIST_ID } from '../types/models.js';
import {
  addMedia,
  addMediaToPlaylist,
  createPlaylist,
  deleteMedia,
  getPlaylist,
  getPlaylistList,
  isMediaInFavorites,
  isPlaylistNameConflictError,
  removeMediaFromPlaylist,
  toggleFavorites,
  updatePlaylist,
} from './service.js';

function makeMedia(id: string, title: string): MediaItem {
  return {
    id,
    title,
    filename: `${title}.mp3`,
    size: 1024,
    type: 'audio',
    mimeType: 'audio/mpeg',
    duration: 120,
    createdAt: Date.now(),
    hasSubtitles: false,
    contentHash: `hash-${id}`,
  };
}

describe('playlist', () => {
  beforeEach(async () => {
    await resetDatabase();
    // ensureFavoritesPlaylist is now called by getDB, so we just need a fresh DB.
    await import('../db/index.js').then((mod) => mod.getDB());
  });

  it('seeds empty favorites on first open', async () => {
    const favorites = await getPlaylist(FAVORITES_PLAYLIST_ID);
    expect(favorites).toBeDefined();
    expect(favorites?.kind).toBe('favorites');
    expect(favorites?.entries).toEqual([]);
  });

  it('creates user playlists with incremental sort order', async () => {
    const p1 = await createPlaylist('Rock');
    const p2 = await createPlaylist('Jazz');
    expect(p1.sortOrder).toBe(1); // favorites is 0
    expect(p2.sortOrder).toBe(2);

    const all = await getPlaylistList();
    expect(all.map((p) => p.name)).toEqual(['喜欢', 'Rock', 'Jazz']);
  });

  it('rejects duplicate playlist names during create after trimming and normalizing case', async () => {
    await createPlaylist('Rock');

    await expect(createPlaylist('  rock  ')).rejects.toSatisfy(isPlaylistNameConflictError);
  });

  it('rejects duplicate playlist names during rename', async () => {
    const rock = await createPlaylist('Rock');
    const jazz = await createPlaylist('Jazz');

    await expect(updatePlaylist(jazz.id, { name: ' rock ' })).rejects.toSatisfy(
      isPlaylistNameConflictError,
    );
    await expect(updatePlaylist(rock.id, { name: ' rock ' })).resolves.toMatchObject({
      name: 'rock',
    });
  });

  it('adds media to playlist (upsert logic)', async () => {
    const media = makeMedia('m1', 'Song 1');
    const blob: MediaBlob = { mediaId: media.id, blob: new Blob(['audio']) };
    await addMedia(media, blob);

    await addMediaToPlaylist(FAVORITES_PLAYLIST_ID, media.id);

    const fav = await getPlaylist(FAVORITES_PLAYLIST_ID);
    expect(fav?.entries).toHaveLength(1);
    expect(fav?.entries[0]?.mediaId).toBe(media.id);
    expect(fav?.entries[0]?.removed).toBe(false);
    expect(fav?.entries[0]?.titleSnapshot).toBe('Song 1');
  });

  it('removes media from playlist (soft delete)', async () => {
    const media = makeMedia('m1', 'Song 1');
    const blob: MediaBlob = { mediaId: media.id, blob: new Blob(['audio']) };
    await addMedia(media, blob);

    await addMediaToPlaylist(FAVORITES_PLAYLIST_ID, media.id);
    await removeMediaFromPlaylist(FAVORITES_PLAYLIST_ID, media.id);

    const fav = await getPlaylist(FAVORITES_PLAYLIST_ID);
    expect(fav?.entries[0]?.removed).toBe(true);
    expect(fav?.entries[0]?.titleSnapshot).toBe('Song 1'); // preserved
  });

  it('toggleFavorites adds/removes from favorites', async () => {
    const media = makeMedia('m1', 'Song 1');
    const blob: MediaBlob = { mediaId: media.id, blob: new Blob(['audio']) };
    await addMedia(media, blob);

    let isFav = await toggleFavorites(media.id);
    expect(isFav).toBe(true);
    expect(await isMediaInFavorites(media.id)).toBe(true);

    isFav = await toggleFavorites(media.id);
    expect(isFav).toBe(false);
    expect(await isMediaInFavorites(media.id)).toBe(false);
  });

  it('marks media as removed in all playlists on delete', async () => {
    const media = makeMedia('m1', 'Song 1');
    const blob: MediaBlob = { mediaId: media.id, blob: new Blob(['audio']) };
    await addMedia(media, blob);

    const p1 = await createPlaylist('Playlist 1');
    await addMediaToPlaylist(p1.id, media.id);
    await addMediaToPlaylist(FAVORITES_PLAYLIST_ID, media.id);

    await deleteMedia(media.id);

    const fav = await getPlaylist(FAVORITES_PLAYLIST_ID);
    const pl1 = await getPlaylist(p1.id);

    expect(fav?.entries[0]?.removed).toBe(true);
    expect(fav?.entries[0]?.titleSnapshot).toBe('Song 1');
    expect(pl1?.entries[0]?.removed).toBe(true);
  });
});
