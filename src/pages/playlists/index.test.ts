/* eslint-disable @typescript-eslint/no-unused-vars */
import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mount } from '../../components/ui/test-utils.js';
import type { UiDrawer } from '../../components/ui/drawer.js';
import * as dbService from '../../db/service.js';
import {
  addMedia,
  addMediaToPlaylist,
  createPlaylist,
  removeMediaFromPlaylist,
} from '../../db/service.js';
import { Message } from '../../components/ui/message.js';
import { getAppSettings, setAppSettings } from '../../lib/app-settings.js';
import * as errorReporter from '../../lib/error-reporter.js';
import { resetDatabase } from '../../test/db-helpers.js';
import type { MediaBlob, MediaItem } from '../../types/models.js';
import './index.js';
import type { PlaylistsPage } from './index.js';

type PlaylistsPageHarness = PlaylistsPage & {
  navigate(path: string): void;
  _handleDeletePlaylist(id: string): Promise<void>;
  _handleCreatePlaylist(): Promise<void>;
  _handleMoveEntry(index: number, direction: -1 | 1): Promise<void>;
  _handleMovePlaylist(id: string, direction: -1 | 1): Promise<void>;
  _handleRemoveEntry(mediaId: string): Promise<void>;
  _saveRename(): Promise<void>;
  _newPlaylistName: string;
  _renameValue: string;
  _renaming: boolean;
  _pendingDeletePlaylistId: string;
};

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function makeMedia(id: string, title: string, overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id,
    title,
    filename: `${title}.mp3`,
    size: 1024,
    type: 'audio',
    mimeType: 'audio/mpeg',
    duration: 180,
    createdAt: Date.now(),
    hasSubtitles: true,
    contentHash: `hash-${id}`,
    ...overrides,
  };
}

describe('playlists-page', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(async () => {
    await resetDatabase();
    Message.closeAll();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    Message.closeAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderPage() {
    const result = mount(html`<playlists-page></playlists-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('playlists-page') as PlaylistsPage;
    await el.updateComplete;
    await Promise.resolve();
    await el.updateComplete;
    return el;
  }

  function getDrawer(el: PlaylistsPage): UiDrawer | null {
    return el.shadowRoot?.querySelector('ui-drawer') as UiDrawer | null;
  }

  async function settlePage(el: PlaylistsPage) {
    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
      await el.updateComplete;
      const drawer = getDrawer(el);
      if (drawer) {
        await drawer.updateComplete;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async function waitForText(el: PlaylistsPage, text: string) {
    for (let i = 0; i < 8; i++) {
      const combinedText = `${el.shadowRoot?.textContent ?? ''}${getDrawer(el)?.textContent ?? ''}`;
      if (combinedText.includes(text)) {
        return;
      }
      await settlePage(el);
    }
    const combinedText = `${el.shadowRoot?.textContent ?? ''}${getDrawer(el)?.textContent ?? ''}`;
    expect(combinedText).toContain(text);
  }

  async function openPlaylistDrawer(el: PlaylistsPage, playlistName: string) {
    await settlePage(el);
    const playlistItems = Array.from(el.shadowRoot?.querySelectorAll('.playlist-item') ?? []);
    const targetItem = playlistItems.find((item) => item.textContent?.includes(playlistName));
    const manageButton = targetItem?.querySelector(
      '.playlist-actions ui-button[aria-label="管理"]',
    ) as HTMLElement | null;
    manageButton?.click();
    await settlePage(el);
    return getDrawer(el);
  }

  it('opens the playlist drawer from manage action, renders entries, and closes back to list state', async () => {
    stubMatchMedia(false);
    const media = makeMedia('m1', 'Lesson 1');
    const blob: MediaBlob = { mediaId: media.id, blob: new Blob(['audio']) };
    await addMedia(media, blob);
    const playlist = await createPlaylist('Daily Practice');
    await addMediaToPlaylist(playlist.id, media.id);
    setAppSettings({ lastPlayedPlaylistId: playlist.id });

    const el = await renderPage();
    await settlePage(el);

    const playlistItems = Array.from(el.shadowRoot?.querySelectorAll('.playlist-item') ?? []);
    const targetItem = playlistItems.find((item) => item.textContent?.includes('Daily Practice'));
    expect(targetItem).toBeTruthy();
    const manageButton = targetItem?.querySelector(
      '.playlist-actions ui-button[aria-label="管理"]',
    ) as HTMLElement | null;
    expect(manageButton).toBeTruthy();
    manageButton?.click();
    await settlePage(el);

    const drawer = getDrawer(el);
    expect(drawer).not.toBeNull();
    expect(drawer?.open).toBe(true);
    expect(drawer?.direction).toBe('rtl');

    await waitForText(el, '喜欢');
    await waitForText(el, 'Lesson 1');
    expect(el.shadowRoot?.textContent).toContain('播放列表库');
    expect(el.shadowRoot?.textContent).toContain('喜欢');
    expect(el.shadowRoot?.textContent).toContain('Daily Practice');
    expect(drawer?.textContent).toContain('Lesson 1');
    expect(el.shadowRoot?.textContent).toContain('上次练习');
    expect(drawer?.textContent).not.toContain('上次播放的播放列表');

    drawer?.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false, reason: 'mask' },
        bubbles: true,
        composed: true,
      }),
    );
    await settlePage(el);

    expect(getDrawer(el)?.open).toBe(false);
    expect(el.shadowRoot?.querySelector('.playlist-item.active')).toBeNull();
    expect(getDrawer(el)?.textContent ?? '').not.toContain('Lesson 1');
  });

  it('hides soft-deleted playlist entries from the drawer', async () => {
    stubMatchMedia(false);
    const active = makeMedia('m1', 'Active Lesson');
    const removed = makeMedia('m2', 'Removed Lesson');
    await addMedia(active, { mediaId: active.id, blob: new Blob(['a']) });
    await addMedia(removed, { mediaId: removed.id, blob: new Blob(['b']) });
    const playlist = await createPlaylist('Mixed List');
    await addMediaToPlaylist(playlist.id, active.id);
    await addMediaToPlaylist(playlist.id, removed.id);
    await removeMediaFromPlaylist(playlist.id, removed.id);

    const el = await renderPage();
    await settlePage(el);

    const playlistItems = Array.from(el.shadowRoot?.querySelectorAll('.playlist-item') ?? []);
    const targetItem = playlistItems.find((item) => item.textContent?.includes('Mixed List'));
    const manageButton = targetItem?.querySelector(
      '.playlist-actions ui-button[aria-label="管理"]',
    ) as HTMLElement | null;
    manageButton?.click();
    await settlePage(el);

    const drawer = getDrawer(el);
    await waitForText(el, 'Active Lesson');
    expect(drawer?.textContent).toContain('Active Lesson');
    expect(drawer?.textContent).not.toContain('Removed Lesson');
    expect(drawer?.textContent).not.toContain('已移除');
  });

  it('uses direct practice actions and clears stale last-played state after deletion', async () => {
    stubMatchMedia(false);
    const media = makeMedia('m1', 'Lesson 1');
    const blob: MediaBlob = { mediaId: media.id, blob: new Blob(['audio']) };
    await addMedia(media, blob);
    const playlist = await createPlaylist('Daily Practice');
    await addMediaToPlaylist(playlist.id, media.id);
    setAppSettings({ lastPlayedPlaylistId: playlist.id });

    const el = (await renderPage()) as PlaylistsPageHarness;
    await settlePage(el);

    const navigateSpy = vi.fn();
    el.navigate = navigateSpy;
    const resumeTooltip = Array.from(
      el.shadowRoot?.querySelectorAll('.playlist-actions ui-tooltip') ?? [],
    ).find((tooltip) => (tooltip as { title?: string }).title === '继续练习');
    const resumeButton = resumeTooltip?.querySelector('ui-button') as HTMLElement | undefined;

    expect(resumeButton).toBeTruthy();
    resumeButton?.click();
    expect(navigateSpy).toHaveBeenCalledWith(`/practice?playlistId=${playlist.id}`);

    await el._handleDeletePlaylist(playlist.id);
    await settlePage(el);

    expect(getAppSettings().lastPlayedPlaylistId).toBe('');
    expect(el.shadowRoot?.textContent ?? '').not.toContain('上次练习');
  });

  it('shows a specific message when creating a duplicate playlist name', async () => {
    stubMatchMedia(false);
    await createPlaylist('Daily Practice');
    const warningSpy = vi
      .spyOn(Message, 'warning')
      .mockImplementation(() => ({ close: () => undefined }));
    const errorSpy = vi
      .spyOn(Message, 'error')
      .mockImplementation(() => ({ close: () => undefined }));

    const el = (await renderPage()) as PlaylistsPageHarness;
    el._newPlaylistName = '  Daily Practice ';

    await el._handleCreatePlaylist();

    expect(warningSpy).toHaveBeenCalledWith('该播放列表名称已存在');
    expect(errorSpy).not.toHaveBeenCalledWith('创建失败');

    warningSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('shows init error when loading playlists fails', async () => {
    stubMatchMedia(false);
    vi.spyOn(dbService, 'getPlaylistList').mockRejectedValue(new Error('db down'));
    const reportSpy = vi.spyOn(errorReporter, 'reportError').mockResolvedValue(undefined);

    const el = await renderPage();
    await settlePage(el);

    expect(reportSpy).toHaveBeenCalled();
    expect(el.shadowRoot?.querySelector('ui-alert.error')?.textContent).toContain(
      '加载播放列表失败',
    );
  });

  it('creates a playlist from the toolbar and shows success', async () => {
    stubMatchMedia(false);
    const successSpy = vi.spyOn(Message, 'success');
    const el = (await renderPage()) as PlaylistsPageHarness;
    await settlePage(el);

    const nameInput = el.shadowRoot?.querySelector('.toolbar ui-input') as HTMLElement;
    nameInput.dispatchEvent(
      new CustomEvent('change', {
        detail: { value: 'Morning Drill' },
        bubbles: true,
        composed: true,
      }),
    );
    el.shadowRoot
      ?.querySelector('.toolbar ui-button')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await settlePage(el);

    expect(successSpy).toHaveBeenCalledWith('播放列表已创建');
    expect(el.shadowRoot?.textContent).toContain('Morning Drill');
  });

  it('warns when creating a playlist with an empty name', async () => {
    stubMatchMedia(false);
    const warningSpy = vi.spyOn(Message, 'warning');
    const el = (await renderPage()) as PlaylistsPageHarness;

    await el._handleCreatePlaylist();

    expect(warningSpy).toHaveBeenCalledWith('请输入播放列表名称');
  });

  it('uses bottom drawer direction in compact viewport', async () => {
    stubMatchMedia(true);
    const media = makeMedia('m1', 'Lesson 1');
    await addMedia(media, { mediaId: media.id, blob: new Blob(['audio']) });
    const playlist = await createPlaylist('Compact List');
    await addMediaToPlaylist(playlist.id, media.id);

    const el = await renderPage();
    const drawer = await openPlaylistDrawer(el, 'Compact List');

    expect(el.compact).toBe(true);
    expect(drawer?.direction).toBe('btt');
  });

  it('clears stale last-played playlist id when it no longer exists', async () => {
    stubMatchMedia(false);
    setAppSettings({ lastPlayedPlaylistId: 'missing-playlist-id' });

    const el = await renderPage();
    await settlePage(el);

    expect(getAppSettings().lastPlayedPlaylistId).toBe('');
    expect(el.shadowRoot?.textContent ?? '').not.toContain('上次练习');
  });

  it('renames a user playlist from the drawer', async () => {
    stubMatchMedia(false);
    const playlist = await createPlaylist('Old Name');
    const el = (await renderPage()) as PlaylistsPageHarness;
    await openPlaylistDrawer(el, 'Old Name');

    const renameButton = [...(getDrawer(el)?.querySelectorAll('ui-button') ?? [])].find((button) =>
      button.textContent?.includes('重命名'),
    ) as HTMLElement | undefined;
    renameButton?.click();
    await el.updateComplete;

    const renameInput = getDrawer(el)?.querySelector('.rename-box ui-input') as HTMLElement;
    renameInput.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'New Name' }, bubbles: true, composed: true }),
    );
    const saveButton = [
      ...(getDrawer(el)?.querySelectorAll('.rename-actions ui-button') ?? []),
    ].find((button) => button.textContent?.includes('保存')) as HTMLElement | undefined;
    saveButton?.click();
    await settlePage(el);

    expect(el.shadowRoot?.textContent).toContain('New Name');
    expect(el.shadowRoot?.textContent).not.toContain('Old Name');
  });

  it('cancels rename and restores the previous playlist name', async () => {
    stubMatchMedia(false);
    await createPlaylist('Keep Name');
    const el = (await renderPage()) as PlaylistsPageHarness;
    await openPlaylistDrawer(el, 'Keep Name');

    getDrawer(el)
      ?.querySelector('.detail-actions ui-button')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;

    const renameInput = getDrawer(el)?.querySelector('.rename-box ui-input') as HTMLElement;
    renameInput.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'Temporary' }, bubbles: true, composed: true }),
    );
    getDrawer(el)
      ?.querySelector('.rename-actions ui-button:last-child')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;

    expect(el._renaming).toBe(false);
    expect(el._renameValue).toBe('Keep Name');
    expect(getDrawer(el)?.querySelector('.rename-box')).toBeNull();
  });

  it('warns when saving an empty rename value', async () => {
    stubMatchMedia(false);
    await createPlaylist('Named List');
    const warningSpy = vi.spyOn(Message, 'warning');
    const el = (await renderPage()) as PlaylistsPageHarness;
    await openPlaylistDrawer(el, 'Named List');

    el._renaming = true;
    el._renameValue = '   ';
    await el.updateComplete;
    await el._saveRename();

    expect(warningSpy).toHaveBeenCalledWith('请输入播放列表名称');
  });

  it('shows empty drawer state and warns when practice is requested on an empty playlist', async () => {
    stubMatchMedia(false);
    const playlist = await createPlaylist('Empty List');
    const warningSpy = vi.spyOn(Message, 'warning');
    const el = await renderPage();
    const drawer = await openPlaylistDrawer(el, 'Empty List');

    expect(drawer?.textContent).toContain('播放列表为空');
    getDrawer(el)
      ?.querySelector('.drawer-footer ui-button')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(warningSpy).toHaveBeenCalledWith('当前播放列表为空，请先添加媒体。');

    const navigateSpy = vi.spyOn(el, 'navigate').mockImplementation(() => undefined);
    const listPracticeButton = el.shadowRoot?.querySelector(
      '.playlist-item .playlist-actions ui-tooltip[title="开始练习"] ui-button',
    ) as HTMLElement | undefined;
    listPracticeButton?.click();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('navigates to practice for a specific playlist entry', async () => {
    stubMatchMedia(false);
    const media = makeMedia('m1', 'Lesson 1');
    await addMedia(media, { mediaId: media.id, blob: new Blob(['audio']) });
    const playlist = await createPlaylist('Entry List');
    await addMediaToPlaylist(playlist.id, media.id);

    const el = await renderPage();
    await openPlaylistDrawer(el, 'Entry List');
    const navigateSpy = vi.spyOn(el, 'navigate').mockImplementation(() => undefined);

    getDrawer(el)
      ?.querySelector('.entry-actions ui-button')
      ?.dispatchEvent(new Event('click', { bubbles: true }));

    expect(navigateSpy).toHaveBeenCalledWith(
      `/practice?playlistId=${playlist.id}&mediaId=${media.id}`,
    );
  });

  it('removes a media entry from the playlist after confirm', async () => {
    stubMatchMedia(false);
    const media = makeMedia('m1', 'Lesson 1');
    await addMedia(media, { mediaId: media.id, blob: new Blob(['audio']) });
    const playlist = await createPlaylist('Removable List');
    await addMediaToPlaylist(playlist.id, media.id);

    const el = await renderPage();
    await openPlaylistDrawer(el, 'Removable List');
    const successSpy = vi.spyOn(Message, 'success');

    getDrawer(el)
      ?.querySelector('ui-popconfirm')
      ?.dispatchEvent(new Event('confirm', { bubbles: true, composed: true }));
    await settlePage(el);

    expect(successSpy).toHaveBeenCalledWith('已从播放列表移除');
    expect(getDrawer(el)?.textContent).toContain('播放列表为空');
  });

  it('shows missing media fallback and video metadata in the drawer', async () => {
    stubMatchMedia(false);
    const video = makeMedia('v1', 'Clip One', {
      type: 'video',
      mimeType: 'video/mp4',
      filename: 'Clip One.mp4',
      hasSubtitles: true,
    });
    await addMedia(video, { mediaId: video.id, blob: new Blob(['video']) });
    const playlist = await createPlaylist('Media Types');
    await addMediaToPlaylist(playlist.id, video.id);
    await addMediaToPlaylist(playlist.id, 'missing-media-id');

    const el = await renderPage();
    const drawer = await openPlaylistDrawer(el, 'Media Types');

    expect(drawer?.textContent).toContain('Clip One');
    expect(drawer?.textContent).toContain('(未知媒体)');
    expect(drawer?.textContent).toContain('媒体已不存在');
  });

  it('reports delete failures and keeps the playlist visible', async () => {
    stubMatchMedia(false);
    const playlist = await createPlaylist('Delete Fail');
    vi.spyOn(dbService, 'deletePlaylist').mockRejectedValue(new Error('delete failed'));
    const errorSpy = vi.spyOn(Message, 'error');
    const el = await renderPage();
    await openPlaylistDrawer(el, 'Delete Fail');

    getDrawer(el)
      ?.querySelector('.detail-actions ui-button[variant="danger"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;

    el.shadowRoot
      ?.querySelector('ui-modal')
      ?.dispatchEvent(new Event('ok', { bubbles: true, composed: true }));
    await settlePage(el);

    expect(errorSpy).toHaveBeenCalledWith('删除失败');
    expect(el.shadowRoot?.textContent).toContain('Delete Fail');
  });

  it('reports load detail failures from the drawer', async () => {
    stubMatchMedia(false);
    const playlist = await createPlaylist('Broken Detail');
    vi.spyOn(dbService, 'getPlaylist').mockRejectedValue(new Error('detail failed'));
    const errorSpy = vi.spyOn(Message, 'error');

    const el = await renderPage();
    await openPlaylistDrawer(el, 'Broken Detail');

    expect(errorSpy).toHaveBeenCalledWith('加载播放列表详情失败');
  });

  it('reorders a user playlist through the overflow menu', async () => {
    stubMatchMedia(false);
    await createPlaylist('Alpha');
    await createPlaylist('Beta');
    const el = await renderPage();
    await settlePage(el);

    const betaItem = [...(el.shadowRoot?.querySelectorAll('.playlist-item') ?? [])].find((item) =>
      item.textContent?.includes('Beta'),
    );
    const dropdown = betaItem?.querySelector('ui-dropdown') as HTMLElement | undefined;
    dropdown?.dispatchEvent(
      new CustomEvent('menu-click', { detail: { key: 'move-up' }, bubbles: true, composed: true }),
    );
    await settlePage(el);

    const names = [...(el.shadowRoot?.querySelectorAll('.playlist-name') ?? [])].map(
      (node) => node.textContent?.trim() ?? '',
    );
    expect(names.indexOf('Beta')).toBeLessThan(names.indexOf('Alpha'));
    expect(names.indexOf('喜欢')).toBe(0);
  });

  it('deletes a playlist through the confirmation modal', async () => {
    stubMatchMedia(false);
    const playlist = await createPlaylist('Gone Soon');
    const el = await renderPage();
    await openPlaylistDrawer(el, 'Gone Soon');

    getDrawer(el)
      ?.querySelector('.detail-actions ui-button[variant="danger"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;

    el.shadowRoot
      ?.querySelector('ui-modal')
      ?.dispatchEvent(new Event('ok', { bubbles: true, composed: true }));
    await settlePage(el);

    expect(el.shadowRoot?.textContent ?? '').not.toContain('Gone Soon');
    expect(getDrawer(el)?.open).toBe(false);
  });

  it('reorders playlist entries through the overflow menu', async () => {
    stubMatchMedia(false);
    const first = makeMedia('m1', 'First');
    const second = makeMedia('m2', 'Second');
    await addMedia(first, { mediaId: first.id, blob: new Blob(['a']) });
    await addMedia(second, { mediaId: second.id, blob: new Blob(['b']) });
    const playlist = await createPlaylist('Reorder Entries');
    await addMediaToPlaylist(playlist.id, first.id);
    await addMediaToPlaylist(playlist.id, second.id);

    const el = await renderPage();
    await openPlaylistDrawer(el, 'Reorder Entries');

    getDrawer(el)
      ?.querySelector('ui-dropdown')
      ?.dispatchEvent(
        new CustomEvent('menu-click', {
          detail: { key: 'move-down' },
          bubbles: true,
          composed: true,
        }),
      );
    await settlePage(el);

    const titles = [...(getDrawer(el)?.querySelectorAll('.entry-title') ?? [])].map(
      (node) => node.textContent?.trim() ?? '',
    );
    expect(titles[0]).toContain('Second');
    expect(titles[1]).toContain('First');
  });

  it('opens delete confirmation from playlist overflow menu', async () => {
    stubMatchMedia(false);
    const playlist = await createPlaylist('Menu Delete');
    const el = await renderPage();
    await settlePage(el);

    const item = [...(el.shadowRoot?.querySelectorAll('.playlist-item') ?? [])].find((node) =>
      node.textContent?.includes('Menu Delete'),
    );
    item
      ?.querySelector('ui-dropdown')
      ?.dispatchEvent(
        new CustomEvent('menu-click', { detail: { key: 'delete' }, bubbles: true, composed: true }),
      );
    await el.updateComplete;

    const modal = el.shadowRoot?.querySelector('ui-modal');
    expect(modal).not.toBeNull();
    expect(modal?.getAttribute('title')).toContain('确定删除该播放列表吗？');
    expect((el as PlaylistsPageHarness)._pendingDeletePlaylistId).toBe(playlist.id);
  });

  it('reports generic create and rename failures', async () => {
    stubMatchMedia(false);
    vi.spyOn(dbService, 'createPlaylist').mockRejectedValue(new Error('create failed'));
    const createErrorSpy = vi.spyOn(Message, 'error');
    const el = (await renderPage()) as PlaylistsPageHarness;
    el._newPlaylistName = 'Broken';
    await el._handleCreatePlaylist();
    expect(createErrorSpy).toHaveBeenCalledWith('创建失败');

    vi.restoreAllMocks();
    stubMatchMedia(false);
    await createPlaylist('Rename Fail');
    vi.spyOn(dbService, 'updatePlaylist').mockRejectedValue(new Error('rename failed'));
    const renameErrorSpy = vi.spyOn(Message, 'error');
    const el2 = (await renderPage()) as PlaylistsPageHarness;
    await openPlaylistDrawer(el2, 'Rename Fail');
    el2._renaming = true;
    el2._renameValue = 'New Name';
    await el2._saveRename();
    expect(renameErrorSpy).toHaveBeenCalledWith('更新失败');
  });

  it('warns on rename name conflict', async () => {
    stubMatchMedia(false);
    await createPlaylist('Alpha');
    await createPlaylist('Beta');
    const warningSpy = vi.spyOn(Message, 'warning');
    const el = (await renderPage()) as PlaylistsPageHarness;
    await openPlaylistDrawer(el, 'Beta');
    el._renaming = true;
    el._renameValue = 'Alpha';
    await el._saveRename();
    expect(warningSpy).toHaveBeenCalledWith('该播放列表名称已存在');
  });

  it('reports move and remove failures', async () => {
    stubMatchMedia(false);
    const first = makeMedia('m1', 'Lesson 1');
    const second = makeMedia('m2', 'Lesson 2');
    await addMedia(first, { mediaId: first.id, blob: new Blob(['audio']) });
    await addMedia(second, { mediaId: second.id, blob: new Blob(['audio']) });
    const playlist = await createPlaylist('Fail Ops');
    await addMediaToPlaylist(playlist.id, first.id);
    await addMediaToPlaylist(playlist.id, second.id);
    await createPlaylist('Other');

    const el = (await renderPage()) as PlaylistsPageHarness;
    await openPlaylistDrawer(el, 'Fail Ops');

    vi.spyOn(dbService, 'setPlaylistEntryOrder').mockRejectedValue(new Error('move entry'));
    const moveEntryErrorSpy = vi.spyOn(Message, 'error');
    await el._handleMoveEntry(0, 1);
    expect(moveEntryErrorSpy).toHaveBeenCalledWith('调整顺序失败');

    vi.spyOn(dbService, 'removeMediaFromPlaylist').mockRejectedValue(new Error('remove'));
    await el._handleRemoveEntry(first.id);
    expect(moveEntryErrorSpy).toHaveBeenCalledWith('移除失败');

    vi.spyOn(dbService, 'reorderPlaylists').mockRejectedValue(new Error('move playlist'));
    await el._handleMovePlaylist(playlist.id, 1);
    expect(moveEntryErrorSpy).toHaveBeenCalledWith('调整顺序失败');
  });
});
