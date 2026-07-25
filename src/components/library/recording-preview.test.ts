import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  decodeAudioData = vi.fn().mockResolvedValue({
    duration: 10,
    length: 480000,
    sampleRate: 48000,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(480000),
  });

  close = vi.fn();
}

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('webkitAudioContext', MockAudioContext);

import { attachMediaElementGain, getMediaElementGain } from '../../lib/media-element-gain.js';
import type { PracticeSegment, SubtitleSegment } from '../../types/models.js';
import {
  HotkeyManager,
  KEYBOARD_SHORTCUTS_MQ,
  setHotkeyManagerForTests,
} from '../../lib/hotkeys/index.js';
import { WaveformEventType } from '../../controllers/waveform-controller.js';
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
    playSourceAt: (time: number) => Promise<void>;
    playRecording: () => Promise<void>;
    playRecordingAt: (time: number) => Promise<void>;
    playSync: () => Promise<void>;
    playSyncFromSegment: (index: number) => Promise<void>;
    playSyncAt: (time: number, axis: 'source' | 'recording') => Promise<boolean>;
    goToSegment: (index: number) => Promise<void>;
    replaySegment: (index?: number) => Promise<void>;
    pause: () => void;
    resume: () => Promise<void>;
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
  _handlePlaySource: () => Promise<void>;
  _handlePlayRecording: () => Promise<void>;
  _handlePlaySync: () => Promise<void>;
  _resolveTrackViewRange: (
    track: { id: string },
    viewRange: { start: number; end: number } | null,
    activeTrack: { id: string } | null,
  ) => { start: number; end: number } | null;
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
    const event = new CustomEvent('seek-request', {
      detail: { trackId, time },
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    waveform.dispatchEvent(event);
    return event;
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
      playSourceAt: vi.fn().mockResolvedValue(undefined),
      playRecording: vi.fn().mockResolvedValue(undefined),
      playRecordingAt: vi.fn().mockResolvedValue(undefined),
      playSync: vi.fn().mockResolvedValue(undefined),
      playSyncFromSegment,
      playSyncAt: vi.fn().mockResolvedValue(true),
      goToSegment: vi.fn().mockResolvedValue(undefined),
      replaySegment: vi.fn().mockResolvedValue(undefined),
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

  it('exposes segment nav buttons between subtitle and waveform', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();
    el._playback = playback;
    el._playMode = 'sync';
    el.segments = samplePracticeSegments;
    el._syncSegmentIndex = 0;
    await el.updateComplete;

    const nav = el.shadowRoot!.querySelector('.segment-nav');
    expect(nav).not.toBeNull();

    const buttons = [...nav!.querySelectorAll('ui-icon-button')] as Array<
      HTMLElement & { disabled: boolean; name: string }
    >;
    expect(buttons).toHaveLength(4);
    expect(buttons[0].name).toBe('backward');
    expect(buttons[1].name).toBe('pause');
    expect(buttons[2].name).toBe('replay');
    expect(buttons[3].name).toBe('forward');

    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(false);
    expect(buttons[2].disabled).toBe(false);
    expect(buttons[3].disabled).toBe(false);

    buttons[3].click();
    expect(playback.goToSegment).toHaveBeenCalledWith(1);

    buttons[2].click();
    expect(playback.replaySegment).toHaveBeenCalledWith(0);

    buttons[1].click();
    expect(playback.togglePause).toHaveBeenCalledTimes(1);

    el._playbackPaused = true;
    await el.updateComplete;
    expect(
      (
        el.shadowRoot!.querySelectorAll('.segment-nav ui-icon-button')[1] as HTMLElement & {
          name: string;
        }
      ).name,
    ).toBe('play');

    el._syncSegmentIndex = 1;
    await el.updateComplete;
    const updated = [...el.shadowRoot!.querySelectorAll('.segment-nav ui-icon-button')] as Array<
      HTMLElement & { disabled: boolean }
    >;
    expect(updated[0].disabled).toBe(false);
    expect(updated[3].disabled).toBe(true);

    updated[0].click();
    expect(playback.goToSegment).toHaveBeenCalledWith(0);
  });

  it('shows play/pause only when there are no practice segments', async () => {
    const el = await renderPreview();
    el.segments = [];
    await el.updateComplete;

    const nav = el.shadowRoot!.querySelector('.segment-nav');
    expect(nav).not.toBeNull();
    const buttons = [...nav!.querySelectorAll('ui-icon-button')] as Array<
      HTMLElement & { name: string; disabled: boolean }
    >;
    expect(buttons).toHaveLength(1);
    expect(buttons[0].name).toBe('play');
    expect(buttons[0].disabled).toBe(true);
  });

  it('keeps transport disabled until a play mode is selected', async () => {
    const el = await renderPreview();
    el.segments = samplePracticeSegments;
    el._playMode = 'idle';
    await el.updateComplete;

    const buttons = [...el.shadowRoot!.querySelectorAll('.segment-nav ui-icon-button')] as Array<
      HTMLElement & { disabled: boolean; title: string }
    >;
    expect(buttons).toHaveLength(4);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    expect(buttons[0].title).toContain('请先选择播放模式');
    expect(buttons[1].title).toContain('请先选择播放模式');
    expect(buttons[2].title).toContain('请先选择播放模式');
    expect(buttons[3].title).toContain('请先选择播放模式');
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
    const tooltips = [...el.shadowRoot!.querySelectorAll('ui-tooltip')];
    expect((tooltips[0] as HTMLElement & { title: string }).title).toContain('无原音');
    expect((tooltips[2] as HTMLElement & { title: string }).title).toContain('无原音');
  });

  it('ignores waveform click while idle without changing playMode', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();

    el._playback = playback;
    el._sourceTrackId = 'source-1';
    el._recordingTrackId = 'rec-1';
    el._playMode = 'idle';
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    const event = dispatchSeek(el, 2.5);

    expect(event.defaultPrevented).toBe(true);
    expect(el._playMode).toBe('idle');
    expect(playback.playSourceAt).not.toHaveBeenCalled();
    expect(playback.playRecordingAt).not.toHaveBeenCalled();
    expect(playback.playSyncAt).not.toHaveBeenCalled();
  });

  it('seeks and plays source on waveform click while already playing', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();
    const controllerPauseSpy = vi.spyOn(el._controller, 'pause');

    el._playback = playback;
    el._sourceTrackId = 'source-1';
    el._recordingTrackId = 'rec-1';
    el._playMode = 'source';
    el._playbackPaused = false;
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    const event = dispatchSeek(el, 2.5);

    expect(event.defaultPrevented).toBe(true);
    expect(playback.playSourceAt).toHaveBeenCalledWith(2.5);
    expect(playback.pause).not.toHaveBeenCalled();
    expect(controllerPauseSpy).not.toHaveBeenCalled();
  });

  it('seeks and plays paused source playback on waveform click', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();

    el._playback = playback;
    el._sourceTrackId = 'source-1';
    el._recordingTrackId = 'rec-1';
    el._playMode = 'source';
    el._playbackPaused = true;
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    const focusSpy = vi.fn();
    el.addEventListener('audio-focus-request', focusSpy);

    const event = dispatchSeek(el, 3.25);

    expect(event.defaultPrevented).toBe(true);
    expect(playback.playSourceAt).toHaveBeenCalledWith(3.25);
    expect(playback.resume).not.toHaveBeenCalled();
    expect(playback.pause).not.toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
  });

  it('seeks and plays recording on waveform click', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();

    el._playback = playback;
    el._sourceTrackId = 'source-1';
    el._recordingTrackId = 'rec-1';
    el._playMode = 'recording';
    el._playbackPaused = false;
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    const event = dispatchSeek(el, 1.5, 'rec-1');

    expect(event.defaultPrevented).toBe(true);
    expect(playback.playRecordingAt).toHaveBeenCalledWith(1.5);
    expect(playback.pause).not.toHaveBeenCalled();
  });

  it('seeks sync playback to the clicked time without zooming to sentence start', async () => {
    const el = await renderPreview();
    const playSyncAt = vi.fn().mockResolvedValue(true);
    const setViewRangeSpy = vi.spyOn(el._controller, 'setViewRange');

    const playback = createPlaybackMock();
    playback.playSyncAt = playSyncAt;
    el._playback = playback;
    el._sourceTrackId = 'source-1';
    el._recordingTrackId = 'rec-1';
    el._playMode = 'sync';
    el.subtitleSegments = sampleSegments;
    el.segments = [samplePracticeSegments[0]];
    await el.updateComplete;
    setViewRangeSpy.mockClear();

    dispatchSeek(el, 2);

    expect(playSyncAt).toHaveBeenCalledWith(2, 'source');
    expect(setViewRangeSpy).not.toHaveBeenCalled();
  });

  it('shows info when clicked subtitle has no practice segment', async () => {
    const el = await renderPreview();
    const infoSpy = vi.spyOn(Message, 'info');
    const playSyncAt = vi.fn().mockResolvedValue(true);

    const playback = createPlaybackMock();
    playback.playSyncAt = playSyncAt;
    el._playback = playback;
    el._sourceTrackId = 'source-1';
    el._recordingTrackId = 'rec-1';
    el._playMode = 'sync';
    el.subtitleSegments = sampleSegments;
    el.segments = [samplePracticeSegments[0]];
    await el.updateComplete;

    dispatchSeek(el, 6);

    expect(infoSpy).toHaveBeenCalled();
    expect(playSyncAt).not.toHaveBeenCalled();
  });

  it('keeps sync seek on the zoomed segment instead of jumping via full-span time', async () => {
    const el = await renderPreview();
    const playSyncAt = vi.fn().mockResolvedValue(true);

    const playback = createPlaybackMock();
    playback.playSyncAt = playSyncAt;
    el._playback = playback;
    el._sourceTrackId = 'source-1';
    el._recordingTrackId = 'rec-1';
    el._playMode = 'sync';
    el.subtitleSegments = sampleSegments;
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    dispatchSeek(el, 4.5);

    expect(playSyncAt).toHaveBeenCalledWith(4.5, 'source');
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

  it('applies gain boost above 100% on preview tracks', async () => {
    const el = await renderPreview();
    const sourceAudio = new Audio();
    attachMediaElementGain(sourceAudio);
    el._sourceAudio = sourceAudio;
    el._recordingAudio = new Audio();
    el._playMode = 'source';

    el._handleVolumeChange('source', 1.5);
    await el.updateComplete;

    expect(sourceAudio.volume).toBe(1);
    expect(el._sourceVolume).toBe(1.5);
    expect(getMediaElementGain(sourceAudio)?.gainNode.gain.value).toBe(1.5);
    expect(el.shadowRoot!.querySelector('.volume-trigger--boosted')).toBeTruthy();
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

  async function loadDualTracks(el: RecordingPreviewInternals): Promise<void> {
    let callCount = 0;
    vi.spyOn(el._controller, 'addFromBlob').mockImplementation(async () => {
      callCount += 1;
      return callCount === 1 ? 'source-track' : 'rec-track';
    });
    el.sourceBlob = new Blob(['source'], { type: 'audio/webm' });
    el.recordingBlob = new Blob(['recording'], { type: 'audio/webm' });
    el.segments = samplePracticeSegments;
    await el.updateComplete;
    await flushUpdates();
  }

  it('starts source playback from the control button', async () => {
    const el = await renderPreview();
    await loadDualTracks(el);
    const playback = createPlaybackMock();
    el._playback = playback;
    el._sourceTrackId = 'source-track';
    el._playMode = 'idle';

    const buttons = [...el.shadowRoot!.querySelectorAll('.controls ui-button')];
    buttons[0].click();
    await flushUpdates();

    expect(playback.playSource).toHaveBeenCalled();
  });

  it('stops source playback when source button is clicked again', async () => {
    const el = await renderPreview();
    el.sourceBlob = new Blob(['source'], { type: 'audio/webm' });
    await el.updateComplete;
    await flushUpdates();

    const playback = createPlaybackMock();
    el._playback = playback;
    el._sourceTrackId = 'source-track';
    el._playMode = 'source';

    await el._handlePlaySource();

    expect(playback.stop).toHaveBeenCalled();
  });

  it('starts recording playback from the control button', async () => {
    const el = await renderPreview();
    await loadDualTracks(el);
    const playback = createPlaybackMock();
    el._playback = playback;
    el._recordingTrackId = 'rec-track';
    el._playMode = 'idle';

    const buttons = [...el.shadowRoot!.querySelectorAll('.controls ui-button')];
    buttons[1].click();
    await flushUpdates();

    expect(playback.playRecording).toHaveBeenCalled();
  });

  it('stops recording playback when recording button is clicked again', async () => {
    const el = await renderPreview();
    el.recordingBlob = new Blob(['recording'], { type: 'audio/webm' });
    await el.updateComplete;
    await flushUpdates();

    const playback = createPlaybackMock();
    el._playback = playback;
    el._recordingTrackId = 'rec-track';
    el._playMode = 'recording';

    await el._handlePlayRecording();

    expect(playback.stop).toHaveBeenCalled();
  });

  it('starts sync playback from the control button', async () => {
    const el = await renderPreview();
    await loadDualTracks(el);
    const playback = createPlaybackMock();
    el._playback = playback;
    el._playMode = 'idle';

    const buttons = [...el.shadowRoot!.querySelectorAll('.controls ui-button')];
    buttons[2].click();
    await flushUpdates();

    expect(playback.playSync).toHaveBeenCalled();
  });

  it('stops sync playback when sync button is clicked again', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();
    el._playback = playback;
    el._playMode = 'sync';
    el.segments = samplePracticeSegments;

    await el._handlePlaySync();

    expect(playback.stop).toHaveBeenCalled();
  });

  it('stops playback when source play throws', async () => {
    const el = await renderPreview();
    el.sourceBlob = new Blob(['source'], { type: 'audio/webm' });
    await el.updateComplete;
    await flushUpdates();

    const playback = createPlaybackMock();
    playback.playSource.mockRejectedValue(new Error('play fail'));
    el._playback = playback;
    el._sourceTrackId = 'source-track';
    el._playMode = 'idle';

    await el._handlePlaySource();

    expect(playback.stop).toHaveBeenCalled();
  });

  it('stops playback when recording play throws', async () => {
    const el = await renderPreview();
    el.recordingBlob = new Blob(['recording'], { type: 'audio/webm' });
    await el.updateComplete;
    await flushUpdates();

    const playback = createPlaybackMock();
    playback.playRecording.mockRejectedValue(new Error('play fail'));
    el._playback = playback;
    el._recordingTrackId = 'rec-track';
    el._playMode = 'idle';

    await el._handlePlayRecording();

    expect(playback.stop).toHaveBeenCalled();
  });

  it('stops playback when sync play throws', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();
    playback.playSync.mockRejectedValue(new Error('play fail'));
    el._playback = playback;
    el._playMode = 'idle';
    el.segments = samplePracticeSegments;

    await el._handlePlaySync();

    expect(playback.stop).toHaveBeenCalled();
  });

  it('warns when seeking waveform while idle', async () => {
    const el = await renderPreview();
    const warningSpy = vi.spyOn(Message, 'warning');
    el._playMode = 'idle';
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    dispatchSeek(el, 2);

    expect(warningSpy).toHaveBeenCalledWith(expect.stringContaining('请先选择播放模式'));
  });

  it('ignores waveform seek for the wrong track in source mode', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();
    el._playback = playback;
    el._sourceTrackId = 'source-track';
    el._playMode = 'source';
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    dispatchSeek(el, 2, 'wrong-track');

    expect(playback.playSourceAt).not.toHaveBeenCalled();
  });

  it('ignores sync seek when clicked time is outside practice segments', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();
    el._playback = playback;
    el._sourceTrackId = 'source-track';
    el._recordingTrackId = 'rec-track';
    el._playMode = 'sync';
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    dispatchSeek(el, 50);

    expect(playback.playSyncAt).not.toHaveBeenCalled();
  });

  it('warns when sync seek cannot locate a subtitle sentence', async () => {
    const el = await renderPreview();
    const warningSpy = vi.spyOn(Message, 'warning');
    const playback = createPlaybackMock();
    el._playback = playback;
    el._sourceTrackId = 'source-track';
    el._recordingTrackId = 'rec-track';
    el._playMode = 'sync';
    el.subtitleSegments = sampleSegments;
    el.segments = [samplePracticeSegments[0]];
    await el.updateComplete;

    dispatchSeek(el, 16, 'source-track');

    expect(warningSpy).toHaveBeenCalledWith(expect.stringContaining('无法定位'));
  });

  it('maps view range between source and recording tracks', async () => {
    const el = await renderPreview();
    el.segments = samplePracticeSegments;
    el._sourceTrackId = 'source-track';
    el._recordingTrackId = 'rec-track';
    await el.updateComplete;

    const mapped = el._resolveTrackViewRange(
      { id: 'rec-track' },
      { start: 0, end: 5 },
      { id: 'source-track' },
    );

    expect(mapped).toEqual({ start: 0, end: 4.5 });
  });

  it('loads recording-only preview when source blob is missing', async () => {
    const el = await renderPreview();
    vi.spyOn(el._controller, 'addFromBlob').mockResolvedValue('rec-track');
    el.recordingBlob = new Blob(['recording'], { type: 'audio/webm' });
    el.segments = samplePracticeSegments;
    await el.updateComplete;
    await flushUpdates();

    expect(el._recordingTrackId).toBe('rec-track');
    expect(el._sourceTrackId).toBe('');
  });

  it('resets view range when active waveform track changes', async () => {
    const el = await renderPreview();
    const setViewRangeSpy = vi.spyOn(el._controller, 'setViewRange');
    el.segments = samplePracticeSegments;
    await el.updateComplete;

    el._controller.dispatchEvent(
      new CustomEvent(WaveformEventType.TRACK_CHANGE, { bubbles: true }),
    );
    await flushUpdates();

    expect(setViewRangeSpy).toHaveBeenCalled();
  });

  it('triggers play source via Q hotkey', async () => {
    const el = await renderPreview();
    await loadDualTracks(el);
    const playback = createPlaybackMock();
    el._playback = playback;
    el._sourceTrackId = 'source-track';
    el._playMode = 'idle';

    dispatchKey('KeyQ');
    await flushUpdates();

    expect(playback.playSource).toHaveBeenCalled();
  });

  it('shows status text while playing source without segments', async () => {
    const el = await renderPreview();
    el._playMode = 'source';
    el.segments = [];
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.status')?.textContent).toContain('正在播放原音');
  });

  it('replays current segment via hotkey', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();
    el._playback = playback;
    el._playMode = 'sync';
    el.segments = samplePracticeSegments;
    el._syncSegmentIndex = 0;
    await el.updateComplete;

    dispatchKey('KeyR');

    expect(playback.replaySegment).toHaveBeenCalledWith(0);
  });
});
