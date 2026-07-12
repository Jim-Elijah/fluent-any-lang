import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import {
  DB_NAME,
  DB_VERSION,
  STORE_MEDIA,
  STORE_MEDIA_BLOB,
  STORE_PRACTICE_SESSION,
  STORE_RECORDING,
  STORE_RECORDING_BLOB,
  STORE_SUBTITLE,
} from './schema.js';

describe('getDB', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('opens database with expected stores and indexes', async () => {
    const { getDB } = await import('./index.js');
    const db = await getDB();

    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toEqual(
      expect.arrayContaining([
        STORE_MEDIA,
        STORE_MEDIA_BLOB,
        STORE_SUBTITLE,
        STORE_RECORDING,
        STORE_RECORDING_BLOB,
        STORE_PRACTICE_SESSION,
      ]),
    );

    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const store = tx.objectStore(STORE_MEDIA);
    expect([...store.indexNames]).toEqual(expect.arrayContaining(['byCreatedAt', 'byTitle']));
    await tx.done;

    const sessionTx = db.transaction(STORE_PRACTICE_SESSION, 'readonly');
    const sessionStore = sessionTx.objectStore(STORE_PRACTICE_SESSION);
    expect([...sessionStore.indexNames]).toEqual(
      expect.arrayContaining(['byDateKey', 'byMediaId', 'byMode', 'byStartedAt']),
    );
    await sessionTx.done;
  });

  it('returns the same singleton promise', async () => {
    const { getDB } = await import('./index.js');
    expect(getDB()).toBe(getDB());
  });
});
