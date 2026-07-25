import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAudioContext } from './audio-context.js';
import { clipAudioBlob } from './audio-clip.js';

vi.mock('./audio-context.js', () => ({
  getAudioContext: vi.fn(),
}));

function createChannelData(length: number, fill: (i: number) => number): Float32Array {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    data[i] = fill(i);
  }
  return data;
}

function createMockAudioContext(options: {
  sampleRate?: number;
  length?: number;
  channels?: number;
  channelData?: Float32Array[];
}) {
  const sampleRate = options.sampleRate ?? 10;
  const length = options.length ?? 20;
  const channels = options.channels ?? 1;
  const channelData =
    options.channelData ??
    Array.from({ length: channels }, (_, channel) =>
      createChannelData(length, (i) => (channel === 0 ? i / length : -i / length)),
    );

  const sourceBuffer = {
    length,
    numberOfChannels: channels,
    sampleRate,
    getChannelData: (channel: number) => channelData[channel] ?? new Float32Array(length),
  };

  return {
    decodeAudioData: vi.fn(async () => sourceBuffer),
    createBuffer: vi.fn((numChannels: number, frameCount: number, rate: number) => {
      const data = Array.from({ length: numChannels }, () => new Float32Array(frameCount));
      return {
        length: frameCount,
        numberOfChannels: numChannels,
        sampleRate: rate,
        getChannelData: (channel: number) => data[channel]!,
      };
    }),
  };
}

describe('clipAudioBlob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid clip ranges', async () => {
    await expect(clipAudioBlob(new Blob(['x']), 1, 1)).rejects.toThrow('Invalid clip range');
    await expect(clipAudioBlob(new Blob(['x']), 2, 1)).rejects.toThrow('Invalid clip range');
  });

  it('clips a mono range and encodes WAV', async () => {
    const ctx = createMockAudioContext({
      sampleRate: 10,
      length: 20,
      channelData: [createChannelData(20, (i) => i / 20)],
    });
    vi.mocked(getAudioContext).mockReturnValue(ctx as unknown as AudioContext);

    const result = await clipAudioBlob(new Blob(['source']), 0.5, 1.5);

    expect(result.mimeType).toBe('audio/wav');
    expect(result.duration).toBe(1);
    expect(result.blob.type).toBe('audio/wav');
    expect(ctx.decodeAudioData).toHaveBeenCalled();
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 10, 10);

    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
  });

  it('clamps start/end to the source buffer and supports stereo', async () => {
    const left = createChannelData(10, () => 0.5);
    const right = createChannelData(10, () => -0.5);
    const ctx = createMockAudioContext({
      sampleRate: 10,
      length: 10,
      channels: 2,
      channelData: [left, right],
    });
    vi.mocked(getAudioContext).mockReturnValue(ctx as unknown as AudioContext);

    const result = await clipAudioBlob(new Blob(['source']), -1, 99);

    expect(result.duration).toBe(1);
    expect(ctx.createBuffer).toHaveBeenCalledWith(2, 10, 10);
  });

  it('clamps out-of-range PCM samples when encoding', async () => {
    const ctx = createMockAudioContext({
      sampleRate: 4,
      length: 4,
      channelData: [new Float32Array([2, -2, 0.25, -0.25])],
    });
    vi.mocked(getAudioContext).mockReturnValue(ctx as unknown as AudioContext);

    const result = await clipAudioBlob(new Blob(['source']), 0, 1);
    const view = new DataView(await result.blob.arrayBuffer());

    // PCM samples begin at byte 44
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
    expect(view.getInt16(48, true)).toBe(Math.floor(0.25 * 0x7fff));
    expect(view.getInt16(50, true)).toBe(Math.floor(-0.25 * 0x8000));
  });

  it('returns zero-duration clip when the range yields no frames', async () => {
    const ctx = createMockAudioContext({ sampleRate: 10, length: 5 });
    vi.mocked(getAudioContext).mockReturnValue(ctx as unknown as AudioContext);

    // start beyond buffer end after clamping
    const result = await clipAudioBlob(new Blob(['source']), 10, 11);
    expect(result.duration).toBe(0);
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 0, 10);
  });
});
