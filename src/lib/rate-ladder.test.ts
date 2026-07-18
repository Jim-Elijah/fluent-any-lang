import { describe, expect, it } from 'vitest';

import { RateLadder, buildLadderSequence, snapDiscriminationRate } from './rate-ladder.js';

describe('buildLadderSequence', () => {
  it('mirrors multi-step rates', () => {
    expect(buildLadderSequence([1, 1.5, 2, 3])).toEqual([1, 1.5, 2, 3, 2, 1.5, 1]);
  });

  it('keeps a single rate', () => {
    expect(buildLadderSequence([1.25])).toEqual([1.25]);
  });

  it('defaults empty to [1]', () => {
    expect(buildLadderSequence([])).toEqual([1]);
  });
});

describe('RateLadder', () => {
  it('advances through the mirrored sequence then finishes', () => {
    const ladder = new RateLadder([1, 2]);
    expect(ladder.getSequence()).toEqual([1, 2, 1]);
    expect(ladder.getCurrentRate()).toBe(1);

    expect(ladder.onMainEnded()).toEqual({ kind: 'advance', rate: 2, index: 1 });
    expect(ladder.onMainEnded()).toEqual({ kind: 'advance', rate: 1, index: 2 });
    expect(ladder.onMainEnded()).toEqual({ kind: 'finished', rate: 1 });
    expect(ladder.getIndex()).toBe(0);
  });

  it('reset returns to the first step', () => {
    const ladder = new RateLadder([1, 1.5]);
    ladder.onMainEnded();
    ladder.reset();
    expect(ladder.getIndex()).toBe(0);
    expect(ladder.getCurrentRate()).toBe(1);
  });
});

describe('snapDiscriminationRate', () => {
  it('snaps to nearest allowed step', () => {
    expect(snapDiscriminationRate(1.4)).toBe(1.5);
    expect(snapDiscriminationRate(2.9)).toBe(3);
  });
});
