import { deleteDB } from 'idb';
import { vi } from 'vitest';

import { DB_NAME } from '../db/schema.js';

/** Reset the IndexedDB singleton between tests. */
export async function resetDatabase(): Promise<void> {
  try {
    const { getDB } = await import('../db/index.js');
    const db = await getDB();
    db.close();
  } catch {
    // Module not loaded yet — nothing to close.
  }

  vi.resetModules();
  await deleteDB(DB_NAME);
}
