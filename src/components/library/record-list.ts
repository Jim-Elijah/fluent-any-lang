import { msg, localized, str } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { getMediaBlob } from '../../db/media.js';
import {
  findRecordings,
  deleteRecording,
  deleteRecordingBatch,
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
  overallBadgeBand,
  requestScore,
  resolveReferenceText,
  SCORE_MAX_DURATION_SEC,
  scoreTooLongMessage,
} from '../../lib/pronunciation-score/index.js';
import { scoreBandStyles } from '../shared/score-band-styles.js';
import { getAppSettings } from '../../lib/app-settings.js';
import { exportRecording, exportRecordingsBatch } from '../../lib/export-content.js';
import { reportError } from '../../lib/error-reporter.js';
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
import '../ui/dropdown.js';
import './recording-preview.js';
import '../ui/icon.js';
import '../ui/tooltip.js';
import type { DropdownMenuClickDetail, DropdownMenuItem } from '../ui/dropdown.js';
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
import {
  resolvePracticeRecordSegmentOrdinal,
  resolvePracticeRecordSummary,
} from '../../lib/practice-record-display.js';
import { Message } from '../ui/message.js';

/** Row height including the --space-md (12px) gap below each card. */
const RECORD_ROW_HEIGHT = 104;
/** Narrow: meta + actions stacked; includes the same gap below each card. */
const RECORD_ROW_HEIGHT_NARROW = 116;
const RECORD_LIST_HEIGHT = 480;

@customElement('record-list')
@localized()
export class RecordList extends LitElement {
  static styles = [
    scoreBandStyles,
    css`
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

      .selection-chrome {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
        margin-bottom: var(--space-block);
        flex-shrink: 0;
      }

      .selection-chrome .header {
        margin-bottom: 0;
      }

      .selection-count {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
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

      .context {
        display: flex;
        align-items: baseline;
        gap: var(--space-sm);
        margin: 0 0 var(--space-xs);
        min-width: 0;
        font-size: 0.8125rem;
        line-height: 1.35;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      }

      .context .ordinal {
        flex-shrink: 0;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--color-text, rgba(0, 0, 0, 0.88));
      }

      .context .excerpt {
        min-width: 0;
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
        flex-wrap: wrap;
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

        /* Override desktop 3-col selection layout so actions stay on their own row. */
        :host([selection-mode]) .item {
          grid-template-columns: auto minmax(0, 1fr);
        }

        :host([selection-mode]) .actions {
          grid-column: 1 / -1;
        }

        .details {
          gap: var(--space-xs);
        }

        .actions {
          gap: var(--space-xs);
          justify-content: flex-end;
        }
      }
    `,
  ];

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
  private _batchExporting = false;

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
  private _pendingKeepOnly: {
    keepId: string;
    deleteIds: string[];
    deleteCount: number;
  } | null = null;

  @state()
  private _keepOnlyDeleting = false;

  @state()
  private _keepOnlyTargetId = '';

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
      renderedItems = renderedItems.filter((item) => this._matchesKeyword(item, this.keyword!));
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
    const allVisibleSelected =
      visibleIds.length > 0 && this._visibleSelected.size === visibleIds.length;

    return html`
      <section>
        ${this.showHeader
          ? this.selectionMode
            ? html`<div class="selection-chrome">
                <div class="header">
                  <p class="selection-count">${msg(str`已选 ${this._visibleSelected.size} 项`)}</p>
                  <ui-button variant="secondary" @click=${() => this.exitSelectionMode()}
                    >${msg('取消')}</ui-button
                  >
                </div>
                <div class="batch-controls">
                  <ui-tooltip title="${allVisibleSelected ? msg('取消全选') : msg('全选')}">
                    <ui-button
                      variant="secondary"
                      aria-label="${allVisibleSelected ? msg('取消全选') : msg('全选')}"
                      @click=${() =>
                        allVisibleSelected ? this._clearSelection() : this._selectAll(visibleIds)}
                    >
                      <ui-icon
                        name="${allVisibleSelected ? 'unselect-all' : 'select-all'}"
                      ></ui-icon>
                    </ui-button>
                  </ui-tooltip>
                  <ui-tooltip title="${msg('导出')}">
                    <ui-button
                      variant="secondary"
                      aria-label="${msg('导出')}"
                      ?disabled=${this._visibleSelected.size === 0 || this._batchExporting}
                      @click=${() => void this._handleBatchExport()}
                    >
                      <ui-icon name="download"></ui-icon>
                    </ui-button>
                  </ui-tooltip>
                  <ui-popconfirm
                    title=${msg(str`确定删除选中的 ${this._visibleSelected.size} 项吗？`)}
                    placement="bottom"
                    ?confirm-loading=${this._batchDeleting}
                    @confirm=${() => this._handleBatchDelete()}
                  >
                    <ui-tooltip title="${msg('删除')}">
                      <ui-button
                        variant="danger"
                        aria-label="${msg('删除')}"
                        ?disabled=${this._visibleSelected.size === 0 || this._batchDeleting}
                      >
                        <ui-icon name="delete"></ui-icon>
                      </ui-button>
                    </ui-tooltip>
                  </ui-popconfirm>
                </div>
              </div>`
            : html`<div class="header">
                <h2>${msg('录音库')}</h2>
                <div class="batch-controls">
                  <span class="count">${renderedItems.length} ${msg('项')}</span>
                  ${renderedItems.length > 0
                    ? html`<ui-button
                        variant="secondary"
                        @click=${() => {
                          this.selectionMode = true;
                        }}
                        >${msg('管理')}</ui-button
                      >`
                    : null}
                </div>
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
        <ui-modal
          title="${msg('确定仅保留本条录音吗？')}"
          .zIndex=${this._confirmOverlayZIndex()}
          ?open=${Boolean(this._pendingKeepOnly)}
          ok-text="${msg('保留本条')}"
          cancel-text="${msg('取消')}"
          width="420px"
          centered
          ?confirm-loading=${this._keepOnlyDeleting}
          @ok=${() => void this._confirmKeepOnly()}
          @cancel=${() => this._cancelPendingKeepOnly()}
          @update:open="${(e: CustomEvent<{ open: boolean }>) => {
            if (e.target !== e.currentTarget) return;
            if (!e.detail.open) this._cancelPendingKeepOnly();
          }}"
        >
          ${this._pendingKeepOnly
            ? html`<p>
                ${msg(str`将删除同句其余 ${this._pendingKeepOnly.deleteCount} 条录音，不可恢复。`)}
              </p>`
            : nothing}
        </ui-modal>
      </section>
    `;
  }

  /** Title or full subtitle reference (snapshot, else live track). Not the truncated list excerpt. */
  private _matchesKeyword(item: PracticeRecord, keyword: string): boolean {
    const q = keyword.trim().toLowerCase();
    if (!q) {
      return true;
    }
    if (item.mediaTitle.toLowerCase().includes(q)) {
      return true;
    }
    const reference = resolveReferenceText(item, this._subtitleByMediaId.get(item.mediaId));
    return (reference ?? '').toLowerCase().includes(q);
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
    const scoreConfigured = isSpeechScoreConfigured(getAppSettings());
    const scoreBlocked = scoring || tooLong || noReference;
    const scoreLabel =
      score?.status === 'success' ? msg('重新评分') : scoring ? msg('评分中') : msg('评分');
    const scoreTip = tooLong
      ? scoreTooLongMessage()
      : noReference
        ? msg('需要对照原稿才能评分')
        : scoreLabel;
    const subtitleTrack = this._subtitleByMediaId.get(recording.mediaId);
    const segmentOrdinal = resolvePracticeRecordSegmentOrdinal(recording, subtitleTrack);
    const summary = resolvePracticeRecordSummary(recording, subtitleTrack);
    const contextLine =
      segmentOrdinal || summary
        ? html`<p class="context">
            ${segmentOrdinal ? html`<span class="ordinal">#${segmentOrdinal}</span>` : nothing}
            ${summary
              ? html`<span class="excerpt">${summary}</span>`
              : segmentOrdinal
                ? nothing
                : html`<span class="excerpt">—</span>`}
          </p>`
        : nothing;
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
          ${contextLine}
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
          ${this._renderRowActions(recording, scoreConfigured, scoreLabel, scoreTip, scoreBlocked)}
        </div>
      </div>
    `;
  };

  private _dropdownZIndex(): number {
    return this.popupZIndex ?? Z_INDEX.DROPDOWN;
  }

  private _confirmOverlayZIndex(): number {
    return this.popupZIndex != null ? this.popupZIndex + 50 : Z_INDEX.POPCONFIRM;
  }

  private _resolveSegmentId(recording: PracticeRecord): string | undefined {
    return recording.segmentId ?? recording.segments[0]?.id;
  }

  private _echoTakeIds(recording: PracticeRecord): string[] {
    const segmentId = this._resolveSegmentId(recording);
    if (!segmentId || recording.mode !== 'echo') {
      return [];
    }
    return this._items
      .filter(
        (item) =>
          item.mode === 'echo' &&
          item.mediaId === recording.mediaId &&
          this._resolveSegmentId(item) === segmentId,
      )
      .map((item) => item.id);
  }

  private _canKeepOnly(recording: PracticeRecord): boolean {
    return this._echoTakeIds(recording).length >= 2;
  }

  private _keepOnlyDeleteIds(recording: PracticeRecord): string[] {
    return this._echoTakeIds(recording).filter((id) => id !== recording.id);
  }

  private _getRowMenuItems(recording: PracticeRecord): DropdownMenuItem[] {
    const items: DropdownMenuItem[] = [{ key: 'export', label: msg('导出'), icon: 'download' }];
    if (this._canKeepOnly(recording)) {
      items.push({
        key: 'keep-only',
        label: msg('仅保留本条'),
        danger: true,
        disabled: this._keepOnlyDeleting,
      });
    }
    return items;
  }

  private _renderRowActions(
    recording: PracticeRecord,
    scoreConfigured: boolean,
    scoreLabel: string,
    scoreTip: string,
    scoreBlocked: boolean,
  ) {
    const canKeepOnly = this._canKeepOnly(recording);
    const keepOnlyDeleteCount = this._keepOnlyDeleteIds(recording).length;
    const deletePopconfirm = html`<ui-popconfirm
      title=${msg('确定删除该录音吗？')}
      placement="bottom"
      .zIndex=${this._confirmOverlayZIndex()}
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
    </ui-popconfirm>`;

    const keepOnlyPopconfirm = canKeepOnly
      ? html`<ui-popconfirm
          title=${msg(
            str`确定仅保留本条吗？将删除同句其余 ${keepOnlyDeleteCount} 条录音，不可恢复。`,
          )}
          placement="bottom"
          .zIndex=${this._confirmOverlayZIndex()}
          ?confirm-loading=${this._keepOnlyDeleting && this._keepOnlyTargetId === recording.id}
          @confirm=${() => void this._executeKeepOnly(recording)}
        >
          <ui-button
            variant="secondary"
            aria-label="${msg('仅保留本条')}"
            ?disabled=${this._keepOnlyDeleting}
          >
            <ui-icon name="select-all"></ui-icon>
          </ui-button>
        </ui-popconfirm>`
      : null;

    const moreMenu = html`<ui-dropdown
      trigger="click"
      placement="bottomRight"
      .zIndex=${this._dropdownZIndex()}
      .menu=${{ items: this._getRowMenuItems(recording) }}
      @menu-click=${(e: CustomEvent<DropdownMenuClickDetail>) =>
        this._handleRowMenuClick(e, recording)}
    >
      <ui-tooltip title="${msg('更多操作')}" .zIndex=${this._dropdownZIndex()}>
        <ui-button variant="secondary" aria-label="${msg('更多操作')}">
          <ui-icon name="more"></ui-icon>
        </ui-button>
      </ui-tooltip>
    </ui-dropdown>`;

    return html`
      <ui-tooltip title="${msg('查看')}">
        <ui-button
          variant="primary"
          aria-label="${msg('查看')}"
          @click="${() => this._handleView(recording)}"
        >
          <ui-icon name="play"></ui-icon>
        </ui-button>
      </ui-tooltip>
      ${scoreConfigured
        ? html`<ui-tooltip title="${scoreTip}">
              <ui-button
                variant="secondary"
                aria-label="${scoreLabel}"
                ?disabled=${scoreBlocked}
                @click="${() => this._handleScore(recording)}"
              >
                <ui-icon name="score"></ui-icon>
              </ui-button>
            </ui-tooltip>
            ${deletePopconfirm} ${moreMenu}`
        : html`<ui-tooltip title="${msg('导出')}">
              <ui-button
                variant="secondary"
                aria-label="${msg('导出')}"
                @click="${() => this._handleExport(recording)}"
              >
                <ui-icon name="download"></ui-icon>
              </ui-button>
            </ui-tooltip>
            ${keepOnlyPopconfirm} ${deletePopconfirm}`}
    `;
  }

  private _handleRowMenuClick(
    event: CustomEvent<DropdownMenuClickDetail>,
    recording: PracticeRecord,
  ): void {
    const { key } = event.detail;
    if (key === 'export') {
      void this._handleExport(recording);
      return;
    }
    if (key === 'keep-only') {
      this._requestKeepOnly(recording);
    }
  }

  private _requestKeepOnly(recording: PracticeRecord): void {
    const deleteIds = this._keepOnlyDeleteIds(recording);
    if (deleteIds.length === 0) {
      return;
    }
    this._pendingKeepOnly = {
      keepId: recording.id,
      deleteIds,
      deleteCount: deleteIds.length,
    };
  }

  private _cancelPendingKeepOnly(): void {
    if (this._keepOnlyDeleting) {
      return;
    }
    this._pendingKeepOnly = null;
  }

  private async _executeKeepOnly(recording: PracticeRecord): Promise<void> {
    const deleteIds = this._keepOnlyDeleteIds(recording);
    if (deleteIds.length === 0) {
      return;
    }

    this._keepOnlyDeleting = true;
    this._keepOnlyTargetId = recording.id;
    try {
      await deleteRecordingBatch(deleteIds);
      Message.success(msg('已保留本条录音'));
      await this.refresh();
      this._emitRecordingsChanged('batch-deleted');
    } catch (error) {
      void reportError(error, {
        where: 'record-list.keepOnly',
        keepId: recording.id,
        count: deleteIds.length,
      });
      Message.error(msg('删除其余录音失败，请重试。'));
    } finally {
      this._keepOnlyDeleting = false;
      this._keepOnlyTargetId = '';
    }
  }

  private async _confirmKeepOnly(): Promise<void> {
    const pending = this._pendingKeepOnly;
    if (!pending) {
      return;
    }

    this._keepOnlyDeleting = true;
    try {
      await deleteRecordingBatch(pending.deleteIds);
      Message.success(msg('已保留本条录音'));
      this._pendingKeepOnly = null;
      await this.refresh();
      this._emitRecordingsChanged('batch-deleted');
    } catch (error) {
      void reportError(error, {
        where: 'record-list.keepOnly',
        keepId: pending.keepId,
        count: pending.deleteIds.length,
      });
      Message.error(msg('删除其余录音失败，请重试。'));
    } finally {
      this._keepOnlyDeleting = false;
    }
  }

  private _renderScoreBadge(score: PronunciationScore | undefined) {
    if (score?.status === 'pending') {
      return html`<span class="score-badge pending" aria-label="${msg('评分中')}"
        ><span class="score-spinner"></span
      ></span>`;
    }
    if (score?.status === 'success' && typeof score.overall === 'number') {
      return html`<span class="score-badge score-band ${overallBadgeBand(score.overall)}"
        >${formatOverallBadge(score.overall)}</span
      >`;
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

  private _clearSelection(): void {
    this._selected = new Set();
  }

  exitSelectionMode(): void {
    this.selectionMode = false;
    this._selected = new Set();
  }

  private async _handleBatchExport(): Promise<void> {
    const visibleSet = new Set(this._visibleIds);
    const toExport = this._items.filter(
      (item) => this._selected.has(item.id) && visibleSet.has(item.id),
    );
    if (toExport.length === 0) return;
    this._batchExporting = true;
    try {
      const { failedCount } = await exportRecordingsBatch(toExport);
      if (failedCount > 0) {
        Message.error(msg('部分录音导出失败'));
      } else {
        Message.success(msg(str`已导出 ${toExport.length} 项`));
      }
    } finally {
      this._batchExporting = false;
    }
  }

  private async _handleBatchDelete(): Promise<void> {
    const visibleSet = new Set(this._visibleIds);
    const toDelete = [...this._selected].filter((id) => visibleSet.has(id));
    if (toDelete.length === 0) return;
    this._batchDeleting = true;
    try {
      try {
        await deleteRecordingBatch(toDelete);
        Message.success(msg('批量删除完成'));
        const deleted = new Set(toDelete);
        this._selected = new Set([...this._selected].filter((id) => !deleted.has(id)));
        await this.refresh();
        this._emitRecordingsChanged('batch-deleted');
      } catch (error) {
        void reportError(error, { where: 'record-list.batchDelete', count: toDelete.length });
        Message.error(msg('部分录音删除失败'));
      }
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
