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
import {
  dispatchRecordingPreviewClose,
  dispatchRecordingPreviewOpen,
} from '../../lib/audio-focus.js';
import { estimateListNaturalHeight, type ListMetricsDetail } from '../../lib/split-list-heights.js';
import { NARROW_VIEWPORT_MQ } from '../../lib/layout-compact.js';
import { Z_INDEX } from '../ui/internal/z-index.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/modal.js';
import '../ui/popconfirm.js';
import './recording-preview.js';
import '../ui/icon.js';
import '../ui/tooltip.js';
import '../ui/virtual-grid.js';
import type {
  PracticeMode,
  PracticeRecord,
  SortDirection,
  SubtitleSegment,
} from '../../types/models.js';
import { formatDate, formatTime } from '../../lib/playback-utils.js';
import { Message } from '../ui/message.js';

/** Row height including the --space-md (12px) gap below each card. */
const RECORD_ROW_HEIGHT = 88;
/** Narrow: meta + actions stacked; includes the same gap below each card. */
const RECORD_ROW_HEIGHT_NARROW = 132;
const RECORD_LIST_HEIGHT = 480;

@customElement('record-list')
@localized()
export class RecordList extends LitElement {
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

    h2 {
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
      /* Reserve --space-md to match RECORD_ROW_HEIGHT gap (fixed, not --space-block). */
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
      padding: 2px var(--space-sm);
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 500;
      line-height: 1.2;
    }

    .badge.shadowing {
      background: rgba(19, 194, 194, 0.12);
      color: #08979c;
    }

    .badge.echo {
      background: rgba(250, 140, 22, 0.12);
      color: #d46b08;
    }

    .actions {
      display: flex;
      gap: var(--space-sm);
      flex-shrink: 0;
    }

    .empty {
      padding: var(--space-stack);
      text-align: center;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      background: var(--color-surface, #fff);
      border: 1px dashed var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
    }

    @media (max-width: 767px) {
      .item {
        grid-template-columns: 1fr;
        align-items: start;
        gap: var(--space-sm);
        height: calc(100% - var(--space-sm));
        padding: var(--space-sm) var(--space-md);
      }

      .details {
        gap: var(--space-xs);
      }

      .actions {
        gap: var(--space-xs);
        justify-content: flex-end;
      }
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

  /** Fill parent height and scroll inside the list instead of using a fixed max height. */
  @property({ type: Boolean, reflect: true, attribute: 'fill-height' })
  fillHeight = false;

  /**
   * Elevate child popups (popconfirm, preview modal) above a parent modal.
   * Pass `Z_INDEX.MODAL + 1` when embedding inside a modal.
   */
  @property({ type: Number })
  popupZIndex: number | undefined;

  /**
   * When true, preview is blocked (e.g. active mic recording on the practice page).
   */
  @property({ type: Boolean })
  previewDisabled = false;

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

  private _visibleCount = 0;

  private _lastMetricsKey = '';

  @state()
  private _narrow = false;

  private _narrowMq?: MediaQueryList;

  connectedCallback(): void {
    super.connectedCallback();
    this._narrowMq = window.matchMedia(NARROW_VIEWPORT_MQ);
    this._narrow = this._narrowMq.matches;
    this._narrowMq.addEventListener('change', this._onNarrowMqChange);
    void this.refresh();
  }

  disconnectedCallback(): void {
    this._narrowMq?.removeEventListener('change', this._onNarrowMqChange);
    super.disconnectedCallback();
  }

  private _onNarrowMqChange = (e: MediaQueryListEvent) => {
    this._narrow = e.matches;
  };

  private _rowHeight(): number {
    return this._narrow ? RECORD_ROW_HEIGHT_NARROW : RECORD_ROW_HEIGHT;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('mediaId') && changed.get('mediaId') !== this.mediaId) {
      void this.refresh();
    }

    const rowHeight = this._rowHeight();
    const naturalHeight = estimateListNaturalHeight({
      itemCount: this._visibleCount,
      rowHeight,
      hasHeader: this.showHeader,
      hasError: Boolean(this._error),
      loading: this._loading,
    });
    const key = `${naturalHeight}:${this._visibleCount}:${this._loading}:${this._error}:${this.showHeader}:${rowHeight}`;
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
      renderedItems = [...renderedItems].sort((a: PracticeRecord, b: PracticeRecord) => {
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

    this._visibleCount = renderedItems.length;

    const rowHeight = this._rowHeight();
    const listHeight = this.fillHeight
      ? '100%'
      : Math.min(Math.max(renderedItems.length, 1) * rowHeight, RECORD_LIST_HEIGHT);

    const emptyMessage = this.keyword ? msg('无匹配录音') : msg('暂无录音');

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
            ? html`<div class="empty">${emptyMessage}</div>`
            : html`
                <div class="list-viewport">
                  <ui-virtual-grid
                    .items=${renderedItems}
                    .itemHeight=${rowHeight}
                    .containerHeight=${listHeight}
                    .gridItems=${1}
                    .renderItem=${this._renderItem}
                  ></ui-virtual-grid>
                </div>
              `}
        <ui-modal
          title="${this._modalRecording?.mediaTitle ?? msg('录音预览')}"
          .zIndex=${this.popupZIndex != null ? this.popupZIndex + 50 : Z_INDEX.MODAL}
          @update:open="${(e: CustomEvent<{ open: boolean }>) => {
            // Ignore bubbled update:open from nested overlays (dropdown / tooltip).
            if (e.target !== e.currentTarget) return;
            e.stopPropagation();
            if (!e.detail.open) this._handleModalClose();
          }}"
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

  private _modeLabel(mode: PracticeMode): string {
    return mode === 'echo' ? msg('回声') : msg('跟读');
  }

  private _renderItem = (item: unknown): unknown => {
    const recording = item as PracticeRecord;
    const showModeBadge = !this.modeFilter;
    return html`
      <div class="item">
        <div class="meta">
          <p class="title">${recording.mediaTitle}</p>
          <p class="details">
            ${showModeBadge
              ? html`<span class="badge ${recording.mode}"
                  >${this._modeLabel(recording.mode)}</span
                >`
              : null}
            <span>${formatTime(recording.recordingDuration)}</span>
            <span class="date">${formatDate(recording.createdAt, true)}</span>
          </p>
        </div>
        <div class="actions">
          <ui-tooltip title="${msg('查看')}">
            <ui-button
              variant="primary"
              aria-label="${msg('查看')}"
              @click="${() => this._handleView(recording)}"
            >
              <ui-icon name="play"></ui-icon>
            </ui-button>
          </ui-tooltip>
          <ui-tooltip title="${msg('导出')}">
            <ui-button
              variant="secondary"
              aria-label="${msg('导出')}"
              @click="${() => this._handleExport(recording)}"
            >
              <ui-icon name="download"></ui-icon>
            </ui-button>
          </ui-tooltip>
          <ui-popconfirm
            title=${msg('确定删除该录音吗？')}
            placement="bottom"
            .zIndex=${this.popupZIndex ?? Z_INDEX.POPCONFIRM}
            ?confirm-loading=${this._deletingId === recording.id}
            @confirm=${() => this._handleDelete(recording)}
          >
            <ui-button
              variant="danger"
              aria-label="${msg('删除')}"
              ?disabled="${this._deletingId === recording.id}"
            >
              <ui-icon name="delete"></ui-icon>
            </ui-button>
          </ui-popconfirm>
        </div>
      </div>
    `;
  };

  private _handleModalClose(): void {
    this._modalOpen = false;
    this._modalRecording = null;
    this._modalRecordingBlob = null;
    this._modalSourceBlob = null;
    this._modalSubtitleSegments = [];
    dispatchRecordingPreviewClose(this);
  }

  private async _handleView(recording: PracticeRecord): Promise<void> {
    if (this.previewDisabled) {
      Message.warning(msg('录音中无法预览，请先结束录音。'));
      return;
    }

    const [recordingBlob, sourceBlob, subtitleTrack] = await Promise.all([
      getRecordingBlob(recording.id),
      getMediaBlob(recording.mediaId),
      getSubtitle(recording.mediaId),
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
    dispatchRecordingPreviewOpen(this);
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
