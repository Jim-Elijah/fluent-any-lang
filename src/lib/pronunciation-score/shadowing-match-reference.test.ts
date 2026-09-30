import { describe, expect, it } from 'vitest';

import type { PracticeRecord, SubtitleTrack } from '../../types/models.js';
import { SCORE_MAX_DURATION_SEC } from './constants.js';
import {
  isShadowingMatchReferenceWithinLimits,
  resolveShadowingMatchBounds,
  shadowingProfileCacheSuffix,
} from './shadowing-match-reference.js';

function makeShadowingRecord(overrides: Partial<PracticeRecord> = {}): PracticeRecord {
  return {
    id: 'rec-sh',
    mediaId: 'media-1',
    mediaTitle: 'Lesson',
    mediaFilename: 'lesson.mp3',
    mode: 'shadowing',
    mimeType: 'audio/webm',
    createdAt: 1,
    sourceDuration: 10,
    recordingDuration: 10,
    segments: [
      {
        id: 'seg-a',
        sourceStartTime: 0,
        sourceEndTime: 5,
        recordingStartTime: 0,
        recordingEndTime: 5,
      },
      {
        id: 'seg-b',
        sourceStartTime: 6,
        sourceEndTime: 10,
        recordingStartTime: 5,
        recordingEndTime: 9,
      },
    ],
    ...overrides,
  };
}

const subtitleTrack: SubtitleTrack = {
  id: 'sub-1',
  mediaId: 'media-1',
  title: 'Lesson',
  filename: 'lesson.srt',
  type: 'srt',
  contentHash: 'hash',
  segments: [
    { id: 'seg-a', startTime: 0, endTime: 5, text: 'Hello there' },
    { id: 'seg-b', startTime: 6, endTime: 10, text: 'How are you' },
    { id: 'seg-c', startTime: 11, endTime: 14, text: 'Fine thanks' },
  ],
};

describe('shadowingProfileCacheSuffix', () => {
  it('returns single segment id for one-segment record', () => {
    const record = makeShadowingRecord({
      segments: [
        {
          id: 'seg-a',
          sourceStartTime: 0,
          sourceEndTime: 5,
          recordingStartTime: 0,
          recordingEndTime: 5,
        },
      ],
    });
    expect(shadowingProfileCacheSuffix(record)).toBe('seg-a');
  });

  it('returns pipe-joined ids for multi-segment record', () => {
    expect(shadowingProfileCacheSuffix(makeShadowingRecord())).toBe('seg-a|seg-b');
  });

  it('returns null for empty segments', () => {
    expect(shadowingProfileCacheSuffix(makeShadowingRecord({ segments: [] }))).toBeNull();
  });

  it('preserves segment order', () => {
    const record = makeShadowingRecord({
      segments: [
        {
          id: 'seg-c',
          sourceStartTime: 0,
          sourceEndTime: 3,
          recordingStartTime: 0,
          recordingEndTime: 3,
        },
        {
          id: 'seg-a',
          sourceStartTime: 4,
          sourceEndTime: 7,
          recordingStartTime: 3,
          recordingEndTime: 6,
        },
      ],
    });
    expect(shadowingProfileCacheSuffix(record)).toBe('seg-c|seg-a');
  });
});

describe('resolveShadowingMatchBounds', () => {
  it('returns clipStart from first practice segment and clipEnd from last subtitle endTime', () => {
    const bounds = resolveShadowingMatchBounds(makeShadowingRecord(), subtitleTrack);
    expect(bounds).toEqual({
      clipStart: 0,
      clipEnd: 10,
      referenceDuration: 9,
    });
  });

  it('uses subtitle endTime for partial last segment (≥90%)', () => {
    const record = makeShadowingRecord({
      segments: [
        {
          id: 'seg-a',
          sourceStartTime: 0,
          sourceEndTime: 5,
          recordingStartTime: 0,
          recordingEndTime: 5,
        },
        {
          id: 'seg-b',
          sourceStartTime: 6,
          sourceEndTime: 9.5,
          recordingStartTime: 5,
          recordingEndTime: 8.5,
        },
      ],
    });
    const bounds = resolveShadowingMatchBounds(record, subtitleTrack);
    expect(bounds).not.toBeNull();
    expect(bounds!.clipEnd).toBe(10);
    expect(bounds!.referenceDuration).toBe(9);
  });

  it('returns null when subtitle track is missing', () => {
    expect(resolveShadowingMatchBounds(makeShadowingRecord(), undefined)).toBeNull();
  });

  it('returns null when segments are empty', () => {
    expect(
      resolveShadowingMatchBounds(makeShadowingRecord({ segments: [] }), subtitleTrack),
    ).toBeNull();
  });

  it('returns null when a practice segment id is not found in subtitle track', () => {
    const record = makeShadowingRecord({
      segments: [
        {
          id: 'seg-missing',
          sourceStartTime: 0,
          sourceEndTime: 5,
          recordingStartTime: 0,
          recordingEndTime: 5,
        },
      ],
    });
    expect(resolveShadowingMatchBounds(record, subtitleTrack)).toBeNull();
  });

  it('early stop with fewer segments produces shorter bounds', () => {
    const fullRecord = makeShadowingRecord();
    const earlyStop = makeShadowingRecord({
      segments: [
        {
          id: 'seg-a',
          sourceStartTime: 0,
          sourceEndTime: 5,
          recordingStartTime: 0,
          recordingEndTime: 5,
        },
      ],
    });

    const fullBounds = resolveShadowingMatchBounds(fullRecord, subtitleTrack);
    const earlyBounds = resolveShadowingMatchBounds(earlyStop, subtitleTrack);

    expect(fullBounds!.clipEnd).toBe(10);
    expect(earlyBounds!.clipEnd).toBe(5);
    expect(earlyBounds!.referenceDuration).toBe(5);
  });

  it('sums per-segment subtitle durations (excludes inter-segment gaps)', () => {
    const record = makeShadowingRecord({
      segments: [
        {
          id: 'seg-a',
          sourceStartTime: 0,
          sourceEndTime: 5,
          recordingStartTime: 0,
          recordingEndTime: 5,
        },
        {
          id: 'seg-c',
          sourceStartTime: 11,
          sourceEndTime: 14,
          recordingStartTime: 5,
          recordingEndTime: 8,
        },
      ],
    });
    const bounds = resolveShadowingMatchBounds(record, subtitleTrack);
    expect(bounds).not.toBeNull();
    expect(bounds!.clipStart).toBe(0);
    expect(bounds!.clipEnd).toBe(14);
    expect(bounds!.referenceDuration).toBe(8);
  });
});

describe('isShadowingMatchReferenceWithinLimits', () => {
  it('accepts clips within the duration limit', () => {
    expect(
      isShadowingMatchReferenceWithinLimits({
        clipStart: 0,
        clipEnd: SCORE_MAX_DURATION_SEC,
        referenceDuration: 50,
      }),
    ).toBe(true);
  });

  it('rejects clips exceeding the duration limit', () => {
    expect(
      isShadowingMatchReferenceWithinLimits({
        clipStart: 0,
        clipEnd: SCORE_MAX_DURATION_SEC + 0.1,
        referenceDuration: 50,
      }),
    ).toBe(false);
  });

  it('uses wall-clock span not reference duration for the check', () => {
    expect(
      isShadowingMatchReferenceWithinLimits({
        clipStart: 10,
        clipEnd: 10 + SCORE_MAX_DURATION_SEC - 1,
        referenceDuration: SCORE_MAX_DURATION_SEC + 10,
      }),
    ).toBe(true);
  });
});
