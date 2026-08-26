/** Glanceable overall / word score tiers for UI badges and chips. */
export type ScoreBand = 'high' | 'good' | 'mid' | 'low';

/** Excellent (90+). */
export const SCORE_BAND_HIGH_MIN = 90;
/** Good (80–89). */
export const SCORE_BAND_GOOD_MIN = 80;
/** Passing (60–79). */
export const SCORE_BAND_MID_MIN = 60;

export function scoreBand(score: number): ScoreBand {
  if (score >= SCORE_BAND_HIGH_MIN) return 'high';
  if (score >= SCORE_BAND_GOOD_MIN) return 'good';
  if (score >= SCORE_BAND_MID_MIN) return 'mid';
  return 'low';
}
