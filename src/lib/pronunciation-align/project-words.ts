import type { WordTiming } from '../../types/models.js';

export type SegmentTimeBounds = { start: number; end: number };

/** True when `[word.start, word.end]` overlaps `(rangeStart, rangeEnd)` on the time axis. */
export function wordOverlapsTimeRange(
  word: Pick<WordTiming, 'start' | 'end'>,
  rangeStart: number,
  rangeEnd: number,
): boolean {
  return word.start < rangeEnd && word.end > rangeStart;
}

/**
 * Assign a timed word to exactly one segment index.
 * Uses `word.start` in `[segmentStarts[i], segmentStarts[i + 1])`; the last segment has no upper start bound.
 */
export function assignTimedWordToSegmentIndex(
  word: Pick<WordTiming, 'start' | 'end'>,
  segmentBounds: ReadonlyArray<SegmentTimeBounds>,
): number {
  if (segmentBounds.length === 0) {
    return -1;
  }
  const t = word.start;
  for (let i = 0; i < segmentBounds.length; i++) {
    const start = segmentBounds[i]!.start;
    const nextStart =
      i + 1 < segmentBounds.length ? segmentBounds[i + 1]!.start : Number.POSITIVE_INFINITY;
    if (t >= start && t < nextStart) {
      return i;
    }
  }
  return -1;
}

/** Words assigned to one segment on the source axis (from a Media-wide word list). */
export function wordsAssignedToSegmentIndex(
  words: ReadonlyArray<WordTiming>,
  segmentBounds: ReadonlyArray<SegmentTimeBounds>,
  segmentIndex: number,
): WordTiming[] {
  if (segmentIndex < 0 || segmentIndex >= segmentBounds.length) {
    return [];
  }
  return words.filter(
    (word) => assignTimedWordToSegmentIndex(word, segmentBounds) === segmentIndex,
  );
}

/**
 * @deprecated Prefer `wordsAssignedToSegmentIndex` with full segment bounds.
 * Words with `word.start` in `[start, end)` on the source axis.
 */
export function projectWordsToSourceRange(
  words: ReadonlyArray<WordTiming>,
  start: number,
  end: number,
): WordTiming[] {
  if (!(end > start)) {
    return [];
  }
  return words.filter((word) => word.start >= start && word.start < end);
}
