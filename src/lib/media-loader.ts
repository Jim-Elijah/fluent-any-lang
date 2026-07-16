import { getMedia, getMediaBlob, getSubtitle, getPlaylist } from '../db/service.js';
import type { MediaItem, SubtitleSegment } from '../types/models.js';

export type LoadedMedia = {
  item: MediaItem;
  blob: Blob;
  segments: SubtitleSegment[];
};

export async function loadMediaForPlayback(id: string): Promise<LoadedMedia | null> {
  const item = await getMedia(id);
  if (!item) {
    return null;
  }

  const blob = await getMediaBlob(id);
  if (!blob) {
    return null;
  }

  const subtitleTrack = await getSubtitle(item.id);
  return {
    item,
    blob,
    segments: subtitleTrack?.segments ?? [],
  };
}

/**
 * Load media from a playlist.
 * Only returns entries with removed=false and existing blob.
 */
export async function loadPlaylistForPlayback(playlistId: string): Promise<LoadedMedia[]> {
  const playlist = await getPlaylist(playlistId);

  if (!playlist) {
    return [];
  }

  const activeEntries = playlist.entries.filter((e) => !e.removed);
  const loaded: LoadedMedia[] = [];

  for (const entry of activeEntries) {
    const media = await loadMediaForPlayback(entry.mediaId);
    if (media) {
      loaded.push(media);
    }
  }

  return loaded;
}
