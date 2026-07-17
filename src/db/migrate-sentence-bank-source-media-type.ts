import type { MediaItem, MediaType, SentenceBankEntry } from '../types/models.js';
import type { AppDatabase } from './schema.js';
import { STORE_MEDIA, STORE_SENTENCE_BANK } from './schema.js';

function isMediaType(value: unknown): value is MediaType {
  return value === 'audio' || value === 'video';
}

/**
 * Backfill `sourceMediaType` for sentence bank entries saved before the field existed.
 */
export async function migrateSentenceBankSourceMediaType(db: AppDatabase): Promise<void> {
  const entries = (await db.getAll(STORE_SENTENCE_BANK)) as SentenceBankEntry[];
  const needsMigration = entries.some((entry) => !isMediaType(entry.sourceMediaType));
  if (!needsMigration) {
    return;
  }

  const tx = db.transaction([STORE_SENTENCE_BANK, STORE_MEDIA], 'readwrite');
  const sentenceStore = tx.objectStore(STORE_SENTENCE_BANK);
  const mediaStore = tx.objectStore(STORE_MEDIA);

  for (const entry of entries) {
    if (isMediaType(entry.sourceMediaType)) {
      continue;
    }

    const media = (await mediaStore.get(entry.sourceMediaId)) as MediaItem | undefined;
    const sourceMediaType: MediaType = media?.type ?? 'audio';
    await sentenceStore.put({ ...entry, sourceMediaType });
  }

  await tx.done;
}
