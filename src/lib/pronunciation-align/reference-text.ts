import type { SubtitleSegment, SubtitleTrack } from '../../types/models.js';
import { normalizeNewlines } from '../pronunciation-score/normalize.js';

function normalizeSegmentText(text: string): string {
  return normalizeNewlines(text).trim();
}

/**
 * Join Subtitle Track segment texts in timeline order (LF-normalized, `\n` separated).
 */
export function buildSubtitleTrackReferenceText(track: Pick<SubtitleTrack, 'segments'>): string {
  const sorted = [...track.segments].sort((a, b) => a.startTime - b.startTime);
  return sorted
    .map((segment) => normalizeSegmentText(segment.text))
    .filter(Boolean)
    .join('\n');
}

/** Same join rules when only live segment rows are available (e.g. recording preview). */
export function buildSubtitleSegmentsReferenceText(
  segments: ReadonlyArray<Pick<SubtitleSegment, 'startTime' | 'text'>>,
): string {
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  return sorted
    .map((segment) => normalizeSegmentText(segment.text))
    .filter(Boolean)
    .join('\n');
}
