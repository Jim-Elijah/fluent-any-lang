import { describe, expect, it } from 'vitest';

import { buildSparseMarks, playbackRateMarks, volumeMarks } from './slider-marks.js';

describe('buildSparseMarks', () => {
  it('keeps endpoints and drops crowded middles', () => {
    expect(
      buildSparseMarks(0, 1, [
        [0, '0'],
        [0.05, 'near'],
        [0.5, 'mid'],
        [0.95, 'near-end'],
        [1, '1'],
      ]),
    ).toEqual({ 0: '0', 0.5: 'mid', 1: '1' });
  });

  it('prefers the max endpoint when it crowds the previous mark', () => {
    expect(
      buildSparseMarks(0, 1.1, [
        [0, '0'],
        [0.5, '50'],
        [1, '100'],
        [1.1, '110'],
      ]),
    ).toEqual({ 0: '0', 0.5: '50', 1.1: '110' });
  });
});

describe('playbackRateMarks', () => {
  it('uses integers up to max on a wide range (drops crowded 0.5x)', () => {
    expect(playbackRateMarks(0.1, 4)).toEqual({
      1: '1x',
      2: '2x',
      3: '3x',
      4: '4x',
    });
  });

  it('uses the greatest nice rate ≤ max instead of the raw max', () => {
    expect(playbackRateMarks(0.1, 3.2)).toEqual({
      1: '1x',
      2: '2x',
      3: '3x',
    });
  });

  it('adds endpoint halves when the integer span is short', () => {
    expect(playbackRateMarks(0.1, 2.5)).toEqual({
      0.5: '0.5x',
      1: '1x',
      2: '2x',
      2.5: '2.5x',
    });
  });

  it('adapts to a low max with halves and 1x', () => {
    expect(playbackRateMarks(0.1, 1.2)).toEqual({
      0.5: '0.5x',
      1: '1x',
    });
  });

  it('includes 1.5x when that is the greatest nice rate ≤ max', () => {
    expect(playbackRateMarks(0.1, 1.5)).toEqual({
      0.5: '0.5x',
      1: '1x',
      1.5: '1.5x',
    });
  });
});

describe('volumeMarks', () => {
  it('uses integer percents up to max on a wide range (drops crowded 50%)', () => {
    expect(volumeMarks(0, 2)).toEqual({
      0: '0%',
      1: '100%',
      2: '200%',
    });
  });

  it('uses the greatest nice level ≤ max instead of the raw max', () => {
    expect(volumeMarks(0, 2.3)).toEqual({
      0: '0%',
      1: '100%',
      2: '200%',
    });
  });

  it('adds an endpoint half when it is the greatest nice level ≤ max', () => {
    expect(volumeMarks(0, 2.5)).toEqual({
      0: '0%',
      1: '100%',
      2: '200%',
      2.5: '250%',
    });
  });

  it('keeps 0% / 100% when max is barely above 1 (no raw 110%)', () => {
    expect(volumeMarks(0, 1.1)).toEqual({
      0: '0%',
      1: '100%',
    });
  });

  it('includes 150% when that is the greatest nice level ≤ max', () => {
    expect(volumeMarks(0, 1.5)).toEqual({
      0: '0%',
      1: '100%',
      1.5: '150%',
    });
  });
});
