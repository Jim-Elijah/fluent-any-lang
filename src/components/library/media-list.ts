import { msg, str, updateWhenLocaleChanges } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { deleteMedia, listMedia } from '../../db/media-store.js';
import { formatTime, formatDate } from '../../lib/playback-utils.js';
import type { MediaItem } from '../../types/models.js';
import '../ui/alert.js';
import '../ui/button.js';

@customElement('media-list')
export class MediaList extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
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

    .list {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.06));
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
      flex-wrap: wrap;
      gap: 8px 12px;
      margin: 0;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.8125rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
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
  `;

  @state()
  private _items: MediaItem[] = [];

  @state()
  private _loading = true;

  @state()
  private _error = '';

  @state()
  private _deletingId = '';

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this._loading = true;
    this._error = '';

    try {
      this._items = await listMedia();
    } catch {
      this._error = msg('无法加载内容库');
      this._items = [];
    } finally {
      this._loading = false;
    }
  }

  render() {
    return html`
      <section>
        <div class="header">
          <h2>${msg('资源库')}</h2>
          <span class="count">${this._items.length} ${msg('项')}</span>
        </div>

        ${this._error
          ? html`<ui-alert class="error" variant="error">${this._error}</ui-alert>`
          : null}
        ${this._loading
          ? html`<div class="empty">${msg('加载中…')}</div>`
          : this._items.length === 0
            ? html`<div class="empty">${msg('暂无内容，请先导入音视频和字幕')}</div>`
            : html`
                <ul class="list">
                  ${this._items.map(
                    (item) => html`
                      <li class="item">
                        <div class="meta">
                          <p class="title">${item.title}</p>
                          <p class="details">
                            <span class="badge">
                              ${item.type === 'video' ? msg('视频') : msg('音频')}
                            </span>
                            <span>${formatTime(item.duration)}</span>
                            <span>${formatDate(item.createdAt, true)}</span>
                            <span class="badge ${item.hasSubtitles ? '' : 'muted'}">
                              ${item.hasSubtitles ? msg('含字幕') : msg('无字幕')}
                            </span>
                          </p>
                        </div>
                        <div class="actions">
                          <ui-button variant="primary" @click="${() => this._handlePractice(item)}">
                            ${msg('练习')}
                          </ui-button>
                          <ui-button
                            variant="danger"
                            ?disabled="${this._deletingId === item.id}"
                            @click="${() => this._handleDelete(item)}"
                          >
                            ${msg('删除')}
                          </ui-button>
                        </div>
                      </li>
                    `,
                  )}
                </ul>
              `}
      </section>
    `;
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
    const confirmed = window.confirm(msg(str`确定删除「${item.title}」吗？`));
    if (!confirmed) {
      return;
    }

    this._deletingId = item.id;

    try {
      await deleteMedia(item.id, item.title);
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
