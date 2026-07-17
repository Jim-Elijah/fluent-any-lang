import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mount } from '../../components/ui/test-utils.js';
import type { UiDrawer } from '../../components/ui/drawer.js';
import {
  addMedia,
  addMediaToPlaylist,
  createPlaylist,
  removeMediaFromPlaylist,
} from '../../db/service.js';
import { Message } from '../../components/ui/message.js';
import { getAppSettings, setAppSettings } from '../../lib/app-settings.js';
import { resetDatabase } from '../../test/db-helpers.js';
import type { MediaBlob, MediaItem } from '../../types/models.js';
import './index.js';
import type { PlaylistsPage } from './index.js';

type PlaylistsPageHarness = PlaylistsPage & {
  navigate(path: string): void;
  _handleDeletePlaylist(id: string): Promise<void>;
  _handleCreatePlaylist(): Promise<void>;
  _newPlaylistName: string;
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

function makeMedia(id: string, title: string): MediaItem {
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
  };
}

describe('playlists-page', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
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
    el._newPlaylistName = '  daily practice ';

    await el._handleCreatePlaylist();

    expect(warningSpy).toHaveBeenCalledWith('该播放列表名称已存在');
    expect(errorSpy).not.toHaveBeenCalledWith('创建失败');
  });
});
