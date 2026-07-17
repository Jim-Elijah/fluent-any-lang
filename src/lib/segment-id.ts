import type { SubtitleSegment } from '../types/models.js';
import { hashString } from './file-validation.js';

/** Normalize subtitle text for stable hashing. */
export function normalizeSegmentText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function segmentIdentityPayload(
  mediaId: string,
  segment: Pick<SubtitleSegment, 'startTime' | 'endTime' | 'text' | 'translation'>,
): string {
  const text = normalizeSegmentText(segment.text);
  const translation = segment.translation ? normalizeSegmentText(segment.translation) : '';
  return [
    mediaId,
    segment.startTime.toFixed(5),
    segment.endTime.toFixed(5),
    text,
    translation,
  ].join('\u0000');
}

/** Deterministic segment id scoped to a media item. */
export async function computeSegmentId(
  mediaId: string,
  segment: Pick<SubtitleSegment, 'startTime' | 'endTime' | 'text' | 'translation'>,
): Promise<string> {
  return hashString(segmentIdentityPayload(mediaId, segment));
}

/** Sentence bank dedup key: same text in different media or timestamps are distinct. */
export async function computeSentenceBankContentHash(
  mediaId: string,
  segment: Pick<SubtitleSegment, 'startTime' | 'text' | 'translation'>,
): Promise<string> {
  const text = normalizeSegmentText(segment.text);
  const translation = segment.translation ? normalizeSegmentText(segment.translation) : '';
  return hashString([text, translation, mediaId, segment.startTime.toFixed(5)].join('\u0000'));
}

/** Assign deterministic ids to parsed subtitle segments. */
export async function assignSegmentIds(
  mediaId: string,
  segments: SubtitleSegment[],
): Promise<SubtitleSegment[]> {
  const result: SubtitleSegment[] = [];
  for (const segment of segments) {
    result.push({
      ...segment,
      id: await computeSegmentId(mediaId, segment),
    });
  }
  return result;
}

export async function buildSegmentIdMigrationMap(
  mediaId: string,
  segments: SubtitleSegment[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const segment of segments) {
    const nextId = await computeSegmentId(mediaId, segment);
    map.set(segment.id, nextId);
  }
  return map;
}
