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
    expect(controller.getState()).toEqual({ mode: 'idle', syncSegmentIndex: 0, paused: false });
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
    expect(state.paused).toBe(false);
    expect(source.currentTime).toBe(5);
    expect(recording.currentTime).toBe(4.5);
  });

  it('playSourceAt seeks to the requested time and plays', async () => {
    await controller.playSourceAt(3.5);
    expect(controller.getState()).toEqual({ mode: 'source', syncSegmentIndex: 0, paused: false });
    expect(source.currentTime).toBe(3.5);
    expect(source.play).toHaveBeenCalled();
    expect(recording.pause).toHaveBeenCalled();
  });

  it('playRecordingAt seeks to the requested time and plays', async () => {
    await controller.playRecordingAt(6);
    expect(controller.getState()).toEqual({
      mode: 'recording',
      syncSegmentIndex: 1,
      paused: false,
    });
    expect(recording.currentTime).toBe(6);
    expect(recording.play).toHaveBeenCalled();
    expect(source.pause).toHaveBeenCalled();
  });

  it('playSyncAt maps mid-segment times with wall-clock elapsed', async () => {
    const ok = await controller.playSyncAt(2.5, 'source');
    expect(ok).toBe(true);
    expect(controller.getState()).toEqual({ mode: 'sync', syncSegmentIndex: 0, paused: false });
    expect(source.currentTime).toBe(2.5);
    expect(recording.currentTime).toBe(2.5);
    expect(source.play).toHaveBeenCalled();
    expect(recording.play).toHaveBeenCalled();
  });

  it('playSyncAt returns false when time is outside practice segments', async () => {
    const ok = await controller.playSyncAt(99, 'source');
    expect(ok).toBe(false);
    expect(controller.getState().mode).toBe('idle');
  });

  it('ignores out-of-range sync segment index', async () => {
    await controller.playSyncFromSegment(99);
    expect(controller.getState().mode).toBe('idle');
  });

  it('stops playback and resets state', async () => {
    await controller.playSource();
    controller.stop();
    expect(controller.getState()).toEqual({ mode: 'idle', syncSegmentIndex: 0, paused: false });
    expect(source.pause).toHaveBeenCalled();
    expect(recording.pause).toHaveBeenCalled();
  });

  it('pauses without leaving play mode and resumes from the same mode', async () => {
    await controller.playSource();
    vi.mocked(source.play).mockClear();
    vi.mocked(source.pause).mockClear();

    controller.pause();
    expect(controller.getState()).toEqual({ mode: 'source', syncSegmentIndex: 0, paused: true });
    expect(source.pause).toHaveBeenCalled();

    await controller.resume();
    expect(controller.getState()).toEqual({ mode: 'source', syncSegmentIndex: 0, paused: false });
    expect(source.play).toHaveBeenCalled();
  });

  it('togglePause switches between paused and playing while keeping mode', async () => {
    await controller.playRecording();
    await controller.togglePause();
    expect(controller.getState().paused).toBe(true);
    expect(controller.getState().mode).toBe('recording');

    await controller.togglePause();
    expect(controller.getState().paused).toBe(false);
    expect(controller.getState().mode).toBe('recording');
  });

  it('goToSegment seeks within source mode and keeps pause state', async () => {
    await controller.playSource();
    await controller.togglePause();
    vi.mocked(source.play).mockClear();

    await controller.goToSegment(1);
    expect(controller.getState()).toEqual({ mode: 'source', syncSegmentIndex: 1, paused: true });
    expect(source.currentTime).toBe(segments[1].sourceStartTime);
    expect(source.play).not.toHaveBeenCalled();
  });

  it('goToSegment resumes source playback when not paused', async () => {
    await controller.playSource();
    vi.mocked(source.play).mockClear();

    await controller.goToSegment(1);
    expect(controller.getState().syncSegmentIndex).toBe(1);
    expect(source.currentTime).toBe(segments[1].sourceStartTime);
    expect(source.play).toHaveBeenCalled();
  });

  it('goToSegment seeks within sync mode while paused', async () => {
    await controller.playSyncFromSegment(0);
    controller.pause();
    vi.mocked(source.play).mockClear();
    vi.mocked(recording.play).mockClear();

    await controller.goToSegment(1);
    expect(controller.getState()).toEqual({ mode: 'sync', syncSegmentIndex: 1, paused: true });
    expect(source.currentTime).toBe(segments[1].sourceStartTime);
    expect(recording.currentTime).toBe(segments[1].recordingStartTime);
    expect(source.play).not.toHaveBeenCalled();
    expect(recording.play).not.toHaveBeenCalled();
  });

  it('ignores goToSegment while idle or out of range', async () => {
    await controller.goToSegment(0);
    expect(controller.getState().mode).toBe('idle');

    await controller.playSource();
    await controller.goToSegment(99);
    expect(controller.getState().syncSegmentIndex).toBe(0);
  });

  it('replaySegment seeks to current segment and plays even when paused', async () => {
    await controller.playSource();
    await controller.togglePause();
    source.currentTime = 2;
    vi.mocked(source.play).mockClear();

    await controller.replaySegment();
    expect(controller.getState()).toEqual({ mode: 'source', syncSegmentIndex: 0, paused: false });
    expect(source.currentTime).toBe(segments[0].sourceStartTime);
    expect(source.play).toHaveBeenCalled();
  });

  it('replaySegment can target an explicit segment index', async () => {
    await controller.playSource();
    vi.mocked(source.play).mockClear();

    await controller.replaySegment(1);
    expect(controller.getState().syncSegmentIndex).toBe(1);
    expect(source.currentTime).toBe(segments[1].sourceStartTime);
    expect(source.play).toHaveBeenCalled();
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

  it('playSync starts from the first segment', async () => {
    await controller.playSync();
    expect(controller.getState()).toEqual({ mode: 'sync', syncSegmentIndex: 0, paused: false });
  });

  it('playContinuous maps both tracks from first-segment anchors', async () => {
    const gapped: PracticeSegment[] = [
      {
        id: 'c0',
        sourceStartTime: 1,
        sourceEndTime: 3,
        recordingStartTime: 0.5,
        recordingEndTime: 2.5,
      },
      {
        id: 'c1',
        sourceStartTime: 10,
        sourceEndTime: 12,
        recordingStartTime: 9.5,
        recordingEndTime: 11.5,
      },
    ];
    controller.setSegments(gapped);
    await controller.playContinuous();
    expect(controller.getState().mode).toBe('continuous');
    expect(source.currentTime).toBe(1);
    expect(recording.currentTime).toBe(0.5);

    const ok = await controller.playContinuousAt(11, 'source');
    expect(ok).toBe(true);
    expect(source.currentTime).toBe(11);
    expect(recording.currentTime).toBeCloseTo(10.5, 5);
  });

  it('playSyncAt maps mid-segment times on the recording axis', async () => {
    const ok = await controller.playSyncAt(6, 'recording');
    expect(ok).toBe(true);
    expect(controller.getState().syncSegmentIndex).toBe(1);
    expect(recording.currentTime).toBe(6);
    expect(source.currentTime).toBe(6.5);
  });

  it('plays source and recording with empty segments', async () => {
    controller.setSegments([]);
    await controller.playSource();
    expect(controller.getState().mode).toBe('source');
    expect(source.currentTime).toBe(0);

    await controller.playRecording();
    expect(controller.getState().mode).toBe('recording');
    expect(recording.currentTime).toBe(0);
  });

  it('goToSegment seeks within recording mode', async () => {
    await controller.playRecording();
    vi.mocked(recording.play).mockClear();

    await controller.goToSegment(1);
    expect(controller.getState()).toEqual({
      mode: 'recording',
      syncSegmentIndex: 1,
      paused: false,
    });
    expect(recording.currentTime).toBe(segments[1].recordingStartTime);
    expect(recording.play).toHaveBeenCalled();
  });

  it('ignores pause and resume when idle or already in target state', async () => {
    controller.pause();
    expect(controller.getState().paused).toBe(false);

    await controller.playSource();
    controller.pause();
    controller.pause();
    expect(controller.getState().paused).toBe(true);

    await controller.resume();
    await controller.resume();
    expect(controller.getState().paused).toBe(false);
  });

  it('togglePause is a no-op while idle', async () => {
    await controller.togglePause();
    expect(controller.getState().mode).toBe('idle');
  });

  it('stops when recording ends in recording mode', async () => {
    await controller.playRecording();
    recording.dispatchEvent(new Event('ended'));
    expect(controller.getState().mode).toBe('idle');
  });

  it('updates sync segment index during source playback', async () => {
    await controller.playSourceAt(6);
    source.currentTime = 6;
    source.dispatchEvent(new Event('timeupdate'));
    expect(controller.getState().syncSegmentIndex).toBe(1);
  });

  it('corrects sync drift when recording falls behind source', async () => {
    vi.useFakeTimers();
    await controller.playSyncFromSegment(0);
    source.currentTime = 2;
    recording.currentTime = 1;
    source.dispatchEvent(new Event('timeupdate'));
    vi.advanceTimersByTime(150);
    expect(recording.currentTime).toBe(2);
    vi.useRealTimers();
  });

  it('re-syncs on visibility change while in sync mode', async () => {
    await controller.playSyncFromSegment(0);
    source.currentTime = 2;
    recording.currentTime = 1;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(recording.currentTime).toBe(2);
  });

  it('resumes sync playback for tracks still within the segment', async () => {
    await controller.playSyncFromSegment(0);
    controller.pause();
    source.currentTime = 1;
    recording.currentTime = 1;
    vi.mocked(source.play).mockClear();
    vi.mocked(recording.play).mockClear();

    await controller.resume();
    expect(source.play).toHaveBeenCalled();
    expect(recording.play).toHaveBeenCalled();
  });

  it('advances to the next sync segment when both tracks start at segment end', async () => {
    await controller.playSyncAt(segments[0].sourceEndTime, 'source');
    expect(controller.getState()).toEqual({ mode: 'sync', syncSegmentIndex: 1, paused: false });
    expect(source.currentTime).toBe(segments[1].sourceStartTime);
    expect(recording.currentTime).toBe(segments[1].recordingStartTime);
  });

  it('advances sync segments when both tracks reach the end', async () => {
    await controller.playSyncFromSegment(0);
    Object.defineProperty(source, 'paused', { configurable: true, value: false });
    Object.defineProperty(recording, 'paused', { configurable: true, value: false });

    source.currentTime = segments[0].sourceEndTime;
    recording.currentTime = segments[0].recordingEndTime;
    source.dispatchEvent(new Event('timeupdate'));

    expect(controller.getState().syncSegmentIndex).toBe(1);
  });

  it('clamps seek time to finite audio duration', async () => {
    Object.defineProperty(source, 'duration', { configurable: true, value: 8 });
    await controller.playSourceAt(99);
    expect(source.currentTime).toBe(8);
  });

  it('ignores source timeupdate handlers outside active modes', async () => {
    source.currentTime = 99;
    source.dispatchEvent(new Event('timeupdate'));
    expect(controller.getState().mode).toBe('idle');

    await controller.playRecording();
    source.dispatchEvent(new Event('timeupdate'));
    expect(controller.getState().mode).toBe('recording');
  });

  it('does not correct sync drift when source is already at segment end', async () => {
    vi.useFakeTimers();
    await controller.playSyncFromSegment(0);
    source.currentTime = segments[0].sourceEndTime;
    recording.currentTime = 0.5;
    source.dispatchEvent(new Event('timeupdate'));
    vi.advanceTimersByTime(150);
    expect(recording.currentTime).toBe(0.5);
    vi.useRealTimers();
  });
});
