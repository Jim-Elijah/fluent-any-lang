import { describe, expect, it } from 'vitest';

import { allocateStackedHeights, estimateListNaturalHeight } from './split-list-heights.js';

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

describe('estimateListNaturalHeight', () => {
  it('uses empty body height when there are no items', () => {
    expect(estimateListNaturalHeight({ itemCount: 0, rowHeight: 96 })).toBe(40 + 88);
  });

  it('scales with item count', () => {
    expect(estimateListNaturalHeight({ itemCount: 2, rowHeight: 96 })).toBe(40 + 192);
  });
});
