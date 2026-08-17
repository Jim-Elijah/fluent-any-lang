import type { PracticeRecord, PronunciationScore } from '../../types/models.js';

/**
 * Latest successful overall per Echo Subtitle Segment.
 * Records in each group should already be newest-first by createdAt.
 */
export function aggregateEchoLatestOverall(
  echoRecordingsBySegmentId: Record<string, PracticeRecord[]>,
  scoresByRecordId: ReadonlyMap<string, PronunciationScore>,
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const [segmentId, records] of Object.entries(echoRecordingsBySegmentId)) {
    for (const record of records) {
      const score = scoresByRecordId.get(record.id);
      if (score?.status === 'success' && typeof score.overall === 'number') {
        result[segmentId] = score.overall;
        break;
      }
    }
  }
  return result;
}

export function formatOverallBadge(overall: number): string {
  return String(Math.round(overall));
}
