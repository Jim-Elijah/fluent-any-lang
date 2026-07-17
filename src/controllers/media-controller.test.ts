import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SubtitleSegment } from '../types/models.js';
import { MediaController, type LoadedTrack } from './media-controller.js';

function makeTrack(id: string, title: string, segments: SubtitleSegment[] = []): LoadedTrack {
  return {
    item: {
      id,
      title,
      filename: `${title}.mp3`,
      size: 100,
      type: 'audio',
      mimeType: 'audio/mpeg',
      duration: 30,
      createdAt: 1,
      hasSubtitles: segments.length > 0,
    },
    blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    segments,
  };
}

function createAudioMock(): HTMLAudioElement {
  const audio = document.createElement('audio');
  audio.play = vi.fn().mockResolvedValue(undefined);
  audio.pause = vi.fn();
  audio.load = vi.fn(() => {
    queueMicrotask(() => audio.dispatchEvent(new Event('loadedmetadata')));
  });
  Object.defineProperty(audio, 'duration', { configurable: true, value: 30 });
  Object.defineProperty(audio, 'paused', { configurable: true, value: true });
  Object.defineProperty(audio, 'readyState', { configurable: true, value: 0 });
  return audio;
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
      [makeTrack('a', 'Track A', segments), makeTrack('b', 'Track B')],
      0,
    );

    const snapshot = controller.getSnapshot();
    expect(snapshot.playlist).toHaveLength(2);
    expect(snapshot.currentItem?.id).toBe('a');
    expect(snapshot.segments).toEqual(segments);
    expect(snapshot.hasSubtitles).toBe(true);
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
    await controller.loadTracks([makeTrack('a', 'Track A', segments)]);
    controller.seekToSegment(0);
    expect(controller.currentTime).toBe(0);
    expect(controller.currentSegmentIndex).toBe(0);

    controller.setNavigationLocked(true);
    expect(controller.getSnapshot().navigationLocked).toBe(true);

    controller.seek(8);
    controller.seekToSegment(1);
    controller.nextSegment();
    expect(controller.currentTime).toBe(0);
    expect(controller.currentSegmentIndex).toBe(0);

    controller.seekToSegment(1, false, { force: true });
    expect(controller.currentTime).toBe(5);
    expect(controller.currentSegmentIndex).toBe(1);

    controller.setNavigationLocked(false);
    controller.seekToSegment(0);
    expect(controller.currentTime).toBe(0);
    expect(controller.currentSegmentIndex).toBe(0);
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
});
