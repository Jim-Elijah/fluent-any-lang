import type { ErrorLogEntry } from '../types/models.js';
import { getDB } from './index.js';
import { ERROR_LOG_MAX_ENTRIES, STORE_ERROR_LOG } from './schema.js';

export async function addErrorLog(entry: ErrorLogEntry): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_ERROR_LOG, 'readwrite');
  const store = tx.objectStore(STORE_ERROR_LOG);
  await store.put(entry);

  const all = await store.index('byCreatedAt').getAll();
  const overflow = all.length - ERROR_LOG_MAX_ENTRIES;
  if (overflow > 0) {
    for (let i = 0; i < overflow; i++) {
      const oldest = all[i];
      if (oldest) {
        await store.delete(oldest.id);
      }
    }
  }

  await tx.done;
}

export async function getErrorLogList(): Promise<ErrorLogEntry[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex(STORE_ERROR_LOG, 'byCreatedAt');
  return items;
}

export async function getErrorLogCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_ERROR_LOG);
}

export async function clearErrorLogs(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_ERROR_LOG);
}
