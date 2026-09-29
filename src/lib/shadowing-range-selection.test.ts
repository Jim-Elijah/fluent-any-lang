import { describe, expect, it } from 'vitest';

import {
  applyShadowingRangeClick,
  formatRangeSummary,
  type ShadowingRangeState,
} from './shadowing-range-selection.js';

describe('applyShadowingRangeClick', () => {
  const empty: ShadowingRangeState = { anchor: null, range: null, confirmed: false };

  it('sets anchor on first click', () => {
    const result = applyShadowingRangeClick(empty, 2);
    expect(result).toEqual({ anchor: 2, range: null, confirmed: false });
  });

  it('builds range from anchor and second click (forward)', () => {
    const withAnchor: ShadowingRangeState = { anchor: 1, range: null, confirmed: false };
    const result = applyShadowingRangeClick(withAnchor, 3);
    expect(result).toEqual({ anchor: null, range: { start: 1, end: 3 }, confirmed: true });
  });

  it('builds range from anchor and second click (backward)', () => {
    const withAnchor: ShadowingRangeState = { anchor: 5, range: null, confirmed: false };
    const result = applyShadowingRangeClick(withAnchor, 2);
    expect(result).toEqual({ anchor: null, range: { start: 2, end: 5 }, confirmed: true });
  });

  it('starts a new anchor when an unconfirmed range exists', () => {
    const withRange: ShadowingRangeState = {
      anchor: null,
      range: { start: 1, end: 5 },
      confirmed: false,
    };
    const step1 = applyShadowingRangeClick(withRange, 3);
    expect(step1).toEqual({ anchor: 3, range: null, confirmed: false });

    const step2 = applyShadowingRangeClick(step1, 5);
    expect(step2).toEqual({ anchor: null, range: { start: 3, end: 5 }, confirmed: true });
  });

  it('ignores click when confirmed', () => {
    const confirmed: ShadowingRangeState = {
      anchor: null,
      range: { start: 1, end: 3 },
      confirmed: true,
    };
    const result = applyShadowingRangeClick(confirmed, 5);
    expect(result).toBe(confirmed);
  });

  it('handles same-index clicks (single-segment range)', () => {
    const withAnchor: ShadowingRangeState = { anchor: 2, range: null, confirmed: false };
    const result = applyShadowingRangeClick(withAnchor, 2);
    expect(result).toEqual({ anchor: null, range: { start: 2, end: 2 }, confirmed: true });
  });
});

describe('formatRangeSummary', () => {
  it('shows range summary when range is set', () => {
    const state: ShadowingRangeState = {
      anchor: null,
      range: { start: 2, end: 6 },
      confirmed: false,
    };
    expect(formatRangeSummary(state, 10)).toBe('#3–#7 · 5句');
  });

  it('shows anchor waiting message', () => {
    const state: ShadowingRangeState = { anchor: 2, range: null, confirmed: false };
    expect(formatRangeSummary(state, 10)).toBe('起点 #3 · 点终点');
  });

  it('shows instruction when empty', () => {
    const state: ShadowingRangeState = { anchor: null, range: null, confirmed: false };
    expect(formatRangeSummary(state, 5)).toBe('点起点和终点');
  });

  it('returns empty string when no segments', () => {
    const state: ShadowingRangeState = { anchor: null, range: null, confirmed: false };
    expect(formatRangeSummary(state, 0)).toBe('');
  });
});
