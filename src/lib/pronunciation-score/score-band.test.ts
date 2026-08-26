import { describe, expect, it } from 'vitest';

import {
  scoreBand,
  SCORE_BAND_GOOD_MIN,
  SCORE_BAND_HIGH_MIN,
  SCORE_BAND_MID_MIN,
} from './score-band.js';

describe('scoreBand', () => {
  it('maps high / good / mid / low at the shared thresholds', () => {
    expect(scoreBand(SCORE_BAND_HIGH_MIN)).toBe('high');
    expect(scoreBand(100)).toBe('high');
    expect(scoreBand(SCORE_BAND_GOOD_MIN)).toBe('good');
    expect(scoreBand(SCORE_BAND_HIGH_MIN - 0.1)).toBe('good');
    expect(scoreBand(SCORE_BAND_MID_MIN)).toBe('mid');
    expect(scoreBand(SCORE_BAND_GOOD_MIN - 0.1)).toBe('mid');
    expect(scoreBand(SCORE_BAND_MID_MIN - 0.1)).toBe('low');
    expect(scoreBand(0)).toBe('low');
  });
});
