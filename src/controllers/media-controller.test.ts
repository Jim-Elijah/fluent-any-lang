import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockGainNode {
  gain = { value: 1 };
  disconnect = vi.fn();
  connect = vi.fn();
}

class MockMediaElementSource {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);

  createGain(): MockGainNode {
    return new MockGainNode();
  }

  createMediaElementSource(): MockMediaElementSource {
    return new MockMediaElementSource();
  }
}

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('webkitAudioContext', MockAudioContext);

import type { SubtitleSegment } from '../types/models.js';
import * as playbackUtils from '../lib/playback-utils.js';
import { ExtendedMediaEventType } from '../lib/playback-utils.js';
import { getMediaElementGain } from '../lib/media-element-gain.js';
import { MediaController, type LoadedTrack } from './media-controller.js';

type MakeTrackOptions = {
  segments?: SubtitleSegment[];
  type?: 'audio' | 'video';
};

function makeTrack(id: string, title: string, options: MakeTrackOptions = {}): LoadedTrack {
  const type = options.type ?? 'audio';
  const segments = options.segments ?? [];
  const filenameExt = type === 'video' ? 'mp4' : 'mp3';
  const mimeType = type === 'video' ? 'video/mp4' : 'audio/mpeg';
  const blobData = type === 'video' ? 'video' : 'audio';
  return {
    item: {
      id,
      title,
      filename: `${title}.${filenameExt}`,
      size: 100,
      type,
      mimeType,
      duration: 30,
      createdAt: 1,
      hasSubtitles: segments.length > 0,
    },
    blob: new Blob([blobData], { type: mimeType }),
    segments,
  };
}

function createAudioMock(paused = true): HTMLAudioElement {
  const audio = document.createElement('audio');
  audio.play = vi.fn().mockResolvedValue(undefined);
  audio.pause = vi.fn();
  audio.load = vi.fn(() => {
    queueMicrotask(() => audio.dispatchEvent(new Event('loadedmetadata')));
  });
  Object.defineProperty(audio, 'duration', { configurable: true, value: 30 });
  Object.defineProperty(audio, 'paused', { configurable: true, value: paused });
  Object.defineProperty(audio, 'readyState', { configurable: true, value: 0 });
  return audio;
}

function createVideoMock(paused = true): HTMLVideoElement {
  const video = document.createElement('video');
  video.play = vi.fn().mockResolvedValue(undefined);
  video.pause = vi.fn();
  video.load = vi.fn(() => {
    queueMicrotask(() => video.dispatchEvent(new Event('loadedmetadata')));
  });
  Object.defineProperty(video, 'duration', { configurable: true, value: 30 });
  Object.defineProperty(video, 'paused', { configurable: true, value: paused });
  Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
  return video;
}

describe('MediaController', () => {
  let controller: MediaController;
  let audio: HTMLAudioElement;

  beforeEach(() => {
    controller = new MediaController();
    audio = createAudioMock();
    controller.attachMediaElement(audio);
  });

  afterEach(() => {
    controller.destroy();
  });

  it('applies object URL when media element attaches after loadTracks', async () => {
    const lateController = new MediaController();
    await lateController.loadTracks([makeTrack('a', 'Track A')]);

    const lateAudio = createAudioMock();
    lateController.attachMediaElement(lateAudio);

    expect(lateAudio.src).toContain('blob:');
    expect(lateAudio.load).toHaveBeenCalled();
    lateController.destroy();
  });

  it('loads tracks and exposes snapshot', async () => {
    const segments: SubtitleSegment[] = [{ id: 's1', startTime: 0, endTime: 5, text: 'one' }];
    await controller.loadTracks(
      [makeTrack('a', 'Track A', { segments }), makeTrack('b', 'Track B')],
      0,
    );

    const snapshot = controller.getSnapshot();
    expect(snapshot.playlist).toHaveLength(2);
    expect(snapshot.currentItem?.id).toBe('a');
    expect(snapshot.segments).toEqual(segments);
    expect(snapshot.hasSubtitles).toBe(true);
  });

  it('exposes the current track blob via getCurrentBlob', async () => {
    expect(controller.getCurrentBlob()).toBeNull();

    const trackA = makeTrack('a', 'Track A');
    const trackB = makeTrack('b', 'Track B');
    await controller.loadTracks([trackA, trackB], 0);
    expect(controller.getCurrentBlob()).toBe(trackA.blob);

    await controller.loadTrack(1);
    expect(controller.getCurrentBlob()).toBe(trackB.blob);
  });

  it('updates current track subtitles without reloading media', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    expect(controller.getSnapshot().hasSubtitles).toBe(false);

    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 2, text: 'hello' },
      { id: 's2', startTime: 2, endTime: 4, text: 'world' },
    ];
    controller.updateCurrentTrackSubtitles(segments);

    const snapshot = controller.getSnapshot();
    expect(snapshot.hasSubtitles).toBe(true);
    expect(snapshot.segments).toEqual(segments);
    expect(snapshot.currentItem?.hasSubtitles).toBe(true);
    expect(snapshot.subtitlesVisible).toBe(true);
  });

  it('seeks within duration bounds', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    controller.seek(40);
    expect(controller.currentTime).toBe(30);
    controller.seek(-5);
    expect(controller.currentTime).toBe(0);
  });

  it('updates playback rate and volume', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    controller.setPlaybackRate(1.5);
    controller.setVolume(0.4);

    expect(audio.playbackRate).toBe(1.5);
    expect(audio.volume).toBe(0.4);
    expect(controller.getSnapshot().playbackRate).toBe(1.5);
    expect(controller.getSnapshot().volume).toBe(0.4);
  });

  it('applies gain boost above 100%', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    controller.setVolume(1.5);

    expect(audio.volume).toBe(1);
    expect(controller.getSnapshot().volume).toBe(1.5);
    expect(getMediaElementGain(audio)?.gainNode.gain.value).toBe(1.5);
  });

  it('clamps volume to maxVolumeBoost setting', async () => {
    const { setAppSettings } = await import('../lib/app-settings.js');
    setAppSettings({ maxVolumeBoost: 2.5 });
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    controller.setVolume(3);

    expect(controller.getSnapshot().volume).toBe(2.5);
  });

  it('clamps playback rate to maxPlaybackRate setting', async () => {
    const { setAppSettings } = await import('../lib/app-settings.js');
    setAppSettings({ maxPlaybackRate: 1.5 });
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    controller.setPlaybackRate(3);

    expect(controller.getSnapshot().playbackRate).toBe(1.5);
    expect(audio.playbackRate).toBe(1.5);
  });

  it('navigates to next and previous track', async () => {
    await controller.loadTracks([makeTrack('a', 'A'), makeTrack('b', 'B')]);
    await controller.nextTrack();
    expect(controller.getSnapshot().currentItem?.id).toBe('b');
    await controller.previousTrack();
    expect(controller.getSnapshot().currentItem?.id).toBe('a');
  });

  it('emits state-change events', async () => {
    const handler = vi.fn();
    controller.addEventListener('state-change', handler);
    await controller.loadTracks([makeTrack('a', 'A')]);
    controller.setSubtitlesVisible(false);
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls.at(-1)?.[0]).toBeInstanceOf(CustomEvent);
  });

  it('blocks seek and segment navigation while navigationLocked', async () => {
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'one' },
      { id: 's2', startTime: 5, endTime: 10, text: 'two' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.seekToSegment(0);
    expect(controller.currentTime).toBe(0);
    expect(controller.currentSegmentIndex).toBe(0);

    controller.setNavigationLocked(true);
    expect(controller.getSnapshot().navigationLocked).toBe(true);

    audio.play.mockClear();
    controller.seek(8);
    controller.seekToSegment(1);
    controller.nextSegment();
    controller.replaySegment();
    expect(controller.currentTime).toBe(0);
    expect(controller.currentSegmentIndex).toBe(0);
    expect(audio.play).not.toHaveBeenCalled();

    controller.seekToSegment(1, false, { force: true });
    expect(controller.currentTime).toBe(5);
    expect(controller.currentSegmentIndex).toBe(1);

    controller.setNavigationLocked(false);
    controller.seekToSegment(0);
    expect(controller.currentTime).toBe(0);
    expect(controller.currentSegmentIndex).toBe(0);
  });

  it('replays the current segment from the start and auto-plays', async () => {
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'one' },
      { id: 's2', startTime: 5, endTime: 10, text: 'two' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.seekToSegment(1);
    controller.seek(7);
    expect(controller.currentSegmentIndex).toBe(1);
    expect(controller.currentTime).toBe(7);
    expect(controller.getSnapshot().canReplaySegment).toBe(true);

    audio.play.mockClear();
    controller.replaySegment();

    expect(controller.currentSegmentIndex).toBe(1);
    expect(controller.currentTime).toBe(5);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('clears pending segment pause when replaying', async () => {
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'one' },
      { id: 's2', startTime: 5, endTime: 10, text: 'two' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.setPauseMode('seconds');
    controller.setPauseSeconds(2);
    controller.seekToSegment(0);

    (
      controller as unknown as {
        _applySegmentPause: (segment: SubtitleSegment) => void;
      }
    )._applySegmentPause(segments[0]!);
    expect(controller.getSnapshot().segmentPausePending).toBe(true);

    audio.play.mockClear();
    controller.replaySegment();

    expect(controller.getSnapshot().segmentPausePending).toBe(false);
    expect(controller.currentSegmentIndex).toBe(0);
    expect(controller.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('shadowing gap compress waits on ended sentence then seeks and resumes', async () => {
    vi.useFakeTimers();
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 2, text: 'one' },
      { id: 's2', startTime: 10, endTime: 12, text: 'two' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.setShadowingGapCompress(true);
    controller.setPauseMode('seconds');
    controller.setPauseSeconds(5);
    controller.seekToSegment(0);
    audio.play.mockClear();

    (
      controller as unknown as {
        _applySegmentPause: (segment: SubtitleSegment) => void;
      }
    )._applySegmentPause(segments[0]!);

    expect(controller.currentSegmentIndex).toBe(0);
    expect(controller.currentTime).toBe(0);
    expect(controller.getSnapshot().segmentPausePending).toBe(true);
    expect(audio.play).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.currentSegmentIndex).toBe(1);
    expect(controller.currentTime).toBe(10);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().segmentPausePending).toBe(false);
    vi.useRealTimers();
  });

  it('shadowing gap compress does not snap back when timeupdate lands in inter-cue gap', async () => {
    vi.useFakeTimers();
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 2, text: 'one' },
      { id: 's2', startTime: 10, endTime: 12, text: 'two' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.setShadowingGapCompress(true);
    controller.seekToSegment(0);

    (
      controller as unknown as {
        _applySegmentPause: (segment: SubtitleSegment) => void;
      }
    )._applySegmentPause(segments[0]!);
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.currentSegmentIndex).toBe(1);

    const regressIndexes: number[] = [];
    controller.addEventListener(ExtendedMediaEventType.SEGMENT_CHANGE, ((event: Event) => {
      const detail = (event as CustomEvent<{ currentIndex: number }>).detail;
      regressIndexes.push(detail.currentIndex);
    }) as EventListener);

    // Browser seek can briefly report a time in the hollow between cues.
    // findSegmentIndex keeps the previous cue there — must not emit SEGMENT_CHANGE back.
    Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 5 });
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    audio.dispatchEvent(new Event('timeupdate'));

    expect(controller.currentSegmentIndex).toBe(1);
    expect(regressIndexes).toEqual([]);
    vi.useRealTimers();
  });

  it('blocks track navigation while navigationLocked unless forced', async () => {
    await controller.loadTracks([makeTrack('a', 'A'), makeTrack('b', 'B')]);
    controller.setNavigationLocked(true);

    await controller.nextTrack(true);
    expect(controller.getSnapshot().currentItem?.id).toBe('a');

    await controller.nextTrack(true, { force: true });
    expect(controller.getSnapshot().currentItem?.id).toBe('b');
  });

  it('snaps currentTime to duration when playback ends naturally', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 29.7 });
    Object.defineProperty(audio, 'duration', { configurable: true, value: 30 });
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });

    audio.dispatchEvent(new Event('ended'));

    const snapshot = controller.getSnapshot();
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.currentTime).toBe(30);
    expect(snapshot.duration).toBe(30);
  });

  it('snaps to duration on pause when media has already ended', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 29.7 });
    Object.defineProperty(audio, 'duration', { configurable: true, value: 30 });
    Object.defineProperty(audio, 'paused', { configurable: true, value: true });
    Object.defineProperty(audio, 'ended', { configurable: true, value: true });

    audio.dispatchEvent(new Event('pause'));

    const snapshot = controller.getSnapshot();
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.currentTime).toBe(30);
    expect(snapshot.duration).toBe(30);
  });

  it('does not skip video when audio ended advances to a video track', async () => {
    const activeAudio = createAudioMock(false);
    controller.destroy();
    controller = new MediaController();
    controller.attachMediaElement(activeAudio);
    controller.setLoopMode('list');
    await controller.loadTracks([
      makeTrack('a', 'Audio A', { type: 'audio' }),
      makeTrack('v', 'Video V', { type: 'video' }),
      makeTrack('b', 'Audio B', { type: 'audio' }),
    ]);

    activeAudio.dispatchEvent(new Event('ended'));
    expect(controller.getSnapshot().currentItem?.id).toBe('v');
    expect(activeAudio.load).toHaveBeenCalledTimes(1);

    const video = createVideoMock(false);
    controller.attachMediaElement(video);
    expect(video.load).toHaveBeenCalledTimes(1);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().currentItem?.id).toBe('v');
  });

  it('play is a no-op without a media element', async () => {
    const bare = new MediaController();
    await bare.loadTracks([makeTrack('a', 'A')]);
    await expect(bare.play()).resolves.toBeUndefined();
    bare.destroy();
  });

  it('toggles play and pause from controller state', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    controller.isPlaying = false;
    await controller.togglePlay();
    expect(audio.play).toHaveBeenCalledTimes(1);

    controller.isPlaying = true;
    await controller.togglePlay();
    expect(audio.pause).toHaveBeenCalled();
  });

  it('pauses playback explicitly', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    controller.pause();
    expect(audio.pause).toHaveBeenCalled();
  });

  it('skips re-attaching the same media element', () => {
    const addListenerSpy = vi.spyOn(audio, 'addEventListener');
    controller.attachMediaElement(audio);
    addListenerSpy.mockClear();
    controller.attachMediaElement(audio);
    expect(addListenerSpy).not.toHaveBeenCalled();
  });

  it('clears state when loading an empty track list', async () => {
    await controller.loadTracks([]);
    const snapshot = controller.getSnapshot();
    expect(snapshot.playlist).toEqual([]);
    expect(snapshot.currentItem).toBeNull();
    expect(snapshot.duration).toBe(0);
  });

  it('ignores segment loop and pause modes without subtitles', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    controller.setLoopMode('list');
    controller.setLoopMode('segment');
    expect(controller.getSnapshot().loopMode).toBe('list');

    controller.setPauseMode('seconds');
    expect(controller.getSnapshot().pauseMode).toBe('off');
  });

  it('navigates between subtitle segments', async () => {
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'one' },
      { id: 's2', startTime: 5, endTime: 10, text: 'two' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.nextSegment();
    expect(controller.currentSegmentIndex).toBe(1);
    expect(controller.currentTime).toBe(5);
    controller.previousSegment();
    expect(controller.currentSegmentIndex).toBe(0);
    expect(controller.currentTime).toBe(0);
  });

  it('does not advance segments at boundaries', async () => {
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'one' },
      { id: 's2', startTime: 5, endTime: 10, text: 'two' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.previousSegment();
    expect(controller.currentSegmentIndex).toBe(0);
    controller.seekToSegment(1);
    controller.nextSegment();
    expect(controller.currentSegmentIndex).toBe(1);
  });

  it('loops a single track from the start when playback ends', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    controller.setLoopMode('single');
    audio.play.mockClear();
    audio.dispatchEvent(new Event('ended'));
    expect(controller.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('navigates via shuffle order on next track', async () => {
    vi.spyOn(playbackUtils, 'shuffleIndices').mockReturnValue([1, 2, 0]);
    await controller.loadTracks([makeTrack('a', 'A'), makeTrack('b', 'B'), makeTrack('c', 'C')]);
    controller.setLoopMode('shuffle');
    await new Promise<void>((resolve) => {
      controller.addEventListener('state-change', () => resolve(), { once: true });
      controller.nextTrack();
    });
    expect(controller.getSnapshot().currentItem?.id).toBe('b');
  });

  it('replays the current segment when segment loop ends naturally', async () => {
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'one' },
      { id: 's2', startTime: 5, endTime: 10, text: 'two' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.setLoopMode('segment');
    controller.seekToSegment(1);
    audio.play.mockClear();
    audio.dispatchEvent(new Event('ended'));
    expect(controller.currentTime).toBe(5);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('loops within the active segment during playback', async () => {
    const segments: SubtitleSegment[] = [{ id: 's1', startTime: 0, endTime: 5, text: 'one' }];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.setLoopMode('segment');
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      value: 4.99,
      writable: true,
    });
    audio.dispatchEvent(new Event('timeupdate'));
    expect(audio.currentTime).toBe(0);
    expect(controller.currentTime).toBe(0);
  });

  it('keeps looping the same segment when rewind lands in the pre-segment gap', async () => {
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'His name?' },
      { id: 's2', startTime: 5.25, endTime: 8, text: 'His name is Armand.' },
      { id: 's3', startTime: 8.4, endTime: 12, text: 'next' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.setLoopMode('segment');
    controller.seekToSegment(1);
    expect(controller.currentSegmentIndex).toBe(1);

    let audioTime = 5.25;
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => audioTime,
      set: (value: number) => {
        audioTime = value;
      },
    });

    // Near end → rewind to start
    audioTime = 7.99;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(audioTime).toBe(5.25);
    expect(controller.currentSegmentIndex).toBe(1);

    // Browser seek undershoots into the gap between s1.end (5) and s2.start (5.25)
    audioTime = 5.1;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(controller.currentSegmentIndex).toBe(1);
  });

  it('detects segment end during playback and emits segment-end', async () => {
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'one' },
      { id: 's2', startTime: 5, endTime: 10, text: 'two' },
    ];
    const segmentEndHandler = vi.fn();
    controller.addEventListener(ExtendedMediaEventType.SEGMENT_END, segmentEndHandler);
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 5.1, writable: true });
    audio.dispatchEvent(new Event('timeupdate'));
    expect(segmentEndHandler).toHaveBeenCalledTimes(1);
    expect(segmentEndHandler.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        detail: expect.objectContaining({ segmentIndex: 0 }),
      }),
    );
  });

  it('does not emit SEGMENT_END from stale currentTime after async seek restart', async () => {
    // Echo listen cancel mid-cue then restart: seek() updates controller clocks to
    // segment start, but the element may still report the pre-seek time until seeked.
    // A timeupdate in that window must not treat (prev=start, curr=near-end) as a real end.
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'one' },
      { id: 's2', startTime: 5, endTime: 10, text: 'two' },
    ];
    const segmentEndHandler = vi.fn();
    controller.addEventListener(ExtendedMediaEventType.SEGMENT_END, segmentEndHandler);
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);

    let audioTime = 4.99;
    let seeking = false;
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => audioTime,
      set: (value: number) => {
        seeking = true;
        // Defer applying the seek target (browser async seek).
        queueMicrotask(() => {
          audioTime = value;
          seeking = false;
          audio.dispatchEvent(new Event('seeked'));
        });
      },
    });
    Object.defineProperty(audio, 'seeking', {
      configurable: true,
      get: () => seeking,
    });

    // Mid-cue cancel position, then echo restart seek+play.
    Object.defineProperty(audio, 'paused', { configurable: true, value: true });
    controller.seek(0, { force: true });
    expect(controller.getSnapshot().currentTime).toBe(0);

    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    // Stale timeupdate before seek settles — must not fire SEGMENT_END.
    audio.dispatchEvent(new Event('timeupdate'));
    expect(segmentEndHandler).not.toHaveBeenCalled();

    await Promise.resolve(); // seek microtask applies
    audioTime = 5.1;
    audio.dispatchEvent(new Event('timeupdate'));
    expect(segmentEndHandler).toHaveBeenCalledTimes(1);
  });

  it('awaits async seek before play so echo listen does not resume mid-cue', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);

    let audioTime = 4.5;
    let seeking = false;
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => audioTime,
      set: (value: number) => {
        seeking = true;
        queueMicrotask(() => {
          audioTime = value;
          seeking = false;
          audio.dispatchEvent(new Event('seeked'));
        });
      },
    });
    Object.defineProperty(audio, 'seeking', {
      configurable: true,
      get: () => seeking,
    });

    audio.play.mockClear();
    controller.seek(0, { force: true });
    const playPromise = controller.play();
    expect(audio.play).not.toHaveBeenCalled();

    await Promise.resolve(); // seeked
    await playPromise;
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audioTime).toBe(0);
  });

  it('seekToSegmentAsync resolves only after seeked', async () => {
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'one' },
      { id: 's2', startTime: 5, endTime: 10, text: 'two' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);

    let audioTime = 7;
    let seeking = false;
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => audioTime,
      set: (value: number) => {
        seeking = true;
        queueMicrotask(() => {
          audioTime = value;
          seeking = false;
          audio.dispatchEvent(new Event('seeked'));
        });
      },
    });
    Object.defineProperty(audio, 'seeking', {
      configurable: true,
      get: () => seeking,
    });

    const done = controller.seekToSegmentAsync(0, false, { force: true });
    expect(audioTime).toBe(7);
    await done;
    expect(audioTime).toBe(0);
  });

  it('does not settle superseded seek early when two seeks target the same time', async () => {
    const segments: SubtitleSegment[] = [{ id: 's1', startTime: 0, endTime: 5, text: 'one' }];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);

    let audioTime = 4.5;
    let seeking = false;
    const pendingApplies: Array<() => void> = [];
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => audioTime,
      set: (value: number) => {
        seeking = true;
        pendingApplies.push(() => {
          audioTime = value;
          seeking = false;
          audio.dispatchEvent(new Event('seeked'));
        });
      },
    });
    Object.defineProperty(audio, 'seeking', {
      configurable: true,
      get: () => seeking,
    });

    controller.seek(0, { force: true });
    controller.seek(0, { force: true });
    expect(pendingApplies).toHaveLength(2);

    const playPromise = controller.play();
    expect(audio.play).not.toHaveBeenCalled();

    pendingApplies[0]!();
    await Promise.resolve();
    await Promise.resolve();
    expect(audio.play).not.toHaveBeenCalled();

    pendingApplies[1]!();
    await Promise.resolve();
    await playPromise;
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audioTime).toBe(0);
  });

  it('applies segment pause and resumes after the configured delay', async () => {
    vi.useFakeTimers();
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'one' },
      { id: 's2', startTime: 5, endTime: 10, text: 'two' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.setPauseMode('seconds');
    controller.setPauseSeconds(2);
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 5.1, writable: true });
    audio.dispatchEvent(new Event('timeupdate'));

    expect(controller.getSnapshot().segmentPausePending).toBe(true);
    expect(audio.pause).toHaveBeenCalled();

    audio.play.mockClear();
    vi.advanceTimersByTime(2100);
    expect(controller.getSnapshot().segmentPausePending).toBe(false);
    expect(audio.play).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('cancels pending segment pause', async () => {
    const segments: SubtitleSegment[] = [{ id: 's1', startTime: 0, endTime: 5, text: 'one' }];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.setPauseMode('seconds');
    (
      controller as unknown as { _applySegmentPause: (segment: SubtitleSegment) => void }
    )._applySegmentPause(segments[0]!);
    expect(controller.getSnapshot().segmentPausePending).toBe(true);

    controller.cancelSegmentPause();
    expect(controller.getSnapshot().segmentPausePending).toBe(false);
  });

  it('resumes playback when seeking to another segment during segment pause', async () => {
    vi.useFakeTimers();
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'one' },
      { id: 's2', startTime: 5, endTime: 10, text: 'two' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.setPauseMode('seconds');
    controller.setPauseSeconds(2);
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 5.1, writable: true });
    audio.dispatchEvent(new Event('timeupdate'));

    expect(controller.getSnapshot().segmentPausePending).toBe(true);
    Object.defineProperty(audio, 'paused', { configurable: true, value: true });

    audio.play.mockClear();
    controller.seekToSegment(1);

    expect(controller.getSnapshot().segmentPausePending).toBe(false);
    expect(controller.currentSegmentIndex).toBe(1);
    expect(controller.currentTime).toBe(5);
    expect(audio.play).toHaveBeenCalledTimes(1);

    audio.play.mockClear();
    vi.advanceTimersByTime(2100);
    expect(audio.play).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not auto-play when seeking after a user pause', async () => {
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 5, text: 'one' },
      { id: 's2', startTime: 5, endTime: 10, text: 'two' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.setPauseMode('seconds');
    controller.setPauseSeconds(2);
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    await controller.play();
    controller.pause();
    Object.defineProperty(audio, 'paused', { configurable: true, value: true });

    audio.play.mockClear();
    controller.seekToSegment(1);

    expect(controller.getSnapshot().segmentPausePending).toBe(false);
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('expires the sleep timer and pauses playback', async () => {
    vi.useFakeTimers();
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    controller.setSleepMinutes(1);
    controller.setSleepMode('minutes');
    expect(controller.getSnapshot().sleepRemainingSeconds).toBe(60);

    vi.advanceTimersByTime(61_000);
    expect(controller.getSnapshot().sleepMode).toBe('off');
    expect(audio.pause).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('clears sleep-until-end when the track ends', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    controller.setSleepMode('until-end');
    audio.dispatchEvent(new Event('ended'));
    expect(controller.getSnapshot().sleepMode).toBe('off');
    expect(audio.pause).toHaveBeenCalled();
  });

  it('cancelSleep turns off sleep mode', async () => {
    controller.setSleepMode('until-end');
    controller.cancelSleep();
    expect(controller.getSnapshot().sleepMode).toBe('off');
    expect(controller.getSnapshot().sleepActive).toBe(false);
  });

  it('clamps sleep minutes to the configured maximum', async () => {
    const { MAX_SLEEP_MINUTES } = await import('../lib/playback-utils.js');
    controller.setSleepMinutes(MAX_SLEEP_MINUTES + 100);
    expect(controller.getSnapshot().sleepMinutes).toBe(MAX_SLEEP_MINUTES);
  });

  it('resets player settings to defaults', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    controller.setVolume(0.5);
    controller.setPlaybackRate(1.5);
    controller.setSubtitlesVisible(false);
    controller.setSleepMode('until-end');
    controller.resetSettings();

    const snapshot = controller.getSnapshot();
    expect(snapshot.volume).toBe(1);
    expect(snapshot.playbackRate).toBe(1);
    expect(snapshot.subtitlesVisible).toBe(true);
    expect(snapshot.sleepMode).toBe('off');
    expect(audio.playbackRate).toBe(1);
  });

  it('forwards native media events with the original event detail', async () => {
    const waitingHandler = vi.fn();
    controller.addEventListener('waiting', waitingHandler);
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    const nativeEvent = new Event('waiting');
    audio.dispatchEvent(nativeEvent);
    expect(waitingHandler).toHaveBeenCalledTimes(1);
    expect(waitingHandler.mock.calls[0]?.[0]).toBeInstanceOf(CustomEvent);
    expect((waitingHandler.mock.calls[0]?.[0] as CustomEvent).detail.originalEvent).toBe(
      nativeEvent,
    );
  });

  it('syncs playback on visibility change while playing', async () => {
    const segments: SubtitleSegment[] = [{ id: 's1', startTime: 0, endTime: 5, text: 'one' }];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 2.5, writable: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(controller.currentTime).toBe(2.5);
  });

  it('does not update subtitles when updateCurrentTrackSubtitles has no active track', () => {
    controller.updateCurrentTrackSubtitles([{ id: 's1', startTime: 0, endTime: 1, text: 'x' }]);
    expect(controller.getSnapshot().segments).toEqual([]);
  });

  it('returns early from loadTrack when the track slot is empty', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    const snapshotBefore = controller.getSnapshot();
    (controller as unknown as { tracks: (LoadedTrack | undefined)[] }).tracks = [undefined];
    await controller.loadTrack(0);
    expect(controller.getSnapshot().currentItem?.id).toBe(snapshotBefore.currentItem?.id);
  });

  it('pauses immediately when sleep minutes is zero', async () => {
    await controller.loadTracks([makeTrack('a', 'Track A')]);
    audio.pause.mockClear();
    controller.setSleepMinutes(0);
    controller.setSleepMode('minutes');
    expect(controller.getSnapshot().sleepMode).toBe('off');
    expect(audio.pause).toHaveBeenCalled();
  });

  it('resumes into segment loop after percent-based segment pause', async () => {
    vi.useFakeTimers();
    const segments: SubtitleSegment[] = [{ id: 's1', startTime: 0, endTime: 5, text: 'one' }];
    await controller.loadTracks([makeTrack('a', 'Track A', { segments })]);
    controller.setLoopMode('segment');
    controller.setPauseMode('percentage');
    controller.setPausePercent(200);
    controller.seekToSegment(0);
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 5.1, writable: true });
    audio.dispatchEvent(new Event('timeupdate'));

    expect(controller.getSnapshot().segmentPausePending).toBe(true);
    audio.play.mockClear();
    vi.advanceTimersByTime(10_100);
    expect(controller.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
