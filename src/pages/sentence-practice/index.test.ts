import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SentenceBankEntry } from '../../types/models.js';
import { flushUpdates, mount } from '../../components/ui/test-utils.js';
import {
  HotkeyManager,
  PLAYBACK_RATE_HOTKEY_STEP,
  VOLUME_HOTKEY_STEP,
  setHotkeyManagerForTests,
} from '../../lib/hotkeys/index.js';

class MockGainNode {
  gain = { value: 1 };
  disconnect = vi.fn();
  connect = vi.fn();
}

class MockMediaElementSource {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);

  createGain(): MockGainNode {
    return new MockGainNode();
  }

  createMediaElementSource(): MockMediaElementSource {
    return new MockMediaElementSource();
  }
}

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('webkitAudioContext', MockAudioContext);

const mockLoadSentenceForPractice = vi.fn();
const mockReportError = vi.fn().mockResolvedValue(undefined);
const mockLoadingClose = vi.fn();

vi.mock('../../lib/media-loader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/media-loader.js')>();
  return {
    ...actual,
    loadSentenceForPractice: (...args: unknown[]) => mockLoadSentenceForPractice(...args),
  };
});

vi.mock('../../lib/error-reporter.js', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

vi.mock('../../components/ui/loading.js', () => ({
  Loading: {
    service: vi.fn(() => ({ close: mockLoadingClose })),
  },
}));

import './index.js';
import type { SentencePracticePage } from './index.js';
import { Message } from '../../components/ui/message.js';

function makeEntry(overrides: Partial<SentenceBankEntry> = {}): SentenceBankEntry {
  return {
    id: 'entry-1',
    contentHash: 'hash-1',
    text: 'Practice this sentence',
    translation: '练习这句',
    sourceMediaId: 'media-1',
    sourceSegmentId: 'seg-1',
    sourceStartTime: 0,
    sourceEndTime: 4,
    sourceTitleSnapshot: 'Lesson One',
    sourceMediaType: 'audio',
    sourceAvailable: true,
    removed: false,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makeLoaded(entry = makeEntry()) {
  return {
    entry,
    blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    mimeType: 'audio/mpeg',
    duration: 4,
  };
}

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

function dispatchKey(code: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
}

describe('sentence-practice-page', () => {
  let cleanup: (() => void) | undefined;
  let hotkeys: HotkeyManager;

  beforeEach(() => {
    mockLoadSentenceForPractice.mockReset();
    mockReportError.mockClear();
    mockLoadingClose.mockClear();
    Message.closeAll();
    stubKeyboardShortcuts(false);
    hotkeys = new HotkeyManager();
    setHotkeyManagerForTests(hotkeys);
    localStorage.setItem(
      'fluent-any-lang:user-settings',
      JSON.stringify({ skipRecordingCountdown: true }),
    );
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    Message.closeAll();
    localStorage.clear();
    hotkeys.reset();
    setHotkeyManagerForTests(null);
    vi.unstubAllGlobals();
  });

  async function renderPage(query: Record<string, string> = { id: 'entry-1' }) {
    const result = mount(
      html`<sentence-practice-page
        .routeContext=${{
          route: 'sentence-practice',
          params: {},
          query,
          data: {},
        }}
      ></sentence-practice-page>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('sentence-practice-page') as SentencePracticePage;
    await el.updateComplete;
    await flushUpdates();
    return el;
  }

  it('shows error when sentence id is missing', async () => {
    const el = await renderPage({});
    expect(el.shadowRoot?.querySelector('ui-alert')?.textContent).toContain('缺少句子 ID');
    expect(mockLoadSentenceForPractice).not.toHaveBeenCalled();
  });

  it('loads sentence and renders practice UI', async () => {
    mockLoadSentenceForPractice.mockResolvedValue(makeLoaded());
    const el = await renderPage();

    expect(mockLoadSentenceForPractice).toHaveBeenCalledWith('entry-1');
    expect(mockLoadingClose).toHaveBeenCalled();
    expect(el.shadowRoot?.textContent).toContain('Practice this sentence');
    expect(el.shadowRoot?.textContent).toContain('练习这句');
    expect(el.shadowRoot?.querySelector('media-player')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('audio-recorder')).toBeNull();
  });

  it('shows error when sentence is missing or deleted', async () => {
    mockLoadSentenceForPractice.mockResolvedValue(null);
    const el = await renderPage();

    expect(el.shadowRoot?.querySelector('ui-alert')?.textContent).toContain(
      '该句子不存在或无法加载',
    );
    expect(el.shadowRoot?.querySelector('.card')).toBeNull();
  });

  it('reports load failures', async () => {
    mockLoadSentenceForPractice.mockRejectedValue(new Error('network'));
    const el = await renderPage();

    expect(mockReportError).toHaveBeenCalled();
    expect(el.shadowRoot?.querySelector('ui-alert')?.textContent).toContain('加载失败，请重试');
  });

  it('switches to speaking mode and navigates actions', async () => {
    mockLoadSentenceForPractice.mockResolvedValue(makeLoaded());
    const el = await renderPage();
    const navigateSpy = vi.spyOn(el, 'navigate').mockImplementation(() => undefined);

    const tabs = el.shadowRoot?.querySelectorAll('.tabs ui-button') ?? [];
    tabs[1]?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('audio-recorder')).not.toBeNull();

    el.shadowRoot
      ?.querySelector('.header .actions ui-button')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(navigateSpy).toHaveBeenCalledWith('/sentences');

    navigateSpy.mockClear();
    el.shadowRoot
      ?.querySelectorAll('.header .actions ui-button')[1]
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(navigateSpy).toHaveBeenCalledWith('/practice?mediaId=media-1&segmentId=seg-1');
  });

  it('warns when viewing source for deleted media', async () => {
    mockLoadSentenceForPractice.mockResolvedValue(
      makeLoaded(makeEntry({ sourceAvailable: false })),
    );
    const el = await renderPage();
    const warningSpy = vi.spyOn(Message, 'warning');

    el.shadowRoot
      ?.querySelectorAll('.header .actions ui-button')[1]
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(warningSpy).toHaveBeenCalled();
  });

  it('opens hotkeys help when keyboard shortcuts are supported', async () => {
    stubKeyboardShortcuts(true);
    mockLoadSentenceForPractice.mockResolvedValue(makeLoaded());
    const el = await renderPage();

    expect(el.shadowRoot?.querySelector('ui-icon-button[name="help"]')).not.toBeNull();
    el.shadowRoot
      ?.querySelector('ui-icon-button[name="help"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('ui-modal')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('ui-modal')?.textContent).toContain('快捷键');

    el.shadowRoot?.querySelector('ui-modal')?.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('ui-modal')).toBeNull();
  });

  it('switches back to listening mode from speaking', async () => {
    mockLoadSentenceForPractice.mockResolvedValue(makeLoaded());
    const el = await renderPage();
    const tabs = el.shadowRoot?.querySelectorAll('.tabs ui-button') ?? [];

    tabs[1]?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('audio-recorder')).not.toBeNull();

    tabs[0]?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('audio-recorder')).toBeNull();
  });

  it('pauses media before recording starts in speaking mode', async () => {
    mockLoadSentenceForPractice.mockResolvedValue(makeLoaded());
    const el = await renderPage();
    type SentencePracticeInternals = SentencePracticePage & {
      _controller: {
        pause: () => Promise<void>;
        getSnapshot: () => { isPlaying: boolean };
      };
    };
    const internals = el as SentencePracticeInternals;
    vi.spyOn(internals._controller, 'getSnapshot').mockReturnValue({ isPlaying: true });
    const pauseSpy = vi.spyOn(internals._controller, 'pause').mockResolvedValue(undefined);

    el.shadowRoot
      ?.querySelectorAll('.tabs ui-button')[1]
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;

    const recorder = el.shadowRoot?.querySelector('audio-recorder') as {
      beforeRecordingStart?: () => void;
    };
    recorder.beforeRecordingStart?.();
    expect(pauseSpy).toHaveBeenCalled();
  });

  it('tracks recording state from audio-recorder events', async () => {
    mockLoadSentenceForPractice.mockResolvedValue(makeLoaded());
    const el = await renderPage();
    type SentencePracticeInternals = SentencePracticePage & { _recording: boolean };
    const internals = el as SentencePracticeInternals;

    el.shadowRoot
      ?.querySelectorAll('.tabs ui-button')[1]
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;

    el.shadowRoot?.querySelector('audio-recorder')?.dispatchEvent(
      new CustomEvent('recording-state-change', {
        detail: { recording: true },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    expect(internals._recording).toBe(true);

    el.shadowRoot?.querySelector('audio-recorder')?.dispatchEvent(
      new CustomEvent('recording-state-change', {
        detail: { recording: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    expect(internals._recording).toBe(false);
  });

  it('closes hotkeys help from footer button', async () => {
    stubKeyboardShortcuts(true);
    mockLoadSentenceForPractice.mockResolvedValue(makeLoaded());
    const el = await renderPage();

    el.shadowRoot
      ?.querySelector('ui-icon-button[name="help"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('ui-modal')).not.toBeNull();

    el.shadowRoot
      ?.querySelector('ui-modal ui-button')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('ui-modal')).toBeNull();
  });

  it('handles media hotkeys when shortcuts are supported and not recording', async () => {
    stubKeyboardShortcuts(true);
    mockLoadSentenceForPractice.mockResolvedValue(makeLoaded());
    const el = await renderPage();
    type SentencePracticeInternals = SentencePracticePage & {
      _controller: {
        togglePlay: () => Promise<void>;
        replaySegment: () => void;
        setVolume: (v: number) => void;
        setPlaybackRate: (r: number) => void;
        getSnapshot: () => { volume: number; playbackRate: number };
      };
    };
    const internals = el as SentencePracticeInternals;
    const toggleSpy = vi.spyOn(internals._controller, 'togglePlay').mockResolvedValue(undefined);
    const replaySpy = vi
      .spyOn(internals._controller, 'replaySegment')
      .mockImplementation(() => undefined);
    const setVolumeSpy = vi
      .spyOn(internals._controller, 'setVolume')
      .mockImplementation(() => undefined);
    const setRateSpy = vi
      .spyOn(internals._controller, 'setPlaybackRate')
      .mockImplementation(() => undefined);
    vi.spyOn(internals._controller, 'getSnapshot').mockReturnValue({
      volume: 0.5,
      playbackRate: 1,
      isPlaying: false,
    });

    dispatchKey('Space');
    expect(toggleSpy).toHaveBeenCalledOnce();

    dispatchKey('KeyR');
    expect(replaySpy).toHaveBeenCalledOnce();

    dispatchKey('ArrowUp');
    expect(setVolumeSpy).toHaveBeenCalledWith(0.5 + VOLUME_HOTKEY_STEP);

    dispatchKey('ArrowDown');
    expect(setVolumeSpy).toHaveBeenCalledWith(0.5 - VOLUME_HOTKEY_STEP);

    dispatchKey('BracketRight');
    expect(setRateSpy).toHaveBeenCalledWith(1 + PLAYBACK_RATE_HOTKEY_STEP);

    dispatchKey('BracketLeft');
    expect(setRateSpy).toHaveBeenCalledWith(1 - PLAYBACK_RATE_HOTKEY_STEP);
  });

  it('disables media hotkeys while recording or hotkeys help is open', async () => {
    stubKeyboardShortcuts(true);
    mockLoadSentenceForPractice.mockResolvedValue(makeLoaded());
    const el = await renderPage();
    type SentencePracticeInternals = SentencePracticePage & {
      _controller: { togglePlay: () => Promise<void> };
    };
    const toggleSpy = vi
      .spyOn((el as SentencePracticeInternals)._controller, 'togglePlay')
      .mockResolvedValue(undefined);

    el.shadowRoot
      ?.querySelectorAll('.tabs ui-button')[1]
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;
    el.shadowRoot?.querySelector('audio-recorder')?.dispatchEvent(
      new CustomEvent('recording-state-change', {
        detail: { recording: true },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    dispatchKey('Space');
    expect(toggleSpy).not.toHaveBeenCalled();

    el.shadowRoot?.querySelector('audio-recorder')?.dispatchEvent(
      new CustomEvent('recording-state-change', {
        detail: { recording: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    el.shadowRoot
      ?.querySelector('ui-icon-button[name="help"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;

    dispatchKey('Space');
    expect(toggleSpy).not.toHaveBeenCalled();

    dispatchKey('KeyH');
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('ui-modal')).toBeNull();
  });

  it('unregisters hotkey scope and destroys controller on disconnect', async () => {
    stubKeyboardShortcuts(true);
    mockLoadSentenceForPractice.mockResolvedValue(makeLoaded());
    const el = await renderPage();
    type SentencePracticeInternals = SentencePracticePage & {
      _controller: { destroy: () => void; togglePlay: () => Promise<void> };
    };
    const internals = el as SentencePracticeInternals;
    const destroySpy = vi
      .spyOn(internals._controller, 'destroy')
      .mockImplementation(() => undefined);
    const toggleSpy = vi.spyOn(internals._controller, 'togglePlay').mockResolvedValue(undefined);

    cleanup?.();
    cleanup = undefined;

    dispatchKey('Space');
    expect(toggleSpy).not.toHaveBeenCalled();
    expect(destroySpy).toHaveBeenCalledOnce();
  });
});
