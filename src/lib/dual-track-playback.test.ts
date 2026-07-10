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
    expect(source.play).toHaveBeenCalled();
    expect(recording.pause).toHaveBeenCalled();
  });

  it('plays recording track and pauses source', async () => {
    await controller.playRecording();
    expect(controller.getState().mode).toBe('recording');
    expect(recording.play).toHaveBeenCalled();
    expect(source.pause).toHaveBeenCalled();
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
});
