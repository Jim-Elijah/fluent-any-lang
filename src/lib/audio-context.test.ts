import { afterEach, describe, expect, it, vi } from 'vitest';

class MockAudioContext {
  createBuffer(channels: number, length: number): AudioBuffer {
    const buffer = {
      length,
      numberOfChannels: channels,
      sampleRate: 44100,
      duration: length / 44100,
      getChannelData: (channel: number) => {
        const data = new Float32Array(length);
        if (channel === 0) {
          data[0] = 0.2;
          data[1] = -0.8;
          data[2] = 0.4;
          data[3] = -0.1;
        }
        return data;
      },
    };
    return buffer as AudioBuffer;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('webkitAudioContext', MockAudioContext);

import { getAudioContext } from './audio-context.js';

describe('getAudioContext', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('returns a shared AudioContext instance', async () => {
    const { getAudioContext: getCtx } = await import('./audio-context.js');
    const first = getCtx();
    const second = getCtx();
    expect(second).toBe(first);
  });

  it('throws when AudioContext is unavailable', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);

    vi.resetModules();
    const { getAudioContext: getCtx } = await import('./audio-context.js');
    expect(() => getCtx()).toThrow('AudioContext is not supported');
  });
});

describe('getAudioContext module singleton', () => {
  it('creates an AudioContext when supported', () => {
    const ctx = getAudioContext();
    expect(ctx).toBeInstanceOf(MockAudioContext);
  });
});
