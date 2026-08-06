import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExtendedMediaEventType, MediaEventType } from '../../lib/playback-utils.js';
import type { SubtitleSegment } from '../../types/models.js';
import { DISCRIMINATION_MAX_NOISE_TRACKS } from '../../types/models.js';

const sampleSegments: SubtitleSegment[] = [
  { id: 's0', startTime: 0, endTime: 5, text: 'one' },
  { id: 's1', startTime: 5, endTime: 10, text: 'two' },
];

function makeLoadedMedia(id: string, options: { hasSubtitles?: boolean } = {}) {
  const hasSubtitles = options.hasSubtitles !== false;
  return {
    item: {
      id,
      title: `Lesson ${id}`,
      filename: `${id}.mp3`,
      size: 1024,
      type: 'audio' as const,
      mimeType: 'audio/mpeg',
      duration: 120,
      createdAt: 1_000,
      hasSubtitles,
    },
    blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    segments: hasSubtitles ? sampleSegments : [],
  };
}

const mockLoadMedia = vi.fn();
const mockLoadPlaylist = vi.fn();

vi.mock('../../lib/media-loader.js', () => ({
  loadMediaForPlayback: (...args: unknown[]) => mockLoadMedia(...args),
  loadPlaylistForPlayback: (...args: unknown[]) => mockLoadPlaylist(...args),
}));

const mockEstimateStorage = vi.fn();

vi.mock('../../lib/export-content.js', () => ({
  estimateStorage: (...args: unknown[]) => mockEstimateStorage(...args),
}));

const mockCountEchoRecordings = vi.fn();
const mockCountShadowingRecordings = vi.fn();
const mockFindAllEchoRecordings = vi.fn();
const mockSaveRecording = vi.fn();
const mockAddToSentenceBank = vi.fn();
const mockRemoveFromSentenceBank = vi.fn();
const mockGetSentenceBankList = vi.fn();

vi.mock('../../db/service.js', () => ({
  countEchoRecordings: (...args: unknown[]) => mockCountEchoRecordings(...args),
  countShadowingRecordings: (...args: unknown[]) => mockCountShadowingRecordings(...args),
  findAllEchoRecordings: (...args: unknown[]) => mockFindAllEchoRecordings(...args),
  saveRecording: (...args: unknown[]) => mockSaveRecording(...args),
  addToSentenceBank: (...args: unknown[]) => mockAddToSentenceBank(...args),
  removeFromSentenceBank: (...args: unknown[]) => mockRemoveFromSentenceBank(...args),
  getSentenceBankList: (...args: unknown[]) => mockGetSentenceBankList(...args),
}));

const mockGetNoiseList = vi.fn();
const mockGetNoiseBlob = vi.fn();

vi.mock('../../db/noise.js', () => ({
  getNoiseList: (...args: unknown[]) => mockGetNoiseList(...args),
  getNoiseBlob: (...args: unknown[]) => mockGetNoiseBlob(...args),
}));

const mockReportError = vi.fn();
vi.mock('../../lib/error-reporter.js', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

const mockLoadingClose = vi.fn();
vi.mock('../../components/ui/loading.js', () => ({
  Loading: {
    service: vi.fn(() => ({ close: mockLoadingClose })),
  },
}));

vi.mock('../../lib/file-validation.js', () => ({
  getMediaDuration: vi.fn().mockResolvedValue(3),
}));

const mockNoiseMixer = {
  setPlaying: vi.fn(),
  setTracks: vi.fn(),
  setTrackVolume: vi.fn(),
  destroy: vi.fn(),
};

vi.mock('../../lib/noise-mixer.js', () => ({
  NoiseMixer: vi.fn(function MockNoiseMixer() {
    return mockNoiseMixer;
  }),
}));

const mockRateLadder = {
  setRates: vi.fn(),
  reset: vi.fn(),
  getIndex: vi.fn(() => 0),
  getCurrentRate: vi.fn(() => 1),
  getSequence: vi.fn(() => [1, 1.5, 1]),
  onMainEnded: vi.fn(() => ({ kind: 'finished' as const, rate: 1 })),
};

vi.mock('../../lib/rate-ladder.js', () => ({
  RateLadder: vi.fn(function MockRateLadder() {
    return mockRateLadder;
  }),
}));

const mockEchoClipPlayer = {
  prepare: vi.fn().mockResolvedValue(undefined),
  play: vi.fn().mockResolvedValue(undefined),
  waitForOutputDrain: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  dispose: vi.fn(),
  isPlaying: false,
  onEnded: null as (() => void) | null,
};

vi.mock('../../lib/echo-clip-player.js', () => ({
  EchoClipPlayer: vi.fn(function MockEchoClipPlayer() {
    return mockEchoClipPlayer;
  }),
}));

const mockCheckMicrophoneStatus = vi.fn().mockResolvedValue('granted');

vi.mock('../../lib/microphone-access.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/microphone-access.js')>();
  return {
    ...actual,
    checkMicrophoneStatus: (...args: unknown[]) => mockCheckMicrophoneStatus(...args),
  };
});

import './practice-view.js';
import type { PracticeView } from './practice-view.js';
import { mount } from '../ui/test-utils.js';
import { Message } from '../ui/message.js';
import {
  AUDIO_FOCUS_REQUEST_EVENT,
  RECORDING_PREVIEW_CLOSE_EVENT,
  RECORDING_PREVIEW_OPEN_EVENT,
} from '../../lib/audio-focus.js';
import { getAppSettings } from '../../lib/app-settings.js';
import {
  getHotkeyManager,
  HotkeyManager,
  setHotkeyManagerForTests,
} from '../../lib/hotkeys/hotkey-manager.js';

type PracticeViewInternals = PracticeView & {
  _controller: {
    play: () => Promise<void>;
    pause: () => Promise<void>;
    togglePlay: () => Promise<void>;
    previousSegment: () => void;
    nextSegment: () => void;
    replaySegment: () => void;
    setVolume: (volume: number) => void;
    setPlaybackRate: (rate: number) => void;
    setSubtitlesVisible: (visible: boolean) => void;
    setLoopMode: (mode: string) => void;
    setSleepMode: (mode: string) => void;
    setSleepMinutes: (minutes: number) => void;
    setPauseMode: (mode: string) => void;
    setPauseSeconds: (seconds: number) => void;
    setPausePercent: (percent: number) => void;
    seek: (time: number, options?: { force?: boolean }) => void;
    addEventListener: (type: string, listener: (event?: Event) => void) => void;
    removeEventListener: (type: string, listener: (event?: Event) => void) => void;
    getSnapshot: () => {
      segments: SubtitleSegment[];
      currentItem: { id: string; title?: string; filename?: string; type?: string } | null;
      isPlaying: boolean;
      navigationLocked: boolean;
      currentSegmentIndex: number;
      currentTime: number;
      hasSubtitles: boolean;
      subtitlesVisible?: boolean;
      volume?: number;
      playbackRate?: number;
      loopMode?: string;
      sleepMode?: string;
      sleepMinutes?: number;
      pauseMode?: string;
      pauseSeconds?: number;
      pausePercent?: number;
    };
    getCurrentBlob: () => Blob | null;
    seekToSegment: (index: number, autoPlay?: boolean, options?: { force?: boolean }) => void;
    setNavigationLocked: (locked: boolean) => void;
    dispatchEvent: (event: Event) => boolean;
  };
  _practiceType: 'listening' | 'speaking';
  _listeningMode: 'free' | 'discrimination';
  _tipsModalKind: string | null;
  _hotkeysHelpOpen: boolean;
  _discriminationSettings: { selected: { noiseId: string; volume: number }[] };
  _echoListening: boolean;
  _sessionPhase: string;
  _recording: boolean;
  _recordingsModalOpen: boolean;
  _recordingsModalMode: 'shadowing' | 'echo';
  _recordingsModalSegmentId: string | null;
  _recordingPreviewOpen: boolean;
  _speakingMode: 'shadowing' | 'echo';
  _subtitlePanelFullscreen: boolean;
  _onTrackChange: () => void;
  _shadowingRecorderEl?: {
    startRecording: () => Promise<void>;
    stopRecording: () => Promise<void>;
    clearWaveform: () => void;
    destroy: () => void;
    waveformController: unknown;
  };
  navigate: (path: string) => void;
  _sentenceBankBusy: boolean;
};

function dispatchKey(code: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
}

describe('practice-view', () => {
  let cleanup: (() => void) | undefined;

  function stubKeyboardShortcuts(matches: boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('hover') ? matches : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  }

  function findButton(el: PracticeViewInternals, text: string) {
    return Array.from(el.shadowRoot!.querySelectorAll('ui-button')).find((button) =>
      button.textContent?.includes(text),
    );
  }

  function clickShadowingManageRecordings(el: PracticeViewInternals) {
    const button = el.shadowRoot!.querySelector(
      '.recordings-summary ui-button',
    ) as HTMLElement | null;
    button?.click();
  }

  function setUserSettingsLocal(overrides: Record<string, unknown> = {}) {
    localStorage.setItem(
      'fluent-any-lang:user-settings',
      JSON.stringify({
        skipRecordingCountdown: true,
        skipShadowingTips: true,
        skipEchoTips: true,
        skipDiscriminationTips: true,
        ...overrides,
      }),
    );
  }

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
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [],
          getAudioTracks: () => [],
        }),
      },
      permissions: {
        query: vi.fn().mockResolvedValue({
          state: 'granted',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
      },
      vibrate: vi.fn(),
    });
    stubKeyboardShortcuts(false);
    setUserSettingsLocal();

    mockLoadMedia.mockReset();
    mockLoadPlaylist.mockReset();
    mockLoadMedia.mockResolvedValue(makeLoadedMedia('media-1'));
    mockLoadPlaylist.mockResolvedValue([makeLoadedMedia('media-1'), makeLoadedMedia('media-2')]);
    mockCountEchoRecordings.mockResolvedValue(0);
    mockCountShadowingRecordings.mockResolvedValue(0);
    mockFindAllEchoRecordings.mockResolvedValue([]);
    mockSaveRecording.mockResolvedValue(undefined);
    mockAddToSentenceBank.mockResolvedValue({ status: 'added' });
    mockRemoveFromSentenceBank.mockResolvedValue({ status: 'removed' });
    mockGetSentenceBankList.mockResolvedValue([]);
    mockGetNoiseList.mockResolvedValue([]);
    mockGetNoiseBlob.mockResolvedValue(new Blob(['noise'], { type: 'audio/mpeg' }));
    mockEstimateStorage.mockResolvedValue({
      usage: 0,
      quota: 100,
      remaining: 100,
      remainingPercent: 100,
    });
    mockCheckMicrophoneStatus.mockResolvedValue('granted');
    mockReportError.mockResolvedValue(undefined);
    mockLoadingClose.mockClear();
    mockNoiseMixer.setPlaying.mockClear();
    mockNoiseMixer.setTracks.mockClear();
    mockNoiseMixer.setTrackVolume.mockClear();
    mockNoiseMixer.destroy.mockClear();
    mockRateLadder.setRates.mockClear();
    mockRateLadder.reset.mockClear();
    mockRateLadder.getIndex.mockReturnValue(0);
    mockRateLadder.getCurrentRate.mockReturnValue(1);
    mockRateLadder.getSequence.mockReturnValue([1, 1.5, 1]);
    mockRateLadder.onMainEnded.mockReturnValue({ kind: 'finished', rate: 1 });
    mockEchoClipPlayer.prepare.mockReset().mockResolvedValue(undefined);
    mockEchoClipPlayer.play.mockReset().mockResolvedValue(undefined);
    mockEchoClipPlayer.waitForOutputDrain.mockReset().mockResolvedValue(undefined);
    mockEchoClipPlayer.stop.mockClear();
    mockEchoClipPlayer.dispose.mockClear();
    mockEchoClipPlayer.onEnded = null;
    mockEchoClipPlayer.isPlaying = false;
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    localStorage.clear();
    document.querySelector('[data-echo-session-dock-portal]')?.remove();
    Message.closeAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderView() {
    const result = mount(
      html`<practice-view
        .routeContext=${{
          route: 'practice',
          params: {},
          query: { mediaId: 'media-1' },
          data: {},
        }}
      ></practice-view>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-view') as PracticeViewInternals;
    await el.updateComplete;
    return el;
  }

  async function settleView(el: PracticeViewInternals) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;
  }

  async function switchToEchoMode(el: PracticeViewInternals) {
    await settleView(el);

    const speakingButton = Array.from(el.shadowRoot!.querySelectorAll('ui-button')).find((button) =>
      button.textContent?.includes('口语'),
    );
    speakingButton?.click();
    await el.updateComplete;
    await settleView(el);
    expect(el._speakingMode).toBe('echo');
  }

  async function switchToShadowingMode(el: PracticeViewInternals) {
    await settleView(el);

    findButton(el, '口语')?.click();
    await el.updateComplete;

    findButton(el, '影子跟读')?.click();
    await el.updateComplete;
    await settleView(el);
    expect(el._speakingMode).toBe('shadowing');
  }

  async function switchToDiscriminationMode(el: PracticeViewInternals) {
    await settleView(el);
    findButton(el, '抗噪听')?.click();
    await el.updateComplete;
    await settleView(el);
    expect(el._listeningMode).toBe('discrimination');
  }

  async function openSpeakingMode(el: PracticeViewInternals) {
    await settleView(el);
    findButton(el, '口语')?.click();
    await el.updateComplete;
    await settleView(el);
  }

  it('defaults to echo speaking mode and lists echo before shadowing when subtitles exist', async () => {
    const el = await renderView();
    await settleView(el);

    const speakingButton = Array.from(el.shadowRoot!.querySelectorAll('ui-button')).find((button) =>
      button.textContent?.includes('口语'),
    );
    speakingButton?.click();
    await el.updateComplete;

    expect(el._speakingMode).toBe('echo');
    const modeTabs = el.shadowRoot!.querySelector('.speaking-mode-tabs');
    const labels = Array.from(modeTabs?.querySelectorAll('ui-button') ?? []).map((button) =>
      button.textContent?.trim(),
    );
    expect(labels).toEqual(['回声跟读', '影子跟读']);
  });

  it('falls back to shadowing and hides echo when media has no subtitles', async () => {
    mockLoadMedia.mockResolvedValue(makeLoadedMedia('media-1', { hasSubtitles: false }));
    const el = await renderView();
    await settleView(el);

    const speakingButton = Array.from(el.shadowRoot!.querySelectorAll('ui-button')).find((button) =>
      button.textContent?.includes('口语'),
    );
    speakingButton?.click();
    await el.updateComplete;

    expect(el._speakingMode).toBe('shadowing');
    const modeTabs = el.shadowRoot!.querySelector('.speaking-mode-tabs');
    const labels = Array.from(modeTabs?.querySelectorAll('ui-button') ?? []).map((button) =>
      button.textContent?.trim(),
    );
    expect(labels).toEqual(['影子跟读']);
  });

  it('falls back from echo to shadowing when track change removes subtitles', async () => {
    const el = await renderView();
    await switchToEchoMode(el);
    expect(el._speakingMode).toBe('echo');

    const snapshot = el._controller.getSnapshot();
    vi.spyOn(el._controller, 'getSnapshot').mockReturnValue({
      ...snapshot,
      hasSubtitles: false,
      segments: [],
    });

    el._onTrackChange();
    await settleView(el);

    expect(el._speakingMode).toBe('shadowing');
  });

  it('renders practice layout shell', async () => {
    const el = await renderView();
    expect(el.shadowRoot?.querySelector('.layout')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('media-player')).not.toBeNull();
  });

  it('loads single media when only mediaId is provided', async () => {
    const result = mount(
      html`<practice-view
        .routeContext=${{
          route: 'practice',
          params: {},
          query: { mediaId: 'media-1' },
          data: {},
        }}
      ></practice-view>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-view') as PracticeViewInternals;
    await el.updateComplete;
    await settleView(el);

    expect(mockLoadMedia).toHaveBeenCalledWith('media-1');
    expect(mockLoadPlaylist).not.toHaveBeenCalled();
    expect(el._controller.getSnapshot().currentItem?.id).toBe('media-1');
  });

  it('loads playlist from first track when only playlistId is provided', async () => {
    const result = mount(
      html`<practice-view
        .routeContext=${{
          route: 'practice',
          params: {},
          query: { playlistId: 'playlist-1' },
          data: {},
        }}
      ></practice-view>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-view') as PracticeViewInternals;
    await el.updateComplete;
    await settleView(el);

    expect(mockLoadPlaylist).toHaveBeenCalledWith('playlist-1');
    expect(el._controller.getSnapshot().currentItem?.id).toBe('media-1');
  });

  it('starts from requested media when playlistId and mediaId are provided', async () => {
    const result = mount(
      html`<practice-view
        .routeContext=${{
          route: 'practice',
          params: {},
          query: { playlistId: 'playlist-1', mediaId: 'media-2' },
          data: {},
        }}
      ></practice-view>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-view') as PracticeViewInternals;
    await el.updateComplete;
    await settleView(el);

    expect(mockLoadPlaylist).toHaveBeenCalledWith('playlist-1');
    expect(el._controller.getSnapshot().currentItem?.id).toBe('media-2');
  });

  it('reloads when practice query changes without changing the path', async () => {
    const result = mount(
      html`<practice-view
        .routeContext=${{
          route: 'practice',
          params: {},
          query: { playlistId: 'playlist-1' },
          data: {},
        }}
      ></practice-view>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-view') as PracticeViewInternals;
    await el.updateComplete;
    await settleView(el);

    mockLoadPlaylist.mockClear();

    el.routeContext = {
      route: 'practice',
      params: {},
      query: { playlistId: 'playlist-2' },
      data: {},
    };
    await el.updateComplete;
    await settleView(el);

    expect(mockLoadPlaylist).toHaveBeenCalledWith('playlist-2');
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

  it('starts echo clip listen without calling main controller.play', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    const playSpy = vi.spyOn(el._controller, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);
    const seekSpy = vi.spyOn(el._controller, 'seekToSegment');
    const echoRecorder = el.shadowRoot!.querySelector('audio-recorder#echo-recorder') as {
      startRecording: () => Promise<void>;
      recording: boolean;
    };
    const startRecordingSpy = vi.spyOn(echoRecorder, 'startRecording').mockResolvedValue(undefined);

    await dispatchEchoRecordRequest(el);

    expect(playSpy).not.toHaveBeenCalled();
    expect(pauseSpy).toHaveBeenCalled();
    expect(seekSpy).toHaveBeenCalledWith(0, false, { force: true });
    expect(mockEchoClipPlayer.prepare).toHaveBeenCalled();
    expect(mockEchoClipPlayer.play).toHaveBeenCalledWith(
      { startTime: 0, endTime: 5 },
      expect.objectContaining({ playbackRate: expect.any(Number), volume: expect.any(Number) }),
    );
    expect(startRecordingSpy).not.toHaveBeenCalled();
    expect(el._echoListening).toBe(true);
    expect(el._sessionPhase).toBe('listening');
  });

  it('opens the mic before the clip plays', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);
    const echoRecorder = el.shadowRoot!.querySelector('audio-recorder#echo-recorder') as {
      warmUpMicrophone: () => Promise<void>;
      startRecording: () => Promise<void>;
    };
    const warmUpSpy = vi.spyOn(echoRecorder, 'warmUpMicrophone').mockResolvedValue(undefined);
    vi.spyOn(echoRecorder, 'startRecording').mockResolvedValue(undefined);

    await dispatchEchoRecordRequest(el);

    expect(warmUpSpy).toHaveBeenCalled();
    expect(warmUpSpy.mock.invocationCallOrder[0]!).toBeLessThan(
      mockEchoClipPlayer.play.mock.invocationCallOrder[0]!,
    );
  });

  it('releases a warmed-up mic when the session is cancelled', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);
    const echoRecorder = el.shadowRoot!.querySelector('audio-recorder#echo-recorder') as {
      warmUpMicrophone: () => Promise<void>;
      releaseMicrophone: () => void;
      startRecording: () => Promise<void>;
    };
    vi.spyOn(echoRecorder, 'warmUpMicrophone').mockResolvedValue(undefined);
    const releaseSpy = vi.spyOn(echoRecorder, 'releaseMicrophone').mockReturnValue(undefined);
    vi.spyOn(echoRecorder, 'startRecording').mockResolvedValue(undefined);

    await dispatchEchoRecordRequest(el);
    el.shadowRoot!.querySelector('subtitle-panel')!.dispatchEvent(
      new CustomEvent('echo-record-stop', { bubbles: true, composed: true }),
    );
    await el.updateComplete;

    expect(releaseSpy).toHaveBeenCalled();
    expect(el._sessionPhase).toBe('idle');
  });

  it('starts recording after echo clip ends', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);
    const seekSpy = vi.spyOn(el._controller, 'seekToSegment');
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
    expect(el._echoListening).toBe(true);

    mockEchoClipPlayer.onEnded?.();
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startRecordingSpy).toHaveBeenCalled();
    expect(el._echoListening).toBe(false);
    expect(seekSpy).toHaveBeenCalledWith(0, false, { force: true });
  });

  it('cancels echo listen session on stop without saving', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    const pauseSpy = vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);
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
    expect(mockEchoClipPlayer.stop).toHaveBeenCalled();
    expect(startRecordingSpy).not.toHaveBeenCalled();
    expect(stopRecordingSpy).not.toHaveBeenCalled();
    expect(el._echoListening).toBe(false);
  });

  it('cancels pending echo listen during prepare without starting recording', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    let resolvePrepare: (() => void) | undefined;
    const pendingPrepare = new Promise<void>((resolve) => {
      resolvePrepare = resolve;
    });
    mockEchoClipPlayer.prepare.mockReturnValue(pendingPrepare);
    vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);
    const echoRecorder = el.shadowRoot!.querySelector('audio-recorder#echo-recorder') as {
      startRecording: () => Promise<void>;
    };
    const startRecordingSpy = vi.spyOn(echoRecorder, 'startRecording').mockResolvedValue(undefined);

    const subtitlePanel = el.shadowRoot!.querySelector('subtitle-panel')!;
    subtitlePanel.dispatchEvent(
      new CustomEvent('echo-record-request', {
        detail: { segmentIndex: 0 },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(el._sessionPhase).toBe('preparing');
    expect(mockEchoClipPlayer.play).not.toHaveBeenCalled();

    const busyPanel = el.shadowRoot!.querySelector('subtitle-panel') as { echoBusy: boolean };
    expect(busyPanel.echoBusy).toBe(true);

    subtitlePanel.dispatchEvent(
      new CustomEvent('echo-record-stop', {
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    resolvePrepare!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;

    expect(mockEchoClipPlayer.play).not.toHaveBeenCalled();
    expect(startRecordingSpy).not.toHaveBeenCalled();
    expect(el._sessionPhase).toBe('idle');
    expect(el._echoListening).toBe(false);
  });

  it('waits for clip output drain before opening the mic', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    let resolveDrain: (() => void) | undefined;
    mockEchoClipPlayer.waitForOutputDrain.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDrain = resolve;
      }),
    );
    vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);
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
    mockEchoClipPlayer.onEnded?.();
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(el._sessionPhase).toBe('draining');
    expect(startRecordingSpy).not.toHaveBeenCalled();

    resolveDrain!();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startRecordingSpy).toHaveBeenCalled();
  });

  it('cancels during output drain without opening the mic', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    let resolveDrain: (() => void) | undefined;
    mockEchoClipPlayer.waitForOutputDrain.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDrain = resolve;
      }),
    );
    vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);
    const echoRecorder = el.shadowRoot!.querySelector('audio-recorder#echo-recorder') as {
      startRecording: () => Promise<void>;
    };
    const startRecordingSpy = vi.spyOn(echoRecorder, 'startRecording').mockResolvedValue(undefined);

    await dispatchEchoRecordRequest(el);
    mockEchoClipPlayer.onEnded?.();
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(el._sessionPhase).toBe('draining');

    el.shadowRoot!.querySelector('subtitle-panel')!.dispatchEvent(
      new CustomEvent('echo-record-stop', { bubbles: true, composed: true }),
    );
    await el.updateComplete;

    resolveDrain!();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startRecordingSpy).not.toHaveBeenCalled();
    expect(el._sessionPhase).toBe('idle');
  });

  it('starts only one clip for repeated taps while the recording count is pending', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    let resolveCount: ((value: number) => void) | undefined;
    mockCountEchoRecordings.mockReturnValue(
      new Promise<number>((resolve) => {
        resolveCount = resolve;
      }),
    );
    vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);

    const subtitlePanel = el.shadowRoot!.querySelector('subtitle-panel')!;
    const tap = () =>
      subtitlePanel.dispatchEvent(
        new CustomEvent('echo-record-request', {
          detail: { segmentIndex: 0 },
          bubbles: true,
          composed: true,
        }),
      );
    tap();
    tap();
    tap();
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;

    expect(el._sessionPhase).toBe('preparing');

    resolveCount!(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;

    expect(mockEchoClipPlayer.play).toHaveBeenCalledTimes(1);
    expect(el._sessionPhase).toBe('listening');
  });

  it('disables media player while echo listening', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    await dispatchEchoRecordRequest(el);

    const mediaPlayer = el.shadowRoot!.querySelector('media-player') as { disabled: boolean };
    expect(mediaPlayer.disabled).toBe(true);
  });

  it('locks navigation while echo listening and unlocks on cancel', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    await dispatchEchoRecordRequest(el);

    expect(el._controller.getSnapshot().navigationLocked).toBe(true);
    const subtitlePanel = el.shadowRoot!.querySelector('subtitle-panel') as {
      seekDisabled: boolean;
    };
    expect(subtitlePanel.seekDisabled).toBe(true);

    subtitlePanel.dispatchEvent(
      new CustomEvent('echo-record-stop', {
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(el._controller.getSnapshot().navigationLocked).toBe(false);
    expect(subtitlePanel.seekDisabled).toBe(false);
  });

  it('keeps echo target segment after blocked seek so clip end still starts recording', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);
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
    expect(el._controller.getSnapshot().navigationLocked).toBe(true);

    el._controller.seekToSegment(1);
    expect(el._controller.getSnapshot().currentSegmentIndex).toBe(0);

    mockEchoClipPlayer.onEnded?.();
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startRecordingSpy).toHaveBeenCalled();
    expect(el._echoListening).toBe(false);
  });

  it('disables media player and locks navigation during shadowing countdown', async () => {
    mockCountShadowingRecordings.mockResolvedValue(2);
    const el = await renderView();
    await switchToShadowingMode(el);

    const recorder = el.shadowRoot!.querySelector(
      'audio-recorder#shadowing-recorder',
    ) as HTMLElement;
    recorder.dispatchEvent(
      new CustomEvent('recording-countdown-start', {
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(el._sessionPhase).toBe('countdown');
    expect(el._controller.getSnapshot().navigationLocked).toBe(true);
    const mediaPlayer = el.shadowRoot!.querySelector('media-player') as { disabled: boolean };
    expect(mediaPlayer.disabled).toBe(true);
    const subtitlePanel = el.shadowRoot!.querySelector('subtitle-panel') as {
      seekDisabled: boolean;
    };
    expect(subtitlePanel.seekDisabled).toBe(true);

    const manageButton = el.shadowRoot!.querySelector('.recordings-summary ui-button') as
      | (HTMLElement & { disabled?: boolean })
      | null;
    expect(manageButton).not.toBeNull();
    expect(manageButton?.hasAttribute('disabled') || manageButton?.disabled).toBe(true);
  });

  it('re-enables media player when shadowing countdown is cancelled', async () => {
    const el = await renderView();
    await switchToShadowingMode(el);

    const recorder = el.shadowRoot!.querySelector(
      'audio-recorder#shadowing-recorder',
    ) as HTMLElement;
    recorder.dispatchEvent(
      new CustomEvent('recording-countdown-start', {
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    recorder.dispatchEvent(
      new CustomEvent('recording-countdown-end', {
        detail: { skipped: false, cancelled: true },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(el._sessionPhase).toBe('idle');
    expect(el._controller.getSnapshot().navigationLocked).toBe(false);
    const mediaPlayer = el.shadowRoot!.querySelector('media-player') as { disabled: boolean };
    expect(mediaPlayer.disabled).toBe(false);
    const subtitlePanel = el.shadowRoot!.querySelector('subtitle-panel') as {
      seekDisabled: boolean;
    };
    expect(subtitlePanel.seekDisabled).toBe(false);
  });

  it('shows echo session dock while listening', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    await dispatchEchoRecordRequest(el);

    expect(el._sessionPhase).toBe('listening');
    const dock = el.shadowRoot!.querySelector('echo-session-dock') as { phase: string };
    expect(dock.phase).toBe('listening');
  });

  it('shows tip summary and explanation button in echo mode', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    const summary = el.shadowRoot!.querySelector('.tips-summary');
    expect(summary?.textContent).toContain('字幕行右侧【麦克风】');
    expect(
      Array.from(el.shadowRoot!.querySelectorAll('ui-button')).some((button) =>
        button.textContent?.includes('说明'),
      ),
    ).toBe(true);
  });

  it('seeks to first segment when shadowing starts at currentTime 0', async () => {
    const el = await renderView();
    await switchToShadowingMode(el);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const snapshot = el._controller.getSnapshot();
    vi.spyOn(el._controller, 'getSnapshot').mockReturnValue({
      ...snapshot,
      currentTime: 0,
      currentSegmentIndex: -1,
    });
    const seekSpy = vi.spyOn(el._controller, 'seekToSegment');

    (
      el as PracticeViewInternals & { _applyShadowingPlaybackProfile: () => void }
    )._applyShadowingPlaybackProfile();

    expect(seekSpy).toHaveBeenCalledWith(0, false, { force: true });
  });

  it('seeks to current segment when shadowing starts mid-track', async () => {
    const el = await renderView();
    await switchToShadowingMode(el);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const snapshot = el._controller.getSnapshot();
    vi.spyOn(el._controller, 'getSnapshot').mockReturnValue({
      ...snapshot,
      currentTime: 7,
      currentSegmentIndex: 1,
    });
    const seekSpy = vi.spyOn(el._controller, 'seekToSegment');

    (
      el as PracticeViewInternals & { _applyShadowingPlaybackProfile: () => void }
    )._applyShadowingPlaybackProfile();

    expect(seekSpy).toHaveBeenCalledWith(1, false, { force: true });
  });

  it('suppresses loop/sleep for shadowing then restores them after session ends', async () => {
    const el = await renderView();
    await switchToShadowingMode(el);
    await new Promise((resolve) => setTimeout(resolve, 0));

    el._controller.setLoopMode('segment');
    el._controller.setSleepMinutes(15);
    el._controller.setSleepMode('minutes');
    el._controller.setVolume(0.4);
    el._controller.setPlaybackRate(0.7);
    el._controller.setPauseMode('seconds');
    el._controller.setPauseSeconds(3);

    (
      el as PracticeViewInternals & { _applyShadowingPlaybackProfile: () => void }
    )._applyShadowingPlaybackProfile();

    let snap = el._controller.getSnapshot();
    expect(snap.loopMode).toBe('none');
    expect(snap.sleepMode).toBe('off');
    expect(snap.volume).toBe(0.4);
    expect(snap.playbackRate).toBe(0.7);
    // Default gap policy is compress → pauseMode forced off (avoid stacking waits).
    expect(snap.pauseMode).toBe('off');
    expect(el._controller.shadowingGapCompress).toBe(true);

    (el as PracticeViewInternals & { _resetSessionUi: () => void })._resetSessionUi();

    snap = el._controller.getSnapshot();
    expect(snap.loopMode).toBe('segment');
    expect(snap.sleepMode).toBe('minutes');
    expect(snap.sleepMinutes).toBe(15);
    expect(snap.volume).toBe(0.4);
    expect(snap.playbackRate).toBe(0.7);
    expect(snap.pauseMode).toBe('seconds');
    expect(snap.pauseSeconds).toBe(3);
    expect(el._controller.shadowingGapCompress).toBe(false);
  });

  it('keeps pauseMode during shadowing when gap policy is preserve', async () => {
    const { setAppSettings } = await import('../../lib/app-settings.js');
    setAppSettings({ shadowingGapPolicy: 'preserve' });

    const el = await renderView();
    await switchToShadowingMode(el);
    await new Promise((resolve) => setTimeout(resolve, 0));

    el._controller.setPauseMode('seconds');
    el._controller.setPauseSeconds(3);
    (
      el as PracticeViewInternals & { _applyShadowingPlaybackProfile: () => void }
    )._applyShadowingPlaybackProfile();

    expect(el._controller.getSnapshot().pauseMode).toBe('seconds');
    expect(el._controller.shadowingGapCompress).toBe(false);

    (el as PracticeViewInternals & { _resetSessionUi: () => void })._resetSessionUi();
    setAppSettings({ shadowingGapPolicy: 'compress' });
  });

  it('suppresses loop/sleep/pause for echo then restores them after session ends', async () => {
    const el = await renderView();
    await switchToEchoMode(el);
    await new Promise((resolve) => setTimeout(resolve, 0));

    el._controller.setLoopMode('list');
    el._controller.setSleepMode('until-end');
    el._controller.setVolume(0.55);
    el._controller.setPlaybackRate(1.2);
    el._controller.setPauseMode('percentage');
    el._controller.setPausePercent(200);

    (
      el as PracticeViewInternals & {
        _echoSegmentIndex: number;
        _applyEchoPlaybackProfile: () => void;
      }
    )._echoSegmentIndex = 0;
    (
      el as PracticeViewInternals & { _applyEchoPlaybackProfile: () => void }
    )._applyEchoPlaybackProfile();

    let snap = el._controller.getSnapshot();
    expect(snap.loopMode).toBe('none');
    expect(snap.sleepMode).toBe('off');
    expect(snap.pauseMode).toBe('off');
    expect(snap.volume).toBe(0.55);
    expect(snap.playbackRate).toBe(1.2);

    (el as PracticeViewInternals & { _resetSessionUi: () => void })._resetSessionUi();

    snap = el._controller.getSnapshot();
    expect(snap.loopMode).toBe('list');
    expect(snap.sleepMode).toBe('until-end');
    expect(snap.pauseMode).toBe('percentage');
    expect(snap.pausePercent).toBe(200);
    expect(snap.volume).toBe(0.55);
    expect(snap.playbackRate).toBe(1.2);
  });

  it('shows compact recordings entry instead of inline record-list in shadowing', async () => {
    mockCountShadowingRecordings.mockResolvedValue(2);
    const el = await renderView();
    await switchToShadowingMode(el);
    await el.updateComplete;

    const summary = el.shadowRoot!.querySelector('.recordings-summary');
    expect(summary?.textContent).toMatch(/已保存\s*2\s*\/\s*5|已保存 2\/5/);
    expect(summary?.querySelector('ui-icon[name="manage"]')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('record-list')).toBeNull();
  });

  it('opens recordings manage modal from shadowing entry', async () => {
    mockCountShadowingRecordings.mockResolvedValue(1);
    const el = await renderView();
    await switchToShadowingMode(el);
    await el.updateComplete;

    clickShadowingManageRecordings(el);
    await el.updateComplete;

    expect(el.shadowRoot!.querySelector('record-list')).not.toBeNull();
  });

  it('ignores nested update:open when managing recordings modal', async () => {
    mockCountShadowingRecordings.mockResolvedValue(1);
    const el = await renderView();
    await switchToShadowingMode(el);
    await el.updateComplete;

    clickShadowingManageRecordings(el);
    await el.updateComplete;
    expect(el._recordingsModalOpen).toBe(true);

    const recordList = el.shadowRoot!.querySelector('record-list');
    expect(recordList).not.toBeNull();

    // Simulate tooltip/preview emitting composed update:open={false} from inside.
    recordList!.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(el._recordingsModalOpen).toBe(true);
    expect(el.shadowRoot!.querySelector('record-list')).not.toBeNull();
  });

  it('opens echo recordings manage modal from subtitle row', async () => {
    const el = await renderView();
    await settleView(el);

    const panel = el.shadowRoot!.querySelector('subtitle-panel') as HTMLElement;
    expect(panel).not.toBeNull();
    panel.dispatchEvent(
      new CustomEvent('echo-manage-recordings', {
        detail: { segmentId: 's0' },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(el._recordingsModalOpen).toBe(true);
    expect(el._recordingsModalMode).toBe('echo');
    expect(el._recordingsModalSegmentId).toBe('s0');

    const recordList = el.shadowRoot!.querySelector('record-list') as {
      modeFilter?: string;
      segmentId?: string;
    } | null;
    expect(recordList).not.toBeNull();
    expect(recordList?.modeFilter).toBe('echo');
    expect(recordList?.segmentId).toBe('s0');

    const modal = el.shadowRoot!.querySelector('ui-modal') as { title?: string } | null;
    expect(modal?.title).toBe('当前句的回声录音');
  });

  it('shows session dock while shadowing recording', async () => {
    const el = await renderView();
    await switchToShadowingMode(el);

    const recorder = el.shadowRoot!.querySelector(
      'audio-recorder#shadowing-recorder',
    ) as HTMLElement & {
      dispatchEvent: (event: Event) => boolean;
      waveformController: unknown;
    };
    expect(recorder).not.toBeNull();

    recorder.dispatchEvent(
      new CustomEvent('recording-state-change', {
        detail: { recording: true },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(el._sessionPhase).toBe('recording');
    expect(el._recording).toBe(true);
    const dock = el.shadowRoot!.querySelector('echo-session-dock') as { phase: string };
    expect(dock.phase).toBe('recording');
  });

  it('hides shadowing recorder waveform in favor of session dock', async () => {
    const el = await renderView();
    await switchToShadowingMode(el);

    const recorder = el.shadowRoot!.querySelector('audio-recorder#shadowing-recorder') as {
      hideWaveform: boolean;
    };
    expect(recorder.hideWaveform).toBe(true);
  });

  it('pauses practice media when recording preview opens', async () => {
    const el = await renderView();
    const pauseSpy = vi.spyOn(el._controller, 'pause').mockResolvedValue(undefined);
    vi.spyOn(el._controller, 'getSnapshot').mockReturnValue({
      segments: sampleSegments,
      currentItem: { id: 'media-1' },
      isPlaying: true,
    });
    const infoSpy = vi
      .spyOn(Message, 'info')
      .mockImplementation(() => ({ close: () => undefined }));

    el.dispatchEvent(
      new CustomEvent(RECORDING_PREVIEW_OPEN_EVENT, { bubbles: true, composed: true }),
    );
    await el.updateComplete;

    expect(el._recordingPreviewOpen).toBe(true);
    expect(pauseSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();

    el.dispatchEvent(
      new CustomEvent(RECORDING_PREVIEW_CLOSE_EVENT, { bubbles: true, composed: true }),
    );
    await el.updateComplete;
    expect(el._recordingPreviewOpen).toBe(false);
  });

  it('cancels echo listen when recording preview opens', async () => {
    const el = await renderView();
    await switchToEchoMode(el);

    const pauseSpy = vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);
    vi.spyOn(Message, 'info').mockImplementation(() => ({ close: () => undefined }));

    await dispatchEchoRecordRequest(el);
    expect(el._echoListening).toBe(true);

    el.dispatchEvent(
      new CustomEvent(RECORDING_PREVIEW_OPEN_EVENT, { bubbles: true, composed: true }),
    );
    await el.updateComplete;

    expect(el._echoListening).toBe(false);
    expect(pauseSpy).toHaveBeenCalled();
    expect(mockEchoClipPlayer.stop).toHaveBeenCalled();
  });

  it('pauses practice media on audio-focus-request without tip', async () => {
    const el = await renderView();
    const pauseSpy = vi.spyOn(el._controller, 'pause').mockResolvedValue(undefined);
    vi.spyOn(el._controller, 'getSnapshot').mockReturnValue({
      segments: sampleSegments,
      currentItem: { id: 'media-1' },
      isPlaying: true,
    });
    const infoSpy = vi
      .spyOn(Message, 'info')
      .mockImplementation(() => ({ close: () => undefined }));

    el.dispatchEvent(new CustomEvent(AUDIO_FOCUS_REQUEST_EVENT, { bubbles: true, composed: true }));
    await el.updateComplete;

    expect(pauseSpy).toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  describe('discrimination mode', () => {
    it('renders discrimination panel and configures mixer on switch', async () => {
      const el = await renderView();
      await switchToDiscriminationMode(el);

      expect(el.shadowRoot!.querySelector('discrimination-panel')).not.toBeNull();
      expect(mockRateLadder.setRates).toHaveBeenCalled();
      expect(mockRateLadder.reset).toHaveBeenCalled();
      expect(mockNoiseMixer.setTracks).toHaveBeenCalled();
    });

    it('tears down discrimination when switching to free listen', async () => {
      const el = await renderView();
      await switchToDiscriminationMode(el);

      findButton(el, '自由听')?.click();
      await el.updateComplete;

      expect(el._listeningMode).toBe('free');
      expect(mockNoiseMixer.setPlaying).toHaveBeenCalledWith(false);
      expect(mockNoiseMixer.setTracks).toHaveBeenCalledWith([]);
    });

    it('tears down discrimination when switching to speaking', async () => {
      const el = await renderView();
      await switchToDiscriminationMode(el);

      await openSpeakingMode(el);
      expect(el._practiceType).toBe('speaking');
      expect(mockNoiseMixer.setTracks).toHaveBeenCalledWith([]);
    });

    it('syncs noise mixer play state with main media', async () => {
      const el = await renderView();
      await switchToDiscriminationMode(el);

      el._controller.dispatchEvent(new CustomEvent(MediaEventType.PLAY));
      expect(mockNoiseMixer.setPlaying).toHaveBeenCalledWith(true);

      el._controller.dispatchEvent(new CustomEvent(MediaEventType.PAUSE));
      expect(mockNoiseMixer.setPlaying).toHaveBeenCalledWith(false);
    });

    it('advances rate ladder when main media ends', async () => {
      const el = await renderView();
      await switchToDiscriminationMode(el);

      mockRateLadder.onMainEnded.mockReturnValueOnce({
        kind: 'advance',
        rate: 1.5,
        index: 1,
      });
      const playSpy = vi.spyOn(el._controller, 'play').mockResolvedValue(undefined);
      const setRateSpy = vi.spyOn(el._controller, 'setPlaybackRate');
      const seekSpy = vi.spyOn(el._controller, 'seek');

      el._controller.dispatchEvent(new CustomEvent(MediaEventType.ENDED));
      await settleView(el);

      expect(setRateSpy).toHaveBeenCalledWith(1.5);
      expect(seekSpy).toHaveBeenCalledWith(0, { force: true });
      expect(playSpy).toHaveBeenCalled();
    });

    it('wires discrimination panel noise and ladder events', async () => {
      mockGetNoiseList.mockResolvedValue([
        {
          id: 'noise-1',
          title: 'Rain',
          filename: 'rain.mp3',
          size: 100,
          mimeType: 'audio/mpeg',
          duration: 30,
          createdAt: 1,
        },
      ]);
      const el = await renderView();
      await switchToDiscriminationMode(el);

      const panel = el.shadowRoot!.querySelector('discrimination-panel')!;
      panel.dispatchEvent(
        new CustomEvent('noise-toggle', {
          detail: { noiseId: 'noise-1', on: true },
          bubbles: true,
          composed: true,
        }),
      );
      await el.updateComplete;
      expect(el._discriminationSettings.selected).toEqual([
        expect.objectContaining({ noiseId: 'noise-1' }),
      ]);

      panel.dispatchEvent(
        new CustomEvent('noise-volume', {
          detail: { noiseId: 'noise-1', volume: 0.7 },
          bubbles: true,
          composed: true,
        }),
      );
      expect(mockNoiseMixer.setTrackVolume).toHaveBeenCalledWith('noise-1', 0.7);

      panel.dispatchEvent(
        new CustomEvent('ladder-count', {
          detail: { count: 3 },
          bubbles: true,
          composed: true,
        }),
      );
      await el.updateComplete;
      expect(el._discriminationSettings.ladderCount).toBe(3);

      panel.dispatchEvent(
        new CustomEvent('ladder-rate', {
          detail: { index: 0, rate: 1.5 },
          bubbles: true,
          composed: true,
        }),
      );
      await el.updateComplete;
      expect(el._discriminationSettings.ladderRates[0]).toBe(1.5);
    });

    it('warns when selecting more than max noise tracks', async () => {
      const el = await renderView();
      await switchToDiscriminationMode(el);
      el._discriminationSettings = {
        selected: Array.from({ length: DISCRIMINATION_MAX_NOISE_TRACKS }, (_, i) => ({
          noiseId: `n${i}`,
          volume: 0.5,
        })),
        ladderCount: 1,
        ladderRates: [1],
      };
      await el.updateComplete;

      const warningSpy = vi.spyOn(Message, 'warning');
      const panel = el.shadowRoot!.querySelector('discrimination-panel')!;
      panel.dispatchEvent(
        new CustomEvent('noise-toggle', {
          detail: { noiseId: 'extra', on: true },
          bubbles: true,
          composed: true,
        }),
      );
      expect(warningSpy).toHaveBeenCalled();
    });

    it('navigates to noise library from panel', async () => {
      const el = await renderView();
      await switchToDiscriminationMode(el);
      const navigateSpy = vi.spyOn(el, 'navigate').mockImplementation(() => undefined);

      el.shadowRoot!.querySelector('discrimination-panel')!.dispatchEvent(
        new CustomEvent('open-library', { bubbles: true, composed: true }),
      );
      expect(navigateSpy).toHaveBeenCalledWith('/library#noise-list-title');
    });
  });

  describe('tips modal', () => {
    it('opens shadowing tips when not skipped', async () => {
      setUserSettingsLocal({ skipShadowingTips: false });
      const el = await renderView();
      await openSpeakingMode(el);
      findButton(el, '影子跟读')?.click();
      await el.updateComplete;

      expect(el._tipsModalKind).toBe('shadowing');
      expect(el.shadowRoot!.querySelector('practice-tips-modal')).not.toBeNull();
    });

    it('opens echo tips when not skipped', async () => {
      setUserSettingsLocal({ skipEchoTips: false });
      const el = await renderView();
      await openSpeakingMode(el);
      expect(el._tipsModalKind).toBe('echo');
    });

    it('opens discrimination tips when not skipped', async () => {
      setUserSettingsLocal({ skipDiscriminationTips: false });
      const el = await renderView();
      await switchToDiscriminationMode(el);
      expect(el._tipsModalKind).toBe('discrimination');
    });

    it('persists skip preference on confirm', async () => {
      setUserSettingsLocal({ skipShadowingTips: false });
      const el = await renderView();
      await switchToShadowingMode(el);
      expect(el._tipsModalKind).toBe('shadowing');

      el.shadowRoot!.querySelector('practice-tips-modal')!.dispatchEvent(
        new CustomEvent('confirm', {
          detail: { kind: 'shadowing', skipFuture: true },
          bubbles: true,
          composed: true,
        }),
      );
      await el.updateComplete;

      expect(el._tipsModalKind).toBeNull();
      expect(getAppSettings().skipShadowingTips).toBe(true);
    });

    it('closes tips modal without persisting skip', async () => {
      setUserSettingsLocal({ skipEchoTips: false });
      const el = await renderView();
      await switchToEchoMode(el);

      el.shadowRoot!.querySelector('practice-tips-modal')!.dispatchEvent(
        new CustomEvent('close', { bubbles: true, composed: true }),
      );
      await el.updateComplete;

      expect(el._tipsModalKind).toBeNull();
      expect(getAppSettings().skipEchoTips).toBe(false);
    });

    it('opens tips from explanation button in echo mode', async () => {
      const el = await renderView();
      await switchToEchoMode(el);
      expect(el._tipsModalKind).toBeNull();

      findButton(el, '说明')?.click();
      await el.updateComplete;
      expect(el._tipsModalKind).toBe('echo');
    });
  });

  describe('hotkeys help', () => {
    it('opens and closes practice hotkeys help', async () => {
      stubKeyboardShortcuts(true);
      const el = await renderView();
      await settleView(el);

      el.shadowRoot!.querySelector('ui-icon-button[name="help"]')?.dispatchEvent(
        new Event('click', { bubbles: true }),
      );
      await el.updateComplete;
      expect(el._hotkeysHelpOpen).toBe(true);
      expect(el.shadowRoot!.querySelector('practice-hotkeys-help')).not.toBeNull();

      el.shadowRoot!.querySelector('practice-hotkeys-help')!.dispatchEvent(
        new CustomEvent('close', { bubbles: true, composed: true }),
      );
      await el.updateComplete;
      expect(el._hotkeysHelpOpen).toBe(false);
    });
  });

  describe('load and error states', () => {
    it('shows error when practice route has no media or playlist', async () => {
      const errorSpy = vi.spyOn(Message, 'error');
      const result = mount(
        html`<practice-view
          .routeContext=${{ route: 'practice', params: {}, query: {}, data: {} }}
        ></practice-view>`,
      );
      cleanup = result.cleanup;
      const el = result.container.querySelector('practice-view') as PracticeViewInternals;
      await el.updateComplete;
      await settleView(el);

      expect(errorSpy).toHaveBeenCalled();
      expect(mockLoadMedia).not.toHaveBeenCalled();
    });

    it('shows error when single media is missing', async () => {
      mockLoadMedia.mockResolvedValue(null);
      const errorSpy = vi.spyOn(Message, 'error');
      const el = await renderView();
      await settleView(el);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('shows error when playlist is empty', async () => {
      mockLoadPlaylist.mockResolvedValue([]);
      const errorSpy = vi.spyOn(Message, 'error');
      const result = mount(
        html`<practice-view
          .routeContext=${{
            route: 'practice',
            params: {},
            query: { playlistId: 'playlist-empty' },
            data: {},
          }}
        ></practice-view>`,
      );
      cleanup = result.cleanup;
      const el = result.container.querySelector('practice-view') as PracticeViewInternals;
      await el.updateComplete;
      await settleView(el);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('reports load failures', async () => {
      mockLoadMedia.mockRejectedValue(new Error('network'));
      const errorSpy = vi.spyOn(Message, 'error');
      const el = await renderView();
      await settleView(el);

      expect(mockReportError).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      expect(mockLoadingClose).toHaveBeenCalled();
    });

    it('falls back when requested media is not in playlist', async () => {
      const infoSpy = vi.spyOn(Message, 'info');
      const result = mount(
        html`<practice-view
          .routeContext=${{
            route: 'practice',
            params: {},
            query: { playlistId: 'playlist-1', mediaId: 'missing' },
            data: {},
          }}
        ></practice-view>`,
      );
      cleanup = result.cleanup;
      const el = result.container.querySelector('practice-view') as PracticeViewInternals;
      await el.updateComplete;
      await settleView(el);

      expect(infoSpy).toHaveBeenCalled();
      expect(el._controller.getSnapshot().currentItem?.id).toBe('media-1');
    });

    it('seeks to segmentId from route query', async () => {
      const result = mount(
        html`<practice-view
          .routeContext=${{
            route: 'practice',
            params: {},
            query: { mediaId: 'media-1', segmentId: 's1' },
            data: {},
          }}
        ></practice-view>`,
      );
      cleanup = result.cleanup;
      const el = result.container.querySelector('practice-view') as PracticeViewInternals;
      const seekSpy = vi.spyOn(el._controller, 'seekToSegment');
      await el.updateComplete;
      await settleView(el);

      expect(seekSpy).toHaveBeenCalledWith(1, false, { force: true });
    });

    it('warns when segmentId cannot be resolved', async () => {
      const warningSpy = vi.spyOn(Message, 'warning');
      const result = mount(
        html`<practice-view
          .routeContext=${{
            route: 'practice',
            params: {},
            query: { mediaId: 'media-1', segmentId: 'missing-seg' },
            data: {},
          }}
        ></practice-view>`,
      );
      cleanup = result.cleanup;
      const el = result.container.querySelector('practice-view') as PracticeViewInternals;
      await el.updateComplete;
      await settleView(el);
      expect(warningSpy).toHaveBeenCalled();
    });
  });

  describe('recording flows', () => {
    it('saves shadowing recording on complete', async () => {
      mockCountShadowingRecordings.mockResolvedValue(1);
      const successSpy = vi.spyOn(Message, 'success');
      const el = await renderView();
      await switchToShadowingMode(el);

      el.shadowRoot!.querySelector('audio-recorder#shadowing-recorder')!.dispatchEvent(
        new CustomEvent('recording-complete', {
          detail: {
            blob: new Blob(['rec'], { type: 'audio/webm' }),
            segments: [],
            reason: 'manual',
          },
          bubbles: true,
          composed: true,
        }),
      );
      await settleView(el);

      expect(mockSaveRecording).toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalled();
    });

    it('shows recording error when shadowing save fails', async () => {
      mockSaveRecording.mockRejectedValue(new Error('disk full'));
      const el = await renderView();
      await switchToShadowingMode(el);

      el.shadowRoot!.querySelector('audio-recorder#shadowing-recorder')!.dispatchEvent(
        new CustomEvent('recording-complete', {
          detail: {
            blob: new Blob(['rec'], { type: 'audio/webm' }),
            segments: [],
            reason: 'manual',
          },
          bubbles: true,
          composed: true,
        }),
      );
      await settleView(el);

      expect(el.shadowRoot!.querySelector('ui-alert[type="error"]')).not.toBeNull();
    });

    it('saves echo recording on complete after listen phase', async () => {
      const successSpy = vi.spyOn(Message, 'success');
      const el = await renderView();
      await switchToEchoMode(el);

      await dispatchEchoRecordRequest(el);

      el.shadowRoot!.querySelector('audio-recorder#echo-recorder')!.dispatchEvent(
        new CustomEvent('recording-complete', {
          detail: {
            blob: new Blob(['rec'], { type: 'audio/webm' }),
            segments: [],
            reason: 'manual',
          },
          bubbles: true,
          composed: true,
        }),
      );
      await settleView(el);

      expect(mockSaveRecording).toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalled();
    });

    it('blocks echo record when segment limit reached', async () => {
      mockCountEchoRecordings.mockResolvedValue(10);
      const warningSpy = vi.spyOn(Message, 'warning');
      const el = await renderView();
      await switchToEchoMode(el);

      await dispatchEchoRecordRequest(el);
      expect(warningSpy).toHaveBeenCalled();
      expect(el._echoListening).toBe(false);
    });

    it('stops shadowing recording from session dock', async () => {
      const el = await renderView();
      await switchToShadowingMode(el);

      const stopSpy = vi.fn().mockResolvedValue(undefined);
      const recorder = el.shadowRoot!.querySelector('audio-recorder#shadowing-recorder') as {
        stopRecording: () => Promise<void>;
      };
      vi.spyOn(recorder, 'stopRecording').mockImplementation(stopSpy);

      el.shadowRoot!.querySelector('echo-session-dock')!.dispatchEvent(
        new CustomEvent('echo-session-stop', { bubbles: true, composed: true }),
      );
      await settleView(el);

      expect(stopSpy).toHaveBeenCalled();
    });

    it('cancels echo listen from session dock', async () => {
      const el = await renderView();
      await switchToEchoMode(el);
      const pauseSpy = vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);

      await dispatchEchoRecordRequest(el);
      el.shadowRoot!.querySelector('echo-session-dock')!.dispatchEvent(
        new CustomEvent('echo-session-cancel', { bubbles: true, composed: true }),
      );
      await settleView(el);

      expect(pauseSpy).toHaveBeenCalled();
      expect(mockEchoClipPlayer.stop).toHaveBeenCalled();
      expect(el._echoListening).toBe(false);
    });

    it('shows speak cue after skipped countdown', async () => {
      const primarySpy = vi.spyOn(Message, 'primary');
      const el = await renderView();
      await switchToShadowingMode(el);

      const recorder = el.shadowRoot!.querySelector('audio-recorder#shadowing-recorder')!;
      recorder.dispatchEvent(
        new CustomEvent('recording-countdown-end', {
          detail: { skipped: true, cancelled: false },
          bubbles: true,
          composed: true,
        }),
      );
      await el.updateComplete;

      expect(el._sessionPhase).toBe('recording');
      expect(primarySpy).toHaveBeenCalled();
    });

    it('shows shadowing limit message when recordings are full', async () => {
      mockCountShadowingRecordings.mockResolvedValue(5);
      const el = await renderView();
      await switchToShadowingMode(el);

      expect(el.shadowRoot!.textContent).toContain('已达上限');
      const recorder = el.shadowRoot!.querySelector('audio-recorder#shadowing-recorder') as {
        disabled: boolean;
      };
      expect(recorder.disabled).toBe(true);
    });
  });

  describe('subtitle panel and storage', () => {
    it('shows storage info and low storage warning', async () => {
      mockEstimateStorage.mockResolvedValue({
        usage: 95,
        quota: 100,
        remaining: 5,
        remainingPercent: 5,
      });
      const el = await renderView();
      await switchToEchoMode(el);
      await settleView(el);

      expect(el.shadowRoot!.textContent).toContain('当前存储');
      expect(el.shadowRoot!.querySelector('ui-alert[type="warning"]')).not.toBeNull();
    });

    it('adds sentence to bank from subtitle panel', async () => {
      const successSpy = vi.spyOn(Message, 'success');
      const el = await renderView();
      await settleView(el);

      el.shadowRoot!.querySelector('subtitle-panel')!.dispatchEvent(
        new CustomEvent('sentence-bank-add', {
          detail: { segment: sampleSegments[0] },
          bubbles: true,
          composed: true,
        }),
      );
      await settleView(el);

      expect(mockAddToSentenceBank).toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalled();
      expect(mockLoadingClose).toHaveBeenCalled();
    });

    it('handles duplicate sentence bank add', async () => {
      mockAddToSentenceBank.mockResolvedValue({ status: 'duplicate' });
      const infoSpy = vi.spyOn(Message, 'info');
      const el = await renderView();
      await settleView(el);

      el.shadowRoot!.querySelector('subtitle-panel')!.dispatchEvent(
        new CustomEvent('sentence-bank-add', {
          detail: { segment: sampleSegments[0] },
          bubbles: true,
          composed: true,
        }),
      );
      await settleView(el);

      expect(infoSpy).toHaveBeenCalled();
    });

    it('removes sentence from bank via subtitle panel', async () => {
      const successSpy = vi.spyOn(Message, 'success');
      const el = await renderView();
      await settleView(el);

      el.shadowRoot!.querySelector('subtitle-panel')!.dispatchEvent(
        new CustomEvent('sentence-bank-remove', {
          detail: { segment: sampleSegments[0] },
          bubbles: true,
          composed: true,
        }),
      );
      await settleView(el);

      expect(mockRemoveFromSentenceBank).toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalled();
    });

    it('syncs subtitle fullscreen from panel event', async () => {
      const el = await renderView();
      await settleView(el);

      el.shadowRoot!.querySelector('subtitle-panel')!.dispatchEvent(
        new CustomEvent('update:fullscreen', {
          detail: { fullscreen: true },
          bubbles: true,
          composed: true,
        }),
      );
      await el.updateComplete;

      expect(el._subtitlePanelFullscreen).toBe(true);
      const panel = el.shadowRoot!.querySelector('subtitle-panel') as { fullscreen: boolean };
      expect(panel.fullscreen).toBe(true);
    });

    it('closes recordings modal from footer button', async () => {
      mockCountShadowingRecordings.mockResolvedValue(1);
      const el = await renderView();
      await switchToShadowingMode(el);
      await el.updateComplete;

      clickShadowingManageRecordings(el);
      await el.updateComplete;
      expect(el._recordingsModalOpen).toBe(true);

      const modal = el.shadowRoot!.querySelector('ui-modal')!;
      modal.querySelector('ui-button')?.dispatchEvent(new Event('click', { bubbles: true }));
      await el.updateComplete;
      expect(el._recordingsModalOpen).toBe(false);
    });

    it('reports sentence bank add failure', async () => {
      mockAddToSentenceBank.mockRejectedValue(new Error('db error'));
      const errorSpy = vi.spyOn(Message, 'error');
      const el = await renderView();
      await settleView(el);

      el.shadowRoot!.querySelector('subtitle-panel')!.dispatchEvent(
        new CustomEvent('sentence-bank-add', {
          detail: { segment: sampleSegments[0] },
          bubbles: true,
          composed: true,
        }),
      );
      await settleView(el);

      expect(mockReportError).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      expect(mockLoadingClose).toHaveBeenCalled();
    });

    it('reports sentence bank remove failure', async () => {
      mockRemoveFromSentenceBank.mockRejectedValue(new Error('db error'));
      const errorSpy = vi.spyOn(Message, 'error');
      const el = await renderView();
      await settleView(el);

      el.shadowRoot!.querySelector('subtitle-panel')!.dispatchEvent(
        new CustomEvent('sentence-bank-remove', {
          detail: { segment: sampleSegments[0] },
          bubbles: true,
          composed: true,
        }),
      );
      await settleView(el);

      expect(mockReportError).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('handles missing sentence on remove', async () => {
      mockRemoveFromSentenceBank.mockResolvedValue({ status: 'missing' });
      const infoSpy = vi.spyOn(Message, 'info');
      const el = await renderView();
      await settleView(el);

      el.shadowRoot!.querySelector('subtitle-panel')!.dispatchEvent(
        new CustomEvent('sentence-bank-remove', {
          detail: { segment: sampleSegments[0] },
          bubbles: true,
          composed: true,
        }),
      );
      await settleView(el);

      expect(infoSpy).toHaveBeenCalled();
    });

    it('ignores sentence bank add while busy', async () => {
      mockAddToSentenceBank.mockClear();
      const el = await renderView();
      await settleView(el);
      el._sentenceBankBusy = true;

      el.shadowRoot!.querySelector('subtitle-panel')!.dispatchEvent(
        new CustomEvent('sentence-bank-add', {
          detail: { segment: sampleSegments[0] },
          bubbles: true,
          composed: true,
        }),
      );
      await settleView(el);

      expect(mockAddToSentenceBank).not.toHaveBeenCalled();
    });

    it('clears waveform when last saved recording is deleted', async () => {
      vi.spyOn(crypto, 'randomUUID').mockReturnValue('rec-last');
      mockCountShadowingRecordings.mockResolvedValue(1);
      const el = await renderView();
      await switchToShadowingMode(el);

      const clearSpy = vi.fn();
      const recorder = el.shadowRoot!.querySelector('audio-recorder#shadowing-recorder') as {
        clearWaveform: () => void;
      };
      vi.spyOn(recorder, 'clearWaveform').mockImplementation(clearSpy);

      el.shadowRoot!.querySelector('audio-recorder#shadowing-recorder')!.dispatchEvent(
        new CustomEvent('recording-complete', {
          detail: {
            blob: new Blob(['rec'], { type: 'audio/webm' }),
            segments: [],
            reason: 'manual',
          },
          bubbles: true,
          composed: true,
        }),
      );
      await settleView(el);

      clickShadowingManageRecordings(el);
      await el.updateComplete;

      el.shadowRoot!.querySelector('record-list')!.dispatchEvent(
        new CustomEvent('recording-deleted', {
          detail: { id: 'rec-last' },
          bubbles: true,
          composed: true,
        }),
      );
      await settleView(el);
      expect(clearSpy).toHaveBeenCalled();
    });
  });

  describe('registered hotkeys', () => {
    beforeEach(() => {
      setHotkeyManagerForTests(new HotkeyManager());
      stubKeyboardShortcuts(true);
    });

    afterEach(() => {
      getHotkeyManager().reset();
      setHotkeyManagerForTests(null);
    });

    it('dispatches media hotkeys when session is idle', async () => {
      const el = await renderView();
      await settleView(el);

      const toggleSpy = vi.spyOn(el._controller, 'togglePlay').mockResolvedValue(undefined);
      const nextSpy = vi.spyOn(el._controller, 'nextSegment');
      const prevSpy = vi.spyOn(el._controller, 'previousSegment');
      const replaySpy = vi.spyOn(el._controller, 'replaySegment');
      const volumeSpy = vi.spyOn(el._controller, 'setVolume');
      const rateSpy = vi.spyOn(el._controller, 'setPlaybackRate');

      dispatchKey('Space');
      dispatchKey('ArrowRight');
      dispatchKey('ArrowLeft');
      dispatchKey('KeyR');
      dispatchKey('ArrowUp');
      dispatchKey('ArrowDown');
      dispatchKey('BracketRight');
      dispatchKey('BracketLeft');

      expect(toggleSpy).toHaveBeenCalled();
      expect(nextSpy).toHaveBeenCalled();
      expect(prevSpy).toHaveBeenCalled();
      expect(replaySpy).toHaveBeenCalled();
      expect(volumeSpy).toHaveBeenCalled();
      expect(rateSpy).toHaveBeenCalled();
    });

    it('blocks media hotkeys during echo listen but allows subtitle toggles', async () => {
      const el = await renderView();
      await switchToEchoMode(el);

      const toggleSpy = vi.spyOn(el._controller, 'togglePlay').mockResolvedValue(undefined);
      const subtitlesSpy = vi.spyOn(el._controller, 'setSubtitlesVisible');

      await dispatchEchoRecordRequest(el);
      dispatchKey('Space');
      dispatchKey('KeyC');

      expect(toggleSpy).not.toHaveBeenCalled();
      expect(subtitlesSpy).toHaveBeenCalled();
    });

    it('blocks rate hotkeys in discrimination mode', async () => {
      const el = await renderView();
      await switchToDiscriminationMode(el);

      const rateSpy = vi.spyOn(el._controller, 'setPlaybackRate');
      dispatchKey('BracketRight');
      expect(rateSpy).not.toHaveBeenCalled();
    });

    it('disables hotkeys while recordings modal is open', async () => {
      mockCountShadowingRecordings.mockResolvedValue(1);
      const el = await renderView();
      await switchToShadowingMode(el);
      await el.updateComplete;

      clickShadowingManageRecordings(el);
      await el.updateComplete;

      const toggleSpy = vi.spyOn(el._controller, 'togglePlay').mockResolvedValue(undefined);
      dispatchKey('Space');
      expect(toggleSpy).not.toHaveBeenCalled();
    });
  });

  describe('disconnectedCallback teardown', () => {
    beforeEach(() => {
      setHotkeyManagerForTests(new HotkeyManager());
      stubKeyboardShortcuts(true);
    });

    afterEach(() => {
      getHotkeyManager().reset();
      setHotkeyManagerForTests(null);
    });

    it('unregisters hotkeys and destroys resources on disconnect', async () => {
      const manager = getHotkeyManager();
      const unregisterSpy = vi.spyOn(manager, 'unregisterScope');
      const el = await renderView();
      await switchToEchoMode(el);
      await dispatchEchoRecordRequest(el);

      cleanup?.();
      cleanup = undefined;

      expect(unregisterSpy).toHaveBeenCalledWith('practice');
      expect(mockNoiseMixer.destroy).toHaveBeenCalled();
      expect(mockEchoClipPlayer.dispose).toHaveBeenCalled();
    });
  });

  describe('error and edge paths', () => {
    it('recovers when refreshNoise fails on connect', async () => {
      mockGetNoiseList.mockRejectedValue(new Error('noise db'));
      const el = await renderView();
      await settleView(el);
      expect(el.shadowRoot?.querySelector('.layout')).not.toBeNull();
    });

    it('recovers when refreshRecordings fails on track change', async () => {
      const el = await renderView();
      await settleView(el);
      mockCountShadowingRecordings.mockRejectedValue(new Error('count failed'));
      el._onTrackChange();
      await settleView(el);
      expect(el.shadowRoot?.textContent).not.toContain('当前存储');
    });

    it('cancels echo listen when clip play fails', async () => {
      const el = await renderView();
      await switchToEchoMode(el);
      mockEchoClipPlayer.play.mockRejectedValue(new Error('decode blocked'));

      await dispatchEchoRecordRequest(el);
      await settleView(el);

      expect(el._echoListening).toBe(false);
      expect(el._sessionPhase).toBe('idle');
    });

    it('clears echo session when recording start fails after listen', async () => {
      const el = await renderView();
      await switchToEchoMode(el);
      vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);
      const echoRecorder = el.shadowRoot!.querySelector('audio-recorder#echo-recorder') as {
        startRecording: () => Promise<void>;
        recording: boolean;
      };
      vi.spyOn(echoRecorder, 'startRecording').mockRejectedValue(new Error('mic denied'));

      await dispatchEchoRecordRequest(el);
      mockEchoClipPlayer.onEnded?.();
      await settleView(el);

      expect(el._echoListening).toBe(false);
      expect(el._sessionPhase).toBe('idle');
    });

    it('clears echo session when recording does not start after listen', async () => {
      const el = await renderView();
      await switchToEchoMode(el);
      vi.spyOn(el._controller, 'pause').mockReturnValue(undefined as never);
      const echoRecorder = el.shadowRoot!.querySelector('audio-recorder#echo-recorder') as {
        startRecording: () => Promise<void>;
        recording: boolean;
      };
      Object.defineProperty(echoRecorder, 'recording', {
        configurable: true,
        get: () => false,
      });
      vi.spyOn(echoRecorder, 'startRecording').mockResolvedValue(undefined);

      await dispatchEchoRecordRequest(el);
      mockEchoClipPlayer.onEnded?.();
      await settleView(el);

      expect(el._sessionPhase).toBe('idle');
    });

    it('ignores main SEGMENT_END during echo clip listen', async () => {
      const el = await renderView();
      await switchToEchoMode(el);
      const echoRecorder = el.shadowRoot!.querySelector('audio-recorder#echo-recorder') as {
        startRecording: () => Promise<void>;
      };
      const startRecordingSpy = vi
        .spyOn(echoRecorder, 'startRecording')
        .mockResolvedValue(undefined);

      await dispatchEchoRecordRequest(el);
      el._controller.dispatchEvent(
        new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
          detail: { segmentIndex: 0, segment: sampleSegments[0] },
        }),
      );
      await settleView(el);

      expect(startRecordingSpy).not.toHaveBeenCalled();
      expect(el._echoListening).toBe(true);
    });

    it('ignores echo record request while already recording', async () => {
      const el = await renderView();
      await switchToEchoMode(el);
      el._recording = true;

      await dispatchEchoRecordRequest(el);
      expect(el._echoListening).toBe(false);
    });

    it('stops discrimination ladder when main media finishes all rates', async () => {
      const el = await renderView();
      await switchToDiscriminationMode(el);

      mockRateLadder.onMainEnded.mockReturnValueOnce({ kind: 'finished', rate: 1 });
      const setRateSpy = vi.spyOn(el._controller, 'setPlaybackRate');
      const playSpy = vi.spyOn(el._controller, 'play').mockResolvedValue(undefined);

      el._controller.dispatchEvent(new CustomEvent(MediaEventType.ENDED));
      await settleView(el);

      expect(setRateSpy).toHaveBeenCalledWith(1);
      expect(mockNoiseMixer.setPlaying).toHaveBeenCalledWith(false);
      expect(playSpy).not.toHaveBeenCalled();
    });

    it('disables recorders when browser recording is unsupported', async () => {
      vi.unstubAllGlobals();
      vi.stubGlobal('MediaRecorder', undefined);
      vi.stubGlobal('navigator', { vibrate: vi.fn() });
      stubKeyboardShortcuts(false);

      const el = await renderView();
      await switchToShadowingMode(el);

      const shadowingRecorder = el.shadowRoot!.querySelector(
        'audio-recorder#shadowing-recorder',
      ) as { disabled: boolean };
      expect(shadowingRecorder.disabled).toBe(true);
    });
  });
});
