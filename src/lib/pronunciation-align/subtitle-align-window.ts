import type { SubtitleSegment } from '../../types/models.js';
import { normalizeNewlines } from '../pronunciation-score/normalize.js';

export type SubtitleAlignWindow = {
  startTime: number;
  endTime: number;
};

function hasReferenceText(text: string): boolean {
  return normalizeNewlines(text).trim().length > 0;
}

/**
 * Span from the first to last Subtitle Segment that contributes reference text
 * (timeline order), for clipping Media before whole-file forced align.
 */
export function resolveSubtitleAlignWindow(
  segments: ReadonlyArray<Pick<SubtitleSegment, 'startTime' | 'endTime' | 'text'>>,
): SubtitleAlignWindow | null {
  const withText = [...segments]
    .filter((segment) => hasReferenceText(segment.text))
    .sort((a, b) => a.startTime - b.startTime);
  if (withText.length === 0) {
    return null;
  }
  const startTime = withText[0]!.startTime;
  const endTime = withText[withText.length - 1]!.endTime;
  if (!(endTime > startTime)) {
    return null;
  }
  return { startTime, endTime };
}

export function subtitleAlignWindowDurationSec(window: SubtitleAlignWindow): number {
  return window.endTime - window.startTime;
}
