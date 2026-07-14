import { getDB } from './index.js';
import { STORE_SUBTITLE } from './schema.js';
import type { SubtitleTrack } from '../types/models.js';

// create/insert
export async function addSubtitle(subtitles: SubtitleTrack): Promise<void> {
  const db = await getDB();
  await db.put(STORE_SUBTITLE, subtitles);
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
    await db.delete(STORE_SUBTITLE, subtitle.id);
  }
}
