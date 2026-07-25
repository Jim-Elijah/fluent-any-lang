/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioRecorderController } from './audio-recorder.js';

let lastRecorder: MockMediaRecorder | null = null;
let deferRecorderStart = false;

function registerLastRecorder(recorder: MockMediaRecorder): void {
  lastRecorder = recorder;
}

class MockMediaRecorder {
  mimeType = 'audio/webm';
  state = 'inactive';
  private listeners: Record<string, Array<(event?: Event) => void>> = {};

  constructor(_stream: MediaStream, _options?: unknown) {
    registerLastRecorder(this);
  }

  start(): void {
    this.state = 'recording';
    const fire = () => this.listeners.start?.forEach((fn) => fn());
    if (deferRecorderStart) {
      queueMicrotask(fire);
      return;
    }
    fire();
  }

  addEventListener(
    type: string,
    listener: (event?: Event) => void,
    options?: { once?: boolean },
  ): void {
    const handlers = (this.listeners[type] ??= []);
    handlers.push(listener);
    if (options?.once) {
      const wrapped = (event?: Event) => {
        this.removeEventListener(type, wrapped);
        listener(event);
      };
      handlers[handlers.length - 1] = wrapped;
    }
  }

  removeEventListener(type: string, listener: (event?: Event) => void): void {
    const handlers = this.listeners[type];
    if (!handlers) {
      return;
    }
    this.listeners[type] = handlers.filter((fn) => fn !== listener);
  }

  pause(): void {
    this.state = 'paused';
    this.listeners.pause?.forEach((fn) => fn());
  }

  resume(): void {
    this.state = 'recording';
    this.listeners.resume?.forEach((fn) => fn());
  }

  stop(): void {
    this.state = 'inactive';
    this.listeners.stop?.forEach((fn) => fn());
  }

  set ondataavailable(handler: (event: BlobEvent) => void) {
    this.listeners.dataavailable = [handler as (event?: Event) => void];
  }

  set onstart(handler: () => void) {
    this.listeners.start = [handler];
  }

  set onpause(handler: () => void) {
    this.listeners.pause = [handler];
  }

  set onresume(handler: () => void) {
    this.listeners.resume = [handler];
  }

  set onstop(handler: () => void) {
    this.listeners.stop = [handler];
  }

  set onerror(handler: (event: ErrorEvent) => void) {
    this.listeners.error = [handler as (event?: Event) => void];
  }

  dispatchData(blob: Blob): void {
    this.listeners.dataavailable?.forEach((fn) => fn({ data: blob } as unknown as Event));
  }

  dispatchError(error: Error): void {
    this.listeners.error?.forEach((fn) => fn({ error } as unknown as Event));
  }

  static isTypeSupported = vi.fn().mockReturnValue(true);
}

describe('AudioRecorderController', () => {
  const originalMediaRecorder = globalThis.MediaRecorder;

  beforeEach(() => {
    lastRecorder = null;
    deferRecorderStart = false;
    const stream = {
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    });

    globalThis.MediaRecorder = MockMediaRecorder as never;
  });

  afterEach(() => {
    globalThis.MediaRecorder = originalMediaRecorder;
  });

  it('starts recording and reports state changes', async () => {
    const onStateChange = vi.fn();
    const controller = new AudioRecorderController({ onStateChange });

    await controller.start();
    expect(controller.getState()).toBe('recording');
    expect(onStateChange).toHaveBeenCalledWith('recording');
  });

  it('resolves start only after MediaRecorder fires start', async () => {
    deferRecorderStart = true;
    const onStateChange = vi.fn();
    const controller = new AudioRecorderController({ onStateChange });
    const startPromise = controller.start();

    expect(controller.getState()).toBe('inactive');
    await startPromise;

    expect(controller.getState()).toBe('recording');
    expect(onStateChange).toHaveBeenCalledWith('recording');
  });

  it('pauses and resumes recording', async () => {
    const controller = new AudioRecorderController();
    await controller.start();

    controller.pause();
    expect(controller.getState()).toBe('paused');

    controller.resume();
    expect(controller.getState()).toBe('recording');
  });

  it('stops recording and resolves blob', async () => {
    const onStop = vi.fn();
    const controller = new AudioRecorderController({ onStop });
    await controller.start();

    lastRecorder?.dispatchData(new Blob(['chunk'], { type: 'audio/webm' }));

    const blob = await controller.stop();
    expect(blob.type).toBe('audio/webm');
    expect(onStop).toHaveBeenCalledWith(blob);
    expect(controller.getState()).toBe('inactive');
  });

  it('throws when pausing before start', () => {
    const controller = new AudioRecorderController();
    expect(() => controller.pause()).toThrow('录音器未初始化');
  });

  it('throws when starting while already recording', async () => {
    const controller = new AudioRecorderController();
    await controller.start();
    await expect(controller.start()).rejects.toThrow('当前已经在录音中');
  });

  it('resumes via start when paused', async () => {
    const onResume = vi.fn();
    const controller = new AudioRecorderController({ onResume });
    await controller.start();
    controller.pause();
    await controller.start();
    expect(controller.getState()).toBe('recording');
    expect(onResume).toHaveBeenCalled();
  });

  it('throws pause/resume/stop in invalid states', async () => {
    const controller = new AudioRecorderController();
    expect(() => controller.resume()).toThrow('录音器未初始化');
    await expect(controller.stop()).rejects.toThrow('录音器未初始化');

    await controller.start();
    expect(() => controller.resume()).toThrow('当前不是暂停状态');

    controller.pause();
    expect(() => controller.pause()).toThrow('当前不是录音状态');

    controller.resume();
    await controller.stop();
    await expect(controller.stop()).rejects.toThrow('当前没有正在进行的录音');
  });

  it('invokes data and error callbacks', async () => {
    const onDataAvailable = vi.fn();
    const onError = vi.fn();
    const onPause = vi.fn();
    const controller = new AudioRecorderController({ onDataAvailable, onError, onPause });
    await controller.start();

    lastRecorder?.dispatchData(new Blob(['chunk'], { type: 'audio/webm' }));
    expect(onDataAvailable).toHaveBeenCalled();

    lastRecorder?.dispatchError(new Error('mic failed'));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'mic failed' }));

    controller.pause();
    expect(onPause).toHaveBeenCalled();
  });

  it('rejects when getUserMedia fails', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    const onError = vi.fn();
    const controller = new AudioRecorderController({ onError });
    await expect(controller.start()).rejects.toThrow('denied');
    expect(onError).toHaveBeenCalled();
  });

  it('falls back when preferred mime type is unsupported', async () => {
    MockMediaRecorder.isTypeSupported = vi.fn((type: string) => type === 'audio/ogg');
    const controller = new AudioRecorderController({ mimeType: 'audio/unsupported' });
    await controller.start();
    expect(controller.getState()).toBe('recording');
  });

  it('attaches waveform analysis and cleans up on destroy', async () => {
    vi.useFakeTimers();
    const peak = vi.fn();
    const disconnect = vi.fn();
    const getByteTimeDomainData = vi.fn((target: Uint8Array) => {
      target.fill(200);
    });
    const analyser = {
      fftSize: 0,
      connect: vi.fn(),
      disconnect,
      getByteTimeDomainData,
    };
    const source = { connect: vi.fn(), disconnect };
    const audioContext = {
      resume: vi.fn(async () => undefined),
      createAnalyser: vi.fn(() => analyser),
      createMediaStreamSource: vi.fn(() => source),
    };
    const audioContextModule = await import('./audio-context.js');
    vi.spyOn(audioContextModule, 'getAudioContext').mockReturnValue(
      audioContext as unknown as AudioContext,
    );

    const controller = new AudioRecorderController();
    await controller.start();
    expect(controller.getStream()).toBeTruthy();

    const detach = controller.attachWaveformAnalysis(peak, { intervalMs: 20 });
    vi.advanceTimersByTime(20);
    expect(peak).toHaveBeenCalled();
    expect(peak.mock.calls[0]![0]).toBeGreaterThan(0);

    detach();
    expect(disconnect).toHaveBeenCalled();

    controller.destroy();
    expect(controller.getState()).toBe('inactive');
    expect(controller.getStream()).toBeNull();

    vi.useRealTimers();
  });

  it('throws when attaching waveform before stream is ready', () => {
    const controller = new AudioRecorderController();
    expect(() => controller.attachWaveformAnalysis(() => undefined)).toThrow('录音流未就绪');
  });
});
