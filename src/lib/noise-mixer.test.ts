import { afterEach, describe, expect, it, vi } from 'vitest';

import { NoiseMixer } from './noise-mixer.js';

class FakeAudio {
  static instances: FakeAudio[] = [];

  src = '';
  volume = 1;
  currentTime = 0;
  loop = false;
  preload = '';
  paused = true;
  private listeners = new Map<string, Set<EventListener>>();

  constructor() {
    FakeAudio.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    const event = { type, target: this } as unknown as Event;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  play = vi.fn(async () => {
    this.paused = false;
  });

  pause = vi.fn(() => {
    this.paused = true;
  });

  load = vi.fn();

  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });
}

describe('NoiseMixer', () => {
  const OriginalAudio = globalThis.Audio;

  afterEach(() => {
    globalThis.Audio = OriginalAudio;
    FakeAudio.instances = [];
    vi.restoreAllMocks();
  });

  it('plays and pauses all tracks with the main flag', async () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    const mixer = new NoiseMixer();
    mixer.setTracks([
      { id: 'a', url: 'https://example.com/a.mp3', volume: 0.4 },
      { id: 'b', url: 'https://example.com/b.mp3', volume: 0.8 },
    ]);
    expect(FakeAudio.instances).toHaveLength(2);
    expect(FakeAudio.instances[0].volume).toBe(0.4);

    mixer.setPlaying(true);
    await Promise.resolve();
    expect(FakeAudio.instances[0].play).toHaveBeenCalled();
    expect(FakeAudio.instances[1].play).toHaveBeenCalled();

    mixer.setPlaying(false);
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
    expect(FakeAudio.instances[1].pause).toHaveBeenCalled();

    mixer.destroy();
  });

  it('restarts a track when it ends while playing', async () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    const mixer = new NoiseMixer();
    mixer.setTracks([{ id: 'a', url: 'https://example.com/a.mp3', volume: 1 }]);
    mixer.setPlaying(true);
    await Promise.resolve();

    const audio = FakeAudio.instances[0];
    audio.play.mockClear();
    audio.currentTime = 12;
    audio.dispatch('ended');
    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalled();

    mixer.destroy();
  });

  it('clamps track volume to 100%', () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    const mixer = new NoiseMixer();
    mixer.setTracks([{ id: 'a', url: 'https://example.com/a.mp3', volume: 1.5 }]);
    expect(FakeAudio.instances[0].volume).toBe(1);

    mixer.setTrackVolume('a', 2);
    expect(FakeAudio.instances[0].volume).toBe(1);

    mixer.destroy();
  });

  it('ignores setTrackVolume for unknown track ids', () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    const mixer = new NoiseMixer();
    mixer.setTracks([{ id: 'a', url: 'https://example.com/a.mp3', volume: 0.5 }]);
    mixer.setTrackVolume('missing', 0.2);
    expect(FakeAudio.instances[0].volume).toBe(0.5);
    mixer.destroy();
  });

  it('restarts playback when tracks are replaced while playing', async () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    const mixer = new NoiseMixer();
    mixer.setTracks([{ id: 'a', url: 'https://example.com/a.mp3', volume: 1 }]);
    mixer.setPlaying(true);
    await Promise.resolve();
    const first = FakeAudio.instances[0];
    first.play.mockClear();

    mixer.setTracks([{ id: 'b', url: 'https://example.com/b.mp3', volume: 0.5 }]);
    await Promise.resolve();
    expect(FakeAudio.instances[1].play).toHaveBeenCalled();
    mixer.destroy();
  });

  it('revokes blob URLs and ignores calls after destroy', async () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const blobUrl = URL.createObjectURL(new Blob(['noise']));
    const mixer = new NoiseMixer();
    mixer.setTracks([{ id: 'a', url: blobUrl, volume: 1 }]);
    mixer.setPlaying(true);
    await Promise.resolve();

    const audio = FakeAudio.instances[0];
    audio.play.mockClear();
    mixer.setPlaying(false);
    audio.dispatch('ended');
    expect(audio.play).not.toHaveBeenCalled();

    mixer.destroy();
    expect(revokeSpy).toHaveBeenCalledWith(blobUrl);

    mixer.setPlaying(true);
    mixer.setTracks([{ id: 'c', url: 'https://example.com/c.mp3', volume: 1 }]);
    expect(FakeAudio.instances).toHaveLength(1);
    revokeSpy.mockRestore();
  });

  it('ignores per-track play failures', async () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    const mixer = new NoiseMixer();
    mixer.setTracks([{ id: 'a', url: 'https://example.com/a.mp3', volume: 1 }]);
    FakeAudio.instances[0].play = vi.fn().mockRejectedValue(new Error('blocked'));
    mixer.setPlaying(true);
    await Promise.resolve();
    expect(FakeAudio.instances[0].play).toHaveBeenCalled();
    mixer.destroy();
  });
});
