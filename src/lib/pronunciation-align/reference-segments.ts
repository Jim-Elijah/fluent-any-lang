import type { ReferenceSegmentInput, SubtitleSegment } from '../../types/models.js';
import { normalizeNewlines } from '../pronunciation-score/normalize.js';
import { buildSubtitleSegmentsReferenceText } from './reference-text.js';

export type SubtitleAlignRequestPayload = {
  referenceText: string;
  /** Set when ≥2 timed non-empty lines and clip-relative times are valid. */
  referenceSegments?: ReferenceSegmentInput[];
};

function normalizeSegmentText(text: string): string {
  return normalizeNewlines(text).trim();
}

type TimedSubtitleLine = Pick<SubtitleSegment, 'id' | 'startTime' | 'endTime' | 'text'>;

function timedLinesWithText(segments: ReadonlyArray<TimedSubtitleLine>): TimedSubtitleLine[] {
  return [...segments]
    .filter((segment) => normalizeSegmentText(segment.text).length > 0)
    .sort((a, b) => a.startTime - b.startTime);
}

/**
 * Build align multipart script + optional `reference_segments` for a clipped subtitle span.
 * Clip axis: `clipStartTime` is Media absolute seconds at sample 0 of the upload.
 */
export function buildSubtitleAlignRequestPayload(
  segments: ReadonlyArray<TimedSubtitleLine>,
  clipStartTime: number,
): SubtitleAlignRequestPayload | null {
  const lines = timedLinesWithText(segments);
  if (lines.length === 0) {
    return null;
  }

  const referenceText = buildSubtitleSegmentsReferenceText(lines);
  if (!referenceText) {
    return null;
  }

  if (lines.length < 2) {
    return { referenceText };
  }

  const referenceSegments: ReferenceSegmentInput[] = [];
  for (const line of lines) {
    const startTime = line.startTime - clipStartTime;
    const endTime = line.endTime - clipStartTime;
    if (!(endTime > startTime)) {
      return { referenceText };
    }
    referenceSegments.push({
      id: line.id,
      startTime,
      endTime,
      text: normalizeSegmentText(line.text),
    });
  }

  return { referenceText, referenceSegments };
}
