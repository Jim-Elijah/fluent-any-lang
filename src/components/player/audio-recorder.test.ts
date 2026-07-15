/* eslint-disable @typescript-eslint/no-unused-vars */
import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mount } from '../ui/test-utils.js';
import './audio-recorder.js';
import type { AudioRecorder } from './audio-recorder.js';

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
    this.listeners.dataavailable?.forEach((fn) =>
      fn(new BlobEvent('dataavailable', { data: blob }) as Event),
    );
  }

  static isTypeSupported = vi.fn().mockReturnValue(true);
}

class MockAudioContext {
  decodeAudioData = vi.fn().mockImplementation(async () => ({
    length: 44100,
    numberOfChannels: 1,
    sampleRate: 44100,
    duration: 1,
    getChannelData: () => new Float32Array(44100),
  }));

  createAnalyser = vi.fn().mockReturnValue({
    fftSize: 2048,
    getByteTimeDomainData: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  });

  createMediaStreamSource = vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
  });

  resume = vi.fn().mockResolvedValue(undefined);

  close(): Promise<void> {
    return Promise.resolve();
  }
}

describe('audio-recorder component', () => {
  let cleanup: (() => void) | undefined;
  const originalMediaRecorder = globalThis.MediaRecorder;
  const originalAudioContext = globalThis.AudioContext;

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
    globalThis.AudioContext = MockAudioContext as never;
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    globalThis.MediaRecorder = originalMediaRecorder;
    globalThis.AudioContext = originalAudioContext;
  });

  async function renderRecorder(countdownBeforeStart = false) {
    const result = mount(
      html`<audio-recorder .countdownBeforeStart=${countdownBeforeStart}></audio-recorder>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('audio-recorder') as AudioRecorder;
    await el.updateComplete;
    return el;
  }

  it('renders mic icon control', async () => {
    const el = await renderRecorder();
    expect(el.shadowRoot?.querySelector('ui-icon')).not.toBeNull();
  });

  it('starts inactive with micro-on icon', async () => {
    const el = await renderRecorder();
    const icon = el.shadowRoot?.querySelector('ui-icon');
    expect(icon?.getAttribute('name')).toBe('micro-on');
  });

  it('does not show waveform before recording', async () => {
    const el = await renderRecorder();
    expect(el.shadowRoot?.querySelector('waveform-player')).toBeNull();
  });

  it('shows waveform after recording starts', async () => {
    const el = await renderRecorder();
    await el.startRecording();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('waveform-player')).not.toBeNull();
  });

  it('dispatches recording-complete when stopped', async () => {
    const el = await renderRecorder();
    const onComplete = vi.fn();
    el.addEventListener('recording-complete', onComplete);

    await el.startRecording();
    lastRecorder?.dispatchData(new Blob(['chunk'], { type: 'audio/webm' }));
    await el.stopRecording();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].detail.blob).toBeInstanceOf(Blob);
  });

  it('clears waveform without resetting recorder controls', async () => {
    const el = await renderRecorder();
    await el.startRecording();
    lastRecorder?.dispatchData(new Blob(['chunk'], { type: 'audio/webm' }));
    await el.stopRecording();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('waveform-player')).not.toBeNull();

    el.clearWaveform();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('waveform-player')).toBeNull();
    expect(el.shadowRoot?.querySelector('ui-icon')?.getAttribute('name')).toBe('micro-on');
  });

  it('waits for countdown before starting recorder', async () => {
    vi.useFakeTimers();
    localStorage.clear();

    const el = await renderRecorder(true);
    const startPromise = el.startRecording();
    await el.updateComplete;

    expect(lastRecorder).toBeNull();
    expect(document.querySelector('ui-countdown-overlay')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(400);
    await startPromise;
    await el.updateComplete;

    expect(lastRecorder).not.toBeNull();
    expect(document.querySelector('ui-countdown-overlay')).toBeNull();
    vi.useRealTimers();
  });

  it('does not start recorder when countdown is cancelled', async () => {
    vi.useFakeTimers();
    localStorage.clear();

    const el = await renderRecorder(true);
    const onEnd = vi.fn();
    el.addEventListener('recording-countdown-end', onEnd);
    const startPromise = el.startRecording();
    await el.updateComplete;

    const overlay = document.querySelector('ui-countdown-overlay') as {
      cancel: () => void;
    };
    overlay.cancel();
    await startPromise;
    await el.updateComplete;

    expect(lastRecorder).toBeNull();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].detail).toEqual({ skipped: false, cancelled: true });
    vi.useRealTimers();
  });

  it('hides waveform when hideWaveform is set', async () => {
    const result = mount(
      html`<audio-recorder .countdownBeforeStart=${false} .hideWaveform=${true}></audio-recorder>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('audio-recorder') as AudioRecorder;
    await el.updateComplete;

    await el.startRecording();
    await el.updateComplete;

    expect(el.hasWaveform).toBe(true);
    expect(el.waveformController).toBeTruthy();
    expect(el.shadowRoot?.querySelector('waveform-player')).toBeNull();
  });

  it('emits countdown-end with skipped when user opted out', async () => {
    localStorage.setItem(
      'fluent-any-lang:user-settings',
      JSON.stringify({ skipRecordingCountdown: true }),
    );
    const el = await renderRecorder(true);
    const onStart = vi.fn();
    const onEnd = vi.fn();
    el.addEventListener('recording-countdown-start', onStart);
    el.addEventListener('recording-countdown-end', onEnd);

    await el.startRecording();

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd.mock.calls[0][0].detail).toEqual({ skipped: true });
  });
});
