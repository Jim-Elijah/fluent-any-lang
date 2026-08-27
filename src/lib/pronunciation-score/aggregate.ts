import type { PracticeRecord, PronunciationScore } from '../../types/models.js';
import { scoreBand, type ScoreBand } from './score-band.js';

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

/** Integer shown on overall badges; band colors must use this same value. */
export function roundOverallForBadge(overall: number): number {
  return Math.round(overall);
}

export function formatOverallBadge(overall: number): string {
  return String(roundOverallForBadge(overall));
}

/** ScoreBand for an overall badge — keyed off the rounded display value. */
export function overallBadgeBand(overall: number): ScoreBand {
  return scoreBand(roundOverallForBadge(overall));
}
