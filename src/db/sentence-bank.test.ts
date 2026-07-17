import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as audioClip from '../lib/audio-clip.js';
import { resetDatabase } from '../test/db-helpers.js';
import type {
  MediaItem,
  SentenceBankBlob,
  SentenceBankEntry,
  SubtitleSegment,
} from '../types/models.js';
import { computeSentenceBankContentHash } from '../lib/segment-id.js';
import { getDB } from './index.js';
import { addMedia } from './media.js';
import {
  addToSentenceBank,
  getSentenceBankBlob,
  getSentenceBankEntry,
  getSentenceBankEntryByContentHash,
  getSentenceBankList,
  markSentenceBankSourceUnavailable,
  putSentenceBankEntry,
  removeFromSentenceBank,
} from './sentence-bank.js';
import { STORE_SENTENCE_BANK } from './schema.js';

function makeMedia(id = 'media-1'): MediaItem {
  return {
    id,
    title: 'Episode 1',
    filename: 'ep1.mp3',
    size: 10,
    type: 'audio',
    mimeType: 'audio/mpeg',
    duration: 10,
    createdAt: Date.now(),
    contentHash: 'hash',
    hasSubtitles: true,
  };
}

function makeSegment(overrides: Partial<SubtitleSegment> = {}): SubtitleSegment {
  return {
    id: 'seg-1',
    startTime: 1,
    endTime: 3,
    text: 'Hello',
    translation: '你好',
    ...overrides,
  };
}

describe('sentence-bank', () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.spyOn(audioClip, 'clipAudioBlob').mockResolvedValue({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
      mimeType: 'audio/wav',
      duration: 1.5,
    });
  });

  it('adds clipped sentences and dedups by contentHash', async () => {
    const media = makeMedia();
    await addMedia(media, { mediaId: media.id, blob: new Blob(['audio']) });
    const segment = makeSegment();

    const first = await addToSentenceBank({ media, segment });
    expect(first.status).toBe('added');
    expect(first.entry.sourceMediaType).toBe('audio');
    expect(first.entry.removed).toBe(false);

    const second = await addToSentenceBank({ media, segment });
    expect(second.status).toBe('duplicate');
    expect(second.entry.id).toBe(first.entry.id);

    const list = await getSentenceBankList();
    expect(list).toHaveLength(1);

    const contentHash = await computeSentenceBankContentHash(media.id, segment);
    const byHash = await getSentenceBankEntryByContentHash(contentHash);
    expect(byHash?.id).toBe(first.entry.id);
  });

  it('marks source unavailable when media is deleted', async () => {
    const media = makeMedia();
    await addMedia(media, { mediaId: media.id, blob: new Blob(['audio']) });
    const { entry } = await addToSentenceBank({ media, segment: makeSegment() });
    expect(entry.sourceAvailable).toBe(true);

    await markSentenceBankSourceUnavailable(media.id);
    const list = await getSentenceBankList();
    expect(list[0]?.sourceAvailable).toBe(false);
  });

  it('soft-removes sentences and revives on re-add without re-clipping', async () => {
    const media = makeMedia();
    await addMedia(media, { mediaId: media.id, blob: new Blob(['audio']) });
    const segment = makeSegment();
    const contentHash = await computeSentenceBankContentHash(media.id, segment);
    const entry: SentenceBankEntry = {
      id: 'entry-1',
      contentHash,
      text: segment.text,
      translation: segment.translation,
      sourceMediaId: media.id,
      sourceSegmentId: segment.id,
      sourceStartTime: segment.startTime,
      sourceEndTime: segment.endTime,
      sourceTitleSnapshot: media.title,
      sourceMediaType: media.type,
      sourceAvailable: true,
      removed: false,
      createdAt: Date.now(),
    };
    const blobRecord: SentenceBankBlob = {
      entryId: entry.id,
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
      mimeType: 'audio/wav',
      duration: 1.5,
    };
    await putSentenceBankEntry(entry, blobRecord);

    const removed = await removeFromSentenceBank({ media, segment });
    expect(removed).toEqual({ status: 'removed', entry: { ...entry, removed: true } });
    expect(await getSentenceBankList()).toHaveLength(0);

    const stillStored = await getSentenceBankEntry(entry.id);
    expect(stillStored?.removed).toBe(true);
    expect(await getSentenceBankBlob(entry.id)).toBeTruthy();

    const missing = await removeFromSentenceBank({ media, segment });
    expect(missing.status).toBe('missing');

    const clipSpy = vi.mocked(audioClip.clipAudioBlob);
    clipSpy.mockClear();
    const revived = await addToSentenceBank({ media, segment });
    expect(revived.status).toBe('added');
    expect(revived.entry.id).toBe(entry.id);
    expect(revived.entry.removed).toBe(false);
    expect(clipSpy).not.toHaveBeenCalled();
    expect(await getSentenceBankList()).toHaveLength(1);
  });

  it('hides soft-deleted entries from the active list', async () => {
    const db = await getDB();
    await db.put(STORE_SENTENCE_BANK, {
      id: 'gone',
      contentHash: 'hash-gone',
      text: 'Bye',
      sourceMediaId: 'media-1',
      sourceSegmentId: 'seg-1',
      sourceStartTime: 0,
      sourceEndTime: 1,
      sourceTitleSnapshot: 'Ep',
      sourceMediaType: 'audio',
      sourceAvailable: true,
      removed: true,
      createdAt: 1,
    } satisfies SentenceBankEntry);

    expect(await getSentenceBankList()).toHaveLength(0);
  });
});
