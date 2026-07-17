import type { SentenceBankEntry } from '../types/models.js';
import type { AppDatabase } from './schema.js';
import { STORE_SENTENCE_BANK } from './schema.js';

/**
 * Backfill `removed` for sentence bank entries saved before the field existed.
 */
export async function migrateSentenceBankRemoved(db: AppDatabase): Promise<void> {
  const entries = (await db.getAll(STORE_SENTENCE_BANK)) as Array<
    SentenceBankEntry & { removed?: boolean }
  >;
  const needsMigration = entries.some((entry) => typeof entry.removed !== 'boolean');
  if (!needsMigration) {
    return;
  }

  const tx = db.transaction(STORE_SENTENCE_BANK, 'readwrite');
  const store = tx.objectStore(STORE_SENTENCE_BANK);

  for (const entry of entries) {
    if (typeof entry.removed === 'boolean') {
      continue;
    }
    await store.put({ ...entry, removed: false });
  }

  await tx.done;
}
