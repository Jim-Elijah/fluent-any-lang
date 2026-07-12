import { msg, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { deleteMedia, getMediaList, deleteSubtitle } from '../../db/service.js';
import { importSubtitleForMedia } from '../../lib/import-content.js';
import { formatTime, formatDate } from '../../lib/playback-utils.js';
import { estimateListNaturalHeight, type ListMetricsDetail } from '../../lib/split-list-heights.js';
import type { MediaItem, SortDirection, SubtitleTrack } from '../../types/models.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/popconfirm.js';
import '../ui/icon.js';
import '../ui/tooltip.js';
import '../ui/virtual-grid.js';
import { Message } from '../ui/message.js';

/** Row height including the 12px gap below each card. */
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
      gap: 12px;
      margin-bottom: 12px;
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
      gap: 12px;
      align-items: center;
      height: calc(100% - 12px);
      padding: 14px 16px;
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
      margin: 0 0 6px;
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
      gap: 8px;
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
      padding: 4px;
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
      gap: 8px;
      flex-shrink: 0;
    }

    .empty {
      padding: 24px;
      text-align: center;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      background: var(--color-surface, #fff);
      border: 1px dashed var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
    }

    .error {
      margin-bottom: 12px;
    }

    input[type='file'] {
      display: none;
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
      this._items = await getMediaList();
    } catch {
      this._error = msg('无法加载媒体库');
      this._items = [];
    } finally {
      this._loading = false;
    }
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
    return html`
      <div class="item">
        <div class="meta">
          <p class="title">${media.title}</p>
          <p class="details">
            <span class="badge">
              <ui-tooltip title="${media.type === 'video' ? msg('视频') : msg('音频')}">
                <ui-icon name="${media.type === 'video' ? 'video' : 'music'}" size="16px"></ui-icon>
              </ui-tooltip>
            </span>
            <span>${formatTime(media.duration)}</span>
            <span class="date">${formatDate(media.createdAt, true)}</span>
            <span class="badge ${media.hasSubtitles ? '' : 'muted'}">
              <ui-tooltip title="${media.hasSubtitles ? msg('含字幕') : msg('无字幕')}">
                <ui-icon
                  name="${media.hasSubtitles ? 'subtitle' : 'subtitle-off'}"
                  size="16px"
                ></ui-icon>
              </ui-tooltip>
            </span>
          </p>
        </div>
        <div class="actions">
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
        </div>
      </div>
    `;
  };

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
    } catch {
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
    } catch {
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
