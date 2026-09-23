import { getDB } from './index.js';
import { STORE_MEDIA_SOURCE_WORD_ALIGNMENT } from './schema.js';
import type { StoredMediaSourceWordAlignment, WordTiming } from '../types/models.js';

export async function getMediaSourceWordAlignment(
  mediaId: string,
): Promise<StoredMediaSourceWordAlignment | undefined> {
  const db = await getDB();
  return db.get(STORE_MEDIA_SOURCE_WORD_ALIGNMENT, mediaId);
}

export type PutMediaSourceWordAlignmentInput = {
  mediaId: string;
  words: WordTiming[];
  referenceText: string;
  language: string;
  subtitleContentHash: string;
};

export async function putMediaSourceWordAlignment(
  input: PutMediaSourceWordAlignmentInput,
): Promise<StoredMediaSourceWordAlignment> {
  const db = await getDB();
  const existing = await db.get(STORE_MEDIA_SOURCE_WORD_ALIGNMENT, input.mediaId);
  const now = Date.now();
  const row: StoredMediaSourceWordAlignment = {
    id: input.mediaId,
    mediaId: input.mediaId,
    words: input.words,
    referenceText: input.referenceText,
    language: input.language,
    subtitleContentHash: input.subtitleContentHash,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.put(STORE_MEDIA_SOURCE_WORD_ALIGNMENT, row);
  return row;
}

export async function deleteMediaSourceWordAlignment(mediaId: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_MEDIA_SOURCE_WORD_ALIGNMENT, mediaId);
}

export async function deleteMediaSourceWordAlignmentsByMediaIdsBatch(
  mediaIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(mediaIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const db = await getDB();
  const tx = db.transaction(STORE_MEDIA_SOURCE_WORD_ALIGNMENT, 'readwrite');
  for (const mediaId of uniqueIds) {
    await tx.store.delete(mediaId);
  }
  await tx.done;
}
