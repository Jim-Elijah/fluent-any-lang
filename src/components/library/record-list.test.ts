import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PracticeRecord } from '../../types/models.js';

const mockGetRecordingList = vi.fn<() => Promise<PracticeRecord[]>>();

vi.mock('../../db/service.js', () => ({
  getRecordingList: (...args: unknown[]) => mockGetRecordingList(...args),
  findRecordings: vi.fn().mockResolvedValue([]),
  deleteRecording: vi.fn(),
  getMediaBlob: vi.fn(),
  getRecordingBlob: vi.fn(),
}));

vi.mock('../../lib/export-content.js', () => ({
  exportRecording: vi.fn(),
}));

import './record-list.js';
import type { RecordList } from './record-list.js';
import { mount } from '../ui/test-utils.js';

describe('record-list', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    mockGetRecordingList.mockReset();
    mockGetRecordingList.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderList() {
    const result = mount(html`<record-list></record-list>`);
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

  it('lists recordings after refresh', async () => {
    mockGetRecordingList.mockResolvedValue([
      {
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
      },
    ]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('Lesson');
  });
});
