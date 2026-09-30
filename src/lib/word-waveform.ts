import type { PracticeTimeAxis } from './playback-utils.js';
import {
  assignTimedWordToSegmentIndex,
  type SegmentTimeBounds,
} from './pronunciation-align/project-words.js';
import type {
  PracticeSegment,
  SubtitleSegment,
  WordMarkerLayout,
  WordTiming,
} from '../types/models.js';

export type TimeRange = { start: number; end: number };

/** CSS pixel height reserved at the top of the waveform canvas for word labels. */
export const WORD_RAIL_LANE_PX = 22;

/** Word with optional Pronunciation Score (align timings have no score). */
export type TimedWord = WordTiming & { score?: number };

export type WordWaveformMarker = TimedWord & {
  leftPct: number;
  /**
   * Rail percentage used as `width` (duration layout) or `max-width` (compact layout).
   * Duration: clipped pronunciation span. Compact: gap until the next marker (or rail end).
   */
  widthPct: number;
};

function practiceSegmentBounds(
  segments: PracticeSegment[],
  axis: PracticeTimeAxis,
): SegmentTimeBounds[] {
  return segments.map((segment) => ({
    start: axis === 'source' ? segment.sourceStartTime : segment.recordingStartTime,
    end: axis === 'source' ? segment.sourceEndTime : segment.recordingEndTime,
  }));
}

/** Words assigned to this Practice Segment on the chosen axis (exclusive). */
export function wordsInPracticeSegment(
  words: TimedWord[],
  segments: PracticeSegment[],
  segmentIndex: number,
  axis: PracticeTimeAxis = 'recording',
): TimedWord[] {
  if (segmentIndex < 0 || segmentIndex >= segments.length) {
    return [];
  }
  const bounds = practiceSegmentBounds(segments, axis);
  return words.filter((word) => assignTimedWordToSegmentIndex(word, bounds) === segmentIndex);
}

/** Place timed words onto a view range. Omits words fully outside. */
export function layoutWordMarkers(
  words: TimedWord[],
  viewRange: TimeRange,
  layout: WordMarkerLayout = 'duration',
): WordWaveformMarker[] {
  const duration = viewRange.end - viewRange.start;
  if (duration <= 0) {
    return [];
  }

  const visible = words
    .filter((w) => w.end > viewRange.start && w.start < viewRange.end)
    .slice()
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (layout === 'compact') {
    const markers: WordWaveformMarker[] = visible.map((word) => {
      const left = ((word.start - viewRange.start) / duration) * 100;
      return {
        word: word.word,
        start: word.start,
        end: word.end,
        score: word.score,
        leftPct: Math.max(0, left),
        widthPct: 100,
      };
    });
    for (let i = 0; i < markers.length - 1; i++) {
      const gap = markers[i + 1].leftPct - markers[i].leftPct;
      if (gap > 0) {
        markers[i].widthPct = gap;
      }
    }
    return markers;
  }

  const markers: WordWaveformMarker[] = visible.map((word) => {
    const clippedStart = Math.max(word.start, viewRange.start);
    const clippedEnd = Math.min(word.end, viewRange.end);
    const left = ((clippedStart - viewRange.start) / duration) * 100;
    const width = ((clippedEnd - clippedStart) / duration) * 100;
    return {
      word: word.word,
      start: word.start,
      end: word.end,
      score: word.score,
      leftPct: Math.max(0, left),
      widthPct: Math.max(0, width),
    };
  });

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const nextLeft = i < markers.length - 1 ? markers[i + 1].leftPct : 100;
    const maxWidth = nextLeft - marker.leftPct;
    if (maxWidth < marker.widthPct) {
      marker.widthPct = Math.max(0, maxWidth);
    }
  }

  return markers;
}

export function wordMarkersForPreview(input: {
  words: TimedWord[];
  segments: PracticeSegment[];
  segmentIndex: number;
  recordingViewRange: TimeRange | null;
  layout?: WordMarkerLayout;
}): WordWaveformMarker[] {
  const words = wordsInPracticeSegment(
    input.words,
    input.segments,
    input.segmentIndex,
    'recording',
  );
  const segment = input.segments[input.segmentIndex];
  const viewRange =
    input.recordingViewRange ??
    (segment ? { start: segment.recordingStartTime, end: segment.recordingEndTime } : null);
  if (!viewRange) {
    return [];
  }
  return layoutWordMarkers(words, viewRange, input.layout ?? 'duration');
}

/** Source-axis word markers for the current Practice Segment (align timings). */
export function wordMarkersForSourcePreview(input: {
  words: TimedWord[];
  segments: PracticeSegment[];
  segmentIndex: number;
  sourceViewRange: TimeRange | null;
  layout?: WordMarkerLayout;
}): WordWaveformMarker[] {
  const words = wordsInPracticeSegment(input.words, input.segments, input.segmentIndex, 'source');
  const segment = input.segments[input.segmentIndex];
  const viewRange =
    input.sourceViewRange ??
    (segment ? { start: segment.sourceStartTime, end: segment.sourceEndTime } : null);
  if (!viewRange) {
    return [];
  }
  return layoutWordMarkers(words, viewRange, input.layout ?? 'duration');
}

/** Source-axis word markers for the current Subtitle Segment (align timings). */
export function wordMarkersForSourceSubtitle(input: {
  words: TimedWord[];
  segments: SubtitleSegment[];
  segmentIndex: number;
  sourceViewRange: TimeRange | null;
  layout?: WordMarkerLayout;
}): WordWaveformMarker[] {
  const segment = input.segments[input.segmentIndex];
  if (!segment) {
    return [];
  }
  const viewRange =
    input.sourceViewRange ??
    ({ start: segment.startTime, end: segment.endTime } satisfies TimeRange);
  return layoutWordMarkers(input.words, viewRange, input.layout ?? 'duration');
}
