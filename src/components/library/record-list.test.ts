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

  it('supports fill-height attribute', async () => {
    const el = await renderList(html`<record-list fill-height></record-list>`);
    expect(el.fillHeight).toBe(true);
    expect(el.hasAttribute('fill-height')).toBe(true);
  });
});
