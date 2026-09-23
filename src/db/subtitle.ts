import { invalidateAlignCachesOnSubtitleChange } from '../lib/pronunciation-align/invalidate-subtitle-align.js';
import { getDB } from './index.js';
import { getMedia, updateMedia } from './media.js';
import { STORE_SUBTITLE } from './schema.js';
import type { SubtitleTrack } from '../types/models.js';

async function syncMediaHasSubtitles(mediaId: string, hasSubtitles: boolean): Promise<void> {
  const media = await getMedia(mediaId);
  if (!media || media.hasSubtitles === hasSubtitles) {
    return;
  }
  await updateMedia({ ...media, hasSubtitles });
}

// create/insert
export async function addSubtitle(subtitles: SubtitleTrack): Promise<void> {
  const previous = await getSubtitle(subtitles.mediaId);
  const db = await getDB();
  await db.put(STORE_SUBTITLE, subtitles);
  if (previous && previous.contentHash !== subtitles.contentHash) {
    await invalidateAlignCachesOnSubtitleChange(subtitles.mediaId);
  }
  await syncMediaHasSubtitles(subtitles.mediaId, subtitles.segments.length > 0);
}

// read by mediaId
export async function getSubtitle(mediaId: string): Promise<SubtitleTrack | undefined> {
  const db = await getDB();
  return db.getFromIndex(STORE_SUBTITLE, 'byMediaId', mediaId);
}

export async function getAllSubtitles(): Promise<SubtitleTrack[]> {
  const db = await getDB();
  return db.getAll(STORE_SUBTITLE);
}

export async function getSubtitleById(id: string): Promise<SubtitleTrack | undefined> {
  const db = await getDB();
  return db.get(STORE_SUBTITLE, id);
}

// delete by mediaId
export async function deleteSubtitle(mediaId: string): Promise<void> {
  const db = await getDB();
  const subtitle = await getSubtitle(mediaId);
  if (subtitle) {
    await invalidateAlignCachesOnSubtitleChange(mediaId);
    await db.delete(STORE_SUBTITLE, subtitle.id);
    await syncMediaHasSubtitles(mediaId, false);
  }
}
