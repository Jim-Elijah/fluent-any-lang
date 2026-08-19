import { msg, localized, str } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import { deleteNoise, getNoiseList } from '../../db/noise.js';
import { importNoiseFiles } from '../../lib/import-noise.js';
import { estimateListNaturalHeight, type ListMetricsDetail } from '../../lib/split-list-heights.js';
import { formatDate, formatTime } from '../../lib/playback-utils.js';
import { reportError } from '../../lib/error-reporter.js';
import type { NoiseItem, SortDirection } from '../../types/models.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/icon.js';
import '../ui/popconfirm.js';
import { Message } from '../ui/message.js';

/** Row height including the --space-md (12px) gap below each card. */
export const NOISE_ROW_HEIGHT = 88;
const NOISE_LIST_MAX_HEIGHT = 480;

@customElement('noise-list')
@localized()
export class NoiseList extends LitElement {
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

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-block);
      margin-bottom: var(--space-block);
      flex-shrink: 0;
    }

    .header-start {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      min-width: 0;
    }

    .header-end {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
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
      white-space: nowrap;
    }

    .list-viewport {
      overflow-x: hidden;
      overflow-y: auto;
      min-height: 0;
    }

    .item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-md);
      align-items: center;
      margin-bottom: var(--space-md);
      padding: var(--space-md) var(--space-lg);
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.06));
      box-sizing: border-box;
    }

    .item:last-child {
      margin-bottom: 0;
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

    .hidden-input {
      display: none;
    }

    @media (max-width: 767px) {
      .item {
        gap: var(--space-xs);
        padding: var(--space-sm) var(--space-md);
        margin-bottom: var(--space-xs);
      }

      .details {
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

  @property({ type: Boolean, reflect: true, attribute: 'fill-height' })
  fillHeight = false;

  @property({ type: Boolean, reflect: true, attribute: 'selection-mode' })
  selectionMode = false;

  @state()
  private _selected = new Set<string>();

  @state()
  private _batchDeleting = false;

  @query('#noise-file-input')
  private _fileInput?: HTMLInputElement;

  @state()
  private _items: NoiseItem[] = [];

  @state()
  private _loading = false;

  @state()
  private _importing = false;

  @state()
  private _error = '';

  @state()
  private _deletingId = '';

  private _visibleIds: string[] = [];

  private _visibleSelected = new Set<string>();

  private _visibleCount = 0;

  private _lastMetricsKey = '';

  connectedCallback(): void {
    super.connectedCallback();
    void this.refresh();
  }

  protected updated(): void {
    const naturalHeight = estimateListNaturalHeight({
      itemCount: this._visibleCount,
      rowHeight: NOISE_ROW_HEIGHT,
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
      this._items = (await getNoiseList()) || [];
    } catch {
      this._error = msg('无法加载噪音素材');
      this._items = [];
    } finally {
      this._loading = false;
    }
  }

  private _openFilePicker = (): void => {
    this._fileInput?.click();
  };

  private _onFileSelected = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (files.length === 0) return;

    this._importing = true;
    try {
      const result = await importNoiseFiles(files);
      if (result.imported.length > 0) {
        Message.success(msg(str`已导入 ${result.imported.length} 个噪音素材`));
        await this.refresh();
      }
      for (const skipped of result.skipped) {
        Message.info(`${skipped.filename}: ${skipped.message}`);
      }
      for (const err of result.errors) {
        Message.error(`${err.filename}: ${err.message}`);
      }
    } catch (error) {
      void reportError(error, { where: 'noise-list.import' });
      Message.error(msg('导入噪音素材失败'));
    } finally {
      this._importing = false;
    }
  };

  private _onDelete = async (item: NoiseItem): Promise<void> => {
    this._deletingId = item.id;
    try {
      await deleteNoise(item.id);
      Message.success(msg('已删除噪音素材'));
      await this.refresh();
    } catch (error) {
      void reportError(error, { where: 'noise-list.delete' });
      Message.error(msg('删除失败'));
    } finally {
      this._deletingId = '';
    }
  };

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
      const results = await Promise.allSettled(toDelete.map((id) => deleteNoise(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        Message.error(msg('部分噪音素材删除失败'));
      } else {
        Message.success(msg('批量删除完成'));
      }
      const deleted = new Set(toDelete);
      this._selected = new Set([...this._selected].filter((id) => !deleted.has(id)));
      await this.refresh();
    } finally {
      this._batchDeleting = false;
    }
  }

  private _renderItem(item: NoiseItem) {
    return html`
      <div class="item" @click=${this.selectionMode ? () => this._toggleSelection(item.id) : null}>
        ${this.selectionMode
          ? html`<input
              type="checkbox"
              class="batch-checkbox"
              .checked=${this._visibleSelected.has(item.id)}
              @change=${() => this._toggleSelection(item.id)}
              @click=${(e: Event) => e.stopPropagation()}
            />`
          : null}
        <div class="meta">
          <p class="title">${item.title}</p>
          <p class="details">
            <span>${formatTime(item.duration)}</span>
            <span class="date">${formatDate(item.createdAt, true)}</span>
          </p>
        </div>
        <div class="actions" @click=${(e: Event) => e.stopPropagation()}>
          <ui-popconfirm
            .title=${msg('删除此噪音素材？')}
            @confirm=${() => void this._onDelete(item)}
          >
            <ui-button
              variant="secondary"
              ?disabled=${this._deletingId === item.id}
              aria-label=${msg('删除')}
            >
              <ui-icon name="delete" size="var(--icon-md)"></ui-icon>
            </ui-button>
          </ui-popconfirm>
        </div>
      </div>
    `;
  }

  render() {
    let renderedItems = this._items;
    if (this.keyword) {
      const q = this.keyword.toLowerCase();
      renderedItems = renderedItems.filter(
        (item) => item.title.toLowerCase().includes(q) || item.filename.toLowerCase().includes(q),
      );
    }
    if (this.sortBy && this.sortDirection) {
      renderedItems = [...renderedItems].sort((a, b) => {
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

    this._visibleCount = renderedItems.length;

    const emptyMessage = this.keyword ? msg('无匹配噪音素材') : msg('暂无噪音素材，请先导入');
    const viewportStyle = this.fillHeight
      ? ''
      : `max-height: ${Math.min(
          Math.max(renderedItems.length, 1) * NOISE_ROW_HEIGHT,
          NOISE_LIST_MAX_HEIGHT,
        )}px`;

    const visibleIds = renderedItems.map((item) => item.id);

    this._visibleIds = visibleIds;
    const visibleSet = new Set(visibleIds);
    this._visibleSelected = new Set([...this._selected].filter((id) => visibleSet.has(id)));

    return html`
      <section>
        <div class="header">
          <div class="header-start">
            <h2 id="noise-list-title">${msg('噪音素材')}</h2>
            ${this.selectionMode
              ? null
              : html`<ui-button
                  variant="secondary"
                  ?disabled=${this._importing}
                  @click=${this._openFilePicker}
                >
                  ${this._importing ? msg('导入中…') : msg('导入')}
                </ui-button>`}
          </div>
          <div class="header-end">
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
                    title=${msg('确定删除选中的噪音素材吗？')}
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
          </div>
        </div>
        <input
          id="noise-file-input"
          class="hidden-input"
          type="file"
          accept="audio/*"
          multiple
          @change=${this._onFileSelected}
        />
        ${this._error ? html`<ui-alert class="error" type="error">${this._error}</ui-alert>` : null}
        ${this._loading
          ? html`<div class="empty">${msg('加载中…')}</div>`
          : renderedItems.length === 0
            ? html`<div class="empty">${emptyMessage}</div>`
            : html`
                <div class="list-viewport" style=${viewportStyle}>
                  ${renderedItems.map((item) => this._renderItem(item))}
                </div>
              `}
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noise-list': NoiseList;
  }
}
