import { describe, expect, it } from 'vitest';

import type { PracticeSegment, SubtitleSegment } from '../types/models.js';
import {
  computeSegmentPauseMs,
  findCrossedSegmentEnd,
  findPracticeSegmentIndex,
  findSegmentIndex,
  getPracticeSourceDuration,
  getPracticeSourceSpan,
  getPracticeRecordingSpan,
  mapPracticeTime,
  mapPracticeViewRange,
} from './playback-utils.js';

const samplePracticeSegments: PracticeSegment[] = [
  {
    id: 'p0',
    sourceStartTime: 0,
    sourceEndTime: 5,
    recordingStartTime: 0,
    recordingEndTime: 4.5,
  },
  {
    id: 'p1',
    sourceStartTime: 5,
    sourceEndTime: 10,
    recordingStartTime: 4.5,
    recordingEndTime: 9,
  },
  {
    id: 'p2',
    sourceStartTime: 12,
    sourceEndTime: 15,
    recordingStartTime: 9,
    recordingEndTime: 11.5,
  },
];

const sampleSegments: SubtitleSegment[] = [
  { id: 's0', startTime: 0, endTime: 5, text: 'one' },
  { id: 's1', startTime: 5, endTime: 10, text: 'two' },
  { id: 's2', startTime: 12, endTime: 15, text: 'three' },
];

describe('findCrossedSegmentEnd', () => {
  it('returns -1 for empty segments', () => {
    expect(findCrossedSegmentEnd([], 0, 5)).toBe(-1);
  });

  it('returns -1 when playback time does not advance', () => {
    expect(findCrossedSegmentEnd(sampleSegments, 3, 3)).toBe(-1);
  });

  it('returns -1 when seeking backward', () => {
    expect(findCrossedSegmentEnd(sampleSegments, 8, 2)).toBe(-1);
  });

  it('detects crossing the first segment end during normal playback', () => {
    expect(findCrossedSegmentEnd(sampleSegments, 4.9, 5.0)).toBe(0);
  });

  it('detects crossing when timeupdate jumps past the end threshold', () => {
    expect(findCrossedSegmentEnd(sampleSegments, 4.5, 5.2)).toBe(0);
  });

  it('returns the rightmost crossed segment when multiple ends are crossed in one tick', () => {
    expect(findCrossedSegmentEnd(sampleSegments, 0, 10.5)).toBe(1);
  });

  it('detects the last segment end', () => {
    expect(findCrossedSegmentEnd(sampleSegments, 14.9, 15.0)).toBe(2);
  });

  it('does not re-trigger when already past the end threshold', () => {
    expect(findCrossedSegmentEnd(sampleSegments, 5.1, 5.2)).toBe(-1);
  });
});

describe('findPracticeSegmentIndex', () => {
  it('finds the source segment for a click within its range', () => {
    expect(findPracticeSegmentIndex(samplePracticeSegments, 7, 'source')).toBe(1);
  });

  it('finds the recording segment for a click within its range', () => {
    expect(findPracticeSegmentIndex(samplePracticeSegments, 8, 'recording')).toBe(1);
  });

  it('keeps the previous segment active in a source gap', () => {
    expect(findPracticeSegmentIndex(samplePracticeSegments, 11, 'source')).toBe(1);
  });
});

describe('findSegmentIndex', () => {
  it('returns -1 before the first segment', () => {
    expect(findSegmentIndex(sampleSegments, -1)).toBe(-1);
  });

  it('keeps the previous segment active in a gap between subtitles', () => {
    expect(findSegmentIndex(sampleSegments, 11)).toBe(1);
  });

  it('assigns the last segment when time equals its endTime', () => {
    expect(findSegmentIndex(sampleSegments, 15)).toBe(2);
  });
});

describe('getPracticeSourceSpan', () => {
  it('returns null for empty segments', () => {
    expect(getPracticeSourceSpan([])).toBeNull();
  });

  it('returns the single segment span', () => {
    expect(getPracticeSourceSpan([samplePracticeSegments[0]])).toEqual({ start: 0, end: 5 });
  });

  it('returns first start to last end for multiple segments', () => {
    expect(getPracticeSourceSpan(samplePracticeSegments)).toEqual({ start: 0, end: 15 });
  });
});

describe('getPracticeRecordingSpan', () => {
  it('returns null for empty segments', () => {
    expect(getPracticeRecordingSpan([])).toBeNull();
  });

  it('returns the single segment span', () => {
    expect(getPracticeRecordingSpan([samplePracticeSegments[0]])).toEqual({
      start: 0,
      end: 4.5,
    });
  });

  it('returns first start to last end for multiple segments', () => {
    expect(getPracticeRecordingSpan(samplePracticeSegments)).toEqual({ start: 0, end: 11.5 });
  });
});

describe('getPracticeSourceDuration', () => {
  it('returns 0 for empty segments', () => {
    expect(getPracticeSourceDuration([])).toBe(0);
  });

  it('returns span length for a single segment', () => {
    expect(getPracticeSourceDuration([samplePracticeSegments[0]])).toBe(5);
  });

  it('returns span length for multiple segments', () => {
    expect(getPracticeSourceDuration(samplePracticeSegments)).toBe(15);
  });
});

describe('mapPracticeTime', () => {
  const shortRecordingSegment: PracticeSegment = {
    id: 'short',
    sourceStartTime: 10,
    sourceEndTime: 15,
    recordingStartTime: 0,
    recordingEndTime: 2,
  };

  it('maps source timestamps into the short recording axis', () => {
    expect(mapPracticeTime(10, 'source', 'recording', [shortRecordingSegment])).toBe(0);
    expect(mapPracticeTime(15, 'source', 'recording', [shortRecordingSegment])).toBe(2);
    expect(mapPracticeTime(12.5, 'source', 'recording', [shortRecordingSegment])).toBe(1);
  });

  it('maps recording timestamps back into the source axis', () => {
    expect(mapPracticeTime(0, 'recording', 'source', [shortRecordingSegment])).toBe(10);
    expect(mapPracticeTime(2, 'recording', 'source', [shortRecordingSegment])).toBe(15);
  });
});

describe('mapPracticeViewRange', () => {
  const shortRecordingSegment: PracticeSegment = {
    id: 'short',
    sourceStartTime: 10,
    sourceEndTime: 15,
    recordingStartTime: 0,
    recordingEndTime: 2,
  };

  it('maps a source view range onto the recording axis', () => {
    expect(
      mapPracticeViewRange({ start: 10, end: 15 }, 'source', 'recording', [shortRecordingSegment]),
    ).toEqual({ start: 0, end: 2 });
  });
});

describe('computeSegmentPauseMs', () => {
  const segment = sampleSegments[0];

  it('returns null when pause mode is off', () => {
    expect(computeSegmentPauseMs(segment, 'off', 2, 100)).toBeNull();
  });

  it('returns fixed seconds in seconds mode', () => {
    expect(computeSegmentPauseMs(segment, 'seconds', 3, 100)).toBe(3000);
  });

  it('returns a percentage of segment duration in percentage mode', () => {
    expect(computeSegmentPauseMs(segment, 'percentage', 1, 200)).toBe(10000);
  });
});
