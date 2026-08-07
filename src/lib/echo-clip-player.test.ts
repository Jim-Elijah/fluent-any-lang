import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAudioContext } from './audio-context.js';
import { EchoClipPlayer } from './echo-clip-player.js';

vi.mock('./audio-context.js', () => ({
  getAudioContext: vi.fn(),
}));

vi.mock('./media-element-gain.js', () => ({
  attachMediaElementGain: vi.fn(() => null),
  detachMediaElementGain: vi.fn(),
  setLogicalVolume: vi.fn((element: HTMLMediaElement, volume: number) => {
    element.volume = Math.max(0, Math.min(1, volume));
  }),
}));

type MockMedia = HTMLMediaElement & {
  _currentTime: number;
  _seeking: boolean;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
};

function createMockMedia(tag: 'audio' | 'video' = 'audio'): MockMedia {
  const el = document.createElement(tag) as MockMedia;
  el._currentTime = 0;
  el._seeking = false;

  Object.defineProperty(el, 'currentTime', {
    configurable: true,
    get: () => el._currentTime,
    set: (value: number) => {
      el._currentTime = value;
      el._seeking = true;
      queueMicrotask(() => {
        el._seeking = false;
        el.dispatchEvent(new Event('seeked'));
      });
    },
  });
  Object.defineProperty(el, 'seeking', {
    configurable: true,
    get: () => el._seeking,
  });
  Object.defineProperty(el, 'paused', {
    configurable: true,
    get: () => true,
  });
  Object.defineProperty(el, 'readyState', {
    configurable: true,
    get: () => 0,
  });
  Object.defineProperty(el, 'preservesPitch', {
    configurable: true,
    writable: true,
    value: false,
  });

  el.play = vi.fn().mockResolvedValue(undefined);
  el.pause = vi.fn();
  el.load = vi.fn(() => {
    queueMicrotask(() => el.dispatchEvent(new Event('loadedmetadata')));
  });

  return el;
}

describe('EchoClipPlayer', () => {
  let media: MockMedia;
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let player: EchoClipPlayer;
  const nativeCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    vi.clearAllMocks();
    player = new EchoClipPlayer();
    media = createMockMedia('audio');
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'audio' || tagName === 'video') {
        return media;
      }
      return nativeCreateElement(tagName);
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:echo-clip');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.mocked(getAudioContext).mockReturnValue({
      state: 'running',
      outputLatency: 0,
      baseLatency: 0,
    } as unknown as AudioContext);
  });

  afterEach(() => {
    player.dispose();
    createElementSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('plays the subtitle range with rate and volume on a private media element', async () => {
    await player.prepare(new Blob(['audio'], { type: 'audio/mpeg' }));
    await player.play({ startTime: 1.5, endTime: 4 }, { playbackRate: 1.25, volume: 0.6 });

    expect(media.preservesPitch).toBe(true);
    expect(media.playbackRate).toBe(1.25);
    expect(media.volume).toBe(0.6);
    expect(media._currentTime).toBe(1.5);
    expect(media.play).toHaveBeenCalled();
    expect(player.isPlaying).toBe(true);
  });

  it('uses a video element for video blobs', async () => {
    media = createMockMedia('video');
    createElementSpy.mockImplementation((tagName: string) => {
      if (tagName === 'audio' || tagName === 'video') {
        return media;
      }
      return nativeCreateElement(tagName);
    });

    await player.prepare(new Blob(['video'], { type: 'video/mp4' }));

    expect(createElementSpy).toHaveBeenCalledWith('video');
  });

  it('does not fire onEnded after stop', async () => {
    const onEnded = vi.fn();
    player.onEnded = onEnded;

    await player.prepare(new Blob(['audio'], { type: 'audio/mpeg' }));
    await player.play({ startTime: 0, endTime: 2 }, { playbackRate: 1, volume: 1 });

    player.stop();
    media._currentTime = 2;
    media.dispatchEvent(new Event('timeupdate'));
    media.dispatchEvent(new Event('ended'));

    expect(onEnded).not.toHaveBeenCalled();
    expect(player.isPlaying).toBe(false);
    expect(media.pause).toHaveBeenCalled();
  });

  it('stops previous playback when play is called again', async () => {
    const onEnded = vi.fn();
    player.onEnded = onEnded;

    await player.prepare(new Blob(['audio'], { type: 'audio/mpeg' }));
    await player.play({ startTime: 0, endTime: 1 }, { playbackRate: 1, volume: 1 });
    await player.play({ startTime: 1, endTime: 2 }, { playbackRate: 1, volume: 1 });

    expect(media.play).toHaveBeenCalledTimes(2);
    expect(media._currentTime).toBe(1);

    media._currentTime = 0.5;
    media.dispatchEvent(new Event('timeupdate'));
    expect(onEnded).not.toHaveBeenCalled();

    media._currentTime = 2;
    media.dispatchEvent(new Event('timeupdate'));
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(player.isPlaying).toBe(false);
  });

  it('fires onEnded when the clip reaches endTime', async () => {
    const onEnded = vi.fn();
    player.onEnded = onEnded;

    await player.prepare(new Blob(['audio'], { type: 'audio/mpeg' }));
    await player.play({ startTime: 1, endTime: 3 }, { playbackRate: 1, volume: 1 });

    media._currentTime = 3;
    media.dispatchEvent(new Event('timeupdate'));

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(player.isPlaying).toBe(false);
    expect(media.pause).toHaveBeenCalled();
  });

  it('drains for the reported output latency plus safety margin', async () => {
    vi.mocked(getAudioContext).mockReturnValue({
      state: 'running',
      outputLatency: 0.12,
      baseLatency: 0.01,
    } as unknown as AudioContext);

    vi.useFakeTimers();
    try {
      const drained = vi.fn();
      void player.waitForOutputDrain().then(drained);

      await vi.advanceTimersByTimeAsync(189);
      expect(drained).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(drained).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('drains for the minimum window when latency is unreported', async () => {
    vi.useFakeTimers();
    try {
      const drained = vi.fn();
      void player.waitForOutputDrain().then(drained);

      await vi.advanceTimersByTimeAsync(79);
      expect(drained).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(drained).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reuses the prepared element for the same blob reference', async () => {
    const blob = new Blob(['audio'], { type: 'audio/mpeg' });
    await player.prepare(blob);
    await player.prepare(blob);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(createElementSpy).toHaveBeenCalledTimes(1);
  });

  it('revokes the object URL on dispose', async () => {
    await player.prepare(new Blob(['audio'], { type: 'audio/mpeg' }));
    player.dispose();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:echo-clip');
  });
});
