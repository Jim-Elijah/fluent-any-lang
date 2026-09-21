import { describe, expect, it } from 'vitest';

import { estimateListNaturalHeight } from './split-list-heights.js';

describe('estimateListNaturalHeight', () => {
  it('uses empty body height when there are no items', () => {
    expect(estimateListNaturalHeight({ itemCount: 0, rowHeight: 96 })).toBe(40 + 88);
  });

  it('scales with item count', () => {
    expect(estimateListNaturalHeight({ itemCount: 2, rowHeight: 96 })).toBe(40 + 192);
  });
});
