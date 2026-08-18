import { findPracticeSegmentIndex } from './playback-utils.js';
import type { PracticeSegment, PronunciationWordScore } from '../types/models.js';

export type TimeRange = { start: number; end: number };

/** CSS pixel height reserved at the top of the waveform canvas for word labels. */
export const WORD_RAIL_LANE_PX = 22;

export type WordWaveformMarker = PronunciationWordScore & {
  leftPct: number;
};

/** Words whose midpoint falls on this Practice Segment's recording axis. */
export function wordsInPracticeSegment(
  words: PronunciationWordScore[],
  segments: PracticeSegment[],
  segmentIndex: number,
): PronunciationWordScore[] {
  if (segmentIndex < 0 || segmentIndex >= segments.length) {
    return [];
  }
  return words.filter((word) => {
    const midpoint = (word.start + word.end) / 2;
    return findPracticeSegmentIndex(segments, midpoint, 'recording') === segmentIndex;
  });
}

/** Place recording-axis words onto a recording view range. Omits words fully outside. */
export function layoutWordMarkers(
  words: PronunciationWordScore[],
  viewRange: TimeRange,
): WordWaveformMarker[] {
  const duration = viewRange.end - viewRange.start;
  if (duration <= 0) {
    return [];
  }

  const markers: WordWaveformMarker[] = [];
  for (const word of words) {
    if (word.end <= viewRange.start || word.start >= viewRange.end) {
      continue;
    }
    const left = ((word.start - viewRange.start) / duration) * 100;
    markers.push({
      word: word.word,
      start: word.start,
      end: word.end,
      score: word.score,
      leftPct: Math.max(0, left),
    });
  }
  return markers;
}

export function wordMarkersForPreview(input: {
  words: PronunciationWordScore[];
  segments: PracticeSegment[];
  segmentIndex: number;
  recordingViewRange: TimeRange | null;
}): WordWaveformMarker[] {
  const words = wordsInPracticeSegment(input.words, input.segments, input.segmentIndex);
  const segment = input.segments[input.segmentIndex];
  const viewRange =
    input.recordingViewRange ??
    (segment ? { start: segment.recordingStartTime, end: segment.recordingEndTime } : null);
  if (!viewRange) {
    return [];
  }
  return layoutWordMarkers(words, viewRange);
}
