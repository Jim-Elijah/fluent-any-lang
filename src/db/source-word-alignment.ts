import { getDB } from './index.js';
import { STORE_SOURCE_WORD_ALIGNMENT } from './schema.js';
import type {
  SourceWordAlignmentSource,
  StoredSourceWordAlignment,
  WordTiming,
} from '../types/models.js';

export function sourceWordAlignmentId(mediaId: string, segmentId: string): string {
  return `${mediaId}:${segmentId}`;
}

export async function getSourceWordAlignment(
  mediaId: string,
  segmentId: string,
): Promise<StoredSourceWordAlignment | undefined> {
  const db = await getDB();
  return db.get(STORE_SOURCE_WORD_ALIGNMENT, sourceWordAlignmentId(mediaId, segmentId));
}

export type PutSourceWordAlignmentInput = {
  mediaId: string;
  segmentId: string;
  words: WordTiming[];
  referenceText: string;
  language: string;
  source: SourceWordAlignmentSource;
};

/**
 * Persist source word timings. Batch writes do not overwrite a row produced by
 * a single-segment align (`source === 'segment'`).
 */
export async function putSourceWordAlignment(
  input: PutSourceWordAlignmentInput,
): Promise<StoredSourceWordAlignment | undefined> {
  const db = await getDB();
  const id = sourceWordAlignmentId(input.mediaId, input.segmentId);
  const existing = await db.get(STORE_SOURCE_WORD_ALIGNMENT, id);

  if (input.source === 'batch' && existing?.source === 'segment') {
    return existing;
  }

  const now = Date.now();
  const row: StoredSourceWordAlignment = {
    id,
    mediaId: input.mediaId,
    segmentId: input.segmentId,
    words: input.words,
    referenceText: input.referenceText,
    language: input.language,
    source: input.source,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.put(STORE_SOURCE_WORD_ALIGNMENT, row);
  return row;
}

export async function deleteSourceWordAlignment(
  mediaId: string,
  segmentId: string,
): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_SOURCE_WORD_ALIGNMENT, sourceWordAlignmentId(mediaId, segmentId));
}

export async function deleteSourceWordAlignmentsByMediaIdsBatch(
  mediaIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(mediaIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const db = await getDB();
  const tx = db.transaction(STORE_SOURCE_WORD_ALIGNMENT, 'readwrite');
  const index = tx.objectStore(STORE_SOURCE_WORD_ALIGNMENT).index('byMediaId');
  for (const mediaId of uniqueIds) {
    let cursor = await index.openCursor(mediaId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

export async function deleteSourceWordAlignmentsByMediaId(mediaId: string): Promise<void> {
  await deleteSourceWordAlignmentsByMediaIdsBatch([mediaId]);
}

/** Removes batch-written rows only; preserves single-segment (`segment`) overrides. */
export async function deleteBatchSourceWordAlignmentsByMediaId(mediaId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_SOURCE_WORD_ALIGNMENT, 'readwrite');
  const store = tx.objectStore(STORE_SOURCE_WORD_ALIGNMENT);
  const rows = await store.index('byMediaId').getAll(mediaId);
  for (const row of rows) {
    if (row.source === 'batch') {
      await store.delete(row.id);
    }
  }
  await tx.done;
}
