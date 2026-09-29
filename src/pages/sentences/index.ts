import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { navigator } from 'lit-element-router';

import {
  deleteSentenceBankEntry,
  deleteSentenceBankEntriesBatch,
  getSentenceBankList,
} from '../../db/service.js';
import { reportError } from '../../lib/error-reporter.js';
import {
  exportSentenceBankEntry,
  exportSentenceBankEntriesBatch,
} from '../../lib/export-content.js';
import { COMPACT_VIEWPORT_MQ } from '../../lib/layout-compact.js';
import { formatDate, formatTime } from '../../lib/playback-utils.js';
import type { SentenceBankEntry, SortDirection } from '../../types/models.js';
import { Message } from '../../components/ui/message.js';

import '../../components/library/library-list-toolbar.js';
import '../../components/library/library-section-back.js';
import '../../components/ui/alert.js';
import '../../components/ui/button.js';
import '../../components/ui/icon.js';
import '../../components/ui/popconfirm.js';
import '../../components/ui/tooltip.js';
import type { LibraryListToolbarChangeDetail } from '../../components/library/library-list-toolbar.js';
import type { SelectOption } from '../../components/ui/select.js';

const NavigatorElement = navigator(LitElement);

@customElement('sentences-page')
@localized()
export class SentencesPage extends NavigatorElement {
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

    .layout {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      gap: var(--space-sm);
    }

    .hint {
      flex-shrink: 0;
      margin: 0;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.45));
      font-size: 0.8125rem;
    }

    .list-section {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    :host([compact]) .list-section {
      flex: none;
      overflow: visible;
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

    .list-viewport {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }

    :host([compact]) .list-viewport {
      flex: none;
      overflow: visible;
    }

    .list {
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-md);
      align-items: start;
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

    .text {
      margin: 0 0 var(--space-xs);
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.45;
      word-break: break-word;
    }

    .translation {
      margin: 0 0 var(--space-xs);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.875rem;
      line-height: 1.45;
      word-break: break-word;
    }

    .details {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-sm);
      margin: 0;
      min-width: 0;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.8125rem;
    }

    .details > span {
      flex-shrink: 0;
      white-space: nowrap;
    }

    .details > .source {
      flex-shrink: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .details.unavailable {
      color: var(--color-warning, #d48806);
    }

    .details.unavailable .badge {
      color: var(--color-warning, #d48806);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      color: var(--color-primary, #1677ff);
      font-weight: 500;
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

    .error {
      margin-bottom: var(--space-block);
      flex-shrink: 0;
    }

    :host([selection-mode]) .item {
      grid-template-columns: auto minmax(0, 1fr) auto;
      cursor: pointer;
    }

    @media (max-width: 767px) {
      .list {
        gap: var(--space-xs);
      }

      .item {
        grid-template-columns: 1fr;
        gap: var(--space-xs);
        padding: var(--space-sm) var(--space-md);
      }

      :host([selection-mode]) .item {
        grid-template-columns: auto minmax(0, 1fr);
      }

      :host([selection-mode]) .actions {
        grid-column: 1 / -1;
        justify-self: end;
      }

      .actions {
        justify-content: flex-end;
      }
    }
  `;

  @property({ type: Boolean, reflect: true })
  compact = false;

  @property({ type: Boolean, reflect: true, attribute: 'selection-mode' })
  selectionMode = false;

  @state()
  private _entries: SentenceBankEntry[] = [];

  @state()
  private _loading = true;

  @state()
  private _error = '';

  @state()
  private _busyId = '';

  @state()
  private _selected = new Set<string>();

  @state()
  private _batchDeleting = false;

  @state()
  private _batchExporting = false;

  @state()
  private _keyword = '';

  @state()
  private _sortBy: string = 'date';

  @state()
  private _sortDirection: SortDirection = 'desc';

  private _visibleIds: string[] = [];

  private _visibleSelected = new Set<string>();

  private _compactMq?: MediaQueryList;

  connectedCallback(): void {
    super.connectedCallback();
    this._compactMq = window.matchMedia(COMPACT_VIEWPORT_MQ);
    this.compact = this._compactMq.matches;
    this._compactMq.addEventListener('change', this._onCompactMqChange);
    void this._load();
  }

  disconnectedCallback(): void {
    this._compactMq?.removeEventListener('change', this._onCompactMqChange);
    super.disconnectedCallback();
  }

  private _onCompactMqChange = (e: MediaQueryListEvent) => {
    this.compact = e.matches;
  };

  private async _load(): Promise<void> {
    this._loading = true;
    this._error = '';
    try {
      this._entries = await getSentenceBankList();
    } catch (error) {
      void reportError(error, { where: 'sentences-page.load' });
      this._error = msg('加载句库失败');
      this._entries = [];
    } finally {
      this._loading = false;
    }
  }

  private _getSortByOptions(): SelectOption[] {
    return [
      { value: 'date', label: msg('日期') },
      { value: 'source', label: msg('来源') },
      { value: 'text', label: msg('句子') },
    ];
  }

  private _onFiltersChange = (e: CustomEvent<LibraryListToolbarChangeDetail>): void => {
    this._keyword = e.detail.keyword;
    this._sortBy = e.detail.sortBy;
    this._sortDirection = e.detail.sortDirection;
  };

  private _getVisibleEntries(): SentenceBankEntry[] {
    const keyword = this._keyword.trim().toLowerCase();
    let items = this._entries.filter((entry) => !entry.removed);

    if (keyword) {
      items = items.filter((entry) => {
        const haystack = [entry.text, entry.translation ?? '', entry.sourceTitleSnapshot]
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      });
    }

    return [...items].sort((a, b) => {
      const dir = this._sortDirection === 'asc' ? 1 : -1;
      if (this._sortBy === 'source') {
        return dir * a.sourceTitleSnapshot.localeCompare(b.sourceTitleSnapshot);
      }
      if (this._sortBy === 'text') {
        return dir * a.text.localeCompare(b.text);
      }
      return dir * (a.createdAt - b.createdAt);
    });
  }

  private _practice(entry: SentenceBankEntry): void {
    this.navigate(`/sentence-practice?id=${encodeURIComponent(entry.id)}`);
  }

  private _viewSource(entry: SentenceBankEntry): void {
    if (!entry.sourceAvailable) {
      Message.warning(msg('源媒体已删除，无法查看来源'));
      return;
    }
    const query = new URLSearchParams({
      mediaId: entry.sourceMediaId,
      segmentId: entry.sourceSegmentId,
    });
    this.navigate(`/practice?${query.toString()}`);
  }

  private async _export(entry: SentenceBankEntry): Promise<void> {
    try {
      await exportSentenceBankEntry(entry);
    } catch (error) {
      void reportError(error, { where: 'sentences-page.export', entryId: entry.id });
      Message.error(msg('导出失败，请重试'));
    }
  }

  private async _delete(entry: SentenceBankEntry): Promise<void> {
    if (this._busyId) {
      return;
    }
    this._busyId = entry.id;
    try {
      await deleteSentenceBankEntry(entry.id);
      this._entries = this._entries.filter((item) => item.id !== entry.id);
      this._selected = new Set([...this._selected].filter((id) => id !== entry.id));
      Message.success(msg('已从句库移除'));
    } catch (error) {
      void reportError(error, { where: 'sentences-page.delete', entryId: entry.id });
      Message.error(msg('删除失败，请重试'));
    } finally {
      this._busyId = '';
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

  private _exitSelectionMode(): void {
    this.selectionMode = false;
    this._selected = new Set();
  }

  private async _handleBatchExport(): Promise<void> {
    const visibleSet = new Set(this._visibleIds);
    const toExport = this._entries.filter(
      (item) => this._selected.has(item.id) && visibleSet.has(item.id) && !item.removed,
    );
    if (toExport.length === 0) return;
    this._batchExporting = true;
    try {
      const { failedCount } = await exportSentenceBankEntriesBatch(toExport);
      if (failedCount > 0) {
        Message.error(msg('部分条目导出失败'));
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
        await deleteSentenceBankEntriesBatch(toDelete);
        Message.success(msg('批量删除完成'));
        const deleted = new Set(toDelete);
        this._entries = this._entries.filter((item) => !deleted.has(item.id));
        this._selected = new Set([...this._selected].filter((id) => !deleted.has(id)));
      } catch (error) {
        void reportError(error, { where: 'sentences-page.batchDelete', count: toDelete.length });
        Message.error(msg('部分条目删除失败'));
      }
    } finally {
      this._batchDeleting = false;
    }
  }

  render() {
    const visibleEntries = this._getVisibleEntries();
    const visibleIds = visibleEntries.map((entry) => entry.id);
    this._visibleIds = visibleIds;
    const visibleSet = new Set(visibleIds);
    this._visibleSelected = new Set([...this._selected].filter((id) => visibleSet.has(id)));
    const allVisibleSelected =
      visibleIds.length > 0 && this._visibleSelected.size === visibleIds.length;

    return html`
      <div class="layout">
        <library-section-back></library-section-back>
        <library-list-toolbar
          .keyword=${this._keyword}
          .sortBy=${this._sortBy}
          .sortDirection=${this._sortDirection}
          .sortByOptions=${this._getSortByOptions()}
          searchPlaceholder="${msg('搜索句子 / 来源标题')}"
          @filters-change=${this._onFiltersChange}
        ></library-list-toolbar>

        <p class="hint">${msg('收藏喜欢的句子，单独练习或跳回原媒体上下文。')}</p>

        ${this._error
          ? html`<ui-alert class="error" type="error">${this._error}</ui-alert>`
          : nothing}

        <section class="list-section">
          ${this.selectionMode
            ? html`<div class="selection-chrome">
                <div class="header">
                  <p class="selection-count">${msg(str`已选 ${this._visibleSelected.size} 项`)}</p>
                  <ui-button variant="secondary" @click=${() => this._exitSelectionMode()}
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
                    @confirm=${() => void this._handleBatchDelete()}
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
                <h2>${msg('句库')}</h2>
                <div class="batch-controls">
                  <span class="count">${msg(str`${visibleEntries.length} 句`)}</span>
                  ${visibleEntries.length > 0
                    ? html`<ui-button
                        variant="secondary"
                        @click=${() => {
                          this.selectionMode = true;
                        }}
                        >${msg('管理')}</ui-button
                      >`
                    : nothing}
                </div>
              </div>`}
          ${this._loading
            ? html`<div class="empty">${msg('加载中…')}</div>`
            : visibleEntries.length === 0
              ? html`<div class="empty">
                  ${this._keyword.trim() || this._entries.length > 0
                    ? msg('无匹配内容')
                    : msg('句库为空。在练习页点击字幕旁的 ♡ 即可加入。')}
                </div>`
              : html`
                  <div class="list-viewport">
                    <ul class="list">
                      ${visibleEntries.map((entry) => this._renderEntry(entry))}
                    </ul>
                  </div>
                `}
        </section>
      </div>
    `;
  }

  private _renderEntry(entry: SentenceBankEntry) {
    const duration = Math.max(0, entry.sourceEndTime - entry.sourceStartTime);
    const isVideo = entry.sourceMediaType === 'video';

    return html`
      <li class="item" @click=${this.selectionMode ? () => this._toggleSelection(entry.id) : null}>
        ${this.selectionMode
          ? html`<input
              type="checkbox"
              class="batch-checkbox"
              .checked=${this._visibleSelected.has(entry.id)}
              @change=${() => this._toggleSelection(entry.id)}
              @click=${(e: Event) => e.stopPropagation()}
            />`
          : nothing}
        <div class="meta">
          <p class="text">${entry.text}</p>
          ${entry.translation ? html`<p class="translation">${entry.translation}</p>` : nothing}
          <p class="details ${entry.sourceAvailable ? '' : 'unavailable'}">
            <span class="badge">
              <ui-tooltip title="${isVideo ? msg('视频') : msg('音频')}">
                <ui-icon name="${isVideo ? 'video' : 'music'}" size="var(--icon-md)"></ui-icon>
              </ui-tooltip>
            </span>
            <span class="source">${msg(str`来自：${entry.sourceTitleSnapshot}`)}</span>
            <span>${formatTime(duration)}</span>
            <span>${formatDate(entry.createdAt, true)}</span>
            ${entry.sourceAvailable ? nothing : html`<span>${msg('源媒体已删除')}</span>`}
          </p>
        </div>
        <div class="actions" @click=${(e: Event) => e.stopPropagation()}>
          <ui-tooltip title="${msg('练习')}">
            <ui-button
              variant="secondary"
              aria-label="${msg('练习')}"
              @click=${() => this._practice(entry)}
            >
              <ui-icon name="practice"></ui-icon>
            </ui-button>
          </ui-tooltip>
          <ui-tooltip title="${entry.sourceAvailable ? msg('查看来源') : msg('源媒体已删除')}">
            <ui-button
              variant="secondary"
              aria-label="${entry.sourceAvailable ? msg('查看来源') : msg('源媒体已删除')}"
              ?disabled=${!entry.sourceAvailable}
              @click=${() => this._viewSource(entry)}
            >
              <ui-icon name="locate"></ui-icon>
            </ui-button>
          </ui-tooltip>
          <ui-tooltip title="${msg('导出')}">
            <ui-button
              variant="secondary"
              aria-label="${msg('导出')}"
              @click=${() => void this._export(entry)}
            >
              <ui-icon name="download"></ui-icon>
            </ui-button>
          </ui-tooltip>
          <ui-popconfirm
            title="${msg('确定从句库移除该句吗？')}"
            placement="bottom"
            ?confirm-loading=${this._busyId === entry.id}
            @confirm=${() => void this._delete(entry)}
          >
            <ui-button
              variant="danger"
              aria-label="${msg('删除')}"
              ?disabled=${this._busyId === entry.id}
            >
              <ui-icon name="delete"></ui-icon>
            </ui-button>
          </ui-popconfirm>
        </div>
      </li>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sentences-page': SentencesPage;
  }
}
