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
import { getScoresByRecordIds } from '../../db/pronunciation-score.js';
import {
  ackSpeechScorePrivacy,
  formatOverallBadge,
  hasSpeechScorePrivacyAck,
  isSpeechScoreConfigured,
  requestScore,
  resolveReferenceText,
  SCORE_MAX_DURATION_SEC,
  scoreTooLongMessage,
} from '../../lib/pronunciation-score/index.js';
import { getAppSettings } from '../../lib/app-settings.js';
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
  SpeakingMode,
  PracticeRecord,
  PronunciationScore,
  SortDirection,
  SubtitleSegment,
  SubtitleTrack,
} from '../../types/models.js';
import { formatDate, formatTime } from '../../lib/playback-utils.js';
import { Message } from '../ui/message.js';

/** Row height including the --space-md (12px) gap below each card. */
const RECORD_ROW_HEIGHT = 88;
/** Narrow: meta + actions stacked; includes the same gap below each card. */
const RECORD_ROW_HEIGHT_NARROW = 112;
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

    .score-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.5rem;
      padding: 2px 6px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1.2;
      background: rgba(82, 196, 26, 0.14);
      color: #389e0d;
    }

    .score-badge.pending {
      background: rgba(22, 119, 255, 0.1);
      color: var(--color-primary, #1677ff);
    }

    .score-spinner {
      width: 10px;
      height: 10px;
      border: 2px solid rgba(22, 119, 255, 0.25);
      border-top-color: var(--color-primary, #1677ff);
      border-radius: 50%;
      animation: record-list-spin 0.8s linear infinite;
    }

    @keyframes record-list-spin {
      to {
        transform: rotate(360deg);
      }
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

    .batch-controls {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .batch-checkbox {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      cursor: pointer;
      accent-color: var(--color-primary, #1677ff);
    }

    :host([selection-mode]) .item {
      grid-template-columns: auto minmax(0, 1fr) auto;
      cursor: pointer;
    }

    @media (max-width: 767px) {
      .item {
        grid-template-columns: 1fr;
        align-items: start;
        align-content: start;
        gap: var(--space-xs);
        height: calc(100% - var(--space-xs));
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
  modeFilter?: SpeakingMode;

  /** When set, only show recordings for this subtitle segment (echo). */
  @property({ type: String })
  segmentId?: string;

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

  @property({ type: Boolean, reflect: true, attribute: 'selection-mode' })
  selectionMode = false;

  @state()
  private _selected = new Set<string>();

  @state()
  private _batchDeleting = false;

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

  @state()
  private _scores = new Map<string, PronunciationScore>();

  @state()
  private _scoringId = '';

  @state()
  private _privacyOpen = false;

  @state()
  private _privacyRecord: PracticeRecord | null = null;

  @state()
  private _subtitleByMediaId = new Map<string, SubtitleTrack | undefined>();

  private _visibleCount = 0;

  private _visibleIds: string[] = [];

  private _visibleSelected = new Set<string>();

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
      if (this.mediaId && this.mediaId.length > 0) {
        this._items = await findRecordings(this.mediaId);
      } else {
        this._items = (await getRecordingList()) || [];
      }
      // sort newest first
      this._items.sort((a, b) => b.createdAt - a.createdAt);
      try {
        this._scores = await getScoresByRecordIds(this._items.map((item) => item.id));
      } catch {
        this._scores = new Map();
      }
      try {
        const mediaIds = [...new Set(this._items.map((item) => item.mediaId))];
        const tracks = await Promise.all(mediaIds.map((mediaId) => getSubtitle(mediaId)));
        this._subtitleByMediaId = new Map(
          mediaIds.map((mediaId, index) => [mediaId, tracks[index]]),
        );
      } catch {
        this._subtitleByMediaId = new Map();
      }
    } catch {
      this._error = msg('无法加载录音');
      this._items = [];
      this._scores = new Map();
      this._subtitleByMediaId = new Map();
    } finally {
      this._loading = false;
    }
  }

  render() {
    let renderedItems = this._items;
    if (this.modeFilter) {
      renderedItems = renderedItems.filter((item) => item.mode === this.modeFilter);
    }
    if (this.segmentId) {
      renderedItems = renderedItems.filter(
        (item) => (item.segmentId ?? item.segments[0]?.id) === this.segmentId,
      );
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

    const visibleIds = renderedItems.map((item) => item.id);
    this._visibleIds = visibleIds;

    const visibleSet = new Set(visibleIds);
    this._visibleSelected = new Set([...this._selected].filter((id) => visibleSet.has(id)));

    return html`
      <section>
        ${this.showHeader
          ? html`<div class="header">
              <h2>${msg('录音库')}</h2>
              ${this.selectionMode
                ? html`<div class="batch-controls">
                    <ui-button
                      variant="secondary"
                      size="small"
                      @click=${() => this._selectAll(visibleIds)}
                      >${msg('全选')}</ui-button
                    >
                    <ui-button
                      variant="secondary"
                      size="small"
                      @click=${() => this._invertSelection(visibleIds)}
                      >${msg('反选')}</ui-button
                    >
                    <ui-popconfirm
                      title=${msg('确定删除选中的录音吗？')}
                      placement="bottom"
                      ?confirm-loading=${this._batchDeleting}
                      @confirm=${() => this._handleBatchDelete()}
                    >
                      <ui-button
                        variant="danger"
                        size="small"
                        ?disabled=${this._visibleSelected.size === 0 || this._batchDeleting}
                      >
                        ${msg('删除')} (${this._visibleSelected.size})
                      </ui-button>
                    </ui-popconfirm>
                    <ui-button
                      variant="secondary"
                      size="small"
                      @click=${() => this.exitSelectionMode()}
                      >${msg('取消')}</ui-button
                    >
                  </div>`
                : html`<div class="batch-controls">
                    <span class="count">${renderedItems.length} ${msg('项')}</span>
                    ${renderedItems.length > 0
                      ? html`<ui-button
                          variant="secondary"
                          size="small"
                          @click=${() => {
                            this.selectionMode = true;
                          }}
                          >${msg('管理')}</ui-button
                        >`
                      : null}
                  </div>`}
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
                .record=${this._modalRecording}
                .sourceBlob=${this._modalSourceBlob}
                .recordingBlob=${this._modalRecordingBlob}
                .segments=${this._modalRecording?.segments ?? []}
                .subtitleSegments=${this._modalSubtitleSegments}
                .practiceMode=${this._modalRecording?.mode ?? 'shadowing'}
                .gapPolicy=${this._modalRecording?.gapPolicy ?? null}
                @score-updated=${() => void this._onScoreUpdated()}
              ></recording-preview>`
            : null}
        </ui-modal>
        <ui-modal
          title="${msg('上传说明')}"
          .zIndex=${(this.popupZIndex ?? Z_INDEX.MODAL) + 80}
          ?open=${this._privacyOpen}
          ok-text="${msg('同意并评分')}"
          cancel-text="${msg('取消')}"
          width="420px"
          centered
          @ok=${() => this._confirmPrivacy()}
          @cancel=${() => this._cancelPrivacy()}
          @update:open="${(e: CustomEvent<{ open: boolean }>) => {
            if (e.target !== e.currentTarget) return;
            if (!e.detail.open) this._cancelPrivacy();
          }}"
        >
          <p>${msg('评分会将录音上传到你配置的服务器以计算分数。服务端不保存音频。是否继续？')}</p>
        </ui-modal>
      </section>
    `;
  }

  private _modeLabel(mode: SpeakingMode): string {
    return mode === 'echo' ? msg('回声') : msg('影子');
  }

  private _renderItem = (item: unknown): unknown => {
    const recording = item as PracticeRecord;
    const showModeBadge = !this.modeFilter;
    const score = this._scores.get(recording.id);
    const scoring = this._scoringId === recording.id || score?.status === 'pending';
    const tooLong = recording.recordingDuration > SCORE_MAX_DURATION_SEC;
    const noReference = !resolveReferenceText(
      recording,
      this._subtitleByMediaId.get(recording.mediaId),
    );
    const scoreBlocked = scoring || tooLong || noReference;
    const scoreLabel =
      score?.status === 'success' ? msg('重新评分') : scoring ? msg('评分中') : msg('评分');
    const scoreTip = tooLong
      ? scoreTooLongMessage()
      : noReference
        ? msg('需要对照原稿才能评分')
        : scoreLabel;
    return html`
      <div
        class="item"
        @click=${this.selectionMode ? () => this._toggleSelection(recording.id) : null}
      >
        ${this.selectionMode
          ? html`<input
              type="checkbox"
              class="batch-checkbox"
              .checked=${this._visibleSelected.has(recording.id)}
              @change=${() => this._toggleSelection(recording.id)}
              @click=${(e: Event) => e.stopPropagation()}
            />`
          : null}
        <div class="meta">
          <p class="title">${recording.mediaTitle}</p>
          <p class="details">
            ${showModeBadge
              ? html`<span class="badge ${recording.mode}"
                  >${this._modeLabel(recording.mode)}</span
                >`
              : null}
            ${this._renderScoreBadge(score)}
            <span>${formatTime(recording.recordingDuration)}</span>
            <span class="date">${formatDate(recording.createdAt, true)}</span>
          </p>
        </div>
        <div class="actions" @click=${(e: Event) => e.stopPropagation()}>
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
          <ui-tooltip title="${scoreTip}">
            <ui-button
              variant="secondary"
              aria-label="${scoreLabel}"
              ?disabled=${scoreBlocked}
              @click="${() => this._handleScore(recording)}"
            >
              <ui-icon name="score"></ui-icon>
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

  private _renderScoreBadge(score: PronunciationScore | undefined) {
    if (score?.status === 'pending') {
      return html`<span class="score-badge pending" aria-label="${msg('评分中')}"
        ><span class="score-spinner"></span
      ></span>`;
    }
    if (score?.status === 'success' && typeof score.overall === 'number') {
      return html`<span class="score-badge">${formatOverallBadge(score.overall)}</span>`;
    }
    return null;
  }

  private async _handleScore(recording: PracticeRecord): Promise<void> {
    if (this._scoringId || recording.recordingDuration > SCORE_MAX_DURATION_SEC) {
      return;
    }
    if (!resolveReferenceText(recording, this._subtitleByMediaId.get(recording.mediaId))) {
      return;
    }
    if (!isSpeechScoreConfigured(getAppSettings())) {
      Message.warning(msg('请先在设置中填写评分服务地址和 API Key'));
      return;
    }
    if (!hasSpeechScorePrivacyAck()) {
      this._privacyRecord = recording;
      this._privacyOpen = true;
      return;
    }
    await this._runScore(recording);
  }

  private _cancelPrivacy(): void {
    this._privacyOpen = false;
    this._privacyRecord = null;
  }

  private async _confirmPrivacy(): Promise<void> {
    const recording = this._privacyRecord;
    ackSpeechScorePrivacy();
    this._privacyOpen = false;
    this._privacyRecord = null;
    if (recording) {
      await this._runScore(recording);
    }
  }

  private async _runScore(recording: PracticeRecord): Promise<void> {
    this._scoringId = recording.id;
    try {
      const result = await requestScore(recording, {
        onStatus: (score) => {
          const next = new Map(this._scores);
          next.set(recording.id, score);
          this._scores = next;
        },
      });
      if (!result.ok && result.reason === 'not_configured') {
        Message.warning(result.message);
      } else if (!result.ok && result.score?.status === 'success') {
        Message.warning(result.message);
      } else if (!result.ok) {
        Message.error(result.message);
      } else {
        Message.success(msg('评分完成'));
      }
      await this.refresh();
      this._emitRecordingsChanged('scored');
    } finally {
      this._scoringId = '';
    }
  }

  private async _onScoreUpdated(): Promise<void> {
    await this.refresh();
    this._emitRecordingsChanged('scored');
  }

  private _emitRecordingsChanged(reason: 'scored' | 'deleted' | 'batch-deleted'): void {
    this.dispatchEvent(
      new CustomEvent('recordings-changed', {
        detail: { reason },
        bubbles: true,
        composed: true,
      }),
    );
  }

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
      this._emitRecordingsChanged('deleted');
    } catch {
      this._error = msg('删除失败，请重试。');
    } finally {
      this._deletingId = '';
    }
  }

  private _toggleSelection(id: string): void {
    const next = new Set(this._selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this._selected = next;
  }

  private _selectAll(visibleIds: string[]): void {
    this._selected = new Set(visibleIds);
  }

  private _invertSelection(visibleIds: string[]): void {
    const next = new Set<string>();
    for (const id of visibleIds) {
      if (!this._selected.has(id)) next.add(id);
    }
    this._selected = next;
  }

  exitSelectionMode(): void {
    this.selectionMode = false;
    this._selected = new Set();
  }

  private async _handleBatchDelete(): Promise<void> {
    const visibleSet = new Set(this._visibleIds);
    const toDelete = [...this._selected].filter((id) => visibleSet.has(id));
    if (toDelete.length === 0) return;
    this._batchDeleting = true;
    try {
      const results = await Promise.allSettled(toDelete.map((id) => deleteRecording(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        Message.error(msg('部分录音删除失败'));
      } else {
        Message.success(msg('批量删除完成'));
      }
      const deleted = new Set(toDelete);
      this._selected = new Set([...this._selected].filter((id) => !deleted.has(id)));
      await this.refresh();
      this._emitRecordingsChanged('batch-deleted');
    } finally {
      this._batchDeleting = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'record-list': RecordList;
  }
}
