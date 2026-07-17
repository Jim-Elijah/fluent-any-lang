import type { LoadedTrack } from '../controllers/media-controller.js';
import {
  getMedia,
  getMediaBlob,
  getSubtitle,
  getPlaylist,
  getSentenceBankBlob,
  getSentenceBankEntry,
} from '../db/service.js';
import type { MediaItem, SentenceBankEntry, SubtitleSegment } from '../types/models.js';

export type LoadedMedia = {
  item: MediaItem;
  blob: Blob;
  segments: SubtitleSegment[];
};

export type LoadedSentence = {
  entry: SentenceBankEntry;
  blob: Blob;
  mimeType: string;
  duration: number;
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

export async function loadSentenceForPractice(entryId: string): Promise<LoadedSentence | null> {
  const entry = await getSentenceBankEntry(entryId);
  if (!entry || entry.removed) {
    return null;
  }
  const blobRecord = await getSentenceBankBlob(entryId);
  if (!blobRecord) {
    return null;
  }
  return {
    entry,
    blob: blobRecord.blob,
    mimeType: blobRecord.mimeType,
    duration: blobRecord.duration,
  };
}

export function sentenceToLoadedTrack(loaded: LoadedSentence): LoadedTrack {
  const { entry, blob, mimeType, duration } = loaded;
  return {
    item: {
      id: entry.id,
      title: entry.text,
      filename: `${entry.id}.audio`,
      size: blob.size,
      type: 'audio',
      mimeType,
      duration,
      createdAt: entry.createdAt,
      contentHash: entry.contentHash,
      hasSubtitles: false,
    },
    blob,
    segments: [],
  };
}
