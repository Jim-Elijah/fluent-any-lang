import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { PracticeRecord, SubtitleTrack } from '../types/models.js';
import { getDB } from './index.js';
import { migrateSegmentIdsToDeterministic } from './migrate-segment-ids.js';
import { STORE_RECORDING, STORE_SUBTITLE } from './schema.js';
import { computeSegmentId } from '../lib/segment-id.js';

describe('migrateSegmentIdsToDeterministic', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('rewrites subtitle and recording segment ids', async () => {
    const db = await getDB();
    const track: SubtitleTrack = {
      id: 'sub-1',
      mediaId: 'media-1',
      title: 'ep',
      filename: 'ep.srt',
      type: 'srt',
      contentHash: 'x',
      segments: [
        { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', startTime: 0, endTime: 1, text: 'Hello' },
        { id: '11111111-2222-3333-4444-555555555555', startTime: 2, endTime: 3, text: 'World' },
      ],
    };
    await db.put(STORE_SUBTITLE, track);

    const record: PracticeRecord = {
      id: 'rec-1',
      mediaId: 'media-1',
      mediaTitle: 'ep',
      mediaFilename: 'ep.mp3',
      mode: 'echo',
      segmentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      mimeType: 'audio/webm',
      createdAt: Date.now(),
      sourceDuration: 1,
      recordingDuration: 1,
      segments: [
        {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          sourceStartTime: 0,
          sourceEndTime: 1,
          recordingStartTime: 0,
          recordingEndTime: 1,
        },
      ],
    };
    await db.put(STORE_RECORDING, record);

    await migrateSegmentIdsToDeterministic(db);

    const nextTrack = await db.get(STORE_SUBTITLE, 'sub-1');
    const expectedId = await computeSegmentId('media-1', track.segments[0]);
    expect(nextTrack?.segments[0].id).toBe(expectedId);

    const nextRecord = await db.get(STORE_RECORDING, 'rec-1');
    expect(nextRecord?.segmentId).toBe(expectedId);
    expect(nextRecord?.segments[0].id).toBe(expectedId);
  });
});
