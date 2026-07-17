import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { navigator } from 'lit-element-router';

import { deleteSentenceBankEntry, getSentenceBankList } from '../../db/service.js';
import { reportError } from '../../lib/error-reporter.js';
import { COMPACT_VIEWPORT_MQ } from '../../lib/layout-compact.js';
import { formatDate, formatTime } from '../../lib/playback-utils.js';
import type { SentenceBankEntry, SortDirection } from '../../types/models.js';
import { Message } from '../../components/ui/message.js';

import '../../components/ui/alert.js';
import '../../components/ui/button.js';
import '../../components/ui/icon.js';
import '../../components/ui/input.js';
import '../../components/ui/popconfirm.js';
import '../../components/ui/select.js';
import '../../components/ui/tooltip.js';
import type { InputChangeDetail } from '../../components/ui/input.js';
import type { SelectChangeDetail } from '../../components/ui/select.js';

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

    .toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-block);
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .search {
      flex: 1 1 240px;
      min-width: 0;
    }

    .sort-group {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      flex: 0 0 auto;
    }

    .sort-label {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.875rem;
      white-space: nowrap;
    }

    .sort-group ui-select {
      width: 7.5rem;
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

    @media (max-width: 767px) {
      .item {
        grid-template-columns: 1fr;
      }

      .actions {
        justify-content: flex-end;
      }
    }
  `;

  @property({ type: Boolean, reflect: true })
  compact = false;

  @state()
  private _entries: SentenceBankEntry[] = [];

  @state()
  private _loading = true;

  @state()
  private _error = '';

  @state()
  private _busyId = '';

  @state()
  private _keyword = '';

  @state()
  private _sortBy: string = 'date';

  @state()
  private _sortDirection: SortDirection = 'desc';

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

  private _getSortByOptions() {
    return [
      { value: 'date', label: msg('日期') },
      { value: 'source', label: msg('来源') },
      { value: 'text', label: msg('句子') },
    ];
  }

  private _getSortDirectionOptions() {
    return [
      { value: 'asc', label: msg('升序') },
      { value: 'desc', label: msg('降序') },
    ];
  }

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

  private async _delete(entry: SentenceBankEntry): Promise<void> {
    if (this._busyId) {
      return;
    }
    this._busyId = entry.id;
    try {
      await deleteSentenceBankEntry(entry.id);
      this._entries = this._entries.filter((item) => item.id !== entry.id);
      Message.success(msg('已从句库移除'));
    } catch (error) {
      void reportError(error, { where: 'sentences-page.delete', entryId: entry.id });
      Message.error(msg('删除失败，请重试'));
    } finally {
      this._busyId = '';
    }
  }

  render() {
    const visibleEntries = this._getVisibleEntries();

    return html`
      <div class="layout">
        <div class="toolbar">
          <ui-input
            class="search"
            .value=${this._keyword}
            allow-clear
            placeholder="${msg('搜索句子 / 来源标题')}"
            aria-label="${msg('搜索句子 / 来源标题')}"
            @change=${(e: CustomEvent<InputChangeDetail>) => {
              this._keyword = (e.detail.value || '').trim();
            }}
          >
            <ui-icon slot="prefix" name="search" size="var(--icon-md)"></ui-icon>
          </ui-input>

          <div class="sort-group">
            <span class="sort-label">
              <ui-icon name="sort" size="var(--icon-md)"></ui-icon>
              ${msg('排序')}
            </span>
            <ui-select
              .value=${this._sortBy}
              .options=${this._getSortByOptions()}
              aria-label="${msg('排序字段')}"
              @change=${(e: CustomEvent<SelectChangeDetail>) => {
                this._sortBy = e.detail.value as string;
              }}
            ></ui-select>
            <ui-select
              .value=${this._sortDirection}
              .options=${this._getSortDirectionOptions()}
              aria-label="${msg('排序方向')}"
              @change=${(e: CustomEvent<SelectChangeDetail>) => {
                this._sortDirection = e.detail.value as SortDirection;
              }}
            ></ui-select>
          </div>
        </div>

        <p class="hint">${msg('收藏喜欢的句子，单独练习或跳回原媒体上下文。')}</p>

        ${this._error
          ? html`<ui-alert class="error" type="error">${this._error}</ui-alert>`
          : nothing}

        <section class="list-section">
          <div class="header">
            <h2>${msg('句库')}</h2>
            <span class="count">${msg(str`${visibleEntries.length} 句`)}</span>
          </div>

          ${this._loading
            ? html`<div class="empty">${msg('加载中…')}</div>`
            : visibleEntries.length === 0
              ? html`<div class="empty">
                  ${this._keyword || this._entries.length > 0
                    ? msg('无匹配内容')
                    : msg('句库为空。在练习页点击字幕旁的 ☆ 即可加入。')}
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
      <li class="item">
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
        <div class="actions">
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
              <ui-icon name="media"></ui-icon>
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
