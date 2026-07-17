import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { navigator } from 'lit-element-router';

import {
  createPlaylist,
  deletePlaylist,
  getMedia,
  getPlaylist,
  getPlaylistList,
  isPlaylistNameConflictError,
  removeMediaFromPlaylist,
  reorderPlaylists,
  setPlaylistEntryOrder,
  updatePlaylist,
} from '../../db/service.js';
import { reportError } from '../../lib/error-reporter.js';
import { getAppSettings, setAppSettings } from '../../lib/app-settings.js';
import { COMPACT_VIEWPORT_MQ } from '../../lib/layout-compact.js';
import { formatDate, formatTime } from '../../lib/playback-utils.js';
import type { MediaItem, Playlist, PlaylistEntry } from '../../types/models.js';
import { Message } from '../../components/ui/message.js';

import '../../components/ui/alert.js';
import '../../components/ui/button.js';
import '../../components/ui/dropdown.js';
import '../../components/ui/drawer.js';
import '../../components/ui/icon.js';
import '../../components/ui/input.js';
import '../../components/ui/modal.js';
import '../../components/ui/popconfirm.js';
import '../../components/ui/tooltip.js';
import type { InputChangeDetail } from '../../components/ui/input.js';
import type { DropdownMenuClickDetail, DropdownMenuItem } from '../../components/ui/dropdown.js';
import { Z_INDEX } from '../../components/ui/internal/z-index.js';

type PlaylistEntryView = {
  entry: PlaylistEntry;
  media?: MediaItem;
};

const NavigatorElement = navigator(LitElement);

@customElement('playlists-page')
@localized()
export class PlaylistsPage extends NavigatorElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }

    :host([compact]) {
      height: auto;
      overflow: visible;
    }

    .page {
      display: flex;
      flex-direction: column;
      gap: var(--space-inline);
      flex: 1;
      min-height: 0;
    }

    .intro {
      margin: 0;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.9375rem;
      flex-shrink: 0;
    }

    .layout {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    .panel {
      display: flex;
      flex-direction: column;
      min-height: 0;
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-lg, 12px);
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-block);
      padding: var(--space-inline);
      border-bottom: 1px solid var(--color-border, #f0f0f0);
      flex-shrink: 0;
    }

    .panel-header h2,
    .panel-header h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .panel-header p {
      margin: 0;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.8125rem;
    }

    .panel-body {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }

    .create-bar {
      display: flex;
      gap: var(--space-sm);
      padding: var(--space-inline);
      border-bottom: 1px solid var(--color-border, #f0f0f0);
      flex-shrink: 0;
    }

    .create-bar ui-input {
      flex: 1;
      min-width: 0;
    }

    .playlist-list {
      display: flex;
      flex-direction: column;
    }

    .playlist-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-sm);
      align-items: center;
      padding: var(--space-inline);
      border-bottom: 1px solid var(--color-border, #f0f0f0);
    }

    .playlist-item.active {
      background: rgba(22, 119, 255, 0.08);
    }

    .playlist-main {
      min-width: 0;
    }

    .playlist-name-row {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      min-width: 0;
      margin-bottom: var(--space-xs);
    }

    .playlist-name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .playlist-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.75rem;
    }

    .playlist-actions,
    .detail-actions,
    .entry-actions,
    .rename-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs);
      align-items: center;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(22, 119, 255, 0.08);
      color: var(--color-primary, #1677ff);
      font-size: 0.75rem;
      font-weight: 500;
    }

    .tag.muted {
      background: rgba(0, 0, 0, 0.04);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .drawer-content {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .detail-header {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
    }

    .detail-title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--space-inline);
    }

    .detail-title-group {
      display: grid;
      gap: var(--space-xs);
      min-width: 0;
    }

    .detail-title-group h2 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .detail-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.8125rem;
    }

    .rename-box {
      display: grid;
      gap: var(--space-sm);
    }

    .entry-list {
      display: flex;
      flex-direction: column;
    }

    .entry-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-block);
      align-items: center;
      padding: var(--space-inline);
      border-bottom: 1px solid var(--color-border, #f0f0f0);
      background: var(--color-surface, #fff);
    }

    .entry-main {
      display: grid;
      gap: var(--space-xs);
      min-width: 0;
    }

    .entry-title-row {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      min-width: 0;
    }

    .entry-title {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .entry-meta {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: var(--space-sm);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.75rem;
      min-width: 0;
      overflow: hidden;
    }

    .entry-meta > span {
      flex-shrink: 0;
      white-space: nowrap;
    }

    .entry-meta > .entry-position {
      flex-shrink: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: var(--space-xs);
      border-radius: 999px;
      background: rgba(22, 119, 255, 0.08);
      color: var(--color-primary, #1677ff);
      font-size: 0.75rem;
      font-weight: 500;
    }

    .badge.muted {
      background: rgba(0, 0, 0, 0.04);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .empty {
      padding: var(--space-stack);
      text-align: center;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .drawer-empty {
      padding-inline: 0;
    }

    .drawer-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-inline);
    }

    .drawer-footer-meta {
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.8125rem;
    }

    .error {
      margin: var(--space-inline);
    }

    @media (max-width: 767px) {
      .panel,
      .drawer-content {
        min-height: auto;
      }

      .panel-body {
        overflow: visible;
      }

      .detail-title-row,
      .entry-item,
      .playlist-item {
        grid-template-columns: 1fr;
      }
    }
  `;

  @property({ type: Boolean, reflect: true })
  compact = false;

  @state()
  private _playlists: Playlist[] = [];

  @state()
  private _selectedPlaylistId = '';

  @state()
  private _selectedPlaylist?: Playlist;

  @state()
  private _entryViews: PlaylistEntryView[] = [];

  @state()
  private _newPlaylistName = '';

  @state()
  private _renaming = false;

  @state()
  private _renameValue = '';

  @state()
  private _lastPlayedPlaylistId = '';

  @state()
  private _loading = true;

  @state()
  private _detailLoading = false;

  @state()
  private _error = '';

  @state()
  private _busyKey = '';

  @state()
  private _pendingDeletePlaylistId = '';

  private _compactMq?: MediaQueryList;

  connectedCallback(): void {
    super.connectedCallback();
    this._lastPlayedPlaylistId = getAppSettings().lastPlayedPlaylistId;
    this._compactMq = window.matchMedia(COMPACT_VIEWPORT_MQ);
    this.compact = this._compactMq.matches;
    this._compactMq.addEventListener('change', this._onCompactMqChange);
    void this._loadInitialState();
  }

  disconnectedCallback(): void {
    this._compactMq?.removeEventListener('change', this._onCompactMqChange);
    super.disconnectedCallback();
  }

  private _onCompactMqChange = (e: MediaQueryListEvent) => {
    this.compact = e.matches;
  };

  private async _loadInitialState(): Promise<void> {
    this._loading = true;
    this._error = '';
    try {
      await this._loadPlaylists();
    } catch (error) {
      void reportError(error, { where: 'playlists-page.init' });
      this._error = msg('加载播放列表失败');
    } finally {
      this._loading = false;
    }
  }

  private async _loadPlaylists(): Promise<void> {
    this._playlists = await getPlaylistList();
    const lastPlayedPlaylistId = getAppSettings().lastPlayedPlaylistId;
    if (
      lastPlayedPlaylistId &&
      !this._playlists.some((playlist) => playlist.id === lastPlayedPlaylistId)
    ) {
      setAppSettings({ lastPlayedPlaylistId: '' });
      this._lastPlayedPlaylistId = '';
      return;
    }
    this._lastPlayedPlaylistId = lastPlayedPlaylistId;
  }

  private async _selectPlaylist(id: string): Promise<void> {
    if (!id) return;

    if (this._selectedPlaylistId === id && this._selectedPlaylist) {
      return;
    }

    this._selectedPlaylistId = id;
    this._renaming = false;
    await this._loadSelectedPlaylist();
  }

  private async _loadSelectedPlaylist(): Promise<void> {
    if (!this._selectedPlaylistId) {
      this._clearSelection();
      return;
    }

    this._detailLoading = true;
    try {
      const playlist = await getPlaylist(this._selectedPlaylistId);
      if (!playlist) {
        this._clearSelection();
        return;
      }

      const entryViews = await Promise.all(
        playlist.entries
          .filter((entry) => !entry.removed)
          .map(async (entry) => ({
            entry,
            media: entry.mediaId ? await getMedia(entry.mediaId) : undefined,
          })),
      );

      this._selectedPlaylist = playlist;
      this._entryViews = entryViews;
      this._renameValue = playlist.name;
    } catch (error) {
      void reportError(error, { where: 'playlists-page.loadSelected' });
      Message.error(msg('加载播放列表详情失败'));
    } finally {
      this._detailLoading = false;
    }
  }

  private _getActiveEntryCount(playlist: Playlist): number {
    return playlist.entries.filter((entry) => !entry.removed).length;
  }

  private _getPlaylistDuration(): number {
    return this._entryViews.reduce((total, item) => {
      if (item.media) {
        return total + item.media.duration;
      }
      return total;
    }, 0);
  }

  private _isLastPlayedPlaylist(playlistId: string): boolean {
    return Boolean(this._lastPlayedPlaylistId) && playlistId === this._lastPlayedPlaylistId;
  }

  private _getPlaylistPrimaryActionLabel(playlistId: string) {
    return this._isLastPlayedPlaylist(playlistId) ? msg('继续练习') : msg('开始练习');
  }

  private _getPlaylistMenuItems(index: number, playlistId: string): DropdownMenuItem[] {
    const busy = this._busyKey === `move-playlist:${playlistId}`;
    return [
      {
        key: 'move-up',
        label: msg('上移'),
        disabled: index <= 1 || busy,
      },
      {
        key: 'move-down',
        label: msg('下移'),
        disabled: index >= this._playlists.length - 1 || busy,
      },
      { key: 'divider', label: '', type: 'divider' },
      {
        key: 'delete',
        label: msg('删除'),
        danger: true,
        disabled: this._busyKey === `delete:${playlistId}`,
      },
    ];
  }

  private _getEntryMenuItems(index: number): DropdownMenuItem[] {
    return [
      {
        key: 'move-up',
        label: msg('上移'),
        disabled: index === 0,
      },
      {
        key: 'move-down',
        label: msg('下移'),
        disabled: index === this._entryViews.length - 1,
      },
    ];
  }

  private _handlePlaylistMutationError(
    error: unknown,
    fallbackMessage: string,
    where: string,
  ): void {
    if (isPlaylistNameConflictError(error)) {
      Message.warning(msg('该播放列表名称已存在'));
      return;
    }

    void reportError(error, { where });
    Message.error(fallbackMessage);
  }

  private _clearSelection(): void {
    this._selectedPlaylistId = '';
    this._selectedPlaylist = undefined;
    this._entryViews = [];
    this._detailLoading = false;
    this._renaming = false;
    this._renameValue = '';
  }

  private _closeDrawer(): void {
    this._clearSelection();
  }

  private _handleDrawerOpenChange(event: CustomEvent<{ open: boolean }>): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (!event.detail.open) {
      this._closeDrawer();
    }
  }

  private async _handleCreatePlaylist(): Promise<void> {
    const name = this._newPlaylistName.trim();
    if (!name) {
      Message.warning(msg('请输入播放列表名称'));
      return;
    }

    this._busyKey = 'create';
    try {
      await createPlaylist(name);
      this._newPlaylistName = '';
      await this._loadPlaylists();
      Message.success(msg('播放列表已创建'));
    } catch (error) {
      this._handlePlaylistMutationError(error, msg('创建失败'), 'playlists-page.create');
    } finally {
      this._busyKey = '';
    }
  }

  private _startRename(): void {
    if (!this._selectedPlaylist || this._selectedPlaylist.kind !== 'user') return;
    this._renaming = true;
    this._renameValue = this._selectedPlaylist.name;
  }

  private _cancelRename(): void {
    this._renaming = false;
    this._renameValue = this._selectedPlaylist?.name ?? '';
  }

  private async _saveRename(): Promise<void> {
    const playlist = this._selectedPlaylist;
    const name = this._renameValue.trim();
    if (!playlist || playlist.kind !== 'user') return;
    if (!name) {
      Message.warning(msg('请输入播放列表名称'));
      return;
    }

    this._busyKey = 'rename';
    try {
      await updatePlaylist(playlist.id, { name });
      await this._loadPlaylists();
      await this._loadSelectedPlaylist();
      this._renaming = false;
      Message.success(msg('播放列表已更新'));
    } catch (error) {
      this._handlePlaylistMutationError(error, msg('更新失败'), 'playlists-page.rename');
    } finally {
      this._busyKey = '';
    }
  }

  private async _handleDeletePlaylist(id: string): Promise<void> {
    if (!id || this._busyKey === `delete:${id}`) return;

    this._busyKey = `delete:${id}`;
    try {
      await deletePlaylist(id);
      if (this._lastPlayedPlaylistId === id) {
        setAppSettings({ lastPlayedPlaylistId: '' });
        this._lastPlayedPlaylistId = '';
      }
      Message.success(msg('播放列表已删除'));
      await this._loadPlaylists();
      if (this._selectedPlaylistId === id) {
        this._closeDrawer();
      }
    } catch (error) {
      void reportError(error, { where: 'playlists-page.delete', playlistId: id });
      Message.error(msg('删除失败'));
    } finally {
      this._busyKey = '';
      this._pendingDeletePlaylistId = '';
    }
  }

  private _requestDeletePlaylist(id: string): void {
    this._pendingDeletePlaylistId = id;
  }

  private _cancelPendingDeletePlaylist(): void {
    this._pendingDeletePlaylistId = '';
  }

  private _handleDeletePlaylistModalOpenChange(event: CustomEvent<{ open: boolean }>): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (!event.detail.open) {
      this._cancelPendingDeletePlaylist();
    }
  }

  private _handlePlaylistMenuClick(
    event: CustomEvent<DropdownMenuClickDetail>,
    playlistId: string,
  ): void {
    const { key } = event.detail;
    if (key === 'move-up') {
      void this._handleMovePlaylist(playlistId, -1);
      return;
    }
    if (key === 'move-down') {
      void this._handleMovePlaylist(playlistId, 1);
      return;
    }
    if (key === 'delete') {
      this._requestDeletePlaylist(playlistId);
    }
  }

  private _handleEntryMenuClick(event: CustomEvent<DropdownMenuClickDetail>, index: number): void {
    const { key } = event.detail;
    if (key === 'move-up') {
      void this._handleMoveEntry(index, -1);
      return;
    }
    if (key === 'move-down') {
      void this._handleMoveEntry(index, 1);
    }
  }

  private async _handleMovePlaylist(id: string, direction: -1 | 1): Promise<void> {
    const index = this._playlists.findIndex((playlist) => playlist.id === id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 1 || targetIndex >= this._playlists.length) {
      return;
    }

    const orderedIds = this._playlists.map((playlist) => playlist.id);
    [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];

    this._busyKey = `move-playlist:${id}`;
    try {
      await reorderPlaylists(orderedIds);
      await this._loadPlaylists();
    } catch (error) {
      void reportError(error, { where: 'playlists-page.movePlaylist', playlistId: id });
      Message.error(msg('调整顺序失败'));
    } finally {
      this._busyKey = '';
    }
  }

  private async _handleMoveEntry(index: number, direction: -1 | 1): Promise<void> {
    const playlist = this._selectedPlaylist;
    if (!playlist) return;

    const activeIndexes = playlist.entries
      .map((entry, entryIndex) => (entry.removed ? -1 : entryIndex))
      .filter((entryIndex) => entryIndex >= 0);
    const fromIndex = activeIndexes[index];
    const toIndex = activeIndexes[index + direction];
    if (fromIndex == null || toIndex == null) return;

    const nextEntries = [...playlist.entries];
    [nextEntries[fromIndex], nextEntries[toIndex]] = [nextEntries[toIndex], nextEntries[fromIndex]];

    this._busyKey = `move-entry:${index}`;
    try {
      await setPlaylistEntryOrder(playlist.id, nextEntries);
      await this._loadPlaylists();
      await this._loadSelectedPlaylist();
    } catch (error) {
      void reportError(error, { where: 'playlists-page.moveEntry', playlistId: playlist.id });
      Message.error(msg('调整顺序失败'));
    } finally {
      this._busyKey = '';
    }
  }

  private async _handleRemoveEntry(mediaId: string): Promise<void> {
    const playlist = this._selectedPlaylist;
    if (!playlist) return;

    this._busyKey = `remove-entry:${mediaId}`;
    try {
      await removeMediaFromPlaylist(playlist.id, mediaId);
      await this._loadPlaylists();
      await this._loadSelectedPlaylist();
      Message.success(msg('已从播放列表移除'));
    } catch (error) {
      void reportError(error, {
        where: 'playlists-page.removeEntry',
        playlistId: playlist.id,
        mediaId,
      });
      Message.error(msg('移除失败'));
    } finally {
      this._busyKey = '';
    }
  }

  private _startPractice(playlist: Playlist, mediaId?: string): void {
    const firstPlayable = mediaId || playlist.entries.find((entry) => !entry.removed)?.mediaId;
    if (!firstPlayable) {
      Message.warning(msg('当前播放列表为空，请先添加媒体。'));
      return;
    }
    const params = new URLSearchParams({ playlistId: playlist.id });
    if (mediaId) {
      params.set('mediaId', mediaId);
    }
    this.navigate(`/practice?${params.toString()}`);
  }

  render() {
    const selectedPlaylist = this._selectedPlaylist;
    const activeEntryCount = selectedPlaylist ? this._getActiveEntryCount(selectedPlaylist) : 0;
    const totalDuration = selectedPlaylist ? this._getPlaylistDuration() : 0;
    const drawerOpen = Boolean(this._selectedPlaylistId);
    const drawerDirection = this.compact ? 'btt' : 'rtl';
    const drawerSize = this.compact ? '88vh' : 'min(640px, 92vw)';

    return html`
      <div class="page">
        <p class="intro">${msg('在这里快速开始练习，并集中管理播放列表中的音视频与顺序。')}</p>

        ${this._error ? html`<ui-alert class="error" type="error">${this._error}</ui-alert>` : null}

        <div class="layout">
          <section class="panel">
            <div class="panel-header">
              <div>
                <h2>${msg('播放列表库')}</h2>
                <p>${msg(str`${this._playlists.length} 个列表`)}</p>
              </div>
            </div>

            <div class="create-bar">
              <ui-input
                .value=${this._newPlaylistName}
                placeholder="${msg('新建播放列表')}"
                aria-label="${msg('新建播放列表')}"
                @change=${(event: CustomEvent<InputChangeDetail>) => {
                  this._newPlaylistName = event.detail.value || '';
                }}
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key === 'Enter') {
                    void this._handleCreatePlaylist();
                  }
                }}
              ></ui-input>
              <ui-button
                variant="primary"
                ?disabled=${this._busyKey === 'create'}
                @click=${() => void this._handleCreatePlaylist()}
              >
                ${msg('新建')}
              </ui-button>
            </div>

            <div class="panel-body">
              ${this._loading
                ? html`<div class="empty">${msg('加载中…')}</div>`
                : this._playlists.length === 0
                  ? html`<div class="empty">${msg('暂无播放列表')}</div>`
                  : html`
                      <div class="playlist-list">
                        ${this._playlists.map((playlist, index) => {
                          const isActive = playlist.id === this._selectedPlaylistId;
                          const activeCount = this._getActiveEntryCount(playlist);
                          const isLastPlayed = this._isLastPlayedPlaylist(playlist.id);
                          return html`
                            <div class="playlist-item ${isActive ? 'active' : ''}">
                              <div class="playlist-main">
                                <div class="playlist-name-row">
                                  <span class="playlist-name">${playlist.name}</span>
                                  ${isLastPlayed
                                    ? html`<span class="tag muted">${msg('上次练习')}</span>`
                                    : null}
                                </div>
                                <div class="playlist-meta">
                                  <span>${msg(str`${activeCount} 项`)}</span>
                                  <span
                                    >${msg(
                                      str`更新于 ${formatDate(playlist.updatedAt, true)}`,
                                    )}</span
                                  >
                                </div>
                              </div>

                              <div class="playlist-actions">
                                <ui-button
                                  variant=${isLastPlayed ? 'primary' : 'secondary'}
                                  ?disabled=${activeCount === 0}
                                  @click=${() => this._startPractice(playlist)}
                                >
                                  <ui-icon name="practice"></ui-icon>
                                  ${this._getPlaylistPrimaryActionLabel(playlist.id)}
                                </ui-button>
                                <ui-tooltip title=${msg('管理')}>
                                  <ui-button
                                    variant="secondary"
                                    aria-label=${msg('管理')}
                                    @click=${() => void this._selectPlaylist(playlist.id)}
                                  >
                                    <ui-icon name="setting"></ui-icon>
                                  </ui-button>
                                </ui-tooltip>
                                ${playlist.kind === 'user'
                                  ? html`
                                      <ui-dropdown
                                        trigger="click"
                                        placement="bottomRight"
                                        .menu=${{
                                          items: this._getPlaylistMenuItems(index, playlist.id),
                                        }}
                                        @menu-click=${(e: CustomEvent<DropdownMenuClickDetail>) =>
                                          this._handlePlaylistMenuClick(e, playlist.id)}
                                      >
                                        <ui-tooltip title=${msg('更多操作')}>
                                          <ui-button
                                            variant="secondary"
                                            aria-label=${msg('更多操作')}
                                          >
                                            <ui-icon name="more"></ui-icon>
                                          </ui-button>
                                        </ui-tooltip>
                                      </ui-dropdown>
                                    `
                                  : null}
                              </div>
                            </div>
                          `;
                        })}
                      </div>
                    `}
            </div>
          </section>
        </div>

        <ui-drawer
          .open=${drawerOpen}
          .title=${selectedPlaylist?.name ?? msg('播放列表')}
          .direction=${drawerDirection}
          .size=${drawerSize}
          ?destroy-on-close=${true}
          @update:open=${this._handleDrawerOpenChange}
        >
          ${drawerOpen
            ? html`
                <div slot="header" class="detail-header">
                  <div class="detail-title-row">
                    <div class="detail-title-group">
                      <h2>${selectedPlaylist?.name ?? msg('播放列表')}</h2>
                      <div class="detail-meta">
                        ${selectedPlaylist
                          ? html`
                              <span>${msg(str`${activeEntryCount} 项可练习`)}</span>
                              <span>${msg(str`总时长 ${formatTime(totalDuration)}`)}</span>
                              <span
                                >${msg(
                                  str`创建于 ${formatDate(selectedPlaylist.createdAt, true)}`,
                                )}</span
                              >
                            `
                          : html`<span>${msg('加载中…')}</span>`}
                      </div>
                    </div>

                    <div class="detail-actions">
                      ${selectedPlaylist?.kind === 'user'
                        ? html`
                            <ui-button variant="secondary" @click=${() => this._startRename()}>
                              ${msg('重命名')}
                            </ui-button>
                            <ui-button
                              variant="danger"
                              ?disabled=${this._busyKey === `delete:${selectedPlaylist.id}`}
                              @click=${() => this._requestDeletePlaylist(selectedPlaylist.id)}
                            >
                              <ui-icon name="delete"></ui-icon>
                              ${msg('删除')}
                            </ui-button>
                          `
                        : null}
                    </div>
                  </div>

                  ${this._renaming && selectedPlaylist
                    ? html`
                        <div class="rename-box">
                          <ui-input
                            .value=${this._renameValue}
                            placeholder="${msg('播放列表名称')}"
                            aria-label="${msg('播放列表名称')}"
                            @change=${(event: CustomEvent<InputChangeDetail>) => {
                              this._renameValue = event.detail.value || '';
                            }}
                            @keydown=${(event: KeyboardEvent) => {
                              if (event.key === 'Enter') {
                                void this._saveRename();
                              }
                            }}
                          ></ui-input>
                          <div class="rename-actions">
                            <ui-button
                              variant="primary"
                              ?disabled=${this._busyKey === 'rename'}
                              @click=${() => void this._saveRename()}
                            >
                              ${msg('保存')}
                            </ui-button>
                            <ui-button variant="secondary" @click=${() => this._cancelRename()}>
                              ${msg('取消')}
                            </ui-button>
                          </div>
                        </div>
                      `
                    : null}
                </div>

                <div class="drawer-content">
                  ${this._detailLoading
                    ? html`<div class="empty drawer-empty">${msg('加载中…')}</div>`
                    : this._entryViews.length === 0
                      ? html`<div class="empty drawer-empty">${msg('播放列表为空')}</div>`
                      : html`
                          <div class="entry-list">
                            ${this._entryViews.map((item, index) => {
                              const title =
                                item.media?.title || item.entry.titleSnapshot || msg('(未知媒体)');
                              return html`
                                <div class="entry-item">
                                  <div class="entry-main">
                                    <div class="entry-title-row">
                                      <span class="entry-title">${title}</span>
                                    </div>
                                    <div class="entry-meta">
                                      <span class="badge ${item.media ? '' : 'muted'}">
                                        <ui-tooltip
                                          title=${item.media?.type === 'video'
                                            ? msg('视频')
                                            : msg('音频')}
                                          .zIndex=${Z_INDEX.MODAL + 1}
                                        >
                                          <ui-icon
                                            name=${item.media?.type === 'video' ? 'video' : 'music'}
                                            size="var(--icon-md)"
                                          ></ui-icon>
                                        </ui-tooltip>
                                      </span>
                                      <span>
                                        ${item.media
                                          ? formatTime(item.media.duration)
                                          : msg('媒体已不存在')}
                                      </span>
                                      <span class="entry-position"
                                        >${msg(str`第 ${index + 1} 项`)}</span
                                      >
                                      <span
                                        class="badge ${item.media?.hasSubtitles ? '' : 'muted'}"
                                      >
                                        <ui-tooltip
                                          title=${item.media?.hasSubtitles
                                            ? msg('含字幕')
                                            : msg('无字幕')}
                                          .zIndex=${Z_INDEX.MODAL + 1}
                                        >
                                          <ui-icon
                                            name=${item.media?.hasSubtitles
                                              ? 'subtitle'
                                              : 'subtitle-off'}
                                            size="var(--icon-md)"
                                          ></ui-icon>
                                        </ui-tooltip>
                                      </span>
                                    </div>
                                  </div>

                                  <div class="entry-actions">
                                    <ui-button
                                      variant="secondary"
                                      @click=${() =>
                                        this._startPractice(selectedPlaylist!, item.entry.mediaId)}
                                    >
                                      ${msg('从这里练习')}
                                    </ui-button>
                                    <ui-popconfirm
                                      title=${msg('确定将该媒体从播放列表移除吗？')}
                                      placement="bottom"
                                      .zIndex=${Z_INDEX.MODAL + 1}
                                      ?confirm-loading=${this._busyKey ===
                                      `remove-entry:${item.entry.mediaId}`}
                                      @confirm=${() =>
                                        void this._handleRemoveEntry(item.entry.mediaId)}
                                    >
                                      <ui-button
                                        variant="danger"
                                        ?disabled=${this._busyKey ===
                                        `remove-entry:${item.entry.mediaId}`}
                                      >
                                        <ui-icon name="delete"></ui-icon>
                                        ${msg('移除')}
                                      </ui-button>
                                    </ui-popconfirm>
                                    <ui-dropdown
                                      trigger="click"
                                      placement="bottomRight"
                                      .zIndex=${Z_INDEX.MODAL + 1}
                                      .menu=${{
                                        items: this._getEntryMenuItems(index),
                                      }}
                                      @menu-click=${(e: CustomEvent<DropdownMenuClickDetail>) =>
                                        this._handleEntryMenuClick(e, index)}
                                    >
                                      <ui-tooltip
                                        title=${msg('更多操作')}
                                        .zIndex=${Z_INDEX.MODAL + 1}
                                      >
                                        <ui-button
                                          variant="secondary"
                                          aria-label=${msg('更多操作')}
                                        >
                                          <ui-icon name="more"></ui-icon>
                                        </ui-button>
                                      </ui-tooltip>
                                    </ui-dropdown>
                                  </div>
                                </div>
                              `;
                            })}
                          </div>
                        `}
                </div>

                ${selectedPlaylist
                  ? html`
                      <div slot="footer" class="drawer-footer">
                        <div class="drawer-footer-meta">
                          ${this._isLastPlayedPlaylist(selectedPlaylist.id)
                            ? msg('上次练到这份播放列表，可直接继续。')
                            : msg(str`${activeEntryCount} 项可开始练习`)}
                        </div>
                        <ui-button
                          variant="primary"
                          ?disabled=${activeEntryCount === 0}
                          @click=${() => this._startPractice(selectedPlaylist)}
                        >
                          <ui-icon name="practice"></ui-icon>
                          ${this._getPlaylistPrimaryActionLabel(selectedPlaylist.id)}
                        </ui-button>
                      </div>
                    `
                  : null}
              `
            : null}
        </ui-drawer>

        <ui-modal
          title=${msg('确定删除该播放列表吗？')}
          ?open=${Boolean(this._pendingDeletePlaylistId)}
          centered
          ok-text=${msg('删除')}
          ?confirm-loading=${Boolean(
            this._pendingDeletePlaylistId &&
            this._busyKey === `delete:${this._pendingDeletePlaylistId}`,
          )}
          .zIndex=${Z_INDEX.MODAL + 50}
          @ok=${() => {
            if (this._pendingDeletePlaylistId) {
              void this._handleDeletePlaylist(this._pendingDeletePlaylistId);
            }
          }}
          @cancel=${() => this._cancelPendingDeletePlaylist()}
          @update:open=${this._handleDeletePlaylistModalOpenChange}
        >
          <p>${msg('删除后不可恢复。')}</p>
        </ui-modal>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'playlists-page': PlaylistsPage;
  }
}
