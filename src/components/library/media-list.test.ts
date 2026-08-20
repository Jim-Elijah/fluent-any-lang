import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as mediaDb from '../../db/media.js';
import * as subtitleDb from '../../db/subtitle.js';
import * as playlistDb from '../../db/playlist.js';
import { PlaylistNameConflictError } from '../../db/playlist.js';
import * as importContent from '../../lib/import-content.js';
import { NARROW_VIEWPORT_MQ } from '../../lib/layout-compact.js';
import type { PendingSubtitleImport } from '../../lib/subtitle-import-helpers.js';
import { FAVORITES_PLAYLIST_ID, type MediaItem, type SubtitleTrack } from '../../types/models.js';
import { flushUpdates, mount } from '../ui/test-utils.js';
import { Message } from '../ui/message.js';

import './media-list.js';
import type { MediaList } from './media-list.js';

type MediaListHarness = MediaList & {
  _handleDelete(item: MediaItem): Promise<void>;
  _handleAddToPlaylist(e: CustomEvent<{ key: string }>, media: MediaItem): Promise<void>;
  _handleToggleFavorite(media: MediaItem): Promise<void>;
  _openCreatePlaylistModal(mediaId: string): void;
  _createPlaylistName: string;
  _submitCreatePlaylistAndAdd(): Promise<void>;
  _handleSubtitleFile(event: Event): Promise<void>;
  _pendingSubtitleMediaId: string;
  _pendingSubtitleOverwrite: boolean;
  _pendingMismatchImport: PendingSubtitleImport | null;
  _confirmMismatchImport(): Promise<void>;
  _mismatchConfirmOpen: boolean;
  _narrow: boolean;
  _onNarrowMqChange: (event: MediaQueryListEvent) => void;
};

function makeMedia(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
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
    ...overrides,
  };
}

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
    vi.spyOn(playlistDb, 'createPlaylist').mockResolvedValue({
      id: 'playlist-new',
      name: 'New List',
      kind: 'user',
      sortOrder: 2,
      entries: [],
      createdAt: 1,
      updatedAt: 1,
    });
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
    expect(dropdown.menu?.items?.[0]).toEqual(
      expect.objectContaining({
        key: '__create__',
        label: expect.stringContaining('新建播放列表'),
      }),
    );
    expect(dropdown.menu?.items).toEqual([
      expect.objectContaining({ key: '__create__' }),
      expect.objectContaining({ type: 'divider' }),
      expect.objectContaining({ key: 'playlist-1', label: expect.stringContaining('晨读') }),
    ]);
    expect(dropdown.menu?.items?.some((item) => item.key === FAVORITES_PLAYLIST_ID)).toBe(false);
  });

  it('shows create-playlist option when no user playlists exist', async () => {
    vi.mocked(playlistDb.getPlaylistList).mockResolvedValue([
      {
        id: FAVORITES_PLAYLIST_ID,
        name: '喜欢',
        kind: 'favorites',
        sortOrder: 0,
        entries: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
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

    const dropdown = el.shadowRoot?.querySelector('ui-dropdown') as HTMLElement & {
      menu?: { items?: Array<{ key: string; label: string }> };
    };
    expect(dropdown.menu?.items).toEqual([
      expect.objectContaining({
        key: '__create__',
        label: expect.stringContaining('新建播放列表'),
      }),
    ]);
  });

  it('creates playlist and adds media from modal', async () => {
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

    (
      el as MediaList & { _openCreatePlaylistModal(mediaId: string): void }
    )._openCreatePlaylistModal('media-1');
    await el.updateComplete;

    const modal = el.shadowRoot?.querySelector('ui-modal') as HTMLElement & { open?: boolean };
    expect(modal?.open).toBe(true);

    (el as MediaList & { _createPlaylistName: string })._createPlaylistName = 'Daily';
    await (
      el as MediaList & { _submitCreatePlaylistAndAdd(): Promise<void> }
    )._submitCreatePlaylistAndAdd();
    await el.updateComplete;

    expect(playlistDb.createPlaylist).toHaveBeenCalledWith('Daily');
    expect(playlistDb.addMediaToPlaylist).toHaveBeenCalledWith('playlist-new', 'media-1');
    expect(modal?.open).toBe(false);
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

  function getTitles(el: MediaList): string[] {
    return [...(el.shadowRoot?.querySelectorAll('.title') ?? [])].map(
      (node) => node.textContent?.trim() ?? '',
    );
  }

  it('filters items by keyword', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([
      makeMedia({ id: 'a', title: 'Alpha Lesson' }),
      makeMedia({ id: 'b', title: 'Beta Rain', createdAt: 2 }),
    ]);
    const el = await renderList(html`<media-list keyword="rain"></media-list>`);
    await el.refresh();
    await el.updateComplete;

    expect(getTitles(el)).toEqual(['Beta Rain']);
    expect(el.shadowRoot?.textContent).toMatch(/1\s*项/);
  });

  it('shows no-match empty message when keyword filters everything out', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia()]);
    const el = await renderList(html`<media-list keyword="missing"></media-list>`);
    await el.refresh();
    await el.updateComplete;
    expect(el.shadowRoot?.textContent).toContain('无匹配内容');
  });

  it('sorts items by title and date from parent props', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([
      makeMedia({ id: 'a', title: 'Zulu', createdAt: 100 }),
      makeMedia({ id: 'b', title: 'Alpha', createdAt: 200 }),
    ]);
    const el = await renderList(html`<media-list sortBy="title" sortDirection="asc"></media-list>`);
    await el.refresh();
    await el.updateComplete;
    expect(getTitles(el)).toEqual(['Alpha', 'Zulu']);

    el.sortBy = 'date';
    el.sortDirection = 'asc';
    await el.updateComplete;
    expect(getTitles(el)).toEqual(['Zulu', 'Alpha']);
  });

  it('shows load error when refresh fails', async () => {
    vi.mocked(mediaDb.getMediaList).mockRejectedValue(new Error('db down'));
    const el = await renderList();
    await el.refresh();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('ui-alert')?.textContent).toContain('无法加载媒体库');
  });

  it('deletes media after confirm and dispatches media-deleted', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia()]);
    const el = (await renderList()) as MediaListHarness;
    await el.refresh();
    await el.updateComplete;
    const deleted = vi.fn();
    el.addEventListener('media-deleted', deleted);

    el.shadowRoot
      ?.querySelector('ui-popconfirm')
      ?.dispatchEvent(new Event('confirm', { bubbles: true, composed: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(mediaDb.deleteMedia).toHaveBeenCalledWith('media-1');
    expect(subtitleDb.deleteSubtitle).toHaveBeenCalledWith('media-1');
    expect(deleted).toHaveBeenCalled();
    expect(getTitles(el)).toEqual([]);
  });

  it('shows delete error when removal fails', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia()]);
    vi.mocked(mediaDb.deleteMedia).mockRejectedValue(new Error('delete fail'));
    const el = (await renderList()) as MediaListHarness;
    await el.refresh();
    await el.updateComplete;
    const errorSpy = vi.spyOn(Message, 'error');

    el.shadowRoot
      ?.querySelector('ui-popconfirm')
      ?.dispatchEvent(new Event('confirm', { bubbles: true, composed: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.querySelector('ui-alert')?.textContent).toContain('删除失败');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('dispatches media-selected when practice is clicked', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia()]);
    const el = await renderList();
    await el.refresh();
    await el.updateComplete;
    const selected = vi.fn();
    el.addEventListener('media-selected', selected);

    const practiceButton = el.shadowRoot?.querySelector(
      'ui-button[aria-label="练习"]',
    ) as HTMLElement | null;
    practiceButton?.click();
    await el.updateComplete;

    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ detail: { id: 'media-1' } }));
  });

  it('toggles favorite state and notifies playlist change', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia()]);
    vi.mocked(playlistDb.toggleFavorites).mockResolvedValue(true);
    const el = (await renderList()) as MediaListHarness;
    await el.refresh();
    await el.updateComplete;
    const changed = vi.fn();
    el.addEventListener('playlist-changed', changed);
    const successSpy = vi.spyOn(Message, 'success');

    await el._handleToggleFavorite(makeMedia());
    await el.updateComplete;

    expect(playlistDb.toggleFavorites).toHaveBeenCalledWith('media-1');
    expect(changed).toHaveBeenCalled();
    expect(successSpy).toHaveBeenCalled();
  });

  it('adds media to an existing playlist from the dropdown', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia()]);
    const el = (await renderList()) as MediaListHarness;
    await el.refresh();
    await el.updateComplete;
    const changed = vi.fn();
    el.addEventListener('playlist-changed', changed);
    const successSpy = vi.spyOn(Message, 'success');

    await el._handleAddToPlaylist(
      new CustomEvent('menu-click', { detail: { key: 'playlist-1' } }),
      makeMedia(),
    );
    await el.updateComplete;

    expect(playlistDb.addMediaToPlaylist).toHaveBeenCalledWith('playlist-1', 'media-1');
    expect(changed).toHaveBeenCalled();
    expect(successSpy).toHaveBeenCalled();
  });

  it('uses fill-height layout for the virtual grid container', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia()]);
    const el = await renderList(html`<media-list fill-height></media-list>`);
    await el.refresh();
    await el.updateComplete;

    expect(el.hasAttribute('fill-height')).toBe(true);
    const grid = el.shadowRoot?.querySelector('ui-virtual-grid') as
      | { containerHeight?: string }
      | null
      | undefined;
    expect(grid?.containerHeight).toBe('100%');
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
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia()]);

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    const grid = el.shadowRoot?.querySelector('ui-virtual-grid') as
      | { itemHeight?: number }
      | null
      | undefined;
    expect(grid?.itemHeight).toBe(100);
  });

  it('updates row height when narrow viewport MQ changes', async () => {
    let mqListener: ((event: MediaQueryListEvent) => void) | undefined;
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event, listener) => {
        if (query === NARROW_VIEWPORT_MQ) {
          mqListener = listener as (event: MediaQueryListEvent) => void;
        }
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia()]);

    const el = (await renderList()) as MediaListHarness;
    await el.refresh();
    await el.updateComplete;
    expect(el._narrow).toBe(false);

    mqListener?.({ matches: true } as MediaQueryListEvent);
    await el.updateComplete;
    expect(el._narrow).toBe(true);
  });

  it('marks favorites from playlist entries on refresh', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia()]);
    vi.mocked(playlistDb.getPlaylist).mockResolvedValue({
      id: FAVORITES_PLAYLIST_ID,
      name: '喜欢',
      kind: 'favorites',
      sortOrder: 0,
      entries: [{ mediaId: 'media-1', addedAt: 1, removed: false }],
      createdAt: 1,
      updatedAt: 1,
    });

    const el = await renderList();
    await el.refresh();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.favorite-btn.active')).not.toBeNull();
  });

  it('warns when creating a playlist with an empty name', async () => {
    const el = (await renderList()) as MediaListHarness;
    const warningSpy = vi.spyOn(Message, 'warning');

    el._openCreatePlaylistModal('media-1');
    el._createPlaylistName = '   ';
    await el._submitCreatePlaylistAndAdd();

    expect(warningSpy).toHaveBeenCalled();
    expect(playlistDb.createPlaylist).not.toHaveBeenCalled();
  });

  it('warns when playlist name conflicts on create', async () => {
    vi.mocked(playlistDb.createPlaylist).mockRejectedValue(new PlaylistNameConflictError('Daily'));
    const el = (await renderList()) as MediaListHarness;
    const warningSpy = vi.spyOn(Message, 'warning');

    el._openCreatePlaylistModal('media-1');
    el._createPlaylistName = 'Daily';
    await el._submitCreatePlaylistAndAdd();

    expect(warningSpy).toHaveBeenCalledWith(expect.stringContaining('已存在'));
  });

  it('shows create error when playlist creation fails unexpectedly', async () => {
    vi.mocked(playlistDb.createPlaylist).mockRejectedValue(new Error('db fail'));
    const el = (await renderList()) as MediaListHarness;
    const errorSpy = vi.spyOn(Message, 'error');

    el._openCreatePlaylistModal('media-1');
    el._createPlaylistName = 'Daily';
    await el._submitCreatePlaylistAndAdd();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('创建失败'));
  });

  it('opens create-playlist modal from dropdown create action', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia()]);
    const el = (await renderList()) as MediaListHarness;
    await el.refresh();
    await el.updateComplete;

    await el._handleAddToPlaylist(
      new CustomEvent('menu-click', { detail: { key: '__create__' } }),
      makeMedia(),
    );
    await el.updateComplete;

    const modal = el.shadowRoot?.querySelector('ui-modal') as HTMLElement & { open?: boolean };
    expect(modal?.open).toBe(true);
  });

  it('shows add-to-playlist error when insertion fails', async () => {
    vi.mocked(playlistDb.addMediaToPlaylist).mockRejectedValue(new Error('add fail'));
    const el = (await renderList()) as MediaListHarness;
    const errorSpy = vi.spyOn(Message, 'error');
    await el.refresh();
    await el.updateComplete;

    await el._handleAddToPlaylist(
      new CustomEvent('menu-click', { detail: { key: 'playlist-1' } }),
      makeMedia(),
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('添加失败'));
  });

  it('shows favorite error when toggle fails', async () => {
    vi.mocked(playlistDb.toggleFavorites).mockRejectedValue(new Error('toggle fail'));
    const el = (await renderList()) as MediaListHarness;
    const errorSpy = vi.spyOn(Message, 'error');
    await el.refresh();
    await el.updateComplete;

    await el._handleToggleFavorite(makeMedia());

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('操作失败'));
  });

  it('shows unfavorite success message when removing from favorites', async () => {
    vi.mocked(playlistDb.toggleFavorites).mockResolvedValue(false);
    const el = (await renderList()) as MediaListHarness;
    const successSpy = vi.spyOn(Message, 'success');

    await el._handleToggleFavorite(makeMedia());

    expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('移除'));
  });

  function makeSubtitleTrack(): SubtitleTrack {
    return {
      id: 'sub-1',
      mediaId: 'media-1',
      title: 'lesson',
      filename: 'lesson.srt',
      type: 'srt',
      contentHash: 'hash-sub',
      segments: [{ id: 's1', startTime: 0, endTime: 2, text: 'hi' }],
    };
  }

  async function dispatchSubtitleFile(
    el: MediaListHarness,
    file: File,
    mediaId = 'media-1',
    overwrite = false,
  ): Promise<void> {
    el._pendingSubtitleMediaId = mediaId;
    el._pendingSubtitleOverwrite = overwrite;
    const input = el.shadowRoot!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await el._handleSubtitleFile({ target: input } as unknown as Event);
    await el.updateComplete;
    await flushUpdates();
  }

  it('imports subtitle file and updates media row', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia({ hasSubtitles: false })]);
    vi.spyOn(importContent, 'importSubtitleForMedia').mockResolvedValue({
      imported: [makeSubtitleTrack()],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    });
    const el = (await renderList()) as MediaListHarness;
    const imported = vi.fn();
    el.addEventListener('subtitle-imported', imported);
    const successSpy = vi.spyOn(Message, 'success');
    await el.refresh();
    await el.updateComplete;

    await dispatchSubtitleFile(el, new File(['1'], 'lesson.srt', { type: 'application/x-subrip' }));

    expect(importContent.importSubtitleForMedia).toHaveBeenCalledWith(
      'media-1',
      expect.any(File),
      {},
    );
    expect(successSpy).toHaveBeenCalled();
    expect(imported).toHaveBeenCalled();
    expect(el.shadowRoot?.querySelector('ui-icon[name="subtitle-on"]')).not.toBeNull();
  });

  it('reports subtitle import diagnostics from result payload', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia({ hasSubtitles: false })]);
    vi.spyOn(importContent, 'importSubtitleForMedia').mockResolvedValue({
      imported: [],
      errors: [{ filename: 'bad.srt', message: 'parse error' }],
      warnings: [{ filename: 'warn.srt', message: 'gap' }],
      skipped: [{ filename: 'skip.srt', message: 'duplicate' }],
      conflicts: [{ filename: 'old.srt', message: 'conflict msg' }],
    });
    const el = (await renderList()) as MediaListHarness;
    const errorSpy = vi.spyOn(Message, 'error');
    const warningSpy = vi.spyOn(Message, 'warning');
    const infoSpy = vi.spyOn(Message, 'info');
    await el.refresh();
    await el.updateComplete;

    await dispatchSubtitleFile(el, new File(['1'], 'lesson.srt', { type: 'application/x-subrip' }));

    expect(errorSpy).toHaveBeenCalled();
    expect(warningSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(2);
  });

  it('updates subtitle with overwrite when media already has subtitles', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia({ hasSubtitles: true })]);
    vi.spyOn(importContent, 'importSubtitleForMedia').mockResolvedValue({
      imported: [makeSubtitleTrack()],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    });
    const el = (await renderList()) as MediaListHarness;
    await el.refresh();
    await el.updateComplete;

    const button = el.shadowRoot?.querySelector('ui-button[aria-label="更新字幕"]');
    expect(button).not.toBeNull();
    await dispatchSubtitleFile(
      el,
      new File(['1'], 'lesson.srt', { type: 'application/x-subrip' }),
      'media-1',
      true,
    );

    expect(importContent.importSubtitleForMedia).toHaveBeenCalledWith(
      'media-1',
      expect.any(File),
      { overwrite: true },
    );
  });

  it('prompts before importing mismatched subtitle filename', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia({ hasSubtitles: false })]);
    vi.spyOn(importContent, 'importSubtitleForMedia').mockResolvedValue({
      imported: [],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    });
    const el = (await renderList()) as MediaListHarness;
    await el.refresh();
    await el.updateComplete;

    await dispatchSubtitleFile(
      el,
      new File(['1'], 'different.srt', { type: 'application/x-subrip' }),
      'media-1',
    );

    expect(importContent.importSubtitleForMedia).not.toHaveBeenCalled();
    const modal = el.shadowRoot?.querySelectorAll('ui-modal')[1] as HTMLElement & {
      open?: boolean;
    };
    expect(modal?.open).toBe(true);
  });

  it('imports mismatched subtitle after confirmation', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia({ hasSubtitles: false })]);
    vi.spyOn(importContent, 'importSubtitleForMedia').mockResolvedValue({
      imported: [makeSubtitleTrack()],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    });
    const el = (await renderList()) as MediaListHarness;
    await el.refresh();
    await el.updateComplete;

    await dispatchSubtitleFile(
      el,
      new File(['1'], 'different.srt', { type: 'application/x-subrip' }),
      'media-1',
    );
    await el._confirmMismatchImport();
    await el.updateComplete;
    await flushUpdates();

    expect(importContent.importSubtitleForMedia).toHaveBeenCalledWith(
      'media-1',
      expect.any(File),
      {},
    );
  });

  it('shows subtitle import error when import throws', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([makeMedia({ hasSubtitles: false })]);
    vi.spyOn(importContent, 'importSubtitleForMedia').mockRejectedValue(new Error('import fail'));
    const el = (await renderList()) as MediaListHarness;
    const errorSpy = vi.spyOn(Message, 'error');
    await el.refresh();
    await el.updateComplete;

    await dispatchSubtitleFile(el, new File(['1'], 'lesson.srt', { type: 'application/x-subrip' }));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('导入字幕失败') }),
    );
  });

  it('dispatches list-metrics after rendering items', async () => {
    vi.mocked(mediaDb.getMediaList).mockResolvedValue([
      makeMedia({ id: 'a', title: 'Alpha' }),
      makeMedia({ id: 'b', title: 'Beta', createdAt: 2 }),
    ]);
    const el = await renderList();
    const metrics = vi.fn();
    el.addEventListener('list-metrics', metrics);
    await el.refresh();
    await el.updateComplete;
    await flushUpdates();

    expect(metrics).toHaveBeenCalled();
    expect(metrics.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        detail: expect.objectContaining({ itemCount: 2 }),
      }),
    );
  });
});
