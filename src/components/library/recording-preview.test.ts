import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PracticeSegment, SubtitleSegment } from '../../types/models.js';
import { HotkeyManager, setHotkeyManagerForTests } from '../../lib/hotkeys/index.js';
import { mount, flushUpdates } from '../ui/test-utils.js';
import { Message } from '../ui/message.js';
import './recording-preview.js';
import type { RecordingPreview } from './recording-preview.js';

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

type RecordingPreviewInternals = RecordingPreview & {
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
    playSyncFromSegment: (index: number) => Promise<void>;
    stop: () => void;
    destroy: () => void;
    setSegments: (segments: PracticeSegment[]) => void;
  } | null;
  _sourceTrackId: string;
  _recordingTrackId: string;
  _playMode: string;
};

describe('recording-preview', () => {
  let cleanup: (() => void) | undefined;
  let hotkeys: HotkeyManager;

  beforeEach(() => {
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
    const el = result.container.querySelector('recording-preview') as RecordingPreviewInternals;
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
      playSyncFromSegment,
      stop: vi.fn(),
      destroy: vi.fn(),
      setSegments: vi.fn(),
    };
  }

  it('stops playback on Space while a preview play mode is active', async () => {
    const el = await renderPreview();
    const playback = createPlaybackMock();
    el._playback = playback;
    el._playMode = 'source';
    await el.updateComplete;

    document.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
    );

    expect(playback.stop).toHaveBeenCalledTimes(1);
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
});
