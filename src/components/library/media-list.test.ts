import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MediaItem } from '../../types/models.js';

const mockGetMediaList = vi.fn<() => Promise<MediaItem[]>>();

vi.mock('../../db/service.js', () => ({
  getMediaList: (...args: unknown[]) => mockGetMediaList(...args),
  deleteMedia: vi.fn(),
  deleteSubtitle: vi.fn(),
}));

import './media-list.js';
import type { MediaList } from './media-list.js';
import { mount } from '../ui/test-utils.js';

describe('media-list', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    mockGetMediaList.mockReset();
    mockGetMediaList.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderList() {
    const result = mount(html`<media-list></media-list>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('media-list') as MediaList;
    await el.updateComplete;
    return el;
  }

  it('renders empty state after loading', async () => {
    const el = await renderList();
    await el.refresh();
    await el.updateComplete;
    expect(el.shadowRoot?.textContent).toContain('暂无内容');
  });

  it('lists media after refresh', async () => {
    mockGetMediaList.mockResolvedValue([
      {
        id: 'media-1',
        title: 'Lesson',
        filename: 'lesson.mp3',
        size: 10,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: 12,
        createdAt: 1,
        hasSubtitles: false,
      },
    ]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('Lesson');
  });
});
