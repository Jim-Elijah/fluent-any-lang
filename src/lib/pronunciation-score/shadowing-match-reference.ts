import type { PracticeRecord, SubtitleSegment } from '../../types/models.js';
import { SCORE_MAX_DURATION_SEC } from './constants.js';

export type ShadowingMatchBounds = {
  clipStart: number;
  clipEnd: number;
  /** Sum of per-segment subtitle durations (effective speech, no inter-segment gaps). */
  referenceDuration: number;
};

/**
 * Cache key suffix for a Shadowing Practice Record's reference prosody profile.
 *
 * Single-segment Shadowing returns the bare segment id (Echo-compatible key).
 * Multi-segment returns the ordered segment ids joined with `|`.
 */
export function shadowingProfileCacheSuffix(record: PracticeRecord): string | null {
  if (record.segments.length === 0) {
    return null;
  }
  if (record.segments.length === 1) {
    return record.segments[0].id;
  }
  return record.segments.map((s) => s.id).join('|');
}

/**
 * Resolve canonical reference clip bounds and duration for a Shadowing match request.
 *
 * - `clipStart` = first Practice Segment `sourceStartTime`.
 * - `clipEnd` = Subtitle Track `endTime` of the last Practice Segment id
 *   (match always uses the full subtitle boundary, even for ≥90% partial reads).
 * - `referenceDuration` = sum of each Practice Segment's subtitle `(endTime − startTime)`.
 *
 * Returns `null` when segments are empty or subtitle lookup fails for the
 * first or last segment, causing a silent degrade to text+duration scoring.
 */
export function resolveShadowingMatchBounds(
  record: PracticeRecord,
  subtitleTrack: { segments: ReadonlyArray<SubtitleSegment> } | undefined,
): ShadowingMatchBounds | null {
  if (record.segments.length === 0 || !subtitleTrack) {
    return null;
  }

  const subtitleById = new Map(subtitleTrack.segments.map((s) => [s.id, s]));

  const firstPractice = record.segments[0];
  const lastPractice = record.segments[record.segments.length - 1];

  const firstSubtitle = subtitleById.get(firstPractice.id);
  const lastSubtitle = subtitleById.get(lastPractice.id);

  if (!firstSubtitle || !lastSubtitle) {
    return null;
  }

  const clipStart = firstPractice.sourceStartTime;
  const clipEnd = lastSubtitle.endTime;

  if (clipEnd <= clipStart) {
    return null;
  }

  let referenceDuration = 0;
  for (const segment of record.segments) {
    const sub = subtitleById.get(segment.id);
    if (!sub) {
      return null;
    }
    referenceDuration += sub.endTime - sub.startTime;
  }

  if (referenceDuration <= 0) {
    return null;
  }

  return { clipStart, clipEnd, referenceDuration };
}

/**
 * Check whether the wall-clock clip span is within the local scoring duration limit.
 * Returns `true` when within limits (scoring can proceed with reference audio).
 */
export function isShadowingMatchReferenceWithinLimits(bounds: ShadowingMatchBounds): boolean {
  return bounds.clipEnd - bounds.clipStart <= SCORE_MAX_DURATION_SEC;
}
