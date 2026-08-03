import { describe, expect, it } from 'vitest';

import {
  LIVE_WAVEFORM_MAX_SAMPLES,
  LIVE_WAVEFORM_MIN_CEILING,
  buildLiveDisplayPeaks,
} from './live-waveform-peaks.js';

describe('buildLiveDisplayPeaks', () => {
  it('returns empty peaks for empty input', () => {
    expect(buildLiveDisplayPeaks([])).toEqual(new Float32Array(0));
  });

  it('keeps only the trailing window', () => {
    const raw = Array.from({ length: LIVE_WAVEFORM_MAX_SAMPLES + 20 }, (_, i) =>
      i < 20 ? 0.01 : 0.4,
    );
    const peaks = buildLiveDisplayPeaks(raw);
    expect(peaks.length).toBe(LIVE_WAVEFORM_MAX_SAMPLES);
    expect(peaks[0]).toBeCloseTo(1);
  });

  it('normalizes quiet peaks up to a visible range', () => {
    const peaks = buildLiveDisplayPeaks([0.01, 0.02, 0.015]);
    expect(Math.max(...peaks)).toBeCloseTo(0.02 / LIVE_WAVEFORM_MIN_CEILING);
    expect(peaks[1]).toBeGreaterThan(peaks[0]);
  });

  it('normalizes loud peaks to 1 without using the floor', () => {
    const peaks = buildLiveDisplayPeaks([0.2, 0.8, 0.4]);
    expect(Math.max(...peaks)).toBeCloseTo(1);
    expect(peaks[0]).toBeCloseTo(0.25);
  });
});
