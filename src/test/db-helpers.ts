import { deleteDB } from 'idb';

import { getDB, resetDbPromise } from '../db/index.js';
import { DB_NAME } from '../db/schema.js';

/** Reset the IndexedDB singleton between tests. */
export async function resetDatabase(): Promise<void> {
  try {
    const db = await getDB();
    db.close();
    resetDbPromise();
  } catch {
    // Module not loaded yet — nothing to close.
  }

  await deleteDB(DB_NAME);
}
