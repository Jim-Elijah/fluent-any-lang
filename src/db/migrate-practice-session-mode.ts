import type { IDBPTransaction } from 'idb';

import type { PracticeSession } from '../types/models.js';
import { normalizePracticeAnalyticsMode } from '../types/models.js';
import type { AppDatabase, FluentAnyLangDB } from './schema.js';
import { STORE_PRACTICE_SESSION } from './schema.js';

type UpgradeTx = IDBPTransaction<FluentAnyLangDB, ArrayLike<string>, 'versionchange'>;

type StoredPracticeSession = Omit<PracticeSession, 'mode'> & { mode: string };

/**
 * Rewrite legacy practiceSession.mode `listening` → `free` (updates byMode index).
 * Safe to run more than once.
 */
export async function migratePracticeSessionListeningToFree(tx: UpgradeTx): Promise<void> {
  if (![...tx.objectStoreNames].includes(STORE_PRACTICE_SESSION)) {
    return;
  }

  const store = tx.objectStore(STORE_PRACTICE_SESSION);
  const sessions = (await store.getAll()) as StoredPracticeSession[];

  for (const session of sessions) {
    if (session.mode !== 'listening') {
      continue;
    }
    await store.put({
      ...session,
      mode: normalizePracticeAnalyticsMode(session.mode),
    });
  }
}

/** Test / repair helper outside upgrade transactions. */
export async function migratePracticeSessionListeningToFreeDb(db: AppDatabase): Promise<void> {
  const sessions = (await db.getAll(STORE_PRACTICE_SESSION)) as StoredPracticeSession[];
  const needsMigration = sessions.some((s) => s.mode === 'listening');
  if (!needsMigration) {
    return;
  }

  const tx = db.transaction(STORE_PRACTICE_SESSION, 'readwrite');
  const store = tx.objectStore(STORE_PRACTICE_SESSION);
  for (const session of sessions) {
    if (session.mode !== 'listening') {
      continue;
    }
    await store.put({
      ...session,
      mode: normalizePracticeAnalyticsMode(session.mode),
    });
  }
  await tx.done;
}
