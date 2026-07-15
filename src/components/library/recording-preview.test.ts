import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PracticeSegment, SubtitleSegment } from '../../types/models.js';
import {
  HotkeyManager,
  KEYBOARD_SHORTCUTS_MQ,
  setHotkeyManagerForTests,
} from '../../lib/hotkeys/index.js';
import { mount, flushUpdates, getPortalShadow } from '../ui/test-utils.js';
import { Message } from '../ui/message.js';
import type { UiDropdown } from '../ui/dropdown.js';
import './recording-preview.js';
import { resolvePreviewSubtitle } from './recording-preview.js';

const samplePracticeSegments: PracticeSegment[] = [
  {
    id: 's0',
    sourceStartTime: 0,
    sourceEndTime: 5,
    recordingStartTime: 0,
    recordingEndTime: 4.5,
  },
  {
    id: 's1',
    sourceStartTime: 5,
    sourceEndTime: 10,
    recordingStartTime: 4.5,
    recordingEndTime: 9,
  },
];

const sampleSegments: SubtitleSegment[] = [
  { id: 's0', startTime: 0, endTime: 5, text: 'one' },
  { id: 's1', startTime: 5, endTime: 10, text: 'two' },
  { id: 's2', startTime: 12, endTime: 15, text: 'three' },
];

type RecordingPreviewInternals = HTMLElement & {
  updateComplete: Promise<boolean>;
  segments: PracticeSegment[];
  subtitleSegments: SubtitleSegment[];
  practiceMode: string;
  sourceBlob: Blob | null;
  recordingBlob: Blob | null;
  _controller: {
    activeId: string | null;
    isPlaying: boolean;
    setActiveId: (id: string) => void;
    setViewRange: (range: { start: number; end: number } | null) => void;
    addFromBlob: (blob: Blob, name?: string) => Promise<string>;
    getSnapshot: () => { viewRange: { start: number; end: number } | null };
    pause: () => void;
  };
  _playback: {
    playSource: () => Promise<void>;
    playRecording: () => Promise<void>;
    playSync: () => Promise<void>;
    playSyncFromSegment: (index: number) => Promise<void>;
    goToSegment: (index: number) => Promise<void>;
    togglePause: () => Promise<void>;
    stop: () => void;
    destroy: () => void;
    setSegments: (segments: PracticeSegment[]) => void;
  } | null;
  _sourceTrackId: string;
  _recordingTrackId: string;
  _playMode: string;
  _playbackPaused: boolean;
  _syncSegmentIndex: number;
  _sourceAudio: HTMLAudioElement | null;
  _recordingAudio: HTMLAudioElement | null;
  _sourceVolume: number;
  _recordingVolume: number;
  _activeSubtitle: SubtitleSegment | null;
  _refreshActiveSubtitle: () => void;
  _handleVolumeChange: (track: 'source' | 'recording', value: number) => void;
  _applyVolumes: () => void;
};

describe('resolvePreviewSubtitle', () => {
  it('returns null while idle or when there are no subtitles', () => {
    expect(
      resolvePreviewSubtitle({
        mode: 'idle',
        subtitleSegments: sampleSegments,
        practiceSegments: samplePracticeSegments,
        syncSegmentIndex: 0,
        sourceTime: 1,
        recordingTime: 1,
      }),
    ).toBeNull();

    expect(
      resolvePreviewSubtitle({
        mode: 'source',
        subtitleSegments: [],
        practiceSegments: samplePracticeSegments,
        syncSegmentIndex: 0,
        sourceTime: 1,
        recordingTime: 1,
      }),
    ).toBeNull();
  });

  it('resolves source mode from the source timeline', () => {
    expect(
      resolvePreviewSubtitle({
        mode: 'source',
        subtitleSegments: sampleSegments,
        practiceSegments: samplePracticeSegments,
        syncSegmentIndex: 0,
        sourceTime: 6,
        recordingTime: 0,
      })?.text,
    ).toBe('two');
  });

  it('maps recording timeline through practice segments before subtitle lookup', () => {
    expect(
      resolvePreviewSubtitle({
        mode: 'recording',
        subtitleSegments: sampleSegments,
        practiceSegments: samplePracticeSegments,
        syncSegmentIndex: 0,
        sourceTime: 0,
        recordingTime: 5,
      })?.id,
    ).toBe('s1');
  });

  it('uses syncSegmentIndex for sync mode', () => {
    expect(
      resolvePreviewSubtitle({
        mode: 'sync',
        subtitleSegments: sampleSegments,
        practiceSegments: samplePracticeSegments,
        syncSegmentIndex: 1,
        sourceTime: 0,
        recordingTime: 0,
      })?.text,
    ).toBe('two');
  });
});

describe('recording-preview', () => {
  let cleanup: (() => void) | undefined;
  let hotkeys: HotkeyManager;

  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === KEYBOARD_SHORTCUTS_MQ,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    hotkeys = new HotkeyManager();
    setHotkeyManagerForTests(hotkeys);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    hotkeys.reset();
    setHotkeyManagerForTests(null);
    vi.restoreAllMocks();
  });

  async function renderPreview() {
    const result = mount(html`<recording-preview></recording-preview>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector(
      'recording-preview',
    ) as unknown as RecordingPreviewInternals;
    await el.updateComplete;
    return el;
  }

  function dispatchSeek(el: RecordingPreviewInternals, time: number, trackId = 'source-1') {
    const waveform = el.shadowRoot!.querySelector('waveform-player')!;
    waveform.dispatchEvent(
      new CustomEvent('seek-request', {
        detail: { trackId, time },
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
  }

  it('renders preview shell without blobs', async () => {
    const el = await renderPreview();
    expect(el.shadowRoot?.querySelector('.preview')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('waveform-player')).not.toBeNull();
  });

  it('zooms to echo segment source range after loading tracks', async () => {
    const el = await renderPreview();
    const setViewRangeSpy = vi.spyOn(el._controller, 'setViewRange');
    vi.spyOn(el._controller, 'addFromBlob').mockResolvedValue('track-id');

    el.segments = [samplePracticeSegments[0]];
    el.practiceMode = 'echo';
    el.sourceBlob = new Blob(['source'], { type: 'audio/webm' });
    el.recordingBlob = new Blob(['recording'], { type: 'audio/webm' });
    await el.updateComplete;
    await flushUpdates();

    expect(setViewRangeSpy).toHaveBeenCalledWith({ start: 0, end: 5 });
  });

  it('sets view range to full practice span after loading shadowing tracks', async () => {
    const el = await renderPreview();
    const setViewRangeSpy = vi.spyOn(el._controller, 'setViewRange');
    vi.spyOn(el._controller, 'addFromBlob').mockResolvedValue('track-id');

    el.segments = samplePracticeSegments;
    el.practiceMode = 'shadowing';
    el.sourceBlob = new Blob(['source'], { type: 'audio/webm' });
    el.recordingBlob = new Blob(['recording'], { type: 'audio/webm' });
    await el.updateComplete;
    await flushUpdates();

    expect(setViewRangeSpy).toHaveBeenCalledWith({ start: 0, end: 10 });
  });

  it('clamps view range to practice bounds when user zooms outside segments', async () => {
    const el = await renderPreview();
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    el._controller.setViewRange({ start: -2, end: 20 });
    await flushUpdates();

    expect(el._controller.getSnapshot().viewRange).toEqual({ start: 0, end: 10 });
  });

  it('replaces null view range with full practice bounds when segments exist', async () => {
    const el = await renderPreview();
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    el._controller.setViewRange(null);
    await flushUpdates();

    expect(el._controller.getSnapshot().viewRange).toEqual({ start: 0, end: 10 });
  });

  it('uses recording span while playing recording', async () => {
    const el = await renderPreview();
    el.segments = samplePracticeSegments;
    el._playMode = 'recording';
    await el.updateComplete;

    el._controller.setViewRange({ start: -1, end: 20 });
    await flushUpdates();

    expect(el._controller.getSnapshot().viewRange).toEqual({ start: 0, end: 9 });
  });

  function createPlaybackMock(playSyncFromSegment = vi.fn().mockResolvedValue(undefined)) {
    return {
      playSource: vi.fn().mockResolvedValue(undefined),
      playRecording: vi.fn().mockResolvedValue(undefined),
      playSync: vi.fn().mockResolvedValue(undefined),
      playSyncFromSegment,
      goToSegment: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
      togglePause: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      setSegments: vi.fn(),
    };
  }

  function dispatchKey(code: string): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
  }

  it('omits keyboard shortcut hints on touch-primary devices', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const el = await renderPreview();
    vi.spyOn(el._controller, 'addFromBlob').mockResolvedValue('track-id');
    el.sourceBlob = new Blob(['source'], { type: 'audio/webm' });
    el.recordingBlob = new Blob(['recording'], { type: 'audio/webm' });
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    const buttons = [...el.shadowRoot!.querySelectorAll('ui-button')];
    expect(buttons[0].textContent?.trim()).toBe('播放原音');
    expect(buttons[1].textContent?.trim()).toBe('播放录音');
    expect(buttons[2].textContent?.trim()).toBe('同步播放');
  });

  it('does not register hotkeys on touch-primary devices', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const el = await renderPreview();
    const playback = createPlaybackMock();
    el._playback = playback;
    el._playMode = 'source';
    await el.updateComplete;

    dispatchKey('Space');

    expect(playback.togglePause).not.toHaveBeenCalled();
  });

  it('pauses playback on Space while keeping play mode active', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();
    el._playback = playback;
    el._playMode = 'source';
    await el.updateComplete;

    document.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
    );

    expect(playback.togglePause).toHaveBeenCalledTimes(1);
    expect(playback.stop).not.toHaveBeenCalled();
    expect(el._playMode).toBe('source');
  });

  it('requests audio focus when starting source playback', async () => {
    const el = (await renderPreview()) as RecordingPreviewInternals & {
      _handlePlaySource: () => Promise<void>;
    };
    vi.spyOn(el._controller, 'addFromBlob').mockResolvedValue('source-track');
    const focusSpy = vi.fn();
    el.addEventListener('audio-focus-request', focusSpy);

    el.sourceBlob = new Blob(['source'], { type: 'audio/webm' });
    await el.updateComplete;
    await flushUpdates();

    const playback = createPlaybackMock();
    el._playback = playback;
    el._sourceTrackId = 'source-track';
    el._playMode = 'idle';
    await el.updateComplete;

    await el._handlePlaySource();

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(playback.playSource).toHaveBeenCalledTimes(1);
  });

  it('requests audio focus when resuming from Space pause', async () => {
    const el = await renderPreview();
    const focusSpy = vi.fn();
    el.addEventListener('audio-focus-request', focusSpy);
    const playback = createPlaybackMock();
    el._playback = playback;
    el._playMode = 'source';
    el._playbackPaused = true;
    await el.updateComplete;

    dispatchKey('Space');

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(playback.togglePause).toHaveBeenCalledTimes(1);
  });

  it('ignores Space and arrow hotkeys while idle', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();
    const pauseSpy = vi.spyOn(el._controller, 'pause');
    el._playback = playback;
    el._playMode = 'idle';
    el._controller.isPlaying = true;
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    dispatchKey('Space');
    dispatchKey('ArrowLeft');
    dispatchKey('ArrowRight');
    dispatchKey('ArrowUp');
    dispatchKey('ArrowDown');

    expect(playback.togglePause).not.toHaveBeenCalled();
    expect(playback.goToSegment).not.toHaveBeenCalled();
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(el._sourceVolume).toBe(1);
  });

  it('navigates segments with arrow keys and no-ops at boundaries', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();
    el._playback = playback;
    el._playMode = 'sync';
    el.segments = samplePracticeSegments;
    el._syncSegmentIndex = 1;
    await el.updateComplete;

    dispatchKey('ArrowRight');
    expect(playback.goToSegment).not.toHaveBeenCalled();

    dispatchKey('ArrowLeft');
    expect(playback.goToSegment).toHaveBeenCalledWith(0);

    vi.mocked(playback.goToSegment).mockClear();
    el._syncSegmentIndex = 0;
    await el.updateComplete;

    dispatchKey('ArrowLeft');
    expect(playback.goToSegment).not.toHaveBeenCalled();
  });

  it('nudges source volume with arrow keys in source mode', async () => {
    const el = await renderPreview();
    const sourceAudio = new Audio();
    el._sourceAudio = sourceAudio;
    el._recordingAudio = new Audio();
    el._playMode = 'source';
    await el.updateComplete;

    dispatchKey('ArrowDown');
    expect(el._sourceVolume).toBe(0.95);
    expect(sourceAudio.volume).toBe(0.95);

    dispatchKey('ArrowUp');
    expect(el._sourceVolume).toBe(1);
    expect(sourceAudio.volume).toBe(1);
  });

  it('nudges active track volume in sync mode', async () => {
    const el = await renderPreview();
    const sourceAudio = new Audio();
    const recordingAudio = new Audio();
    el._sourceAudio = sourceAudio;
    el._recordingAudio = recordingAudio;
    el._sourceTrackId = 'source-1';
    el._recordingTrackId = 'rec-1';
    el._playMode = 'sync';
    el._controller.activeId = 'rec-1';
    await el.updateComplete;

    dispatchKey('ArrowDown');
    expect(el._recordingVolume).toBe(0.95);
    expect(recordingAudio.volume).toBe(0.95);
    expect(el._sourceVolume).toBe(1);
  });

  it('shows disabled reason titles when source is missing', async () => {
    const el = await renderPreview();
    vi.spyOn(el._controller, 'addFromBlob').mockResolvedValue('rec-track');

    el.recordingBlob = new Blob(['recording'], { type: 'audio/webm' });
    el.segments = samplePracticeSegments;
    await el.updateComplete;
    await flushUpdates();

    const buttons = [...el.shadowRoot!.querySelectorAll('ui-button')];
    expect(
      buttons[0].hasAttribute('disabled') || (buttons[0] as unknown as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((buttons[0] as HTMLElement).title).toContain('无原音');
    expect((buttons[2] as HTMLElement).title).toContain('无原音');
  });

  it('resolves sync click on source track via subtitle timeline', async () => {
    const el = await renderPreview();
    const playSyncFromSegment = vi.fn().mockResolvedValue(undefined);
    const setViewRangeSpy = vi.spyOn(el._controller, 'setViewRange');

    el._playback = createPlaybackMock(playSyncFromSegment);
    el._sourceTrackId = 'source-1';
    el._recordingTrackId = 'rec-1';
    el._playMode = 'sync';
    el.subtitleSegments = sampleSegments;
    el.segments = [samplePracticeSegments[0]];
    await el.updateComplete;

    dispatchSeek(el, 2);

    expect(playSyncFromSegment).toHaveBeenCalledWith(0);
    expect(setViewRangeSpy).toHaveBeenCalledWith({ start: 0, end: 5 });
  });

  it('shows info when clicked subtitle has no practice segment', async () => {
    const el = await renderPreview();
    const infoSpy = vi.spyOn(Message, 'info');
    const playSyncFromSegment = vi.fn().mockResolvedValue(undefined);

    el._playback = createPlaybackMock(playSyncFromSegment);
    el._sourceTrackId = 'source-1';
    el._recordingTrackId = 'rec-1';
    el._playMode = 'sync';
    el.subtitleSegments = sampleSegments;
    el.segments = [samplePracticeSegments[0]];
    await el.updateComplete;

    dispatchSeek(el, 6);

    expect(infoSpy).toHaveBeenCalled();
    expect(playSyncFromSegment).not.toHaveBeenCalled();
  });

  it('keeps sync seek on the zoomed segment instead of jumping via full-span time', async () => {
    const el = await renderPreview();
    const playSyncFromSegment = vi.fn().mockResolvedValue(undefined);

    el._playback = createPlaybackMock(playSyncFromSegment);
    el._sourceTrackId = 'source-1';
    el._recordingTrackId = 'rec-1';
    el._playMode = 'sync';
    el.subtitleSegments = sampleSegments;
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    dispatchSeek(el, 4.5);

    expect(playSyncFromSegment).toHaveBeenCalledWith(0);
  });

  it('shows one volume icon in source mode and writes volume to the source audio', async () => {
    const el = await renderPreview();
    const sourceAudio = new Audio();
    el._sourceAudio = sourceAudio;
    el._recordingAudio = new Audio();
    el._playMode = 'source';
    el.subtitleSegments = sampleSegments;
    el.segments = samplePracticeSegments;
    el._syncSegmentIndex = 0;
    el._refreshActiveSubtitle();
    await el.updateComplete;

    const volumeButtons = el.shadowRoot!.querySelectorAll('[data-volume-track]');
    expect(volumeButtons).toHaveLength(1);
    expect(volumeButtons[0].getAttribute('data-volume-track')).toBe('source');
    expect(el.shadowRoot!.querySelector('.subtitle-text')?.textContent).toBe('one');

    el._handleVolumeChange('source', 0.4);
    await el.updateComplete;
    expect(sourceAudio.volume).toBe(0.4);
    expect(el._sourceVolume).toBe(0.4);
  });

  it('shows one volume icon in recording mode and maps subtitle via practice segments', async () => {
    const el = await renderPreview();
    const recordingAudio = new Audio();
    Object.defineProperty(recordingAudio, 'currentTime', {
      configurable: true,
      writable: true,
      value: 5,
    });
    el._sourceAudio = new Audio();
    el._recordingAudio = recordingAudio;
    el._playMode = 'recording';
    el.subtitleSegments = sampleSegments;
    el.segments = samplePracticeSegments;
    el._refreshActiveSubtitle();
    await el.updateComplete;

    const volumeButtons = el.shadowRoot!.querySelectorAll('[data-volume-track]');
    expect(volumeButtons).toHaveLength(1);
    expect(volumeButtons[0].getAttribute('data-volume-track')).toBe('recording');
    expect(el.shadowRoot!.querySelector('.subtitle-text')?.textContent).toBe('two');

    el._handleVolumeChange('recording', 0.25);
    await el.updateComplete;
    expect(recordingAudio.volume).toBe(0.25);
  });

  it('shows two volume icons in sync mode', async () => {
    const el = await renderPreview();
    el._playMode = 'sync';
    el.subtitleSegments = sampleSegments;
    el.segments = samplePracticeSegments;
    el._syncSegmentIndex = 1;
    el._refreshActiveSubtitle();
    await el.updateComplete;

    const volumeButtons = [...el.shadowRoot!.querySelectorAll('[data-volume-track]')];
    expect(volumeButtons.map((btn) => btn.getAttribute('data-volume-track'))).toEqual([
      'source',
      'recording',
    ]);
    expect(el.shadowRoot!.querySelector('.subtitle-text')?.textContent).toBe('two');
  });

  it('hides subtitle and volume icons while idle', async () => {
    const el = await renderPreview();
    el._playMode = 'idle';
    el.subtitleSegments = sampleSegments;
    el.segments = samplePracticeSegments;
    el._activeSubtitle = sampleSegments[0];
    el._refreshActiveSubtitle();
    await el.updateComplete;

    expect(el.shadowRoot!.querySelector('.subtitle-text')).toBeNull();
    expect(el.shadowRoot!.querySelectorAll('[data-volume-track]')).toHaveLength(0);
  });

  it('updates volume slider overlay for the active track', async () => {
    const el = await renderPreview();
    el._playMode = 'source';
    el._sourceAudio = new Audio();
    await el.updateComplete;

    const dropdown = el.shadowRoot!.querySelector('ui-dropdown') as UiDropdown;
    dropdown.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await dropdown.updateComplete;
    await flushUpdates();

    const portal = getPortalShadow('[data-ui-dropdown-portal]');
    const slider = portal?.querySelector('ui-slider') as HTMLElement & { value: number };
    expect(slider).toBeTruthy();
    slider.dispatchEvent(
      new CustomEvent('change', { detail: { value: 0.55 }, bubbles: true, composed: true }),
    );
    await el.updateComplete;
    await flushUpdates();

    expect(el._sourceVolume).toBe(0.55);
    expect(el._sourceAudio?.volume).toBe(0.55);
  });

  it('stops volume overlay open/close events from bubbling past the preview', async () => {
    const el = await renderPreview();
    el._playMode = 'source';
    await el.updateComplete;

    const closeSpy = vi.fn();
    const updateOpenSpy = vi.fn();
    el.addEventListener('close', closeSpy);
    el.addEventListener('update:open', updateOpenSpy);

    const dropdown = el.shadowRoot!.querySelector('ui-dropdown') as UiDropdown;
    dropdown.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await dropdown.updateComplete;
    await flushUpdates();

    dropdown.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await dropdown.updateComplete;
    await flushUpdates();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(updateOpenSpy).not.toHaveBeenCalled();
  });
});
