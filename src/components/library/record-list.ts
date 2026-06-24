import { msg, updateWhenLocaleChanges } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import {
  listRecordings,
  deleteRecording,
  listAllRecordings,
  getRecordingBlob,
} from '../../db/media-store.js';
import { exportRecording } from '../../lib/export-content.js';
import '../ui/alert.js';
import '../ui/button.js';
import type { PracticeRecord } from '../../types/models.js';
import { formatDate, formatTime } from '../../lib/playback-utils.js';

@customElement('record-list')
export class RecordList extends LitElement {
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

    h2 {
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
  `;

  @property({ type: String })
  mediaId?: string;

  @property({ type: Boolean })
  showHeader = true;

  @state()
  private _items: PracticeRecord[] = [];

  @state()
  private _loading = false;

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

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('mediaId')) {
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    this._loading = true;
    this._error = '';
    try {
      if (this.mediaId && this.mediaId.length > 0) {
        this._items = await listRecordings(this.mediaId);
      } else {
        this._items = (await listAllRecordings()) || [];
      }
      // sort newest first
      this._items.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      this._error = msg('无法加载录音');
      this._items = [];
    } finally {
      this._loading = false;
    }
  }

  render() {
    console.log('record-list render', this._items);

    return html`
      <section>
        ${this.showHeader
          ? html`<div class="header">
              <h2>${msg('录音库')}</h2>
              <span class="count">${this._items.length} ${msg('项')}</span>
            </div>`
          : null}
        ${this._error ? html`<ui-alert variant="error">${this._error}</ui-alert>` : null}
        ${this._loading
          ? html`<div class="empty">${msg('加载中…')}</div>`
          : this._items.length === 0
            ? html`<div class="empty">${msg('暂无录音')}</div>`
            : html`<div class="list">
                ${this._items.map(
                  (item) => html`
                <div class="item">
                  <div class="meta">
                      <p class="title">${item.mediaTitle} ${item.segmentIndex !== undefined ? `${msg('句子')} ${item.segmentIndex + 1}` : msg('完整录音')}</p>
                      <p class="details">
                        <span>${formatTime(item.duration)}</span>
                        <span>${formatDate(item.createdAt, true)}</span>
                      </p>
                  </div>
                  <div class="actions">
                    <ui-button variant="primary" @click="${() => this._handleView(item)}">${msg('查看')}</ui-button>
                    <ui-button variant="secondary" @click="${() => this._handleExport(item)}">${msg('导出')}</ui-button>
                    <ui-button variant="danger" ?disabled="${this._deletingId === item.id}" @click="${() => this._handleDelete(item)}">${msg('删除')}</ui-button>
                  </div>
                </div>
               </div>
              `,
                )}
              </div>`}
      </section>
    `;
  }

  /**
   * @todo use media player
   * @param recording
   * @returns
   */
  private async _handleView(recording: PracticeRecord): Promise<void> {
    const blob = await getRecordingBlob(recording.id);
    if (!blob) {
      this._error = msg('录音文件不存在');
      return;
    }

    const url = URL.createObjectURL(blob);
    const win = window.open('', '_blank');
    if (!win) {
      // fallback: prompt download
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recording';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    // write a minimal player
    win.document.title = '录音预览';
    win.document.body.style.margin = '12px';
    const audio = win.document.createElement('audio');
    audio.controls = true;
    audio.src = url;
    audio.autoplay = false;
    win.document.body.appendChild(audio);
    // revoke when window unloads
    win.addEventListener('unload', () => {
      URL.revokeObjectURL(url);
    });
  }

  private async _handleExport(recording: PracticeRecord): Promise<void> {
    try {
      await exportRecording(recording);
    } catch {
      this._error = msg('导出失败，请重试。');
    }
  }

  private async _handleDelete(recording: PracticeRecord): Promise<void> {
    const ok = window.confirm(msg('确定删除该录音吗？'));
    if (!ok) return;
    this._deletingId = recording.id;
    try {
      await deleteRecording(recording.id);
      await this.refresh();
      this.dispatchEvent(
        new CustomEvent('recording-deleted', {
          detail: { id: recording.id },
          bubbles: true,
          composed: true,
        }),
      );
    } catch {
      this._error = msg('删除失败，请重试。');
    } finally {
      this._deletingId = '';
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'record-list': RecordList;
  }
}
