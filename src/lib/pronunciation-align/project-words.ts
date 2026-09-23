import type { WordTiming } from '../../types/models.js';

/** Words whose midpoint falls in `[start, end)` on the Media source axis. */
export function projectWordsToSourceRange(
  words: ReadonlyArray<WordTiming>,
  start: number,
  end: number,
): WordTiming[] {
  if (!(end > start)) {
    return [];
  }
  return words.filter((word) => {
    const midpoint = (word.start + word.end) / 2;
    return midpoint >= start && midpoint < end;
  });
}
