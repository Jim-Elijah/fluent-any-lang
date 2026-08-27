import { describe, expect, it } from 'vitest';

import { formatOverallBadge, overallBadgeBand, roundOverallForBadge } from './aggregate.js';

describe('overall badge display', () => {
  it('rounds for display text', () => {
    expect(roundOverallForBadge(89.7)).toBe(90);
    expect(formatOverallBadge(89.7)).toBe('90');
    expect(formatOverallBadge(89.4)).toBe('89');
  });

  it('bands from the rounded display value so text and color stay aligned', () => {
    expect(overallBadgeBand(89.7)).toBe('high');
    expect(overallBadgeBand(89.4)).toBe('good');
    expect(overallBadgeBand(79.5)).toBe('good');
    expect(overallBadgeBand(59.5)).toBe('mid');
  });
});
