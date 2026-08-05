import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAudioContext } from './audio-context.js';
import { EchoClipPlayer } from './echo-clip-player.js';

vi.mock('./audio-context.js', () => ({
  getAudioContext: vi.fn(),
}));

type MockSource = {
  buffer: AudioBuffer | null;
  playbackRate: { value: number };
  onended: ((ev?: Event) => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

type MockGain = {
  gain: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

function createMockAudioContext() {
  const buffer = {
    length: 100,
    numberOfChannels: 1,
    sampleRate: 10,
    duration: 10,
    getChannelData: () => new Float32Array(100),
  } as unknown as AudioBuffer;

  const sources: MockSource[] = [];
  const gains: MockGain[] = [];

  const ctx = {
    state: 'running' as AudioContextState,
    currentTime: 0,
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    decodeAudioData: vi.fn(async () => buffer),
    createBufferSource: vi.fn(() => {
      const source: MockSource = {
        buffer: null,
        playbackRate: { value: 1 },
        onended: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(source);
      return source;
    }),
    createGain: vi.fn(() => {
      const gain: MockGain = {
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    }),
    destination: {} as AudioDestinationNode,
  };

  return { ctx, buffer, sources, gains };
}

describe('EchoClipPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays the exact subtitle range with rate and volume on the nodes', async () => {
    const { ctx, sources, gains } = createMockAudioContext();
    vi.mocked(getAudioContext).mockReturnValue(ctx as unknown as AudioContext);

    const player = new EchoClipPlayer();
    await player.prepare(new Blob(['audio']));
    await player.play({ startTime: 1.5, endTime: 4 }, { playbackRate: 1.25, volume: 0.6 });

    expect(sources).toHaveLength(1);
    expect(gains).toHaveLength(1);
    expect(sources[0]!.playbackRate.value).toBe(1.25);
    expect(gains[0]!.gain.value).toBe(0.6);
    expect(sources[0]!.start).toHaveBeenCalledWith(0, 1.5, 2.5);
    expect(player.isPlaying).toBe(true);
  });

  it('does not fire onEnded after stop for a superseded source', async () => {
    const { ctx, sources } = createMockAudioContext();
    vi.mocked(getAudioContext).mockReturnValue(ctx as unknown as AudioContext);

    const onEnded = vi.fn();
    const player = new EchoClipPlayer();
    player.onEnded = onEnded;

    await player.prepare(new Blob(['audio']));
    await player.play({ startTime: 0, endTime: 2 }, { playbackRate: 1, volume: 1 });
    const first = sources[0]!;

    player.stop();
    first.onended?.(new Event('ended'));

    expect(onEnded).not.toHaveBeenCalled();
    expect(player.isPlaying).toBe(false);
    expect(first.stop).toHaveBeenCalled();
    expect(first.disconnect).toHaveBeenCalled();
  });

  it('destroys the previous source when play is called again', async () => {
    const { ctx, sources } = createMockAudioContext();
    vi.mocked(getAudioContext).mockReturnValue(ctx as unknown as AudioContext);

    const onEnded = vi.fn();
    const player = new EchoClipPlayer();
    player.onEnded = onEnded;

    await player.prepare(new Blob(['audio']));
    await player.play({ startTime: 0, endTime: 1 }, { playbackRate: 1, volume: 1 });
    await player.play({ startTime: 1, endTime: 2 }, { playbackRate: 1, volume: 1 });

    expect(sources).toHaveLength(2);
    expect(sources[0]!.stop).toHaveBeenCalled();
    expect(sources[0]!.disconnect).toHaveBeenCalled();
    expect(sources[1]!.start).toHaveBeenCalledWith(0, 1, 1);

    sources[0]!.onended?.(new Event('ended'));
    expect(onEnded).not.toHaveBeenCalled();

    sources[1]!.onended?.(new Event('ended'));
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(player.isPlaying).toBe(false);
  });

  it('drains for the reported output latency plus safety margin', async () => {
    const { ctx } = createMockAudioContext();
    Object.assign(ctx, { outputLatency: 0.12, baseLatency: 0.01 });
    vi.mocked(getAudioContext).mockReturnValue(ctx as unknown as AudioContext);

    vi.useFakeTimers();
    try {
      const player = new EchoClipPlayer();
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
    const { ctx } = createMockAudioContext();
    vi.mocked(getAudioContext).mockReturnValue(ctx as unknown as AudioContext);

    vi.useFakeTimers();
    try {
      const player = new EchoClipPlayer();
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

  it('reuses the decoded buffer for the same blob reference', async () => {
    const { ctx } = createMockAudioContext();
    vi.mocked(getAudioContext).mockReturnValue(ctx as unknown as AudioContext);

    const blob = new Blob(['audio']);
    const player = new EchoClipPlayer();
    await player.prepare(blob);
    await player.prepare(blob);

    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
  });
});
