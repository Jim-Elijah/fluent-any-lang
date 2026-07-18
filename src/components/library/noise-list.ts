import { msg, localized, str } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import { deleteNoise, getNoiseList } from '../../db/noise.js';
import { importNoiseFiles } from '../../lib/import-noise.js';
import { estimateListNaturalHeight, type ListMetricsDetail } from '../../lib/split-list-heights.js';
import { NARROW_VIEWPORT_MQ } from '../../lib/layout-compact.js';
import { formatDate, formatTime } from '../../lib/playback-utils.js';
import { reportError } from '../../lib/error-reporter.js';
import type { NoiseItem, SortDirection } from '../../types/models.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/icon.js';
import '../ui/popconfirm.js';
import '../ui/virtual-grid.js';
import { Message } from '../ui/message.js';

/** Row height including the --space-md (12px) gap below each card. */
const NOISE_ROW_HEIGHT = 88;
/** Narrow: meta + actions stacked; includes the same gap below each card. */
const NOISE_ROW_HEIGHT_NARROW = 100;
const NOISE_LIST_HEIGHT = 480;

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

    .item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-md);
      align-items: center;
      /* Reserve --space-md to match NOISE_ROW_HEIGHT gap (fixed, not --space-block). */
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

    .hidden-input {
      display: none;
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

  @property({ type: Boolean, reflect: true, attribute: 'fill-height' })
  fillHeight = false;

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

  @state()
  private _narrow = false;

  private _visibleCount = 0;

  private _lastMetricsKey = '';

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

  private _onNarrowMqChange = (e: MediaQueryListEvent): void => {
    this._narrow = e.matches;
  };

  private _rowHeight(): number {
    return this._narrow ? NOISE_ROW_HEIGHT_NARROW : NOISE_ROW_HEIGHT;
  }

  protected updated(): void {
    const rowHeight = this._rowHeight();
    const naturalHeight = estimateListNaturalHeight({
      itemCount: this._visibleCount,
      rowHeight,
      hasError: Boolean(this._error),
      loading: this._loading,
    });
    const key = `${naturalHeight}:${this._visibleCount}:${this._loading}:${this._error}:${rowHeight}`;
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

  private _renderItem = (item: NoiseItem): unknown => {
    return html`
      <div class="item">
        <div class="meta">
          <p class="title">${item.title}</p>
          <p class="details">
            <span>${formatTime(item.duration)}</span>
            <span class="date">${formatDate(item.createdAt, true)}</span>
          </p>
        </div>
        <div class="actions">
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
  };

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

    const rowHeight = this._rowHeight();
    const listHeight = this.fillHeight
      ? '100%'
      : Math.min(Math.max(renderedItems.length, 1) * rowHeight, NOISE_LIST_HEIGHT);

    const emptyMessage = this.keyword ? msg('无匹配噪音素材') : msg('暂无噪音素材，请先导入');

    return html`
      <section>
        <div class="header">
          <div class="header-start">
            <h2 id="noise-list-title">${msg('噪音素材')}</h2>
            <ui-button
              variant="secondary"
              ?disabled=${this._importing}
              @click=${this._openFilePicker}
            >
              ${this._importing ? msg('导入中…') : msg('导入')}
            </ui-button>
          </div>
          <div class="header-end">
            <span class="count">${renderedItems.length} ${msg('项')}</span>
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
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noise-list': NoiseList;
  }
}
