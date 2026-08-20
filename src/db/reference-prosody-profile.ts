import { getDB } from './index.js';
import { STORE_REFERENCE_PROSODY_PROFILE } from './schema.js';
import type { ReferenceProsodyProfile, StoredReferenceProsodyProfile } from '../types/models.js';

export function referenceProsodyProfileId(mediaId: string, segmentId: string): string {
  return `${mediaId}:${segmentId}`;
}

export async function getReferenceProsodyProfile(
  mediaId: string,
  segmentId: string,
): Promise<StoredReferenceProsodyProfile | undefined> {
  const db = await getDB();
  return db.get(STORE_REFERENCE_PROSODY_PROFILE, referenceProsodyProfileId(mediaId, segmentId));
}

export async function putReferenceProsodyProfile(
  mediaId: string,
  segmentId: string,
  profile: ReferenceProsodyProfile,
): Promise<StoredReferenceProsodyProfile> {
  const db = await getDB();
  const id = referenceProsodyProfileId(mediaId, segmentId);
  const existing = await db.get(STORE_REFERENCE_PROSODY_PROFILE, id);
  const now = Date.now();
  const row: StoredReferenceProsodyProfile = {
    id,
    mediaId,
    segmentId,
    profile,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.put(STORE_REFERENCE_PROSODY_PROFILE, row);
  return row;
}

export async function deleteReferenceProsodyProfile(
  mediaId: string,
  segmentId: string,
): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_REFERENCE_PROSODY_PROFILE, referenceProsodyProfileId(mediaId, segmentId));
}

export async function deleteReferenceProsodyProfilesByMediaId(mediaId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_REFERENCE_PROSODY_PROFILE, 'readwrite');
  const index = tx.objectStore(STORE_REFERENCE_PROSODY_PROFILE).index('byMediaId');
  let cursor = await index.openCursor(mediaId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
