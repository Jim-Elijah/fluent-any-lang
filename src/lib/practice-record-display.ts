import type { PracticeRecord } from '../types/models.js';
import { resolveReferenceText } from './pronunciation-score/service.js';

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

const ORDINAL_RANGE_SEPARATOR = '–';

/** Display label for subtitle segment ordinals: #3 or #2–#4 (matches range-chip in subtitle-panel). */
export function formatPracticeRecordSegmentOrdinalLabel(ordinal: string): string {
  const dash = ordinal.indexOf(ORDINAL_RANGE_SEPARATOR);
  if (dash === -1) {
    return `#${ordinal}`;
  }
  return `#${ordinal.slice(0, dash)}${ORDINAL_RANGE_SEPARATOR}#${ordinal.slice(dash + ORDINAL_RANGE_SEPARATOR.length)}`;
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

export function resolvePracticeRecordSummary(
  record: PracticeRecord,
  subtitleTrack: { segments: ReadonlyArray<{ id: string; text: string }> } | undefined,
): string | null {
  const reference = resolveReferenceText(record, subtitleTrack);
  if (!reference) {
    return null;
  }
  return reference.trim();
}
