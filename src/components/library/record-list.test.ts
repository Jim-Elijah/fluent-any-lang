import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PracticeRecord } from '../../types/models.js';
import * as recordDb from '../../db/record.js';
import * as mediaDb from '../../db/media.js';
import * as subtitleDb from '../../db/subtitle.js';

vi.mock('../../lib/export-content.js', () => ({
  exportRecording: vi.fn(),
}));

import './record-list.js';
import type { RecordList } from './record-list.js';
import { mount } from '../ui/test-utils.js';
import { Message } from '../ui/message.js';
import { RECORDING_PREVIEW_OPEN_EVENT } from '../../lib/audio-focus.js';

const sampleRecord: PracticeRecord = {
  id: 'rec-1',
  mediaId: 'media-1',
  mediaTitle: 'Lesson',
  mediaFilename: 'lesson.mp3',
  mode: 'shadowing',
  mimeType: 'audio/webm',
  createdAt: 1,
  sourceDuration: 10,
  recordingDuration: 9,
  segments: [],
};

describe('record-list', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.spyOn(recordDb, 'getRecordingList').mockResolvedValue([]);
    vi.spyOn(recordDb, 'findRecordings').mockResolvedValue([]);
    vi.spyOn(recordDb, 'deleteRecording').mockResolvedValue(undefined as never);
    vi.spyOn(recordDb, 'getRecordingBlob').mockResolvedValue(null);
    vi.spyOn(mediaDb, 'getMediaBlob').mockResolvedValue(undefined as never);
    vi.spyOn(subtitleDb, 'getSubtitle').mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
  });

  async function renderList(template = html`<record-list></record-list>`) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('record-list') as RecordList;
    await el.updateComplete;
    return el;
  }

  it('renders empty state after loading', async () => {
    const el = await renderList();
    await el.refresh();
    await el.updateComplete;
    expect(el.shadowRoot?.textContent).toContain('暂无录音');
  });

  it('shows no-match empty state when keyword filters all items', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);

    const el = await renderList(html`<record-list keyword="zzz"></record-list>`);
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('无匹配录音');
  });

  it('lists recordings after refresh', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    expect(recordDb.getRecordingList).toHaveBeenCalled();
    expect(el.shadowRoot?.textContent).toContain('Lesson');
  });

  it('shows mode badge for shadowing and echo recordings', async () => {
    const echoRecord: PracticeRecord = {
      ...sampleRecord,
      id: 'rec-2',
      mode: 'echo',
      mediaTitle: 'Echo lesson',
    };
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord, echoRecord]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    const badges = el.shadowRoot?.querySelectorAll('.badge');
    expect(badges).toHaveLength(2);
    expect(badges?.[0]?.classList.contains('shadowing')).toBe(true);
    expect(badges?.[0]?.textContent?.trim()).toBe('跟读');
    expect(badges?.[1]?.classList.contains('echo')).toBe(true);
    expect(badges?.[1]?.textContent?.trim()).toBe('回声');
  });

  it('hides mode badge when modeFilter is set', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);

    const el = await renderList(html`<record-list .modeFilter=${'shadowing'}></record-list>`);
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.badge')).toBeNull();
    expect(el.shadowRoot?.textContent).toContain('Lesson');
  });

  it('supports fill-height attribute', async () => {
    const el = await renderList(html`<record-list fill-height></record-list>`);
    expect(el.fillHeight).toBe(true);
    expect(el.hasAttribute('fill-height')).toBe(true);
  });

  it('blocks preview when previewDisabled and does not open modal', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    const warningSpy = vi
      .spyOn(Message, 'warning')
      .mockImplementation(() => ({ close: () => undefined }));
    const openSpy = vi.fn();

    const el = await renderList(html`<record-list .previewDisabled=${true}></record-list>`);
    el.addEventListener(RECORDING_PREVIEW_OPEN_EVENT, openSpy);
    await el.refresh();
    await el.updateComplete;

    const viewButton = el.shadowRoot!.querySelector(
      'ui-button[aria-label="查看"]',
    ) as HTMLElement | null;
    expect(viewButton).not.toBeNull();
    viewButton!.click();
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warningSpy).toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(el.shadowRoot?.querySelector('recording-preview')).toBeNull();
  });

  it('emits recording-preview-open when viewing a recording', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    vi.mocked(recordDb.getRecordingBlob).mockResolvedValue(
      new Blob(['rec'], { type: 'audio/webm' }),
    );
    vi.mocked(mediaDb.getMediaBlob).mockResolvedValue(new Blob(['src'], { type: 'audio/mpeg' }));
    vi.stubGlobal(
      'AudioContext',
      class {
        decodeAudioData = vi.fn().mockResolvedValue({
          length: 1,
          sampleRate: 48000,
          numberOfChannels: 1,
          getChannelData: () => new Float32Array(1),
        });
        close = vi.fn();
      },
    );
    const openSpy = vi.fn();

    const el = await renderList();
    el.addEventListener(RECORDING_PREVIEW_OPEN_EVENT, openSpy);
    await el.refresh();
    await el.updateComplete;

    const viewButton = el.shadowRoot!.querySelector(
      'ui-button[aria-label="查看"]',
    ) as HTMLElement | null;
    viewButton!.click();
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;

    expect(openSpy).toHaveBeenCalled();
  });
});
