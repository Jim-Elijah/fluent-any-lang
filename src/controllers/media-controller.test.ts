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
});
