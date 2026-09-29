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
  exportRecordingsBatch: vi.fn(),
}));

const requestScoreMock = vi.fn();
let speechScoreConfigured = true;
vi.mock('../../lib/pronunciation-score/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/pronunciation-score/index.js')>();
  return {
    ...actual,
    requestScore: (...args: unknown[]) => requestScoreMock(...args),
    isSpeechScoreConfigured: () => speechScoreConfigured,
    hasSpeechScorePrivacyAck: () => true,
    ackSpeechScorePrivacy: vi.fn(),
  };
});

import { KEEP_ONLY_DELETE_PREVIEW_LIMIT, type RecordList } from './record-list.js';
import { exportRecording, exportRecordingsBatch } from '../../lib/export-content.js';
import { formatDate, formatTime } from '../../lib/playback-utils.js';
import { formatOverallBadge } from '../../lib/pronunciation-score/aggregate.js';
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

function expectKeepOnlyRow(text: string, recording: PracticeRecord, overall?: number): void {
  expect(text).toContain(formatDate(recording.createdAt, true));
  expect(text).toContain(formatTime(recording.recordingDuration));
  if (overall != null) {
    expect(text).toContain(formatOverallBadge(overall));
  }
}

function keepOnlyModal(el: HTMLElement): HTMLElement | undefined {
  return [...el.shadowRoot!.querySelectorAll('ui-modal')].find(
    (modal) => modal.getAttribute('title') === '确定仅保留本条录音吗？',
  ) as HTMLElement | undefined;
}

function echoRecord(id: string, createdAt: number, segmentId = 'seg-a'): PracticeRecord {
  return {
    ...sampleRecord,
    id,
    mode: 'echo',
    segmentId,
    createdAt,
  };
}

describe('record-list', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    speechScoreConfigured = true;
    vi.spyOn(recordDb, 'getRecordingList').mockResolvedValue([]);
    vi.spyOn(recordDb, 'findRecordings').mockResolvedValue([]);
    vi.spyOn(recordDb, 'deleteRecording').mockResolvedValue(undefined as never);
    vi.spyOn(recordDb, 'deleteRecordingBatch').mockResolvedValue(undefined as never);
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

  it('filters by media title or full subtitle reference, including text past the excerpt', async () => {
    const tail = 'uniqueword';
    const longText = `${'a'.repeat(80)}${tail}`;
    const titled: PracticeRecord = { ...sampleRecord, id: 'by-title', mediaTitle: 'Rain lesson' };
    const bySnapshot: PracticeRecord = {
      ...sampleRecord,
      id: 'by-text',
      mediaTitle: 'Other',
      segments: [{ ...sampleRecord.segments[0]!, text: longText }],
    };
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([titled, bySnapshot]);

    const byTitle = await renderList(html`<record-list keyword="rain"></record-list>`);
    await byTitle.refresh();
    await byTitle.updateComplete;
    expect(byTitle.shadowRoot?.textContent).toContain('Rain lesson');
    expect(byTitle.shadowRoot?.textContent).not.toContain('Other');

    cleanup?.();
    const bySubtitle = await renderList(html`<record-list keyword="uniqueword"></record-list>`);
    await bySubtitle.refresh();
    await bySubtitle.updateComplete;
    expect(bySubtitle.shadowRoot?.textContent).toContain('Other');
    expect(bySubtitle.shadowRoot?.querySelector('.excerpt')?.textContent).toContain(tail);
    expect(bySubtitle.shadowRoot?.textContent).not.toContain('Rain lesson');
  });

  it('filters shadowing records when keyword spans sentences joined by newline', async () => {
    const shadowing: PracticeRecord = {
      ...sampleRecord,
      mode: 'shadowing',
      segments: [
        {
          id: 's0',
          sourceStartTime: 0,
          sourceEndTime: 5,
          recordingStartTime: 0,
          recordingEndTime: 5,
          text: 'Hello there',
        },
        {
          id: 's1',
          sourceStartTime: 5,
          sourceEndTime: 10,
          recordingStartTime: 5,
          recordingEndTime: 10,
          text: 'How are you',
        },
      ],
    };
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([shadowing]);

    const el = await renderList(html`<record-list keyword="there How"></record-list>`);
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('Lesson');
    expect(el.shadowRoot?.textContent).not.toContain('无匹配录音');
  });

  it('filters by live subtitle text when the practice snapshot is empty', async () => {
    const legacy: PracticeRecord = {
      ...sampleRecord,
      mediaTitle: 'Legacy',
      segments: [{ ...sampleRecord.segments[0]!, text: '' }],
    };
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([legacy]);
    vi.mocked(subtitleDb.getSubtitle).mockResolvedValue({
      id: 'sub-1',
      mediaId: 'media-1',
      title: 'sub',
      segments: [{ id: 's0', startTime: 0, endTime: 10, text: 'live subtitle phrase' }],
    });

    const el = await renderList(html`<record-list keyword="phrase"></record-list>`);
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('Legacy');
  });

  it('lists recordings after refresh', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    expect(recordDb.getRecordingList).toHaveBeenCalled();
    expect(el.shadowRoot?.textContent).toContain('Lesson');
  });

  it('shows segment ordinal and source excerpt when subtitle track is available', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    vi.mocked(subtitleDb.getSubtitle).mockResolvedValue({
      id: 'sub-1',
      mediaId: 'media-1',
      title: 'sub',
      segments: [
        { id: 's0', startTime: 0, endTime: 10, text: 'hello there' },
        { id: 's1', startTime: 10, endTime: 20, text: 'next' },
      ],
    });

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    const context = el.shadowRoot?.querySelector('.context');
    expect(context?.querySelector('.ordinal')?.textContent).toBe('#1');
    expect(context?.querySelector('.excerpt')?.textContent).toBe('hello');
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
    expect(grid?.itemHeight).toBe(116);
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
    speechScoreConfigured = false;
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
    speechScoreConfigured = false;
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
    const changed = vi.fn();
    el.addEventListener('recording-deleted', deleted);
    el.addEventListener('recordings-changed', changed);

    el.shadowRoot
      ?.querySelector('ui-popconfirm')
      ?.dispatchEvent(new Event('confirm', { bubbles: true, composed: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(recordDb.deleteRecording).toHaveBeenCalledWith('rec-1');
    expect(deleted).toHaveBeenCalled();
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { reason: 'deleted' },
      }),
    );
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
    expect(el.shadowRoot?.querySelector('.score-badge.score-band.good')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('ui-button[aria-label="重新评分"]')).not.toBeNull();
  });

  it('hides the score action when speech score is not configured', async () => {
    speechScoreConfigured = false;
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('ui-button[aria-label="评分"]')).toBeNull();
    expect(el.shadowRoot?.querySelector('ui-button[aria-label="重新评分"]')).toBeNull();
  });

  it('keeps the score badge but hides rescore when not configured', async () => {
    speechScoreConfigured = false;
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
    expect(el.shadowRoot?.querySelector('ui-button[aria-label="重新评分"]')).toBeNull();
  });

  it('applies good, mid and low score-band classes on overall badges', async () => {
    const midScore: PronunciationScore = {
      id: 'score-mid',
      recordId: 'rec-1',
      status: 'success',
      referenceText: 'hello',
      overall: 65,
      createdAt: 1,
    };
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    vi.mocked(scoreDb.getScoresByRecordIds).mockResolvedValue(new Map([['rec-1', midScore]]));

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.score-badge.score-band.mid')).not.toBeNull();

    vi.mocked(scoreDb.getScoresByRecordIds).mockResolvedValue(
      new Map([['rec-1', { ...midScore, id: 'score-good', overall: 85 }]]),
    );
    await el.refresh();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.score-badge.score-band.good')).not.toBeNull();

    vi.mocked(scoreDb.getScoresByRecordIds).mockResolvedValue(
      new Map([['rec-1', { ...midScore, id: 'score-high', overall: 92 }]]),
    );
    await el.refresh();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.score-badge.score-band.high')).not.toBeNull();

    vi.mocked(scoreDb.getScoresByRecordIds).mockResolvedValue(
      new Map([['rec-1', { ...midScore, id: 'score-low', overall: 40 }]]),
    );
    await el.refresh();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.score-badge.score-band.low')).not.toBeNull();
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
    const changed = vi.fn();
    el.addEventListener('recordings-changed', changed);

    el.shadowRoot!.querySelector('ui-button[aria-label="评分"]')!.click();
    await flushUpdates();

    expect(requestScoreMock).toHaveBeenCalled();
    expect(requestScoreMock.mock.calls[0]?.[0]).toMatchObject({ id: 'rec-1' });
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { reason: 'scored' },
      }),
    );
  });

  it('dispatches recordings-changed after batch delete', async () => {
    vi.mocked(recordDb.getRecordingList)
      .mockResolvedValueOnce([sampleRecord])
      .mockResolvedValue([]);
    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    const changed = vi.fn();
    el.addEventListener('recordings-changed', changed);

    const list = el as unknown as {
      _selected: Set<string>;
      _visibleIds: string[];
      _handleBatchDelete: () => Promise<void>;
    };
    list._visibleIds = ['rec-1'];
    list._selected = new Set(['rec-1']);
    await list._handleBatchDelete();
    await flushUpdates();

    expect(recordDb.deleteRecordingBatch).toHaveBeenCalledWith(['rec-1']);
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { reason: 'batch-deleted' },
      }),
    );
  });

  it('shows selection chrome with export and delete icons', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    const el = await renderList();
    await el.refresh();
    el.selectionMode = true;
    await el.updateComplete;

    expect(
      el.shadowRoot?.querySelector('.batch-controls ui-button[aria-label="导出"]'),
    ).not.toBeNull();
    expect(
      el.shadowRoot?.querySelector('.batch-controls ui-button[aria-label="删除"]'),
    ).not.toBeNull();
    expect(
      el.shadowRoot?.querySelector('.batch-controls ui-button[aria-label="全选"]'),
    ).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.batch-controls ui-icon[name="download"]')).not.toBeNull();
    expect(el.shadowRoot?.textContent).toContain('已选 0 项');
    expect(el.shadowRoot?.textContent).not.toContain('反选');
  });

  it('batch-exports selected recordings', async () => {
    const second: PracticeRecord = {
      ...sampleRecord,
      id: 'rec-2',
      mediaTitle: 'Lesson 2',
      createdAt: 2,
    };
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord, second]);
    vi.mocked(exportRecordingsBatch).mockResolvedValue({ failedCount: 0 });
    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    const list = el as unknown as {
      _selected: Set<string>;
      _visibleIds: string[];
      _handleBatchExport: () => Promise<void>;
    };
    list._visibleIds = ['rec-1', 'rec-2'];
    list._selected = new Set(['rec-1', 'rec-2']);
    const successSpy = vi.spyOn(Message, 'success');

    await list._handleBatchExport();
    await flushUpdates();

    expect(exportRecordingsBatch).toHaveBeenCalledWith([second, sampleRecord]);
    expect(successSpy).toHaveBeenCalledWith('已导出 2 项');
  });

  it('shows batch export error when some exports fail', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);
    vi.mocked(exportRecordingsBatch).mockResolvedValue({ failedCount: 1 });
    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    const list = el as unknown as {
      _selected: Set<string>;
      _visibleIds: string[];
      _handleBatchExport: () => Promise<void>;
    };
    list._visibleIds = ['rec-1'];
    list._selected = new Set(['rec-1']);
    const errorSpy = vi.spyOn(Message, 'error');

    await list._handleBatchExport();
    await flushUpdates();

    expect(errorSpy).toHaveBeenCalledWith('部分录音导出失败');
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

  it('shows more menu instead of inline export when speech score is configured', async () => {
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([sampleRecord]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('ui-button[aria-label="导出"]')).toBeNull();
    expect(el.shadowRoot?.querySelector('ui-button[aria-label="更多操作"]')).not.toBeNull();
  });

  it('hides keep-only when only one echo take exists for the segment', async () => {
    speechScoreConfigured = false;
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([echoRecord('rec-echo-1', 1)]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('ui-button[aria-label="仅保留本条"]')).toBeNull();
  });

  it('deletes sibling echo takes when keep-only is confirmed without score menu', async () => {
    speechScoreConfigured = false;
    const first = echoRecord('rec-echo-1', Date.UTC(2024, 0, 10, 12, 2));
    const second = echoRecord('rec-echo-2', Date.UTC(2024, 0, 10, 12, 1));
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([first, second]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    const changed = vi.fn();
    el.addEventListener('recordings-changed', changed);

    const keepButtons = el.shadowRoot!.querySelectorAll('ui-button[aria-label="仅保留本条"]');
    expect(keepButtons.length).toBe(2);
    expect(keepButtons[0]!.closest('ui-popconfirm')).toBeNull();

    (keepButtons[0] as HTMLElement).click();
    await el.updateComplete;

    const modal = keepOnlyModal(el);
    const modalText = modal?.textContent ?? '';
    expect(modalText).toContain('将删除同句其余 1 条录音，不可恢复。');
    expect(modal?.querySelector('table.keep-only-table')).not.toBeNull();
    expect(modalText).toContain('前 1 条详情如下：');
    expect(modalText).toContain('日期');
    expect(modalText).toContain('时长');
    expect(modalText).toContain('得分');
    expectKeepOnlyRow(modalText, second);
    expect(modalText).not.toContain(formatDate(first.createdAt, true));

    const list = el as unknown as { _confirmKeepOnly: () => Promise<void> };
    await list._confirmKeepOnly();
    await flushUpdates();

    expect(recordDb.deleteRecordingBatch).toHaveBeenCalledWith(['rec-echo-2']);
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { reason: 'batch-deleted' },
      }),
    );
  });

  it('opens keep-only modal from more menu when speech score is configured', async () => {
    const first = echoRecord('rec-echo-1', Date.UTC(2024, 0, 10, 12, 2));
    const second = echoRecord('rec-echo-2', Date.UTC(2024, 0, 10, 12, 1));
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([first, second]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    const list = el as unknown as {
      _handleRowMenuClick: (event: CustomEvent<{ key: string }>, recording: PracticeRecord) => void;
      _confirmKeepOnly: () => Promise<void>;
    };
    list._handleRowMenuClick(
      new CustomEvent('menu-click', { detail: { key: 'keep-only' } }),
      first,
    );
    await el.updateComplete;

    const modal = keepOnlyModal(el);
    expect(modal?.textContent).toContain('将删除同句其余 1 条录音，不可恢复。');
    expect(modal?.textContent).toContain('前 1 条详情如下：');
    expect(modal?.textContent).toContain(formatDate(second.createdAt, true));
    expect(modal?.textContent).not.toContain(formatDate(first.createdAt, true));

    await list._confirmKeepOnly();
    await flushUpdates();

    expect(recordDb.deleteRecordingBatch).toHaveBeenCalledWith(['rec-echo-2']);
  });

  it('lists a scored sibling with the same keep-only preview as an unscored one', async () => {
    speechScoreConfigured = false;
    const first = echoRecord('rec-echo-1', Date.UTC(2024, 0, 10, 12, 2));
    const second = echoRecord('rec-echo-2', Date.UTC(2024, 0, 10, 12, 1));
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([first, second]);
    vi.mocked(scoreDb.getScoresByRecordIds).mockResolvedValue(
      new Map([
        [
          second.id,
          {
            id: 'score-2',
            recordId: second.id,
            status: 'success',
            referenceText: 'hello',
            overall: 84.2,
            createdAt: 1,
          },
        ],
      ]),
    );

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    (el.shadowRoot!.querySelector('ui-button[aria-label="仅保留本条"]') as HTMLElement).click();
    await el.updateComplete;

    const modalText = keepOnlyModal(el)?.textContent ?? '';
    expect(modalText).toContain(formatDate(second.createdAt, true));
    expect(modalText).toContain(formatTime(second.recordingDuration));
    expect(modalText).toContain(formatOverallBadge(84.2));
  });

  it('previews only the first keep-only rows and still deletes every sibling', async () => {
    speechScoreConfigured = false;
    const base = Date.UTC(2024, 0, 10, 12, 0);
    const keep = echoRecord('rec-keep', base);
    const siblings = Array.from({ length: KEEP_ONLY_DELETE_PREVIEW_LIMIT + 1 }, (_, index) =>
      echoRecord(`rec-old-${index}`, base - (index + 1) * 60_000),
    );
    vi.mocked(recordDb.getRecordingList).mockResolvedValue([keep, ...siblings]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    (el.shadowRoot!.querySelector('ui-button[aria-label="仅保留本条"]') as HTMLElement).click();
    await el.updateComplete;

    const modalText = keepOnlyModal(el)?.textContent ?? '';
    expect(modalText).toContain(
      `将删除同句其余 ${KEEP_ONLY_DELETE_PREVIEW_LIMIT + 1} 条录音，不可恢复。`,
    );
    expect(modalText).toContain(`前 ${KEEP_ONLY_DELETE_PREVIEW_LIMIT} 条详情如下：`);
    expect(modalText).not.toContain('及其他');
    for (const sibling of siblings.slice(0, KEEP_ONLY_DELETE_PREVIEW_LIMIT)) {
      expect(modalText).toContain(formatDate(sibling.createdAt, true));
    }
    expect(modalText).not.toContain(formatDate(siblings.at(-1)!.createdAt, true));

    const list = el as unknown as { _confirmKeepOnly: () => Promise<void> };
    await list._confirmKeepOnly();
    await flushUpdates();

    expect(recordDb.deleteRecordingBatch).toHaveBeenCalledWith(siblings.map((item) => item.id));
  });
});
