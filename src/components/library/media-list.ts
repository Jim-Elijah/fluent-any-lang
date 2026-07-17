import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import {
  deleteMedia,
  getMediaList,
  deleteSubtitle,
  toggleFavorites,
  getPlaylist,
  getPlaylistList,
  addMediaToPlaylist,
} from '../../db/service.js';
import { importSubtitleForMedia } from '../../lib/import-content.js';
import { reportError } from '../../lib/error-reporter.js';
import { formatTime, formatDate } from '../../lib/playback-utils.js';
import { estimateListNaturalHeight, type ListMetricsDetail } from '../../lib/split-list-heights.js';
import {
  FAVORITES_PLAYLIST_ID,
  type MediaItem,
  type SortDirection,
  type SubtitleTrack,
} from '../../types/models.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/popconfirm.js';
import '../ui/icon.js';
import '../ui/tooltip.js';
import '../ui/virtual-grid.js';
import '../ui/dropdown.js';
import type { DropdownMenuClickDetail, DropdownMenuItem } from '../ui/dropdown.js';
import { Message } from '../ui/message.js';

/** Row height including the --space-md (12px) gap below each card. */
const MEDIA_ROW_HEIGHT = 96;
const MEDIA_LIST_HEIGHT = 480;

@customElement('media-list')
@localized()
export class MediaList extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    :host([fill-height]) {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    :host([fill-height]) section {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    :host([fill-height]) .list-viewport {
      flex: 1;
      min-height: 0;
    }

    :host([fill-height]) .list-viewport ui-virtual-grid {
      display: block;
      height: 100%;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-block);
      margin-bottom: var(--space-block);
      flex-shrink: 0;
    }

    .header h2 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
    }

    .count {
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.875rem;
    }

    .item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-md);
      align-items: center;
      /* Reserve --space-md to match MEDIA_ROW_HEIGHT gap (fixed, not --space-block). */
      height: calc(100% - var(--space-md));
      padding: var(--space-md) var(--space-lg);
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.06));
      box-sizing: border-box;
    }

    .meta {
      min-width: 0;
    }

    .title {
      margin: 0 0 var(--space-xs);
      font-size: 1rem;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .details {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: var(--space-sm);
      margin: 0;
      min-width: 0;
      overflow: hidden;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.8125rem;
    }

    .details > span {
      flex-shrink: 0;
      white-space: nowrap;
    }

    .details > .date {
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

    .actions {
      display: flex;
      gap: var(--space-sm);
      flex-shrink: 0;
    }

    .favorite-btn {
      color: #faad14;
      transition: transform 0.2s ease;
    }

    .favorite-btn.active {
      color: #fa8c16;
    }

    .favorite-btn:hover {
      transform: scale(1.1);
    }

    .empty {
      padding: var(--space-stack);
      text-align: center;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      background: var(--color-surface, #fff);
      border: 1px dashed var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
    }

    .error {
      margin-bottom: var(--space-block);
    }

    input[type='file'] {
      display: none;
    }

    @media (max-width: 767px) {
      .item {
        gap: var(--space-sm);
        height: calc(100% - var(--space-sm));
        padding: var(--space-sm) var(--space-md);
      }

      .details {
        gap: var(--space-xs);
      }
      .actions {
        gap: var(--space-xs);
      }
    }
  `;

  @property({ type: String })
  keyword?: string;

  @property({ type: String })
  sortBy?: string = 'date';

  @property({ type: String })
  sortDirection?: SortDirection = 'desc';

  /** When set, only the first N items after filter/sort are shown (e.g. recent 10 on home). */
  @property({ type: Number })
  limit?: number;

  /** Fill parent height and scroll inside the list instead of using a fixed max height. */
  @property({ type: Boolean, reflect: true, attribute: 'fill-height' })
  fillHeight = false;

  @state()
  private _items: MediaItem[] = [];

  @state()
  private _loading = true;

  @state()
  private _error = '';

  @state()
  private _deletingId = '';

  @state()
  private _importingSubtitleId = '';

  @state()
  private _favoriteStates = new Map<string, boolean>();

  /** User playlists only (excludes favorites — favorites use the ★ button). */
  @state()
  private _playlists: Array<{ id: string; name: string }> = [];

  private _pendingSubtitleMediaId = '';

  private _visibleCount = 0;

  private _lastMetricsKey = '';

  connectedCallback(): void {
    super.connectedCallback();
    void this.refresh();
  }

  protected updated(): void {
    const naturalHeight = estimateListNaturalHeight({
      itemCount: this._visibleCount,
      rowHeight: MEDIA_ROW_HEIGHT,
      hasError: Boolean(this._error),
      loading: this._loading,
    });
    const key = `${naturalHeight}:${this._visibleCount}:${this._loading}:${this._error}`;
    if (key === this._lastMetricsKey) return;
    this._lastMetricsKey = key;
    this.dispatchEvent(
      new CustomEvent<ListMetricsDetail>('list-metrics', {
        detail: { naturalHeight, itemCount: this._visibleCount },
        bubbles: true,
        composed: true,
      }),
    );
  }

  async refresh(): Promise<void> {
    this._loading = true;
    this._error = '';

    try {
      const [items, playlists, favorites] = await Promise.all([
        getMediaList(),
        getPlaylistList(),
        getPlaylist(FAVORITES_PLAYLIST_ID),
      ]);
      this._items = items;
      this._playlists = playlists
        .filter((playlist) => playlist.kind === 'user')
        .map((playlist) => ({ id: playlist.id, name: playlist.name }));

      const favoriteIds = new Set(
        (favorites?.entries ?? []).filter((entry) => !entry.removed).map((entry) => entry.mediaId),
      );
      const favoriteStates = new Map<string, boolean>();
      for (const item of items) {
        favoriteStates.set(item.id, favoriteIds.has(item.id));
      }
      this._favoriteStates = favoriteStates;
    } catch (error) {
      void reportError(error, { where: 'media-list.refresh' });
      this._error = msg('无法加载媒体库');
      this._items = [];
      this._playlists = [];
      this._favoriteStates = new Map();
    } finally {
      this._loading = false;
    }
  }

  private _getAddToPlaylistMenuItems(): DropdownMenuItem[] {
    if (this._playlists.length === 0) {
      return [{ key: '__empty__', label: msg('暂无播放列表'), disabled: true }];
    }
    return this._playlists.map((playlist) => ({
      key: playlist.id,
      label: msg(str`加入「${playlist.name}」`),
    }));
  }

  render() {
    let renderedItems = this._items;
    if (this.keyword) {
      renderedItems = renderedItems.filter((item: MediaItem) =>
        item.title.toLowerCase().includes(this.keyword!.toLowerCase()),
      );
    }
    if (this.sortBy && this.sortDirection) {
      renderedItems = [...renderedItems].sort((a: MediaItem, b: MediaItem) => {
        if (this.sortBy === 'date') {
          return this.sortDirection === 'asc'
            ? a.createdAt - b.createdAt
            : b.createdAt - a.createdAt;
        }
        if (this.sortBy === 'title') {
          return this.sortDirection === 'asc'
            ? a.title.localeCompare(b.title)
            : b.title.localeCompare(a.title);
        }
        return 0;
      });
    }

    if (this.limit != null && this.limit >= 0) {
      renderedItems = renderedItems.slice(0, this.limit);
    }

    this._visibleCount = renderedItems.length;

    const listHeight = this.fillHeight
      ? '100%'
      : Math.min(Math.max(renderedItems.length, 1) * MEDIA_ROW_HEIGHT, MEDIA_LIST_HEIGHT);

    return html`
      <section>
        <div class="header">
          <h2>${msg('媒体库')}</h2>
          <span class="count"
            >${this.limit && this.limit > 0 ? msg('最近') : ''} ${renderedItems.length}
            ${msg('项')}</span
          >
        </div>

        ${this._error ? html`<ui-alert class="error" type="error">${this._error}</ui-alert>` : null}
        ${this._loading
          ? html`<div class="empty">${msg('加载中…')}</div>`
          : renderedItems.length === 0
            ? html`<div class="empty">
                ${this.keyword ? msg('无匹配内容') : msg('暂无内容，请先导入音视频')}
              </div>`
            : html`
                <div class="list-viewport">
                  <ui-virtual-grid
                    .items=${renderedItems}
                    .itemHeight=${MEDIA_ROW_HEIGHT}
                    .containerHeight=${listHeight}
                    .gridItems=${1}
                    .renderItem=${this._renderItem}
                  ></ui-virtual-grid>
                </div>
              `}
        <input type="file" accept=".srt,.lrc" @change="${this._handleSubtitleFile}" />
      </section>
    `;
  }

  private _renderItem = (item: unknown): unknown => {
    const media = item as MediaItem;
    const isFavorite = this._favoriteStates.get(media.id) || false;

    return html`
      <div class="item">
        <div class="meta">
          <p class="title">${media.title}</p>
          <p class="details">
            <span class="badge">
              <ui-tooltip title="${media.type === 'video' ? msg('视频') : msg('音频')}">
                <ui-icon
                  name="${media.type === 'video' ? 'video' : 'music'}"
                  size="var(--icon-md)"
                ></ui-icon>
              </ui-tooltip>
            </span>
            <span>${formatTime(media.duration)}</span>
            <span class="date">${formatDate(media.createdAt, true)}</span>
            <span class="badge ${media.hasSubtitles ? '' : 'muted'}">
              <ui-tooltip title="${media.hasSubtitles ? msg('含字幕') : msg('无字幕')}">
                <ui-icon
                  name="${media.hasSubtitles ? 'subtitle' : 'subtitle-off'}"
                  size="var(--icon-md)"
                ></ui-icon>
              </ui-tooltip>
            </span>
          </p>
        </div>
        <div class="actions">
          <ui-tooltip title="${isFavorite ? msg('取消喜欢') : msg('喜欢')}">
            <ui-button
              variant="ghost"
              aria-label="${isFavorite ? msg('取消喜欢') : msg('喜欢')}"
              class="favorite-btn ${isFavorite ? 'active' : ''}"
              @click="${() => this._handleToggleFavorite(media)}"
            >
              <ui-icon name="${isFavorite ? 'like-fill' : 'like'}" style="color: red"></ui-icon>
            </ui-button>
          </ui-tooltip>

          ${!media.hasSubtitles
            ? html`
                <ui-tooltip title="${msg('导入字幕')}">
                  <ui-button
                    variant="secondary"
                    aria-label="${msg('导入字幕')}"
                    ?disabled="${this._importingSubtitleId === media.id}"
                    @click="${() => this._openSubtitlePicker(media)}"
                  >
                    <ui-icon name="subtitle"></ui-icon>
                  </ui-button>
                </ui-tooltip>
              `
            : null}
          <ui-tooltip title="${msg('练习')}">
            <ui-button
              variant="secondary"
              aria-label="${msg('练习')}"
              @click="${() => this._handlePractice(media)}"
            >
              <ui-icon name="practice"></ui-icon>
            </ui-button>
          </ui-tooltip>
          <ui-popconfirm
            title=${msg('确定删除该资源吗？')}
            placement="bottom"
            ?confirm-loading=${this._deletingId === media.id}
            @confirm=${() => this._handleDelete(media)}
          >
            <ui-button
              variant="danger"
              aria-label="${msg('删除')}"
              ?disabled="${this._deletingId === media.id}"
            >
              <ui-icon name="delete"></ui-icon>
            </ui-button>
          </ui-popconfirm>
          <ui-dropdown
            trigger="click"
            placement="bottomRight"
            .menu=${{ items: this._getAddToPlaylistMenuItems() }}
            @menu-click=${(e: CustomEvent<DropdownMenuClickDetail>) =>
              void this._handleAddToPlaylist(e, media)}
          >
            <ui-tooltip title="${msg('加入播放列表')}">
              <ui-button variant="secondary" aria-label="${msg('加入播放列表')}">
                <ui-icon name="more"></ui-icon>
              </ui-button>
            </ui-tooltip>
          </ui-dropdown>
        </div>
      </div>
    `;
  };

  private async _handleToggleFavorite(media: MediaItem): Promise<void> {
    try {
      const isNowFavorite = await toggleFavorites(media.id);
      this._favoriteStates.set(media.id, isNowFavorite);
      this.requestUpdate();
      Message.success(isNowFavorite ? msg('已添加到喜欢') : msg('已从喜欢移除'));
      this.dispatchEvent(
        new CustomEvent('playlist-changed', {
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      void reportError(error, { where: 'media-list.toggleFavorite', mediaId: media.id });
      Message.error(msg('操作失败，请重试'));
    }
  }

  private async _handleAddToPlaylist(
    e: CustomEvent<DropdownMenuClickDetail>,
    media: MediaItem,
  ): Promise<void> {
    const playlistId = e.detail.key;
    if (!playlistId || playlistId === '__empty__') return;

    try {
      await addMediaToPlaylist(playlistId, media.id);
      const playlistName =
        this._playlists.find((p) => p.id === playlistId)?.name ?? msg('播放列表');
      Message.success(msg(str`已添加到「${playlistName}」`));
      this.dispatchEvent(
        new CustomEvent('playlist-changed', {
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      void reportError(error, { where: 'media-list.addToPlaylist', mediaId: media.id });
      Message.error(msg('添加失败，请重试'));
    }
  }

  private _openSubtitlePicker(media: MediaItem): void {
    this._pendingSubtitleMediaId = media.id;
    const input = this.renderRoot.querySelector('input[type="file"]') as HTMLInputElement | null;
    input?.click();
  }

  private async _handleSubtitleFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const mediaId = this._pendingSubtitleMediaId;
    input.value = '';
    this._pendingSubtitleMediaId = '';

    if (!file || !mediaId) {
      return;
    }

    this._importingSubtitleId = mediaId;
    try {
      const result = await importSubtitleForMedia(mediaId, file);

      for (const error of result.errors) {
        Message.error({ message: `${error.filename}: ${error.message}` });
      }
      for (const skipped of result.skipped) {
        Message.info({ message: `${skipped.filename}: ${skipped.message}` });
      }
      if (result.conflicts.length > 0) {
        Message.info({
          message: result.conflicts[0]?.message ?? msg('该媒体已有不同内容的字幕'),
        });
      }

      const track = result.imported.find(
        (item): item is SubtitleTrack => 'segments' in item && item.mediaId === mediaId,
      );
      if (track) {
        Message.success({ message: msg('字幕已导入') });
        this._items = this._items.map((item) =>
          item.id === mediaId ? { ...item, hasSubtitles: true } : item,
        );
        this.dispatchEvent(
          new CustomEvent('subtitle-imported', {
            detail: { mediaId, track },
            bubbles: true,
            composed: true,
          }),
        );
      }
    } catch (error) {
      void reportError(error, { where: 'media-list.importSubtitle', mediaId });
      Message.error({ message: msg('导入字幕失败，请重试') });
    } finally {
      this._importingSubtitleId = '';
    }
  }

  private _handlePractice(item: MediaItem): void {
    this.dispatchEvent(
      new CustomEvent('media-selected', {
        detail: { id: item.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private async _handleDelete(item: MediaItem): Promise<void> {
    this._deletingId = item.id;

    try {
      await Promise.all([deleteMedia(item.id), deleteSubtitle(item.id)]);
      this._items = this._items.filter((entry) => entry.id !== item.id);
      this.dispatchEvent(
        new CustomEvent('media-deleted', {
          detail: { id: item.id },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      void reportError(error, { where: 'media-list.delete', mediaId: item.id });
      this._error = msg('删除失败，请重试');
    } finally {
      this._deletingId = '';
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'media-list': MediaList;
  }
}
