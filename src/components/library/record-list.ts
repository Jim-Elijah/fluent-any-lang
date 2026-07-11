import { msg, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { getMediaBlob } from '../../db/media.js';
import {
  findRecordings,
  deleteRecording,
  getRecordingList,
  getRecordingBlob,
  getSubtitle,
} from '../../db/service.js';
import { exportRecording } from '../../lib/export-content.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/modal.js';
import '../ui/popconfirm.js';
import './recording-preview.js';
import '../ui/icon.js';
import '../ui/tooltip.js';
import type {
  PracticeMode,
  PracticeRecord,
  SortDirection,
  SubtitleSegment,
} from '../../types/models.js';
import { formatDate, formatTime } from '../../lib/playback-utils.js';

@customElement('record-list')
@localized()
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
  keyword?: string;

  @property({ type: String })
  sortBy?: string = 'date';

  @property({ type: String })
  sortDirection?: SortDirection = 'desc';

  @property({ type: String })
  mediaId?: string;

  @property({ type: String })
  modeFilter?: PracticeMode;

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

  @state()
  private _modalOpen = false;

  @state()
  private _modalRecording: PracticeRecord | null = null;

  @state()
  private _modalRecordingBlob: Blob | null = null;

  @state()
  private _modalSourceBlob: Blob | null = null;

  @state()
  private _modalSubtitleSegments: SubtitleSegment[] = [];

  constructor() {
    super();
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
      console.log('refresh', this.mediaId);
      if (this.mediaId && this.mediaId.length > 0) {
        this._items = await findRecordings(this.mediaId);
        console.log('findRecordings', this.mediaId, this._items);
      } else {
        this._items = (await getRecordingList()) || [];
        console.log('getRecordingList', this._items);
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

    let renderedItems = this._items;
    if (this.modeFilter) {
      renderedItems = renderedItems.filter((item) => item.mode === this.modeFilter);
    }
    if (this.keyword) {
      renderedItems = renderedItems.filter((item: PracticeRecord) =>
        item.mediaTitle.toLowerCase().includes(this.keyword!.toLowerCase()),
      );
    }
    if (this.sortBy && this.sortDirection) {
      renderedItems = renderedItems.sort((a: PracticeRecord, b: PracticeRecord) => {
        if (this.sortBy === 'date') {
          return this.sortDirection === 'asc'
            ? a.createdAt - b.createdAt
            : b.createdAt - a.createdAt;
        }
        if (this.sortBy === 'title') {
          return this.sortDirection === 'asc'
            ? a.mediaTitle.localeCompare(b.mediaTitle)
            : b.mediaTitle.localeCompare(a.mediaTitle);
        }
        return 0;
      });
    }

    return html`
      <section>
        ${this.showHeader
          ? html`<div class="header">
              <h2>${msg('录音库')}</h2>
              <span class="count">${renderedItems.length} ${msg('项')}</span>
            </div>`
          : null}
        ${this._error ? html`<ui-alert type="error">${this._error}</ui-alert>` : null}
        ${this._loading
          ? html`<div class="empty">${msg('加载中…')}</div>`
          : renderedItems.length === 0
            ? html`<div class="empty">${msg('暂无录音')}</div>`
            : html`<div class="list">
                ${renderedItems.map(
                  (item) => html`
                <div class="item">
                  <div class="meta">
                      <p class="title">${item.mediaTitle}</p>
                      <p class="details">
                        <span>${formatTime(item.recordingDuration)}</span>
                        <span>${formatDate(item.createdAt, true)}</span>
                      </p>
                  </div>
                  <div class="actions">
                    <ui-tooltip title="${msg('查看')}">
                      <ui-button
                        variant="primary"
                        aria-label="${msg('查看')}"
                        @click="${() => this._handleView(item)}"
                      >
                        <ui-icon name="play"></ui-icon>
                      </ui-button>
                    </ui-tooltip>
                    <ui-tooltip title="${msg('导出')}">
                      <ui-button
                        variant="secondary"
                        aria-label="${msg('导出')}"
                        @click="${() => this._handleExport(item)}"
                      >
                        <ui-icon name="download"></ui-icon>
                      </ui-button>
                    </ui-tooltip>
                    <ui-popconfirm
                      title=${msg('确定删除该录音吗？')}
                      placement="bottom"
                      ?confirm-loading=${this._deletingId === item.id}
                      @confirm=${() => this._handleDelete(item)}
                    >
                        <ui-button
                          variant="danger"
                          aria-label="${msg('删除')}"
                          ?disabled="${this._deletingId === item.id}"
                        >
                          <ui-icon name="delete"></ui-icon>
                        </ui-button>
                    </ui-popconfirm>
                  </div>
                </div>
               </div>
              `,
                )}
              </div>`}
        <ui-modal
          title="${this._modalRecording?.mediaTitle ?? msg('录音预览')}"
          @close="${() => this._handleModalClose()}"
          ?open=${this._modalOpen}
          width="600px"
          centered
          ?mask=${true}
          ?mask-closable=${true}
          ?keyboard=${true}
          ?closable=${true}
          .footer=${false}
          ?destroy-on-close=${true}
        >
          ${this._modalOpen && this._modalRecordingBlob
            ? html`<recording-preview
                .sourceBlob=${this._modalSourceBlob}
                .recordingBlob=${this._modalRecordingBlob}
                .segments=${this._modalRecording?.segments ?? []}
                .subtitleSegments=${this._modalSubtitleSegments}
                .practiceMode=${this._modalRecording?.mode ?? 'shadowing'}
              ></recording-preview>`
            : null}
        </ui-modal>
      </section>
    `;
  }

  private _handleModalClose(): void {
    this._modalOpen = false;
    this._modalRecording = null;
    this._modalRecordingBlob = null;
    this._modalSourceBlob = null;
    this._modalSubtitleSegments = [];
  }

  private async _handleView(recording: PracticeRecord): Promise<void> {
    const [recordingBlob, sourceBlob, subtitleTrack] = await Promise.all([
      getRecordingBlob(recording.id),
      getMediaBlob(recording.mediaId),
      getSubtitle(recording.mediaTitle),
    ]);

    if (!recordingBlob) {
      this._error = msg('录音文件不存在');
      return;
    }

    this._modalRecording = recording;
    this._modalRecordingBlob = recordingBlob;
    this._modalSourceBlob = sourceBlob ?? null;
    this._modalSubtitleSegments = subtitleTrack?.segments ?? [];
    this._modalOpen = true;
  }

  private async _handleExport(recording: PracticeRecord): Promise<void> {
    try {
      await exportRecording(recording);
    } catch {
      this._error = msg('导出失败，请重试。');
    }
  }

  private async _handleDelete(recording: PracticeRecord): Promise<void> {
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
