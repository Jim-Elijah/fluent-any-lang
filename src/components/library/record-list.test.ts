import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PracticeRecord, PronunciationScore } from '../../types/models.js';
import * as recordDb from '../../db/record.js';
import * as mediaDb from '../../db/media.js';
import * as subtitleDb from '../../db/subtitle.js';
import * as scoreDb from '../../db/pronunciation-score.js';
import { NARROW_VIEWPORT_MQ } from '../../lib/layout-compact.js';

vi.mock('../../lib/export-content.js', () => ({
  exportRecording: vi.fn(),
}));

const requestScoreMock = vi.fn();
vi.mock('../../lib/pronunciation-score/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/pronunciation-score/index.js')>();
  return {
    ...actual,
    requestScore: (...args: unknown[]) => requestScoreMock(...args),
    isSpeechScoreConfigured: () => true,
    hasSpeechScorePrivacyAck: () => true,
    ackSpeechScorePrivacy: vi.fn(),
  };
});

import './record-list.js';
import type { RecordList } from './record-list.js';
import { exportRecording } from '../../lib/export-content.js';
import { mount, flushUpdates } from '../ui/test-utils.js';
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
  segments: [
    {
      id: 's0',
      sourceStartTime: 0,
      sourceEndTime: 10,
      recordingStartTime: 0,
      recordingEndTime: 9,
      text: 'hello',
    },
  ],
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
    vi.spyOn(scoreDb, 'getScoresByRecordIds').mockResolvedValue(new Map());
    requestScoreMock.mockReset();
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
    expect(badges?.[1]?.classList.contains('echo')).toBe(true);
  });

  it('hides mode badge when modeFilter is set', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);

    const el = await renderList(html`<record-list .modeFilter=${'shadowing'}></record-list>`);
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.badge')).toBeNull();
    expect(el.shadowRoot?.textContent).toContain('Lesson');
  });

  it('filters echo recordings by segmentId', async () => {
    const echoA: PracticeRecord = {
      ...sampleRecord,
      id: 'echo-a',
      mode: 'echo',
      segmentId: 'seg-a',
      mediaTitle: 'Seg A',
    };
    const echoB: PracticeRecord = {
      ...sampleRecord,
      id: 'echo-b',
      mode: 'echo',
      segmentId: 'seg-b',
      mediaTitle: 'Seg B',
    };
    vi.mocked(recordDb.findRecordings).mockResolvedValue([echoA, echoB]);

    const el = await renderList(
      html`<record-list mediaId="media-1" .modeFilter=${'echo'} segmentId="seg-a"></record-list>`,
    );
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('Seg A');
    expect(el.shadowRoot?.textContent).not.toContain('Seg B');
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
        destination = {};
        resume = vi.fn().mockResolvedValue(undefined);
        createGain = vi.fn(() => ({
          gain: { value: 1 },
          connect: vi.fn(),
          disconnect: vi.fn(),
        }));
        createMediaElementSource = vi.fn(() => ({
          connect: vi.fn(),
          disconnect: vi.fn(),
        }));
        decodeAudioData = vi.fn().mockResolvedValue({
          duration: 1,
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

  it('uses narrow row height when viewport matches narrow MQ', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === NARROW_VIEWPORT_MQ,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    const grid = el.shadowRoot?.querySelector('ui-virtual-grid') as
      | { itemHeight?: number }
      | null
      | undefined;
    expect(grid?.itemHeight).toBe(112);
  });

  it('loads recordings for a specific media id', async () => {
    vi.mocked(recordDb.findRecordings).mockResolvedValue([sampleRecord]);

    const el = await renderList(html`<record-list .mediaId=${'media-1'}></record-list>`);
    await el.refresh();
    await el.updateComplete;

    expect(recordDb.findRecordings).toHaveBeenCalledWith('media-1');
    expect(recordDb.getRecordingList).not.toHaveBeenCalled();
  });

  it('refreshes when mediaId changes', async () => {
    vi.mocked(recordDb.findRecordings).mockResolvedValue([sampleRecord]);
    const el = await renderList(html`<record-list .mediaId=${'media-1'}></record-list>`);
    await el.refresh();
    await el.updateComplete;
    vi.mocked(recordDb.findRecordings).mockClear();

    el.mediaId = 'media-2';
    await el.updateComplete;
    await flushUpdates();

    expect(recordDb.findRecordings).toHaveBeenCalledWith('media-2');
  });

  it('shows load error when refresh fails', async () => {
    vi.mocked(recordDb.getRecordingList).mockRejectedValue(new Error('db down'));
    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('ui-alert')?.textContent).toContain('无法加载录音');
  });

  it('sorts recordings by title from parent props', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([
      { ...sampleRecord, id: 'a', mediaTitle: 'Zulu' },
      { ...sampleRecord, id: 'b', mediaTitle: 'Alpha', createdAt: 2 },
    ]);
    const el = await renderList(
      html`<record-list sortBy="title" sortDirection="asc"></record-list>`,
    );
    await el.refresh();
    await el.updateComplete;

    const titles = [...(el.shadowRoot?.querySelectorAll('.title') ?? [])].map(
      (node) => node.textContent?.trim() ?? '',
    );
    expect(titles).toEqual(['Alpha', 'Zulu']);
  });

  it('filters recordings by mode', async () => {
    const echoRecord: PracticeRecord = {
      ...sampleRecord,
      id: 'rec-2',
      mode: 'echo',
      mediaTitle: 'Echo lesson',
    };
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord, echoRecord]);

    const el = await renderList(html`<record-list .modeFilter=${'echo'}></record-list>`);
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelectorAll('.title')).toHaveLength(1);
    expect(el.shadowRoot?.textContent).toContain('Echo lesson');
  });

  it('shows error when recording blob is missing on preview', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    vi.mocked(recordDb.getRecordingBlob).mockResolvedValue(null);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    el.shadowRoot!.querySelector('ui-button[aria-label="查看"]')!.click();
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.querySelector('ui-alert')?.textContent).toContain('录音文件不存在');
  });

  it('exports a recording from the row action', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    vi.mocked(exportRecording).mockResolvedValue(undefined);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    el.shadowRoot!.querySelector('ui-button[aria-label="导出"]')!.click();
    await flushUpdates();

    expect(exportRecording).toHaveBeenCalledWith(sampleRecord);
  });

  it('shows export error when export fails', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    vi.mocked(exportRecording).mockRejectedValue(new Error('export fail'));

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    el.shadowRoot!.querySelector('ui-button[aria-label="导出"]')!.click();
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.querySelector('ui-alert')?.textContent).toContain('导出失败');
  });

  it('deletes recording after confirm and dispatches recording-deleted', async () => {
    vi.mocked(recordDb.getRecordingList)
      .mockResolvedValueOnce([sampleRecord])
      .mockResolvedValue([]);
    const el = await renderList();
    await el.updateComplete;
    await flushUpdates();
    const deleted = vi.fn();
    el.addEventListener('recording-deleted', deleted);

    el.shadowRoot
      ?.querySelector('ui-popconfirm')
      ?.dispatchEvent(new Event('confirm', { bubbles: true, composed: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(recordDb.deleteRecording).toHaveBeenCalledWith('rec-1');
    expect(deleted).toHaveBeenCalled();
    expect(recordDb.getRecordingList).toHaveBeenCalledTimes(2);
  });

  it('shows delete error when removal fails', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    vi.mocked(recordDb.deleteRecording).mockRejectedValue(new Error('delete fail'));

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    el.shadowRoot
      ?.querySelector('ui-popconfirm')
      ?.dispatchEvent(new Event('confirm', { bubbles: true, composed: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.querySelector('ui-alert')?.textContent).toContain('删除失败');
  });

  it('dispatches list-metrics after rendering items', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    const el = await renderList();
    const metrics = vi.fn();
    el.addEventListener('list-metrics', metrics);
    await el.refresh();
    await el.updateComplete;
    await flushUpdates();

    expect(metrics).toHaveBeenCalled();
  });

  it('shows an overall badge and a rescore action when a score exists', async () => {
    const score: PronunciationScore = {
      id: 'score-1',
      recordId: 'rec-1',
      status: 'success',
      referenceText: 'hello',
      overall: 84.2,
      createdAt: 1,
    };
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    vi.mocked(scoreDb.getScoresByRecordIds).mockResolvedValue(new Map([['rec-1', score]]));

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.score-badge')?.textContent?.trim()).toBe('84');
    expect(el.shadowRoot?.querySelector('ui-button[aria-label="重新评分"]')).not.toBeNull();
  });

  it('requests a score from the row action', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    requestScoreMock.mockResolvedValue({
      ok: true,
      score: {
        id: 'score-1',
        recordId: 'rec-1',
        status: 'success',
        referenceText: 'hello',
        overall: 80,
        createdAt: 1,
      },
    });

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    el.shadowRoot!.querySelector('ui-button[aria-label="评分"]')!.click();
    await flushUpdates();

    expect(requestScoreMock).toHaveBeenCalled();
    expect(requestScoreMock.mock.calls[0]?.[0]).toMatchObject({ id: 'rec-1' });
  });

  it('disables scoring when the recording has no reference script', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([
      {
        ...sampleRecord,
        segments: [
          {
            id: 's0',
            sourceStartTime: 0,
            sourceEndTime: 10,
            recordingStartTime: 0,
            recordingEndTime: 9,
          },
        ],
      },
    ]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    const button = el.shadowRoot!.querySelector(
      'ui-button[aria-label="评分"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click();
    await flushUpdates();
    expect(requestScoreMock).not.toHaveBeenCalled();
  });

  it('allows scoring a legacy recording from the live Subtitle Track', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([
      {
        ...sampleRecord,
        segments: [
          {
            id: 's0',
            sourceStartTime: 0,
            sourceEndTime: 10,
            recordingStartTime: 0,
            recordingEndTime: 9,
          },
        ],
      },
    ]);
    vi.mocked(subtitleDb.getSubtitle).mockResolvedValue({
      id: 'sub-1',
      mediaId: 'media-1',
      title: 'Lesson',
      filename: 'lesson.srt',
      type: 'srt',
      contentHash: 'hash',
      segments: [{ id: 's0', startTime: 0, endTime: 10, text: 'hello' }],
    });
    requestScoreMock.mockResolvedValue({
      ok: true,
      score: {
        id: 'score-1',
        recordId: 'rec-1',
        status: 'success',
        referenceText: 'hello',
        overall: 80,
        createdAt: 1,
      },
    });

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    const button = el.shadowRoot!.querySelector('ui-button[aria-label="评分"]') as HTMLElement & {
      disabled: boolean;
    };
    expect(button.disabled).toBe(false);
    button.click();
    await flushUpdates();
    expect(requestScoreMock).toHaveBeenCalled();
  });
});
