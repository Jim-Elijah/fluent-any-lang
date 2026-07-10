/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioRecorderController } from './audio-recorder.js';

let lastRecorder: MockMediaRecorder | null = null;

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
    this.listeners.start?.forEach((fn) => fn());
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
    this.listeners.dataavailable?.forEach((fn) =>
      fn(new BlobEvent('dataavailable', { data: blob }) as Event),
    );
  }

  static isTypeSupported = vi.fn().mockReturnValue(true);
}

describe('AudioRecorderController', () => {
  const originalMediaRecorder = globalThis.MediaRecorder;

  beforeEach(() => {
    lastRecorder = null;
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
});
