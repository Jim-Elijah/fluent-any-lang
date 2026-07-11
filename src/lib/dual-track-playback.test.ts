import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PracticeSegment } from '../types/models.js';
import { DualTrackPlayback } from './dual-track-playback.js';

function createMockAudio(): HTMLAudioElement {
  const audio = document.createElement('audio');
  audio.play = vi.fn().mockResolvedValue(undefined);
  audio.pause = vi.fn();
  return audio;
}

const segments: PracticeSegment[] = [
  {
    id: 'p0',
    sourceStartTime: 0,
    sourceEndTime: 5,
    recordingStartTime: 0,
    recordingEndTime: 4.5,
  },
  {
    id: 'p1',
    sourceStartTime: 5,
    sourceEndTime: 10,
    recordingStartTime: 4.5,
    recordingEndTime: 9,
  },
];

describe('DualTrackPlayback', () => {
  let source: HTMLAudioElement;
  let recording: HTMLAudioElement;
  let onStateChange: ReturnType<typeof vi.fn>;
  let controller: DualTrackPlayback;

  beforeEach(() => {
    source = createMockAudio();
    recording = createMockAudio();
    onStateChange = vi.fn();
    controller = new DualTrackPlayback(source, recording, segments, onStateChange);
  });

  afterEach(() => {
    controller.destroy();
  });

  it('starts in idle mode', () => {
    expect(controller.getState()).toEqual({ mode: 'idle', syncSegmentIndex: 0 });
  });

  it('plays source track and pauses recording', async () => {
    await controller.playSource();
    expect(controller.getState().mode).toBe('source');
    expect(source.currentTime).toBe(0);
    expect(source.play).toHaveBeenCalled();
    expect(recording.pause).toHaveBeenCalled();
  });

  it('seeks to first segment start when playing source with segments', async () => {
    await controller.playSource();
    expect(source.currentTime).toBe(segments[0].sourceStartTime);
  });

  it('stops source playback when reaching last segment end', async () => {
    await controller.playSource();
    source.currentTime = segments[1].sourceEndTime - 0.1;
    source.dispatchEvent(new Event('timeupdate'));
    expect(controller.getState().mode).toBe('source');

    source.currentTime = segments[1].sourceEndTime;
    source.dispatchEvent(new Event('timeupdate'));
    expect(controller.getState().mode).toBe('idle');
  });

  it('plays recording track and pauses source', async () => {
    await controller.playRecording();
    expect(controller.getState().mode).toBe('recording');
    expect(recording.currentTime).toBe(segments[0].recordingStartTime);
    expect(recording.play).toHaveBeenCalled();
    expect(source.pause).toHaveBeenCalled();
  });

  it('stops recording playback when reaching last segment end', async () => {
    await controller.playRecording();
    recording.currentTime = segments[1].recordingEndTime - 0.1;
    recording.dispatchEvent(new Event('timeupdate'));
    expect(controller.getState().mode).toBe('recording');

    recording.currentTime = segments[1].recordingEndTime;
    recording.dispatchEvent(new Event('timeupdate'));
    expect(controller.getState().mode).toBe('idle');
  });

  it('starts sync playback from a segment', async () => {
    await controller.playSyncFromSegment(1);
    const state = controller.getState();
    expect(state.mode).toBe('sync');
    expect(state.syncSegmentIndex).toBe(1);
    expect(source.currentTime).toBe(5);
    expect(recording.currentTime).toBe(4.5);
  });

  it('ignores out-of-range sync segment index', async () => {
    await controller.playSyncFromSegment(99);
    expect(controller.getState().mode).toBe('idle');
  });

  it('stops playback and resets state', async () => {
    await controller.playSource();
    controller.stop();
    expect(controller.getState()).toEqual({ mode: 'idle', syncSegmentIndex: 0 });
    expect(source.pause).toHaveBeenCalled();
    expect(recording.pause).toHaveBeenCalled();
  });

  it('stops when source ends in source mode', async () => {
    await controller.playSource();
    source.dispatchEvent(new Event('ended'));
    expect(controller.getState().mode).toBe('idle');
  });

  it('waits for the longer recording segment before ending sync playback', async () => {
    const longRecordingSegment: PracticeSegment = {
      id: 'long-recording',
      sourceStartTime: 0,
      sourceEndTime: 1,
      recordingStartTime: 0,
      recordingEndTime: 2,
    };
    controller.setSegments([longRecordingSegment]);
    await controller.playSyncFromSegment(0);
    Object.defineProperty(source, 'paused', { configurable: true, value: false });
    Object.defineProperty(recording, 'paused', { configurable: true, value: false });
    vi.mocked(source.pause).mockClear();
    vi.mocked(recording.pause).mockClear();

    source.currentTime = 1;
    source.dispatchEvent(new Event('timeupdate'));
    expect(controller.getState().mode).toBe('sync');
    expect(source.pause).toHaveBeenCalled();
    expect(recording.pause).not.toHaveBeenCalled();

    recording.currentTime = 2;
    recording.dispatchEvent(new Event('timeupdate'));
    expect(controller.getState().mode).toBe('idle');
  });

  it('waits for the longer source segment before ending sync playback', async () => {
    const longSourceSegment: PracticeSegment = {
      id: 'long-source',
      sourceStartTime: 0,
      sourceEndTime: 2,
      recordingStartTime: 0,
      recordingEndTime: 1,
    };
    controller.setSegments([longSourceSegment]);
    await controller.playSyncFromSegment(0);
    Object.defineProperty(source, 'paused', { configurable: true, value: false });
    Object.defineProperty(recording, 'paused', { configurable: true, value: false });
    vi.mocked(source.pause).mockClear();
    vi.mocked(recording.pause).mockClear();

    recording.currentTime = 1;
    recording.dispatchEvent(new Event('timeupdate'));
    expect(controller.getState().mode).toBe('sync');
    expect(recording.pause).toHaveBeenCalled();
    expect(source.pause).not.toHaveBeenCalled();

    source.currentTime = 2;
    source.dispatchEvent(new Event('timeupdate'));
    expect(controller.getState().mode).toBe('idle');
  });
});
