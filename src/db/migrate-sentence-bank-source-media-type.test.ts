import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { SentenceBankEntry } from '../types/models.js';
import { getDB } from './index.js';
import { migrateSentenceBankSourceMediaType } from './migrate-sentence-bank-source-media-type.js';
import { addMedia } from './media.js';
import { STORE_SENTENCE_BANK } from './schema.js';
import type { MediaItem } from '../types/models.js';

function makeMedia(id = 'media-1', type: MediaItem['type'] = 'video'): MediaItem {
  return {
    id,
    title: 'Episode 1',
    filename: 'ep1.mp4',
    size: 10,
    type,
    mimeType: type === 'video' ? 'video/mp4' : 'audio/mpeg',
    duration: 10,
    createdAt: Date.now(),
    contentHash: 'hash',
    hasSubtitles: true,
  };
}

describe('migrateSentenceBankSourceMediaType', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('backfills sourceMediaType from media when missing', async () => {
    const media = makeMedia('media-v', 'video');
    await addMedia(media, { mediaId: media.id, blob: new Blob(['video']) });

    const db = await getDB();
    const legacyEntry = {
      id: 'entry-1',
      contentHash: 'hash-1',
      text: 'Hello',
      sourceMediaId: media.id,
      sourceSegmentId: 'seg-1',
      sourceStartTime: 0,
      sourceEndTime: 1,
      sourceTitleSnapshot: media.title,
      sourceAvailable: true,
      createdAt: Date.now(),
    } as SentenceBankEntry;

    await db.put(STORE_SENTENCE_BANK, legacyEntry);
    await migrateSentenceBankSourceMediaType(db);

    const migrated = await db.get(STORE_SENTENCE_BANK, legacyEntry.id);
    expect(migrated?.sourceMediaType).toBe('video');
  });

  it('defaults to audio when source media is gone', async () => {
    const db = await getDB();
    const legacyEntry = {
      id: 'entry-2',
      contentHash: 'hash-2',
      text: 'Hi',
      sourceMediaId: 'missing-media',
      sourceSegmentId: 'seg-2',
      sourceStartTime: 0,
      sourceEndTime: 1,
      sourceTitleSnapshot: 'Deleted',
      sourceAvailable: false,
      createdAt: Date.now(),
    } as SentenceBankEntry;

    await db.put(STORE_SENTENCE_BANK, legacyEntry);
    await migrateSentenceBankSourceMediaType(db);

    const migrated = await db.get(STORE_SENTENCE_BANK, legacyEntry.id);
    expect(migrated?.sourceMediaType).toBe('audio');
  });
});
