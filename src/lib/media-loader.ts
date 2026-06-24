import { getMedia, getMediaBlob, getSubtitle, listMedia } from '../db/media-store.js';
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

  const subtitleTrack = await getSubtitle(item.title);
  return {
    item,
    blob,
    segments: subtitleTrack?.segments ?? [],
  };
}

export async function loadPlaylistForPlayback(): Promise<LoadedMedia[]> {
  const items = await listMedia();
  const loaded: LoadedMedia[] = [];

  for (const item of items) {
    const entry = await loadMediaForPlayback(item.id);
    if (entry) {
      loaded.push(entry);
    }
  }

  return loaded;
}
