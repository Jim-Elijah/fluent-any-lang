import { getDB } from './index.js';
import { STORE_SUBTITLE } from './schema.js';
import type { SubtitleTrack } from '../types/models.js';

// create/insert
export async function addSubtitle(subtitles: SubtitleTrack): Promise<void> {
  const db = await getDB();
  db.put(STORE_SUBTITLE, subtitles);
}

// read
export async function getSubtitle(mediaTitle: string): Promise<SubtitleTrack | undefined> {
  const db = await getDB();
  return db.getFromIndex(STORE_SUBTITLE, 'byTitle', mediaTitle);
}

// delete
export async function deleteSubtitle(title: string): Promise<void> {
  const db = await getDB();
  const subtitle = await getSubtitle(title);
  if (subtitle) {
    await db.delete(STORE_SUBTITLE, subtitle.id);
  }
}
