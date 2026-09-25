import type { PracticeRecord } from '../types/models.js';
import { resolveReferenceText } from './pronunciation-score/service.js';

/** Max characters shown for Practice Record source excerpt in lists. */
export const PRACTICE_RECORD_SUMMARY_MAX_CHARS = 80;

export function buildSubtitleSegmentOrdinalMap(
  segments: ReadonlyArray<{ id: string }>,
): Map<string, number> {
  const map = new Map<string, number>();
  segments.forEach((segment, index) => {
    map.set(segment.id, index + 1);
  });
  return map;
}

/** 1-based ordinals → display label; single index omits the range dash. */
export function formatSubtitleSegmentOrdinalRange(indices: readonly number[]): string | null {
  if (indices.length === 0) {
    return null;
  }
  const min = Math.min(...indices);
  const max = Math.max(...indices);
  if (min === max) {
    return String(min);
  }
  return `${min}–${max}`;
}

function practiceSegmentIds(record: PracticeRecord): string[] {
  if (record.mode === 'echo') {
    const id = record.segmentId ?? record.segments[0]?.id;
    return id ? [id] : [];
  }
  return record.segments.map((segment) => segment.id);
}

function ordinalsForSegmentIds(
  segmentIds: readonly string[],
  ordinalById: Map<string, number>,
): number[] {
  const indices: number[] = [];
  for (const id of segmentIds) {
    const ordinal = ordinalById.get(id);
    if (ordinal !== undefined) {
      indices.push(ordinal);
    }
  }
  return indices;
}

/**
 * Subtitle Track ordinals for a Practice Record (1-based, track array order).
 * Shadowing spans multiple Subtitle Segments → min–max range; one segment → that ordinal only.
 */
export function resolvePracticeRecordSegmentOrdinal(
  record: PracticeRecord,
  subtitleTrack: { segments: ReadonlyArray<{ id: string }> } | undefined,
): string | null {
  if (!subtitleTrack?.segments.length) {
    return null;
  }
  const ordinalById = buildSubtitleSegmentOrdinalMap(subtitleTrack.segments);
  const ordinals = ordinalsForSegmentIds(practiceSegmentIds(record), ordinalById);
  return formatSubtitleSegmentOrdinalRange(ordinals);
}

export function truncatePracticeRecordSummary(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars)}…`;
}

export function resolvePracticeRecordSummary(
  record: PracticeRecord,
  subtitleTrack: { segments: ReadonlyArray<{ id: string; text: string }> } | undefined,
): string | null {
  const reference = resolveReferenceText(record, subtitleTrack);
  if (!reference) {
    return null;
  }
  return truncatePracticeRecordSummary(reference, PRACTICE_RECORD_SUMMARY_MAX_CHARS);
}
