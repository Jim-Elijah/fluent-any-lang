import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExtendedMediaEventType } from '../../lib/playback-utils.js';
import type { SubtitleSegment } from '../../types/models.js';

const sampleSegments: SubtitleSegment[] = [
  { id: 's0', startTime: 0, endTime: 5, text: 'one' },
  { id: 's1', startTime: 5, endTime: 10, text: 'two' },
];

const mockLoadPlaylist = vi.fn();

vi.mock('../../lib/media-loader.js', () => ({
  loadPlaylistForPlayback: (...args: unknown[]) => mockLoadPlaylist(...args),
}));

vi.mock('../../lib/export-content.js', () => ({
  estimateStorage: vi.fn().mockResolvedValue({
    usage: 0,
    quota: 100,
    remaining: 100,
    remainingPercent: 100,
  }),
}));

const mockCountEchoRecordings = vi.fn();
const mockCountShadowingRecordings = vi.fn();
const mockFindAllEchoRecordings = vi.fn();

vi.mock('../../db/service.js', () => ({
  countEchoRecordings: (...args: unknown[]) => mockCountEchoRecordings(...args),
  countShadowingRecordings: (...args: unknown[]) => mockCountShadowingRecordings(...args),
  findAllEchoRecordings: (...args: unknown[]) => mockFindAllEchoRecordings(...args),
  saveRecording: vi.fn(),
}));

import './practice-view.js';
import type { PracticeView } from './practice-view.js';
import { mount } from '../ui/test-utils.js';

type PracticeViewInternals = PracticeView & {
  _controller: {
    play: () => Promise<void>;
    pause: () => Promise<void>;
    addEventListener: (type: string, listener: (event?: Event) => void) => void;
    removeEventListener: (type: string, listener: (event?: Event) => void) => void;
    getSnapshot: () => { segments: SubtitleSegment[] };
    dispatchEvent: (event: Event) => boolean;
  };
  _echoListening: boolean;
};

describe('practice-view', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    class MockMediaRecorder {
      static isTypeSupported = vi.fn().mockReturnValue(true);
      mimeType = 'audio/webm';
      state = 'inactive';
      start = vi.fn();
      stop = vi.fn();
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
    }
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
      },
    });

    mockLoadPlaylist.mockResolvedValue([
      {
        item: {
          id: 'media-1',
          title: 'Lesson 1',
          filename: 'lesson-1.mp3',
          size: 1024,
          type: 'audio',
          mimeType: 'audio/mpeg',
          duration: 120,
          createdAt: 1_000,
          hasSubtitles: true,
        },
        blob: new Blob(['audio'], { type: 'audio/mpeg' }),
        segments: sampleSegments,
      },
    ]);
    mockCountEchoRecordings.mockResolvedValue(0);
    mockCountShadowingRecordings.mockResolvedValue(0);
    mockFindAllEchoRecordings.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
  });

  async function renderView() {
    const result = mount(
      html`<practice-view
        .routeContext=${{
          route: 'practice',
          params: { id: 'media-1' },
          query: {},
          data: {},
        }}
      ></practice-view>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-view') as PracticeViewInternals;
    await el.updateComplete;
    return el;
  }

  async function switchToEchoMode(el: PracticeViewInternals) {
    const speakingButton = Array.from(el.shadowRoot!.querySelectorAll('ui-button')).find((button) =>
      button.textContent?.includes('口语'),
    );
    speakingButton?.click();
    await el.updateComplete;

    const echoButton = Array.from(el.shadowRoot!.querySelectorAll('ui-button')).find((button) =>
      button.textContent?.includes('Echo'),
    );
    echoButton?.click();
    await el.updateComplete;
  }

  it('renders practice layout shell', async () => {
    const el = await renderView();
    expect(el.shadowRoot?.querySelector('.layout')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('media-player')).not.toBeNull();
  });

  async function dispatchEchoRecordRequest(el: PracticeViewInternals, segmentIndex = 0) {
    const subtitlePanel = el.shadowRoot!.querySelector('subtitle-panel')!;
    subtitlePanel.dispatchEvent(
      new CustomEvent('echo-record-request', {
        detail: { segmentIndex },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('starts playback without recording on echo-record-request', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    const playSpy = vi.spyOn(el._controller, 'play').mockResolvedValue(undefined);
    const echoRecorder = el.shadowRoot!.querySelector('audio-recorder#echo-recorder') as {
      startRecording: () => Promise<void>;
      recording: boolean;
    };
    const startRecordingSpy = vi.spyOn(echoRecorder, 'startRecording').mockResolvedValue(undefined);

    await dispatchEchoRecordRequest(el);

    expect(playSpy).toHaveBeenCalled();
    expect(startRecordingSpy).not.toHaveBeenCalled();
    expect(el._echoListening).toBe(true);
  });

  it('pauses playback when SEGMENT_END fires during echo listen phase', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    vi.spyOn(el._controller, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(el._controller, 'pause').mockResolvedValue(undefined);
    const echoRecorder = el.shadowRoot!.querySelector('audio-recorder#echo-recorder') as {
      startRecording: () => Promise<void>;
      recording: boolean;
    };
    vi.spyOn(echoRecorder, 'startRecording').mockResolvedValue(undefined);

    await dispatchEchoRecordRequest(el);

    el._controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex: 0, segment: sampleSegments[0] },
      }),
    );
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pauseSpy).toHaveBeenCalled();
  });

  it('starts recording after SEGMENT_END during echo listen phase', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    vi.spyOn(el._controller, 'play').mockResolvedValue(undefined);
    vi.spyOn(el._controller, 'pause').mockResolvedValue(undefined);
    const echoRecorder = el.shadowRoot!.querySelector('audio-recorder#echo-recorder') as {
      startRecording: () => Promise<void>;
      recording: boolean;
    };
    Object.defineProperty(echoRecorder, 'recording', {
      configurable: true,
      get: () => true,
    });
    const startRecordingSpy = vi.spyOn(echoRecorder, 'startRecording').mockResolvedValue(undefined);

    await dispatchEchoRecordRequest(el);

    el._controller.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex: 0, segment: sampleSegments[0] },
      }),
    );
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startRecordingSpy).toHaveBeenCalled();
    expect(el._echoListening).toBe(false);
  });

  it('cancels echo listen session on stop without saving', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    const pauseSpy = vi.spyOn(el._controller, 'pause').mockResolvedValue(undefined);
    vi.spyOn(el._controller, 'play').mockResolvedValue(undefined);
    const echoRecorder = el.shadowRoot!.querySelector('audio-recorder#echo-recorder') as {
      startRecording: () => Promise<void>;
      stopRecording: () => Promise<void>;
    };
    const startRecordingSpy = vi.spyOn(echoRecorder, 'startRecording').mockResolvedValue(undefined);
    const stopRecordingSpy = vi.spyOn(echoRecorder, 'stopRecording').mockResolvedValue(undefined);

    await dispatchEchoRecordRequest(el);

    const subtitlePanel = el.shadowRoot!.querySelector('subtitle-panel')!;
    subtitlePanel.dispatchEvent(
      new CustomEvent('echo-record-stop', {
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pauseSpy).toHaveBeenCalled();
    expect(startRecordingSpy).not.toHaveBeenCalled();
    expect(stopRecordingSpy).not.toHaveBeenCalled();
    expect(el._echoListening).toBe(false);
  });

  it('disables media player while echo listening', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    vi.spyOn(el._controller, 'play').mockResolvedValue(undefined);

    await dispatchEchoRecordRequest(el);

    const mediaPlayer = el.shadowRoot!.querySelector('media-player') as { disabled: boolean };
    expect(mediaPlayer.disabled).toBe(true);
  });
});
