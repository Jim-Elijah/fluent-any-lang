import { beforeEach, describe, expect, it } from 'vitest';

import type { SentenceBankEntry } from '../types/models.js';
import { resetDatabase } from '../test/db-helpers.js';
import { getDB } from './index.js';
import { migrateSentenceBankRemoved } from './migrate-sentence-bank-removed.js';
import { STORE_SENTENCE_BANK } from './schema.js';

describe('migrateSentenceBankRemoved', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('backfills missing removed as false', async () => {
    const db = await getDB();
    const legacy = {
      id: 'entry-1',
      contentHash: 'hash-1',
      text: 'Hello',
      sourceMediaId: 'media-1',
      sourceSegmentId: 'seg-1',
      sourceStartTime: 0,
      sourceEndTime: 1,
      sourceTitleSnapshot: 'Episode',
      sourceMediaType: 'audio',
      sourceAvailable: true,
      createdAt: 1,
    } as SentenceBankEntry;

    await db.put(STORE_SENTENCE_BANK, legacy);
    await migrateSentenceBankRemoved(db);

    const migrated = await db.get(STORE_SENTENCE_BANK, 'entry-1');
    expect(migrated?.removed).toBe(false);
  });

  it('leaves existing removed values unchanged', async () => {
    const db = await getDB();
    const entry: SentenceBankEntry = {
      id: 'entry-2',
      contentHash: 'hash-2',
      text: 'Hi',
      sourceMediaId: 'media-1',
      sourceSegmentId: 'seg-2',
      sourceStartTime: 0,
      sourceEndTime: 1,
      sourceTitleSnapshot: 'Episode',
      sourceMediaType: 'audio',
      sourceAvailable: true,
      removed: true,
      createdAt: 1,
    };

    await db.put(STORE_SENTENCE_BANK, entry);
    await migrateSentenceBankRemoved(db);

    const migrated = await db.get(STORE_SENTENCE_BANK, 'entry-2');
    expect(migrated?.removed).toBe(true);
  });
});
