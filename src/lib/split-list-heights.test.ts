import { describe, expect, it } from 'vitest';

import {
  allocateLibraryStackHeights,
  allocateStackedHeights,
  allocateStackedHeightsN,
  estimateListNaturalHeight,
  MAX_NOISE_STACK_ROWS,
  MIN_STACKED_LIST_PX,
  STACK_LIST_ROW_PX,
} from './split-list-heights.js';

describe('allocateStackedHeights', () => {
  it('uses natural heights when both fit', () => {
    expect(allocateStackedHeights(100, 200, 800)).toEqual([100, 200]);
  });

  it('gives leftover to the longer list when the shorter fits', () => {
    // 2 media rows (~232) + many records, avail 800 → media keeps natural, records get rest
    expect(allocateStackedHeights(232, 1800, 800)).toEqual([232, 568]);
  });

  it('fits the shorter list when it is the second pane', () => {
    expect(allocateStackedHeights(1800, 232, 800)).toEqual([568, 232]);
  });

  it('splits when neither list can fully fit', () => {
    const [a, b] = allocateStackedHeights(2000, 2000, 800);
    expect(a + b).toBeCloseTo(800);
    expect(a).toBeCloseTo(400);
    expect(b).toBeCloseTo(400);
  });

  it('keeps empty/short panes compact', () => {
    const [a, b] = allocateStackedHeights(128, 1800, 800);
    expect(a).toBe(128);
    expect(b).toBe(672);
  });
});

describe('allocateStackedHeightsN', () => {
  it('splits overflow panes equally so a long list cannot starve the last', () => {
    const [media, record, noise] = allocateStackedHeightsN(
      [5000, 3000, 1000],
      600,
      MIN_STACKED_LIST_PX,
    );
    expect(media + record + noise).toBeCloseTo(600);
    expect(media).toBeCloseTo(200);
    expect(record).toBeCloseTo(200);
    expect(noise).toBeCloseTo(200);
    expect(noise).toBeGreaterThanOrEqual(MIN_STACKED_LIST_PX);
  });

  it('still fully fits a short pane and shares the rest equally', () => {
    const [a, b, c] = allocateStackedHeightsN([120, 2000, 2000], 600, MIN_STACKED_LIST_PX);
    expect(a).toBe(120);
    expect(b).toBeCloseTo(240);
    expect(c).toBeCloseTo(240);
  });
});

describe('allocateLibraryStackHeights', () => {
  const maxNoise = estimateListNaturalHeight({
    itemCount: MAX_NOISE_STACK_ROWS,
    rowHeight: STACK_LIST_ROW_PX,
  });

  it('reserves about 2 noise rows when all three panes compete', () => {
    const [media, record, noise] = allocateLibraryStackHeights(5000, 3000, 1000, 600);
    expect(media + record + noise).toBeCloseTo(600);
    expect(noise).toBeCloseTo(maxNoise);
    expect(media).toBeGreaterThanOrEqual(MIN_STACKED_LIST_PX);
    expect(record).toBeGreaterThanOrEqual(MIN_STACKED_LIST_PX);
    expect(media + record).toBeGreaterThan(noise);
  });

  it('still lets noise expand when media and record already fit', () => {
    const [media, record, noise] = allocateLibraryStackHeights(128, 128, 800, 1200);
    expect(media).toBe(128);
    expect(record).toBe(128);
    expect(noise).toBe(800);
  });
});

describe('estimateListNaturalHeight', () => {
  it('uses empty body height when there are no items', () => {
    expect(estimateListNaturalHeight({ itemCount: 0, rowHeight: 96 })).toBe(40 + 88);
  });

  it('scales with item count', () => {
    expect(estimateListNaturalHeight({ itemCount: 2, rowHeight: 96 })).toBe(40 + 192);
  });
});
