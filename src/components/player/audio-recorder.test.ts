/* eslint-disable @typescript-eslint/no-unused-vars */
import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExtendedMediaEventType } from '../../lib/playback-utils.js';
import type { PracticeSegment, SubtitleSegment } from '../../types/models.js';
import { MediaController, type LoadedTrack } from '../../controllers/media-controller.js';
import { mount } from '../ui/test-utils.js';
import './audio-recorder.js';
import {
  AudioRecorderEventType,
  RECORDING_HEAD_PAD_MS,
  RECORDING_TAIL_PAD_MS,
  applyRecordingLatencyOffset,
  type AudioRecorder,
} from './audio-recorder.js';

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

  dispatchError(error: DOMException): void {
    this.listeners.error?.forEach((fn) => fn({ error } as ErrorEvent));
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
    getByteTimeDomainData: vi.fn((arr: Uint8Array) => {
      arr.fill(160);
    }),
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

const sampleSegments: SubtitleSegment[] = [
  { id: 's0', startTime: 0, endTime: 5, text: 'one' },
  { id: 's1', startTime: 5, endTime: 10, text: 'two' },
];

function makeTrack(): LoadedTrack {
  return {
    item: {
      id: 'lesson',
      title: 'Lesson',
      filename: 'lesson.mp3',
      size: 100,
      type: 'audio',
      mimeType: 'audio/mpeg',
      duration: 30,
      createdAt: 1,
      hasSubtitles: true,
    },
    blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    segments: sampleSegments,
  };
}

describe('applyRecordingLatencyOffset', () => {
  const base: PracticeSegment[] = [
    {
      id: 'a',
      sourceStartTime: 0,
      sourceEndTime: 2,
      recordingStartTime: 0.3,
      recordingEndTime: 2.0,
    },
    {
      id: 'b',
      sourceStartTime: 2,
      sourceEndTime: 4,
      recordingStartTime: 2.1,
      recordingEndTime: 2.12,
    },
  ];

  it('clamps so recordingEndTime is never before recordingStartTime', () => {
    const result = applyRecordingLatencyOffset(base.slice(0, 1), 0.35, 2.2);
    expect(result).toHaveLength(1);
    expect(result[0].recordingStartTime).toBeCloseTo(0.65, 5);
    expect(result[0].recordingEndTime).toBeGreaterThanOrEqual(result[0].recordingStartTime);
    expect(result[0].recordingEndTime).toBeLessThanOrEqual(2.2);
  });

  it('drops near-zero windows that would invert past totalElapsed', () => {
    const result = applyRecordingLatencyOffset(base, 0.35, 2.3);
    expect(result.map((s) => s.id)).toEqual(['a']);
    expect(result[0].recordingEndTime).toBeGreaterThanOrEqual(result[0].recordingStartTime);
  });
});

describe('audio-recorder component', () => {
  let cleanup: (() => void) | undefined;
  const originalMediaRecorder = globalThis.MediaRecorder;
  const originalAudioContext = globalThis.AudioContext;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    lastRecorder = null;
    const tracks = [{ stop: vi.fn() }];
    const stream = {
      getTracks: () => tracks,
      getAudioTracks: () => tracks,
    } as unknown as MediaStream;

    getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    globalThis.MediaRecorder = MockMediaRecorder as never;
    globalThis.AudioContext = MockAudioContext as never;
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    globalThis.MediaRecorder = originalMediaRecorder;
    globalThis.AudioContext = originalAudioContext;
    vi.useRealTimers();
    localStorage.clear();
  });

  async function renderRecorder(
    options: {
      countdownBeforeStart?: boolean;
      controller?: MediaController;
      props?: Record<string, unknown>;
    } = {},
  ) {
    const result = mount(
      html`<audio-recorder
        .countdownBeforeStart=${options.countdownBeforeStart ?? false}
        .controller=${options.controller ?? null}
        .collectSegments=${options.props?.collectSegments ?? false}
        .autoPlayOnStart=${options.props?.autoPlayOnStart ?? true}
        .autoPauseOnStop=${options.props?.autoPauseOnStop ?? true}
        .stopOnMediaEnded=${options.props?.stopOnMediaEnded ?? true}
        .stopOnSegmentEnd=${options.props?.stopOnSegmentEnd ?? false}
        .pauseMediaOnSegmentEnd=${options.props?.pauseMediaOnSegmentEnd ?? false}
        .hideControls=${options.props?.hideControls ?? false}
        .disabled=${options.props?.disabled ?? false}
        .disabledTitle=${options.props?.disabledTitle ?? ''}
        .shadowingLatencyOffset=${options.props?.shadowingLatencyOffset ?? 0}
        .beforeRecordingStart=${options.props?.beforeRecordingStart ?? undefined}
      ></audio-recorder>`,
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

  it('starts inactive with micro icon', async () => {
    const el = await renderRecorder();
    expect(el.shadowRoot?.querySelector('ui-icon')?.getAttribute('name')).toBe('micro');
  });

  it('does not show waveform before recording', async () => {
    const el = await renderRecorder();
    expect(el.shadowRoot?.querySelector('waveform-player')).toBeNull();
  });

  it('warms up the mic without recording, and reuses it on start', async () => {
    const el = await renderRecorder();

    await el.warmUpMicrophone();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(el.recording).toBe(false);

    await el.startRecording();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(el.recording).toBe(true);
  });

  it('releases a warmed-up mic that never recorded', async () => {
    const stop = vi.fn();
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop }],
      getAudioTracks: () => [{ stop }],
    } as unknown as MediaStream);
    const el = await renderRecorder();

    await el.warmUpMicrophone();
    el.releaseMicrophone();

    expect(stop).toHaveBeenCalled();
  });

  it('destroy releases a warmed-up mic', async () => {
    const stop = vi.fn();
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop }],
      getAudioTracks: () => [{ stop }],
    } as unknown as MediaStream);
    const el = await renderRecorder();

    await el.warmUpMicrophone();
    el.destroy();

    expect(stop).toHaveBeenCalled();
  });

  it('keeps the mic while recording', async () => {
    const stop = vi.fn();
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop }],
      getAudioTracks: () => [{ stop }],
    } as unknown as MediaStream);
    const el = await renderRecorder();

    await el.startRecording();
    el.releaseMicrophone();

    expect(stop).not.toHaveBeenCalled();
    expect(el.recording).toBe(true);
  });

  it('shows waveform after recording starts', async () => {
    const el = await renderRecorder();
    await el.startRecording();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('waveform-player')).not.toBeNull();
  });

  it('dispatches recording-complete when stopped', async () => {
    vi.useFakeTimers();
    const el = await renderRecorder();
    const onComplete = vi.fn();
    el.addEventListener(AudioRecorderEventType.COMPLETE, onComplete);

    await el.startRecording();
    lastRecorder?.dispatchData(new Blob(['chunk'], { type: 'audio/webm' }));
    const stopPromise = el.stopRecording();
    await vi.advanceTimersByTimeAsync(RECORDING_TAIL_PAD_MS);
    await stopPromise;

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].detail.blob).toBeInstanceOf(Blob);
  });

  it('clears waveform without resetting recorder controls', async () => {
    vi.useFakeTimers();
    const el = await renderRecorder();
    await el.startRecording();
    lastRecorder?.dispatchData(new Blob(['chunk'], { type: 'audio/webm' }));
    const stopPromise = el.stopRecording();
    await vi.advanceTimersByTimeAsync(RECORDING_TAIL_PAD_MS);
    await stopPromise;
    await el.updateComplete;

    el.clearWaveform();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('waveform-player')).toBeNull();
    expect(el.shadowRoot?.querySelector('ui-icon')?.getAttribute('name')).toBe('micro');
  });

  it('waits for countdown before starting recorder', async () => {
    vi.useFakeTimers();
    const el = await renderRecorder({ countdownBeforeStart: true });
    const startPromise = el.startRecording();
    await el.updateComplete;

    expect(lastRecorder).toBeNull();
    expect(document.querySelector('ui-countdown-overlay')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(3400);
    await startPromise;
    await el.updateComplete;

    expect(lastRecorder).not.toBeNull();
  });

  it('does not start recorder when countdown is cancelled', async () => {
    vi.useFakeTimers();
    const el = await renderRecorder({ countdownBeforeStart: true });
    const onEnd = vi.fn();
    el.addEventListener(AudioRecorderEventType.COUNTDOWN_END, onEnd);
    const startPromise = el.startRecording();
    await el.updateComplete;

    (document.querySelector('ui-countdown-overlay') as { cancel: () => void }).cancel();
    await startPromise;

    expect(lastRecorder).toBeNull();
    expect(onEnd.mock.calls[0][0].detail).toEqual({ skipped: false, cancelled: true });
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
    expect(el.shadowRoot?.querySelector('waveform-player')).toBeNull();
  });

  it('emits countdown-end with skipped when user opted out', async () => {
    localStorage.setItem(
      'fluent-any-lang:user-settings',
      JSON.stringify({ skipRecordingCountdown: true }),
    );
    const el = await renderRecorder({ countdownBeforeStart: true });
    const onStart = vi.fn();
    const onEnd = vi.fn();
    el.addEventListener(AudioRecorderEventType.COUNTDOWN_START, onStart);
    el.addEventListener(AudioRecorderEventType.COUNTDOWN_END, onEnd);

    await el.startRecording();

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd.mock.calls[0][0].detail).toEqual({ skipped: true });
  });

  it('toggles recording via the record button', async () => {
    const el = await renderRecorder();
    await el.toggleRecording();
    await el.updateComplete;
    expect(el.recording).toBe(true);

    lastRecorder?.dispatchData(new Blob(['chunk'], { type: 'audio/webm' }));
    await el.toggleRecording();
    await el.updateComplete;
    expect(el.recording).toBe(false);
  });

  it('dispatches state-change when recording starts and stops', async () => {
    const el = await renderRecorder();
    const onState = vi.fn();
    el.addEventListener(AudioRecorderEventType.STATE_CHANGE, onState);

    await el.startRecording();
    expect(onState.mock.calls.at(-1)?.[0].detail).toEqual({ recording: true });

    lastRecorder?.dispatchData(new Blob(['chunk'], { type: 'audio/webm' }));
    await el.stopRecording();
    expect(onState.mock.calls.at(-1)?.[0].detail).toEqual({ recording: false });
  });

  it('auto plays media on start and pauses on stop when controller is attached', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    const playSpy = vi.spyOn(controller, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(controller, 'pause').mockResolvedValue(undefined);

    const el = await renderRecorder({ controller });
    await el.startRecording();
    expect(playSpy).toHaveBeenCalled();

    lastRecorder?.dispatchData(new Blob(['chunk'], { type: 'audio/webm' }));
    await el.stopRecording();
    expect(pauseSpy).toHaveBeenCalled();
    controller.destroy();
  });

  it('shows permission error when microphone access is denied', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const el = await renderRecorder();
    const onError = vi.fn();
    el.addEventListener(AudioRecorderEventType.ERROR, onError);

    await el.startRecording();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('ui-alert')).toBeNull();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          message: expect.stringContaining('未能开启麦克风'),
        }),
      }),
    );
  });

  it('shows unavailable error when no microphone device is found', async () => {
    getUserMedia.mockRejectedValue(new DOMException('not found', 'NotFoundError'));
    const el = await renderRecorder();
    const onError = vi.fn();
    el.addEventListener(AudioRecorderEventType.ERROR, onError);

    await el.startRecording();
    await el.updateComplete;

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          message: expect.stringContaining('未检测到可用麦克风'),
        }),
      }),
    );
  });

  it('shows generic recorder error from MediaRecorder failure', async () => {
    const el = await renderRecorder();
    const onError = vi.fn();
    el.addEventListener(AudioRecorderEventType.ERROR, onError);

    await el.startRecording();
    lastRecorder?.dispatchError(new DOMException('failed', 'UnknownError'));
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('ui-alert')).toBeNull();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          message: expect.stringContaining('录音失败'),
        }),
      }),
    );
  });

  it('does not start when disabled', async () => {
    const el = await renderRecorder({ props: { disabled: true } });
    await el.startRecording();
    expect(lastRecorder).toBeNull();
  });

  it('shows disabledTitle on record tooltip when disabled', async () => {
    const tip = '已达上限，删除旧录音后可继续。';
    const el = await renderRecorder({
      props: { disabled: true, disabledTitle: tip },
    });
    const tooltip = el.shadowRoot?.querySelector('ui-tooltip') as
      | (HTMLElement & { title?: string; disabled?: boolean })
      | null;
    expect(tooltip?.title).toBe(tip);
    expect(tooltip?.disabled).toBe(false);
  });

  it('reports unsupported browser when recorder APIs are missing', async () => {
    globalThis.MediaRecorder = undefined as never;
    const el = await renderRecorder();
    const onError = vi.fn();
    el.addEventListener(AudioRecorderEventType.ERROR, onError);

    await el.startRecording();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('ui-alert')).toBeNull();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          message: expect.stringContaining('当前浏览器不支持录音'),
        }),
      }),
    );
  });

  it('stops without saving when save is false', async () => {
    const el = await renderRecorder();
    await el.startRecording();
    await el.stopRecording({ save: false });
    await el.updateComplete;
    expect(el.recording).toBe(false);
    expect(el.shadowRoot?.querySelector('waveform-player')).toBeNull();
  });

  it('stops when media ends and reports media-ended reason', async () => {
    vi.useFakeTimers();
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    const el = await renderRecorder({ controller, props: { stopOnMediaEnded: true } });
    const onComplete = vi.fn();
    el.addEventListener(AudioRecorderEventType.COMPLETE, onComplete);

    const startPromise = el.startRecording();
    await vi.advanceTimersByTimeAsync(RECORDING_HEAD_PAD_MS);
    await startPromise;
    lastRecorder?.dispatchData(new Blob(['chunk'], { type: 'audio/webm' }));
    controller.dispatchEvent(new Event('ended'));
    await vi.advanceTimersByTimeAsync(RECORDING_TAIL_PAD_MS);
    await el.updateComplete;

    expect(onComplete.mock.calls[0][0].detail.reason).toBe('media-ended');
    controller.destroy();
  });

  it('collects practice segments and can stop on segment end', async () => {
    vi.useFakeTimers();
    let nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    const el = await renderRecorder({
      controller,
      props: { collectSegments: true, stopOnSegmentEnd: true },
    });
    const onComplete = vi.fn();
    el.addEventListener(AudioRecorderEventType.COMPLETE, onComplete);

    const startPromise = el.startRecording();
    nowMs = 1_000 + RECORDING_HEAD_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_HEAD_PAD_MS);
    await startPromise;

    nowMs = 3_000;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex: 0, segment: sampleSegments[0] },
      }),
    );
    nowMs = 3_000 + RECORDING_TAIL_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_TAIL_PAD_MS);
    await el.updateComplete;

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].detail.segments).toHaveLength(1);
    expect(onComplete.mock.calls[0][0].detail.reason).toBe('segment-end');
    controller.destroy();
  });

  it('anchors first practice segment after head pad when auto-playing', async () => {
    vi.useFakeTimers();
    let nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    vi.spyOn(controller, 'play').mockResolvedValue(undefined);
    const el = await renderRecorder({
      controller,
      props: { collectSegments: true, stopOnSegmentEnd: true },
    });
    const onComplete = vi.fn();
    el.addEventListener(AudioRecorderEventType.COMPLETE, onComplete);

    const startPromise = el.startRecording();
    nowMs = 1_000 + RECORDING_HEAD_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_HEAD_PAD_MS);
    await startPromise;

    nowMs = 3_000;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex: 0, segment: sampleSegments[0] },
      }),
    );
    nowMs = 3_000 + RECORDING_TAIL_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_TAIL_PAD_MS);
    await el.updateComplete;

    const segment = onComplete.mock.calls[0][0].detail.segments[0];
    expect(segment.recordingStartTime).toBeGreaterThanOrEqual(RECORDING_HEAD_PAD_MS / 1000 - 0.02);
    expect(segment.recordingStartTime).toBeLessThan(RECORDING_HEAD_PAD_MS / 1000 + 0.05);
    expect(segment.text).toBe('one');
    controller.destroy();
  });

  it('leaves a hollow between practice segments across a subtitle gap', async () => {
    vi.useFakeTimers();
    let nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    const gappedSegments: SubtitleSegment[] = [
      { id: 'g0', startTime: 0, endTime: 2, text: 'one' },
      { id: 'g1', startTime: 10, endTime: 12, text: 'two' },
    ];
    const controller = new MediaController();
    await controller.loadTracks([
      {
        ...makeTrack(),
        segments: gappedSegments,
      },
    ]);
    vi.spyOn(controller, 'play').mockResolvedValue(undefined);
    const el = await renderRecorder({
      controller,
      props: { collectSegments: true, autoPlayOnStart: true },
    });
    const onComplete = vi.fn();
    el.addEventListener(AudioRecorderEventType.COMPLETE, onComplete);

    const startPromise = el.startRecording();
    nowMs = 1_000 + RECORDING_HEAD_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_HEAD_PAD_MS);
    await startPromise;

    nowMs = 2_000;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex: 0, segment: gappedSegments[0] },
      }),
    );

    // Wall-clock gap while source is in the subtitle hollow.
    nowMs = 7_000;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_CHANGE, {
        detail: {
          currentIndex: 1,
          currentSegment: gappedSegments[1],
          previousIndex: 0,
          previousSegment: gappedSegments[0],
        },
      }),
    );
    nowMs = 9_000;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex: 1, segment: gappedSegments[1] },
      }),
    );

    const stopPromise = el.stopRecording();
    nowMs = 9_000 + RECORDING_TAIL_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_TAIL_PAD_MS);
    await stopPromise;
    await el.updateComplete;

    const practice = onComplete.mock.calls[0][0].detail.segments as Array<{
      id: string;
      recordingStartTime: number;
      recordingEndTime: number;
    }>;
    expect(practice).toHaveLength(2);
    expect(practice[1].recordingStartTime - practice[0].recordingEndTime).toBeGreaterThan(4);
    controller.destroy();
  });

  it('ignores regressing SEGMENT_CHANGE after a cue was already finalized', async () => {
    vi.useFakeTimers();
    let nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    const gappedSegments: SubtitleSegment[] = [
      { id: 'g0', startTime: 0, endTime: 2, text: 'one' },
      { id: 'g1', startTime: 10, endTime: 12, text: 'two' },
    ];
    const controller = new MediaController();
    await controller.loadTracks([{ ...makeTrack(), segments: gappedSegments }]);
    vi.spyOn(controller, 'play').mockResolvedValue(undefined);
    const el = await renderRecorder({
      controller,
      props: { collectSegments: true, autoPlayOnStart: true },
    });
    const onComplete = vi.fn();
    el.addEventListener(AudioRecorderEventType.COMPLETE, onComplete);

    const startPromise = el.startRecording();
    nowMs = 1_000 + RECORDING_HEAD_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_HEAD_PAD_MS);
    await startPromise;

    nowMs = 2_000;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex: 0, segment: gappedSegments[0] },
      }),
    );

    nowMs = 3_000;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_CHANGE, {
        detail: {
          currentIndex: 1,
          currentSegment: gappedSegments[1],
          previousIndex: 0,
          previousSegment: gappedSegments[0],
        },
      }),
    );

    // Compress seek undershoot: gap snap-back to the already-closed cue.
    nowMs = 3_010;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_CHANGE, {
        detail: {
          currentIndex: 0,
          currentSegment: gappedSegments[0],
          previousIndex: 1,
          previousSegment: gappedSegments[1],
        },
      }),
    );

    nowMs = 5_000;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex: 1, segment: gappedSegments[1] },
      }),
    );

    const stopPromise = el.stopRecording();
    nowMs = 5_000 + RECORDING_TAIL_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_TAIL_PAD_MS);
    await stopPromise;

    const practice = onComplete.mock.calls[0][0].detail.segments as Array<{ id: string }>;
    expect(practice.map((s) => s.id)).toEqual(['g0', 'g1']);
    controller.destroy();
  });

  it('finalizes last subtitle when currentSegmentIndex is past the end', async () => {
    vi.useFakeTimers();
    let nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    vi.spyOn(controller, 'play').mockResolvedValue(undefined);
    // Start already on the last cue so ensureOpen anchors s1.
    controller.currentSegmentIndex = 1;
    controller.currentTime = 7;
    const el = await renderRecorder({
      controller,
      props: { collectSegments: true, autoPlayOnStart: true },
    });
    const onComplete = vi.fn();
    el.addEventListener(AudioRecorderEventType.COMPLETE, onComplete);

    const startPromise = el.startRecording();
    nowMs = 1_000 + RECORDING_HEAD_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_HEAD_PAD_MS);
    await startPromise;

    // Simulate finishing past the last subtitle without a SEGMENT_END event.
    nowMs = 5_000;
    Object.defineProperty(controller, 'currentSegmentIndex', { get: () => -1, configurable: true });
    Object.defineProperty(controller, 'currentTime', { get: () => 30, configurable: true });

    const stopPromise = el.stopRecording();
    nowMs = 5_000 + RECORDING_TAIL_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_TAIL_PAD_MS);
    await stopPromise;

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].detail.segments).toHaveLength(1);
    expect(onComplete.mock.calls[0][0].detail.segments[0].id).toBe('s1');
    controller.destroy();
  });

  it('pauses media when segment ends if pauseMediaOnSegmentEnd is enabled', async () => {
    vi.useFakeTimers();
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    const pauseSpy = vi.spyOn(controller, 'pause').mockResolvedValue(undefined);
    const setPauseModeSpy = vi.spyOn(controller, 'setPauseMode');
    vi.spyOn(controller, 'play').mockResolvedValue(undefined);

    const el = await renderRecorder({
      controller,
      props: { pauseMediaOnSegmentEnd: true, collectSegments: true },
    });
    const startPromise = el.startRecording();
    await vi.advanceTimersByTimeAsync(RECORDING_HEAD_PAD_MS);
    await startPromise;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex: 0, segment: sampleSegments[0] },
      }),
    );

    expect(setPauseModeSpy).toHaveBeenCalledWith('off');
    expect(pauseSpy).toHaveBeenCalled();
    controller.destroy();
  });

  it('calls beforeRecordingStart before MediaRecorder starts', async () => {
    const order: string[] = [];
    const beforeRecordingStart = vi.fn(() => {
      order.push(lastRecorder ? 'after-recorder' : 'before-recorder');
    });
    const el = await renderRecorder({ props: { beforeRecordingStart } });

    await el.startRecording();
    expect(beforeRecordingStart).toHaveBeenCalled();
    expect(order).toEqual(['before-recorder']);
  });

  it('calls beforeRecordingStart and updates live waveform peaks', async () => {
    vi.useFakeTimers();
    const beforeRecordingStart = vi.fn();
    const el = await renderRecorder({ props: { beforeRecordingStart } });

    await el.startRecording();
    expect(beforeRecordingStart).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);
    const trackId = el.waveformController.getSnapshot().tracks[0]?.id;
    expect(trackId).toBeTruthy();
    expect(el.waveformController.getSnapshot().tracks[0]?.peaks.length).toBeGreaterThan(0);
  });

  it('hides controls but still exposes recording state', async () => {
    const el = await renderRecorder({ props: { hideControls: true } });
    expect(el.shadowRoot?.querySelector('.recording-controls')).toBeNull();
    await el.startRecording();
    expect(el.recording).toBe(true);
  });

  it('applies shadowingLatencyOffset to collected segments', async () => {
    vi.useFakeTimers();
    let nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    const el = await renderRecorder({
      controller,
      props: { collectSegments: true, stopOnSegmentEnd: true, shadowingLatencyOffset: 0.35 },
    });
    const onComplete = vi.fn();
    el.addEventListener(AudioRecorderEventType.COMPLETE, onComplete);

    const startPromise = el.startRecording();
    nowMs = 1_000 + RECORDING_HEAD_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_HEAD_PAD_MS);
    await startPromise;

    nowMs = 3_000;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex: 0, segment: sampleSegments[0] },
      }),
    );
    nowMs = 3_000 + RECORDING_TAIL_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_TAIL_PAD_MS);
    await el.updateComplete;

    expect(onComplete).toHaveBeenCalledTimes(1);
    const segments = onComplete.mock.calls[0][0].detail.segments;
    expect(segments).toHaveLength(1);
    const segment = segments[0];
    // Since original recordingStartTime is around 0.3s (RECORDING_HEAD_PAD_MS),
    // with 0.35s offset, it should be around 0.65s.
    expect(segment.recordingStartTime).toBeGreaterThanOrEqual(0.65 - 0.02);
    expect(segment.recordingStartTime).toBeLessThan(0.65 + 0.05);
    expect(segment.recordingEndTime).toBeGreaterThanOrEqual(segment.recordingStartTime);
    controller.destroy();
  });

  it('keeps a mid-stop cue as a partial practice segment with clipped source end', async () => {
    vi.useFakeTimers();
    let nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    vi.spyOn(controller, 'play').mockResolvedValue(undefined);
    const el = await renderRecorder({
      controller,
      props: { collectSegments: true, autoPlayOnStart: true, shadowingLatencyOffset: 0.35 },
    });
    const onComplete = vi.fn();
    el.addEventListener(AudioRecorderEventType.COMPLETE, onComplete);

    const startPromise = el.startRecording();
    nowMs = 1_000 + RECORDING_HEAD_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_HEAD_PAD_MS);
    await startPromise;

    nowMs = 2_500;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex: 0, segment: sampleSegments[0] },
      }),
    );

    nowMs = 2_600;
    controller.currentSegmentIndex = 1;
    controller.currentTime = 7.2;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_CHANGE, {
        detail: {
          currentIndex: 1,
          currentSegment: sampleSegments[1],
          previousIndex: 0,
          previousSegment: sampleSegments[0],
        },
      }),
    );

    // Stop mid-cue on s1 (subtitle 5–10s); keep a meaningful partial take.
    nowMs = 4_100;
    const stopPromise = el.stopRecording();
    nowMs = 4_100 + RECORDING_TAIL_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_TAIL_PAD_MS);
    await stopPromise;
    await el.updateComplete;

    const practice = onComplete.mock.calls[0][0].detail.segments as PracticeSegment[];
    expect(practice).toHaveLength(2);
    expect(practice[1].id).toBe('s1');
    expect(practice[1].sourceStartTime).toBe(5);
    expect(practice[1].sourceEndTime).toBe(7.2);
    expect(practice[1].recordingEndTime).toBeGreaterThan(practice[1].recordingStartTime);
    controller.destroy();
  });

  it('drops a near-zero mid-stop cue after latency offset instead of inverted times', async () => {
    vi.useFakeTimers();
    let nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    vi.spyOn(controller, 'play').mockResolvedValue(undefined);
    const el = await renderRecorder({
      controller,
      props: { collectSegments: true, autoPlayOnStart: true, shadowingLatencyOffset: 0.35 },
    });
    const onComplete = vi.fn();
    el.addEventListener(AudioRecorderEventType.COMPLETE, onComplete);

    const startPromise = el.startRecording();
    nowMs = 1_000 + RECORDING_HEAD_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_HEAD_PAD_MS);
    await startPromise;

    nowMs = 2_000;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex: 0, segment: sampleSegments[0] },
      }),
    );

    // Open s1 and stop almost immediately — offset would invert without clamp/drop.
    nowMs = 2_020;
    controller.currentSegmentIndex = 1;
    controller.currentTime = 5.05;
    controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_CHANGE, {
        detail: {
          currentIndex: 1,
          currentSegment: sampleSegments[1],
          previousIndex: 0,
          previousSegment: sampleSegments[0],
        },
      }),
    );
    nowMs = 2_030;
    const stopPromise = el.stopRecording();
    nowMs = 2_030 + RECORDING_TAIL_PAD_MS;
    await vi.advanceTimersByTimeAsync(RECORDING_TAIL_PAD_MS);
    await stopPromise;
    await el.updateComplete;

    const practice = onComplete.mock.calls[0][0].detail.segments as PracticeSegment[];
    expect(practice.map((s) => s.id)).toEqual(['s0']);
    for (const seg of practice) {
      expect(seg.recordingEndTime).toBeGreaterThanOrEqual(seg.recordingStartTime);
    }
    controller.destroy();
  });

  it('destroy clears active recording without emitting complete', async () => {
    const el = await renderRecorder();
    const onComplete = vi.fn();
    el.addEventListener(AudioRecorderEventType.COMPLETE, onComplete);

    await el.startRecording();
    el.destroy();
    await el.updateComplete;

    expect(onComplete).not.toHaveBeenCalled();
    expect(el.recording).toBe(false);
  });
});
