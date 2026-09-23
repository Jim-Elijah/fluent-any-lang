import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../../test/db-helpers.js';
import { putMediaSourceWordAlignment } from '../../db/media-source-word-alignment.js';
import { putSourceWordAlignment } from '../../db/source-word-alignment.js';
import { resolveSegmentSourceWords } from './resolve-segment-words.js';

describe('resolveSegmentSourceWords', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('returns segment row when present', async () => {
    await putSourceWordAlignment({
      mediaId: 'media-1',
      segmentId: 'seg-a',
      words: [{ word: 'x', start: 1, end: 2 }],
      referenceText: 'x',
      language: 'en',
      source: 'segment',
    });

    const words = await resolveSegmentSourceWords({
      mediaId: 'media-1',
      segment: { id: 'seg-a', sourceStartTime: 0, sourceEndTime: 5 },
      subtitleTrack: { contentHash: 'live' },
    });

    expect(words).toEqual([{ word: 'x', start: 1, end: 2 }]);
  });

  it('does not project when subtitle contentHash mismatches', async () => {
    await putMediaSourceWordAlignment({
      mediaId: 'media-1',
      words: [{ word: 'y', start: 0.5, end: 1 }],
      referenceText: 'y',
      language: 'en',
      subtitleContentHash: 'stored',
    });

    const words = await resolveSegmentSourceWords({
      mediaId: 'media-1',
      segment: { id: 'seg-a', sourceStartTime: 0, sourceEndTime: 2 },
      subtitleTrack: { contentHash: 'live' },
    });

    expect(words).toEqual([]);
  });
});
