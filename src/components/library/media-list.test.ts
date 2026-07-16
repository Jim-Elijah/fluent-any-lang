import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as mediaDb from '../../db/media.js';
import * as subtitleDb from '../../db/subtitle.js';
import * as playlistDb from '../../db/playlist.js';
import { FAVORITES_PLAYLIST_ID } from '../../types/models.js';

import './media-list.js';
import type { MediaList } from './media-list.js';
import { mount } from '../ui/test-utils.js';

describe('media-list', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.spyOn(mediaDb, 'getMediaList').mockResolvedValue([]);
    vi.spyOn(mediaDb, 'deleteMedia').mockResolvedValue(undefined as never);
    vi.spyOn(subtitleDb, 'deleteSubtitle').mockResolvedValue(undefined as never);
    vi.spyOn(playlistDb, 'getPlaylistList').mockResolvedValue([
      {
        id: FAVORITES_PLAYLIST_ID,
        name: '喜欢',
        kind: 'favorites',
        sortOrder: 0,
        entries: [],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'playlist-1',
        name: '晨读',
        kind: 'user',
        sortOrder: 1,
        entries: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    vi.spyOn(playlistDb, 'getPlaylist').mockResolvedValue({
      id: FAVORITES_PLAYLIST_ID,
      name: '喜欢',
      kind: 'favorites',
      sortOrder: 0,
      entries: [],
      createdAt: 1,
      updatedAt: 1,
    });
    vi.spyOn(playlistDb, 'addMediaToPlaylist').mockResolvedValue(null);
    vi.spyOn(playlistDb, 'toggleFavorites').mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
  });

  async function renderList(template = html`<media-list></media-list>`) {
    const result = mount(template);
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
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([
      {
        id: 'media-1',
        title: 'Lesson',
        filename: 'lesson.mp3',
        size: 10,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: 12,
        createdAt: 1,
        contentHash: 'hash',
        hasSubtitles: false,
      },
    ]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    expect(mediaDb.getMediaList).toHaveBeenCalled();
    expect(el.shadowRoot?.textContent).toContain('Lesson');
  });

  it('shows add-to-playlist dropdown with user playlists only', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([
      {
        id: 'media-1',
        title: 'Lesson',
        filename: 'lesson.mp3',
        size: 10,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: 12,
        createdAt: 1,
        contentHash: 'hash',
        hasSubtitles: true,
      },
    ]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    const moreBtn = el.shadowRoot?.querySelector(
      'ui-dropdown ui-button[aria-label="加入播放列表"]',
    );
    expect(moreBtn).not.toBeNull();

    const dropdown = el.shadowRoot?.querySelector('ui-dropdown') as HTMLElement & {
      menu?: { items?: Array<{ key: string; label: string }> };
    };
    expect(dropdown.menu?.items).toEqual([
      expect.objectContaining({ key: 'playlist-1', label: expect.stringContaining('晨读') }),
    ]);
    expect(dropdown.menu?.items?.some((item) => item.key === FAVORITES_PLAYLIST_ID)).toBe(false);
  });

  it('limits rendered items when limit is set', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        id: `media-${i}`,
        title: `Lesson ${i}`,
        filename: `lesson-${i}.mp3`,
        size: 10,
        type: 'audio' as const,
        mimeType: 'audio/mpeg',
        duration: 12,
        createdAt: 100 - i,
        contentHash: `hash-${i}`,
        hasSubtitles: false,
      })),
    );

    const el = await renderList(html`<media-list .limit=${10}></media-list>`);
    await el.refresh();
    await el.updateComplete;

    const grid = el.shadowRoot?.querySelector('ui-virtual-grid') as
      | { items?: unknown[] }
      | null
      | undefined;
    expect(grid?.items).toHaveLength(10);
    expect(el.shadowRoot?.textContent).toMatch(/10\s/);
  });
});
