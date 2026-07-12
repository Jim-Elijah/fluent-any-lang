import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { navigator } from 'lit-element-router';
import { styleMap } from 'lit/directives/style-map.js';

import '../../components/library/media-list.js';
import '../../components/library/record-list.js';
import '../../components/ui/select.js';
import '../../components/ui/input.js';
import '../../components/ui/icon.js';
import type { SelectChangeDetail } from '../../components/ui/select.js';
import { InputChangeDetail } from '../../components/ui/input.js';
import { allocateStackedHeights, type ListMetricsDetail } from '../../lib/split-list-heights.js';
import { SortDirection } from '../../types/models.js';

const STACK_GAP_PX = 16;
const COMPACT_MQ = '(max-height: 739px)';

const NavigatorElement = navigator(LitElement);
@customElement('library-page')
@localized()
export class LibraryPage extends NavigatorElement {
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
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      flex-shrink: 0;
      margin-bottom: 8px;
    }

    .search {
      flex: 1 1 240px;
      min-width: 0;
    }

    .sort-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }

    .sort-label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.875rem;
      white-space: nowrap;
    }

    .sort-group ui-select {
      width: 7.5rem;
    }

    .hint {
      flex-shrink: 0;
      margin: 0 0 16px;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.45));
      font-size: 0.8125rem;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    :host([compact]) .stack {
      flex: none;
      overflow: visible;
    }

    media-list,
    record-list {
      min-height: 0;
      overflow: hidden;
    }

    :host([compact]) media-list,
    :host([compact]) record-list {
      overflow: visible;
    }

    media-list.pending,
    record-list.pending {
      flex: 1;
    }
  `;

  @property({ type: Boolean, reflect: true })
  compact = false;

  @query('.stack')
  private _stack?: HTMLElement;

  @state()
  private _keyword = '';

  @state()
  private _sortBy: string = 'date';

  @state()
  private _sortDirection: SortDirection = 'desc';

  @state()
  private _mediaHeight = 0;

  @state()
  private _recordHeight = 0;

  private _mediaNatural = 128;

  private _recordNatural = 128;

  private _resizeObserver: ResizeObserver | null = null;

  private _compactMq?: MediaQueryList;

  connectedCallback() {
    super.connectedCallback();
    this._compactMq = window.matchMedia(COMPACT_MQ);
    this.compact = this._compactMq.matches;
    this._compactMq.addEventListener('change', this._onCompactChange);
  }

  disconnectedCallback(): void {
    this._compactMq?.removeEventListener('change', this._onCompactChange);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    super.disconnectedCallback();
  }

  private _onCompactChange = (e: MediaQueryListEvent) => {
    this.compact = e.matches;
    if (!this.compact) {
      this._reallocate();
    } else {
      this._mediaHeight = 0;
      this._recordHeight = 0;
    }
  };

  protected firstUpdated(): void {
    if (!this._stack) return;
    this._resizeObserver = new ResizeObserver(() => this._reallocate());
    this._resizeObserver.observe(this._stack);
    this._reallocate();
  }

  private _getSortByOptions() {
    return [
      { value: 'title', label: msg('名称') },
      { value: 'date', label: msg('日期') },
    ];
  }

  private _getSortDirectionOptions() {
    return [
      { value: 'asc', label: msg('升序') },
      { value: 'desc', label: msg('降序') },
    ];
  }

  private _reallocate(): void {
    if (this.compact) return;
    const available = Math.max(0, (this._stack?.clientHeight ?? 0) - STACK_GAP_PX);
    const [mediaHeight, recordHeight] = allocateStackedHeights(
      this._mediaNatural,
      this._recordNatural,
      available,
    );
    if (mediaHeight === this._mediaHeight && recordHeight === this._recordHeight) {
      return;
    }
    this._mediaHeight = mediaHeight;
    this._recordHeight = recordHeight;
  }

  private _handleMediaMetrics = (event: CustomEvent<ListMetricsDetail>): void => {
    this._mediaNatural = event.detail.naturalHeight;
    this._reallocate();
  };

  private _handleRecordMetrics = (event: CustomEvent<ListMetricsDetail>): void => {
    this._recordNatural = event.detail.naturalHeight;
    this._reallocate();
  };

  render() {
    const sized = !this.compact && this._mediaHeight > 0 && this._recordHeight > 0;

    return html`
      <div class="layout">
        <div class="toolbar">
          <ui-input
            class="search"
            .value=${this._keyword}
            allow-clear
            placeholder="${msg('搜索媒体 / 录音标题')}"
            aria-label="${msg('搜索媒体 / 录音标题')}"
            @change=${(e: CustomEvent<InputChangeDetail>) => {
              this._keyword = (e.detail.value || '').trim();
            }}
          >
            <ui-icon slot="prefix" name="search" size="16px"></ui-icon>
          </ui-input>

          <div class="sort-group">
            <span class="sort-label">
              <ui-icon name="sort" size="16px"></ui-icon>
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
        <p class="hint">${msg('筛选与排序同时作用于下方媒体库与录音库')}</p>
        <div class="stack">
          <media-list
            class=${sized || this.compact ? '' : 'pending'}
            ?fill-height=${!this.compact}
            style=${styleMap(sized ? { height: `${this._mediaHeight}px`, flex: 'none' } : {})}
            .keyword=${this._keyword}
            .sortBy=${this._sortBy}
            .sortDirection=${this._sortDirection}
            @list-metrics=${this._handleMediaMetrics}
            @media-selected="${this._handleMediaSelected}"
          ></media-list>
          <record-list
            class=${sized || this.compact ? '' : 'pending'}
            ?fill-height=${!this.compact}
            style=${styleMap(sized ? { height: `${this._recordHeight}px`, flex: 'none' } : {})}
            .keyword=${this._keyword}
            .sortBy=${this._sortBy}
            .sortDirection=${this._sortDirection}
            @list-metrics=${this._handleRecordMetrics}
          ></record-list>
        </div>
      </div>
    `;
  }

  private _handleMediaSelected(event: CustomEvent<{ id: string }>): void {
    this.navigate(`/practice/${event.detail.id}`);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'library-page': LibraryPage;
  }
}
