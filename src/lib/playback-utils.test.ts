import { describe, expect, it } from 'vitest';

import type { SubtitleSegment } from '../types/models.js';
import {
  computeSegmentPauseMs,
  findCrossedSegmentEnd,
  findSegmentIndex,
} from './playback-utils.js';

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
