import { describe, expect, it } from 'vitest';

import type { PracticeRecord, SubtitleTrack } from '../types/models.js';
import {
  formatSubtitleSegmentOrdinalRange,
  resolvePracticeRecordSegmentOrdinal,
  resolvePracticeRecordSummary,
  truncatePracticeRecordSummary,
} from './practice-record-display.js';

const track: SubtitleTrack = {
  id: 't1',
  mediaId: 'm1',
  title: 'sub',
  segments: [
    { id: 'a', startTime: 0, endTime: 1, text: 'one' },
    { id: 'b', startTime: 1, endTime: 2, text: 'two' },
    { id: 'c', startTime: 2, endTime: 3, text: 'three' },
    { id: 'd', startTime: 3, endTime: 4, text: 'four' },
  ],
};

function makeRecord(overrides: Partial<PracticeRecord> = {}): PracticeRecord {
  return {
    id: 'r1',
    mediaId: 'm1',
    mediaTitle: 'Lesson',
    mediaFilename: 'lesson.mp3',
    mode: 'echo',
    mimeType: 'audio/webm',
    createdAt: 1,
    sourceDuration: 1,
    recordingDuration: 1,
    segments: [],
    ...overrides,
  };
}

describe('formatSubtitleSegmentOrdinalRange', () => {
  it('returns a single ordinal when min equals max', () => {
    expect(formatSubtitleSegmentOrdinalRange([3])).toBe('3');
    expect(formatSubtitleSegmentOrdinalRange([2, 2, 2])).toBe('2');
  });

  it('returns an inclusive range when ordinals differ', () => {
    expect(formatSubtitleSegmentOrdinalRange([2, 4])).toBe('2–4');
    expect(formatSubtitleSegmentOrdinalRange([1, 3, 2])).toBe('1–3');
  });
});

describe('resolvePracticeRecordSegmentOrdinal', () => {
  it('resolves echo to one ordinal', () => {
    const record = makeRecord({
      mode: 'echo',
      segmentId: 'c',
      segments: [
        {
          id: 'c',
          sourceStartTime: 2,
          sourceEndTime: 3,
          recordingStartTime: 0,
          recordingEndTime: 1,
        },
      ],
    });
    expect(resolvePracticeRecordSegmentOrdinal(record, track)).toBe('3');
  });

  it('shows one ordinal for shadowing with a single segment', () => {
    const record = makeRecord({
      mode: 'shadowing',
      segments: [
        {
          id: 'b',
          sourceStartTime: 1,
          sourceEndTime: 2,
          recordingStartTime: 0,
          recordingEndTime: 1,
        },
      ],
    });
    expect(resolvePracticeRecordSegmentOrdinal(record, track)).toBe('2');
  });

  it('shows a range for shadowing across multiple segments', () => {
    const record = makeRecord({
      mode: 'shadowing',
      segments: [
        {
          id: 'b',
          sourceStartTime: 1,
          sourceEndTime: 2,
          recordingStartTime: 0,
          recordingEndTime: 0.5,
        },
        {
          id: 'c',
          sourceStartTime: 2,
          sourceEndTime: 3,
          recordingStartTime: 0.5,
          recordingEndTime: 1,
        },
        {
          id: 'd',
          sourceStartTime: 3,
          sourceEndTime: 4,
          recordingStartTime: 1,
          recordingEndTime: 1.5,
        },
      ],
    });
    expect(resolvePracticeRecordSegmentOrdinal(record, track)).toBe('2–4');
  });

  it('returns null when the track is missing or ids are unknown', () => {
    const record = makeRecord({ mode: 'echo', segmentId: 'missing' });
    expect(resolvePracticeRecordSegmentOrdinal(record, track)).toBeNull();
    expect(resolvePracticeRecordSegmentOrdinal(record, undefined)).toBeNull();
  });
});

describe('resolvePracticeRecordSummary', () => {
  it('truncates long reference text', () => {
    const long = 'a'.repeat(100);
    expect(truncatePracticeRecordSummary(long, 80)).toHaveLength(81);
    expect(truncatePracticeRecordSummary(long, 80).endsWith('…')).toBe(true);
  });

  it('uses snapshot and live track fallback', () => {
    const withSnapshot = makeRecord({
      mode: 'echo',
      segmentId: 'a',
      segments: [
        {
          id: 'a',
          sourceStartTime: 0,
          sourceEndTime: 1,
          recordingStartTime: 0,
          recordingEndTime: 1,
          text: 'snap text',
        },
      ],
    });
    expect(resolvePracticeRecordSummary(withSnapshot, undefined)).toBe('snap text');
  });
});
