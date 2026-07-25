import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDecodeAudioData = vi.fn();

vi.mock('../lib/audio-context.js', () => ({
  getAudioContext: vi.fn(() => ({
    decodeAudioData: mockDecodeAudioData,
  })),
}));

import { getAudioContext } from '../lib/audio-context.js';
import {
  audioBufferToPeaks,
  computeBucketCount,
  getPeakIndexRange,
  WaveformController,
  WaveformEventType,
  xToTime,
} from './waveform-controller.js';

function makeDecodedBuffer(duration = 5, length = 100): AudioBuffer {
  return {
    duration,
    length,
    sampleRate: 48_000,
    numberOfChannels: 1,
    getChannelData: () => {
      const data = new Float32Array(length);
      data[0] = 0.2;
      data[Math.floor(length / 2)] = -0.8;
      return data;
    },
  } as AudioBuffer;
}

function prepareTrack(controller: WaveformController, name = 'live'): string {
  const id = controller.prepareLiveTrack(name);
  controller.updateLivePeaks(id, new Float32Array([0.1, 0.5, 0.3]), 10);
  controller.setActiveId(id);
  const audio = controller.getAudioElement(id)!;
  audio.play = vi.fn().mockResolvedValue(undefined);
  audio.pause = vi.fn();
  Object.defineProperty(audio, 'paused', { configurable: true, value: true });
  Object.defineProperty(audio, 'currentTime', { configurable: true, value: 0, writable: true });
  return id;
}

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

  it('returns zero-width peak range for empty peaks', () => {
    expect(getPeakIndexRange({ peaks: new Float32Array(0), duration: 10 }, null)).toEqual({
      iStart: 0,
      iEnd: 0,
    });
  });

  it('returns full peak range when duration is zero', () => {
    expect(getPeakIndexRange({ peaks: new Float32Array(5), duration: 0 }, null)).toEqual({
      iStart: 0,
      iEnd: 4,
    });
  });

  it('converts canvas x position to time', () => {
    expect(xToTime(50, 100, 10, null)).toBe(5);
    expect(xToTime(50, 100, 10, { start: 2, end: 6 })).toBe(4);
    expect(xToTime(-10, 100, 10, null)).toBe(0);
    expect(xToTime(150, 100, 10, null)).toBe(10);
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
  beforeEach(() => {
    mockDecodeAudioData.mockReset();
    mockDecodeAudioData.mockResolvedValue(makeDecodedBuffer());
    vi.mocked(getAudioContext).mockReturnValue({
      decodeAudioData: mockDecodeAudioData,
    } as unknown as AudioContext);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('plays, pauses, toggles, stops, and seeks the active track', async () => {
    const controller = new WaveformController();
    const id = prepareTrack(controller);
    const audio = controller.getAudioElement(id)!;

    await controller.play();
    expect(audio.play).toHaveBeenCalledTimes(1);

    controller.pause();
    expect(audio.pause).toHaveBeenCalledTimes(1);

    controller.isPlaying = true;
    await controller.togglePlay();
    expect(audio.pause).toHaveBeenCalledTimes(2);

    controller.isPlaying = false;
    await controller.togglePlay();
    expect(audio.play).toHaveBeenCalledTimes(2);

    controller.seek(12);
    expect(audio.currentTime).toBe(10);
    expect(controller.getSnapshot().currentTime).toBe(10);

    controller.stop();
    expect(audio.pause).toHaveBeenCalledTimes(3);
    expect(controller.getSnapshot().currentTime).toBe(0);
    expect(controller.getSnapshot().isPlaying).toBe(false);
    controller.destroy();
  });

  it('pauses the previous track when switching active id', () => {
    const controller = new WaveformController();
    const id1 = prepareTrack(controller, 'a');
    const id2 = prepareTrack(controller, 'b');
    const audio1 = controller.getAudioElement(id1)!;
    Object.defineProperty(audio1, 'paused', { configurable: true, value: false });

    controller.setActiveId(id1);
    controller.setActiveId(id2);

    expect(audio1.pause).toHaveBeenCalled();
    expect(controller.getSnapshot().activeId).toBe(id2);
    controller.destroy();
  });

  it('removes and clears tracks while dispatching track-change', () => {
    const controller = new WaveformController();
    const id1 = prepareTrack(controller, 'a');
    const id2 = controller.prepareLiveTrack('b');
    controller.setActiveId(id1);
    const trackChangeHandler = vi.fn();
    controller.addEventListener(WaveformEventType.TRACK_CHANGE, trackChangeHandler);

    controller.removeTrack(id1);
    expect(controller.getSnapshot().activeId).toBe(id2);
    expect(trackChangeHandler).toHaveBeenCalled();

    controller.clearTracks();
    expect(controller.getSnapshot().tracks).toEqual([]);
    expect(controller.getSnapshot().activeId).toBeNull();
    controller.destroy();
  });

  it('adds tracks from blob data and finalizes live tracks', async () => {
    const controller = new WaveformController();
    const blob = new Blob(['audio'], { type: 'audio/mpeg' });
    const id = await controller.addFromBlob(blob, 'demo');

    expect(mockDecodeAudioData).toHaveBeenCalled();
    expect(controller.getSnapshot().tracks.some((track) => track.id === id)).toBe(true);

    const liveId = controller.prepareLiveTrack('recording');
    await controller.finalizeLiveTrack(liveId, blob);
    const finalized = controller.getSnapshot().tracks.find((track) => track.id === liveId);
    expect(finalized?.isLive).toBe(false);
    expect(finalized?.duration).toBe(5);
    controller.destroy();
  });

  it('notifies live extension when peaks update', () => {
    const controller = new WaveformController();
    const extension = { updateLivePeaks: vi.fn() };
    controller.setLiveExtension(extension);
    const id = controller.prepareLiveTrack('live');
    const peaks = new Float32Array([0.2, 0.4]);
    controller.updateLivePeaks(id, peaks, 4);

    expect(extension.updateLivePeaks).toHaveBeenCalledWith(id, peaks);
    controller.destroy();
  });

  it('loops playback within the selected view range', () => {
    vi.useFakeTimers();
    const controller = new WaveformController();
    const id = prepareTrack(controller);
    const audio = controller.getAudioElement(id)!;
    controller.setViewRange({ start: 2, end: 5 });
    controller.setLoopSelection(true);
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 5.1, writable: true });

    audio.dispatchEvent(new Event('timeupdate'));
    expect(audio.currentTime).toBe(2);
    expect(controller.getSnapshot().currentTime).toBe(2);
    controller.destroy();
  });

  it('clears loop selection when view range is reset', () => {
    const controller = new WaveformController();
    prepareTrack(controller);
    controller.setViewRange({ start: 1, end: 4 });
    controller.setLoopSelection(true);
    controller.resetView();
    expect(controller.getSnapshot().loopSelection).toBe(false);
    expect(controller.getSnapshot().canLoopSelection).toBe(false);
    controller.destroy();
  });

  it('ignores loop selection when no view range is set', () => {
    const controller = new WaveformController();
    prepareTrack(controller);
    controller.setLoopSelection(true);
    expect(controller.getSnapshot().loopSelection).toBe(false);
    controller.toggleLoopSelection();
    expect(controller.getSnapshot().loopSelection).toBe(false);
    controller.destroy();
  });

  it('emits view-range-change when the zoom window changes', () => {
    const controller = new WaveformController();
    const handler = vi.fn();
    controller.addEventListener(WaveformEventType.VIEW_RANGE_CHANGE, handler);
    controller.setViewRange({ start: 1, end: 3 });
    expect(handler).toHaveBeenCalledTimes(1);
    controller.resetView();
    expect(handler).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it('polls playback position while playing', () => {
    vi.useFakeTimers();
    const controller = new WaveformController();
    const id = prepareTrack(controller);
    const audio = controller.getAudioElement(id)!;
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 3, writable: true });
    audio.dispatchEvent(new Event('play'));

    vi.advanceTimersByTime(250);
    expect(controller.getSnapshot().currentTime).toBe(3);
    controller.destroy();
  });
});
