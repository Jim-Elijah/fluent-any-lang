import { describe, expect, it } from 'vitest';

import {
  audioBufferToPeaks,
  computeBucketCount,
  getPeakIndexRange,
  WaveformController,
  xToTime,
} from './waveform-controller.js';

describe('waveform pure helpers', () => {
  it('computes bucket count within bounds', () => {
    expect(computeBucketCount(1)).toBe(300);
    expect(computeBucketCount(10)).toBe(800);
    expect(computeBucketCount(100)).toBe(2400);
  });

  it('maps view range to peak index range', () => {
    const range = getPeakIndexRange(
      { peaks: new Float32Array(100), duration: 10 },
      { start: 2, end: 5 },
    );
    expect(range.iStart).toBeGreaterThanOrEqual(0);
    expect(range.iEnd).toBeLessThan(100);
    expect(range.iEnd).toBeGreaterThanOrEqual(range.iStart);
  });

  it('converts canvas x position to time', () => {
    expect(xToTime(50, 100, 10, null)).toBe(5);
    expect(xToTime(50, 100, 10, { start: 2, end: 6 })).toBe(4);
  });

  it('normalizes peaks from audio buffer', () => {
    const buffer = {
      length: 4,
      numberOfChannels: 1,
      getChannelData: () => {
        const data = new Float32Array(4);
        data[0] = 0.2;
        data[1] = -0.8;
        data[2] = 0.4;
        data[3] = -0.1;
        return data;
      },
    } as AudioBuffer;

    const peaks = audioBufferToPeaks(buffer, 2);
    expect(peaks.length).toBe(2);
    expect(Math.max(...peaks)).toBeLessThanOrEqual(1);
    expect(Math.max(...peaks)).toBeGreaterThan(0);
  });
});

describe('WaveformController', () => {
  it('starts with empty snapshot', () => {
    const controller = new WaveformController();
    const snapshot = controller.getSnapshot();

    expect(snapshot.tracks).toEqual([]);
    expect(snapshot.activeId).toBeNull();
    expect(snapshot.isPlaying).toBe(false);
    controller.destroy();
  });

  it('prepares and updates live track peaks', () => {
    const controller = new WaveformController();
    const id = controller.prepareLiveTrack('live');
    controller.updateLivePeaks(id, new Float32Array([0.1, 0.5, 0.3]), 3);

    const snapshot = controller.getSnapshot();
    expect(snapshot.tracks).toHaveLength(1);
    expect(snapshot.activeTrack?.isLive).toBe(true);
    expect(snapshot.duration).toBe(3);
    controller.destroy();
  });

  it('changes layout and view range', () => {
    const controller = new WaveformController();
    controller.setLayout('overlay');
    controller.setViewRange({ start: 1, end: 5 });

    const snapshot = controller.getSnapshot();
    expect(snapshot.layout).toBe('overlay');
    expect(snapshot.viewRange).toEqual({ start: 1, end: 5 });
    expect(snapshot.canResetView).toBe(true);

    controller.resetView();
    expect(controller.getSnapshot().viewRange).toBeNull();
    controller.destroy();
  });
});
