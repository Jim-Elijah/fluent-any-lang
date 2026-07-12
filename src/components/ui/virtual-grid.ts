import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

export type VirtualGridRenderItem = (
  item: unknown,
  index: number,
  itemHeight: number,
) => TemplateResult | unknown;

/**
 * Virtualized grid / list viewport (light DOM so consumers can style item content).
 * Renders only visible rows (plus overscan) while keeping full scroll height via a phantom spacer.
 * Set `gridItems` to 1 for a virtual list; raise it (or set `minItemWidth`) for a multi-column grid.
 */
@customElement('ui-virtual-grid')
export class UiVirtualGrid extends LitElement {
  /** Applied via an inline <style> because this component renders into light DOM. */
  private static readonly _css = css`
    ui-virtual-grid {
      display: block;
    }

    ui-virtual-grid .ui-vg-container {
      position: relative;
      overflow: auto;
      width: 100%;
      box-sizing: border-box;
    }

    ui-virtual-grid .ui-vg-phantom {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      pointer-events: none;
    }

    ui-virtual-grid .ui-vg-list {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      will-change: transform;
    }

    ui-virtual-grid .ui-vg-row {
      display: flex;
      width: 100%;
      box-sizing: border-box;
    }

    ui-virtual-grid .ui-vg-row > * {
      flex: 1 1 0;
      min-width: 0;
      box-sizing: border-box;
    }
  `;

  @property({ type: Number })
  itemHeight = 40;

  /** Viewport height in px, or any valid CSS length (e.g. `60vh`). */
  @property({ attribute: 'container-height' })
  containerHeight: number | string = 400;

  @property({ type: Number, attribute: 'grid-items' })
  gridItems = 1;

  /**
   * When > 0, `gridItems` is derived from container width / minItemWidth on resize
   */
  @property({ type: Number, attribute: 'min-item-width' })
  minItemWidth = 0;

  /** Extra rows rendered above/below the viewport to reduce blank flash while scrolling. */
  @property({ type: Number })
  overscan = 2;

  @property({ attribute: false })
  items: unknown[] = [];

  @property({ attribute: false })
  renderItem: VirtualGridRenderItem = () => null;

  @state()
  private _startRow = 0;

  @state()
  private _clientHeight = 0;

  @state()
  private _resolvedGridItems = 1;

  @query('.ui-vg-container')
  private _container!: HTMLElement;

  private _resizeObserver: ResizeObserver | null = null;

  /** Light DOM: item templates stay under the parent tree for styling (Vue-slot equivalent). */
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._resolvedGridItems = Math.max(1, this.gridItems);
  }

  disconnectedCallback(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    this._measure();
    this._resizeObserver = new ResizeObserver(() => this._measure());
    this._resizeObserver.observe(this._container);
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('gridItems') && this.minItemWidth <= 0) {
      this._resolvedGridItems = Math.max(1, this.gridItems);
    }
    if (changed.has('items') || changed.has('itemHeight') || changed.has('gridItems')) {
      this._syncStartRowFromScroll();
    }
  }

  render() {
    const cols = Math.max(1, this._resolvedGridItems);
    const totalRows = Math.ceil(this.items.length / cols) || 0;
    const rowHeight = Math.max(1, this.itemHeight);
    const visibleRowCount =
      this._clientHeight > 0
        ? Math.ceil(this._clientHeight / rowHeight)
        : Math.ceil(400 / rowHeight);
    const firstVisible = Math.min(this._startRow, Math.max(0, totalRows));
    const renderStart = Math.max(0, firstVisible - this.overscan);
    const renderEnd = Math.min(totalRows, firstVisible + visibleRowCount + this.overscan);
    const phantomHeight = totalRows * rowHeight;
    const startOffset = renderStart * rowHeight;
    const heightStyle =
      typeof this.containerHeight === 'number'
        ? `${this.containerHeight}px`
        : String(this.containerHeight);

    const rows: TemplateResult[] = [];
    for (let row = renderStart; row < renderEnd; row++) {
      const cells: unknown[] = [];
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        if (index >= this.items.length) {
          break;
        }
        cells.push(this.renderItem(this.items[index], index, rowHeight));
      }
      rows.push(html` <div class="ui-vg-row" style="height: ${rowHeight}px">${cells}</div> `);
    }

    return html`
      <style>
        ${UiVirtualGrid._css.cssText}
      </style>
      <div class="ui-vg-container" style="height: ${heightStyle}" @scroll=${this._onScroll}>
        <div class="ui-vg-phantom" style="height: ${phantomHeight}px"></div>
        <div class="ui-vg-list" style="transform: translateY(${startOffset}px)">${rows}</div>
      </div>
    `;
  }

  private _measure = (): void => {
    if (!this._container) {
      return;
    }
    const nextHeight = this._container.clientHeight;
    if (nextHeight !== this._clientHeight) {
      this._clientHeight = nextHeight;
    }
    if (this.minItemWidth > 0) {
      const nextCols = Math.max(1, Math.floor(this._container.clientWidth / this.minItemWidth));
      if (nextCols !== this._resolvedGridItems) {
        this._resolvedGridItems = nextCols;
        this._syncStartRowFromScroll();
      }
    }
  };

  private _onScroll = (): void => {
    this._syncStartRowFromScroll();
  };

  private _syncStartRowFromScroll(): void {
    const scrollTop = this._container?.scrollTop ?? 0;
    const rowHeight = Math.max(1, this.itemHeight);
    const next = Math.max(0, Math.floor(scrollTop / rowHeight));
    if (next !== this._startRow) {
      this._startRow = next;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-virtual-grid': UiVirtualGrid;
  }
}
