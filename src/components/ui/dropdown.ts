import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { arrowStyles } from './internal/arrow-styles.js';
import { isControlledOpen } from './internal/controlled-state.js';
import { OverlayController } from './internal/overlay-controller.js';
import {
  arrowSideForPlacement,
  computePlacement12,
  parsePlacement,
  type DropdownPlacement,
} from './internal/placement.js';
import { Z_INDEX } from './internal/z-index.js';

export type { DropdownPlacement };

export type DropdownTriggerType = 'click' | 'hover' | 'contextMenu';

export type DropdownOpenChangeSource = 'trigger' | 'menu';

export type DropdownOpenChangeDetail = {
  open: boolean;
  source?: DropdownOpenChangeSource;
};

export type DropdownMenuItem = {
  key: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  type?: 'divider';
  children?: DropdownMenuItem[];
};

export type DropdownMenuConfig = {
  items?: DropdownMenuItem[];
  selectable?: boolean;
  selectedKeys?: string[];
};

export type DropdownMenuClickDetail = {
  key: string;
  keyPath: string[];
  item: DropdownMenuItem;
  domEvent: Event;
};

export type DropdownSelectDetail = DropdownMenuClickDetail & {
  selectedKeys: string[];
};

export type DropdownArrowConfig = boolean | { pointAtCenter?: boolean };

const HOVER_DELAY_MS = 100;

const POPUP_PORTAL_STYLES = `
  .overlay {
    position: fixed;
    z-index: var(--dropdown-z, 1050);
    min-width: max-content;
    background: #fff;
    border-radius: 8px;
    box-shadow:
      0 6px 16px 0 rgba(0, 0, 0, 0.08),
      0 3px 6px -4px rgba(0, 0, 0, 0.12),
      0 9px 28px 8px rgba(0, 0, 0, 0.05);
    padding: var(--space-xs);
    color: rgba(0, 0, 0, 0.88);
    font-size: 14px;
    line-height: 1.5714285714285714;
    user-select: none;
    pointer-events: auto;
    box-sizing: border-box;
  }

  .overlay.in-container {
    position: absolute;
  }

  ${arrowStyles({ backgroundVar: '--dropdown-bg', backgroundFallback: '#fff' })}

  .arrow::before {
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.06));
  }

  .menu {
    position: relative;
    z-index: 1;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-height: 32px;
    padding: var(--space-xs) var(--space-md);
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    outline: none;
  }

  .menu-item:hover:not(.disabled) {
    background: rgba(0, 0, 0, 0.04);
  }

  .menu-item.selected {
    background: rgba(22, 119, 255, 0.12);
    color: #1677ff;
  }

  .menu-item.disabled {
    color: rgba(0, 0, 0, 0.25);
    cursor: not-allowed;
  }

  .menu-item.danger:not(.disabled) {
    color: #ff4d4f;
  }

  .menu-item.danger:not(.disabled):hover {
    background: #fff1f0;
  }

  .menu-item .chevron {
    margin-left: auto;
    opacity: 0.45;
    font-size: 12px;
  }

  .divider {
    height: 1px;
    margin: var(--space-xs) 0;
    background: rgba(5, 5, 5, 0.06);
  }

  .submenu {
    position: relative;
  }

  .submenu-panel {
    position: absolute;
    top: -4px;
    left: calc(100% - 4px);
    min-width: max-content;
    background: #fff;
    border-radius: 8px;
    box-shadow:
      0 6px 16px 0 rgba(0, 0, 0, 0.08),
      0 3px 6px -4px rgba(0, 0, 0, 0.12),
      0 9px 28px 8px rgba(0, 0, 0, 0.05);
    padding: var(--space-xs);
    display: none;
    z-index: 1;
  }

  .submenu.open .submenu-panel {
    display: block;
  }

  .overlay-body {
    position: relative;
    z-index: 1;
    min-width: var(--dropdown-overlay-min-width, 148px);
    /* Extra inline padding so slider end marks (translateX(-50%)) clear the overlay edge. */
    padding: var(--dropdown-overlay-padding-block, var(--space-sm))
      var(--dropdown-overlay-padding-inline, var(--space-lg));
    box-sizing: border-box;
  }

  .overlay-panel-label {
    display: block;
    margin-bottom: var(--space-xs);
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
  }
`;

function parseTriggers(value: string | DropdownTriggerType[]): DropdownTriggerType[] {
  if (Array.isArray(value)) return value;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as DropdownTriggerType[];
}

@customElement('ui-dropdown')
export class UiDropdown extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
    }

    .trigger {
      display: inline;
    }

    :host([disabled]) .trigger {
      cursor: not-allowed;
      opacity: 0.55;
    }
  `;

  @property({ type: Boolean }) open?: boolean;
  @property({ type: Boolean, attribute: 'default-open' }) defaultOpen = false;

  @property({ type: Boolean, reflect: true }) disabled = false;

  @property({ type: String }) placement: DropdownPlacement = 'bottomLeft';

  /** antd menu 配置 */
  @property({ attribute: false }) menu: DropdownMenuConfig | null = null;

  /**
   * 自定义浮层内容（优先于 menu）。
   * 用于在下拉中放置 slider 等非菜单交互；内容渲染在 portal 内。
   * 注意：传入的 TemplateResult 若使用 `@event=${this.method}`，
   * 事件回调的 `this` 会变成 dropdown（portal render host），
   * 父组件应使用箭头函数保留词法 `this`，例如 `@change=${(e) => this.onChange(e)}`。
   */
  @property({ attribute: false }) overlay: TemplateResult | null = null;

  /** antd arrow：boolean 或 { pointAtCenter } */
  @property({ attribute: false }) arrow: DropdownArrowConfig = false;

  /** 逗号分隔或数组，默认 hover */
  @property() trigger: string | DropdownTriggerType[] = 'hover';

  @property({ type: Boolean, attribute: 'auto-adjust-overflow' }) autoAdjustOverflow = true;
  @property({ type: Boolean, attribute: 'destroy-on-close' }) destroyOnClose = false;
  @property({ type: Number, attribute: 'z-index' }) zIndex = Z_INDEX.DROPDOWN;

  /** 类似 antd getPopupContainer */
  @property() popupContainer: string | HTMLElement | null = 'body';

  @state() private _internalOpen = false;
  @state() private _pos = { top: 0, left: 0 };
  @state() private _arrowStyle: Record<string, string> = {};
  @state() private _positionInContainer = false;
  @state() private _effectivePlacement: DropdownPlacement = 'bottomLeft';
  @state() private _openSubmenuKey: string | null = null;

  private readonly _overlayId = `ui-dropdown-${Math.random().toString(36).slice(2, 9)}`;

  private _triggerEl: HTMLElement | null = null;
  private _overlay: OverlayController | null = null;
  private _globalBound = false;
  private _prevIsOpen = false;
  private _hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
  private _hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private _contextPoint: { x: number; y: number } | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    if (!isControlledOpen(this.open)) {
      this._internalOpen = this.defaultOpen;
    }
  }

  private _getOverlay(): OverlayController {
    if (!this._overlay) {
      this._overlay = new OverlayController({
        host: this,
        portal: {
          dataAttr: 'data-ui-dropdown-portal',
          styleText: POPUP_PORTAL_STYLES,
          zIndex: this.zIndex,
          popupContainer: this.popupContainer,
        },
        isControlledOpen: () => isControlledOpen(this.open),
        readOpen: () => this._isOpen(),
        writeOpen: (next) => {
          this._internalOpen = next;
        },
        emitOptions: {
          detail: (next, meta) =>
            next
              ? { open: true, source: meta.source as DropdownOpenChangeSource | undefined }
              : { open: false, source: meta.source as DropdownOpenChangeSource | undefined },
        },
      });
      this._overlay.onLayoutChange(() => this._updatePosition());
    }
    return this._overlay;
  }

  private _isOpen(): boolean {
    return isControlledOpen(this.open) ? this.open! : this._internalOpen;
  }

  private _getTriggers(): DropdownTriggerType[] {
    const parsed = parseTriggers(this.trigger);
    return parsed.length ? parsed : ['hover'];
  }

  private _hasTrigger(type: DropdownTriggerType): boolean {
    return this._getTriggers().includes(type);
  }

  private _showArrow(): boolean {
    return this.arrow === true || (typeof this.arrow === 'object' && this.arrow !== null);
  }

  private _arrowPointAtCenter(): boolean {
    return typeof this.arrow === 'object' && !!this.arrow?.pointAtCenter;
  }

  private _menuItems(): DropdownMenuItem[] {
    return this.menu?.items ?? [];
  }

  private _selectedKeys(): string[] {
    return this.menu?.selectedKeys ?? [];
  }

  private _dispatch(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _assignOpen(next: boolean) {
    if (!isControlledOpen(this.open)) {
      this._internalOpen = next;
    }
  }

  private _emitOpenChange(next: boolean, source?: DropdownOpenChangeSource) {
    const detail: DropdownOpenChangeDetail = next
      ? { open: true, source }
      : { open: false, source };
    this._dispatch('open-change', detail);
    this._dispatch('update:open', detail);

    if (next) {
      this._dispatch('open', { source });
    } else {
      this._dispatch('close', { source });
    }
  }

  private _setOpen(next: boolean, source?: DropdownOpenChangeSource) {
    if (this._isOpen() === next) return;
    if (next && this.disabled) return;

    this._assignOpen(next);
    this._emitOpenChange(next, source);
  }

  private _show(source: DropdownOpenChangeSource = 'trigger') {
    this._setOpen(true, source);
  }

  private _hide(source: DropdownOpenChangeSource = 'trigger') {
    this._setOpen(false, source);
  }

  private _getAnchorRect(): DOMRect {
    if (this._contextPoint) {
      const { x, y } = this._contextPoint;
      return new DOMRect(x, y, 0, 0);
    }
    return this._triggerEl?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
  }

  private _computePopupPosition() {
    if (!this._triggerEl && !this._contextPoint) return;

    const overlay = this._getOverlay();
    const overlayEl = overlay.getPopupEl('.overlay');
    const popupRect = overlayEl?.getBoundingClientRect();
    const width = popupRect?.width ?? 120;
    const height = popupRect?.height ?? 80;

    const placed = computePlacement12({
      placement: this.placement,
      triggerRect: this._getAnchorRect(),
      popupWidth: width,
      popupHeight: height,
      container: overlay.portal.getContainer(),
      autoAdjustOverflow: this.autoAdjustOverflow && !this._contextPoint,
      arrowPointAtCenter: this._arrowPointAtCenter(),
    });

    this._effectivePlacement = placed.effectivePlacement;
    this._positionInContainer = placed.inContainer;
    this._pos = { top: placed.top, left: placed.left };
    this._arrowStyle = this._showArrow() ? placed.arrow : {};
  }

  private _findKeyPath(
    key: string,
    items: DropdownMenuItem[] = this._menuItems(),
    path: string[] = [],
  ): string[] | null {
    for (const item of items) {
      if (item.type === 'divider') continue;
      const currentPath = [...path, item.key];
      if (item.key === key) return currentPath;
      if (item.children?.length) {
        const found = this._findKeyPath(key, item.children, currentPath);
        if (found) return found;
      }
    }
    return null;
  }

  private _handleMenuItemClick(item: DropdownMenuItem, domEvent: Event) {
    if (item.disabled || item.type === 'divider') return;
    if (item.children?.length) return;

    const keyPath = this._findKeyPath(item.key) ?? [item.key];
    const detail: DropdownMenuClickDetail = { key: item.key, keyPath, item, domEvent };

    this._dispatch('menu-click', detail);

    if (this.menu?.selectable) {
      const selectedKeys = [item.key];
      this._dispatch('select', { ...detail, selectedKeys } satisfies DropdownSelectDetail);
    }

    this._hide('menu');
  }

  private _renderMenuItems(items: DropdownMenuItem[]): TemplateResult {
    const selectedKeys = this._selectedKeys();

    return html`
      ${items.map((item) => {
        if (item.type === 'divider') {
          return html`<div class="divider" role="separator"></div>`;
        }

        const hasChildren = !!item.children?.length;
        const isSelected = selectedKeys.includes(item.key);
        const isSubmenuOpen = this._openSubmenuKey === item.key;

        if (hasChildren) {
          return html`
            <div
              class=${classMap({ submenu: true, open: isSubmenuOpen })}
              @mouseenter=${() => {
                this._openSubmenuKey = item.key;
                this._syncPortal();
              }}
              @mouseleave=${() => {
                this._openSubmenuKey = null;
                this._syncPortal();
              }}
            >
              <div
                class=${classMap({
                  'menu-item': true,
                  disabled: !!item.disabled,
                  danger: !!item.danger,
                  selected: isSelected,
                })}
                role="menuitem"
                aria-disabled=${item.disabled ? 'true' : 'false'}
                @click=${(e: Event) => {
                  e.stopPropagation();
                  if (!item.disabled)
                    this._dispatch('menu-click', {
                      key: item.key,
                      keyPath: this._findKeyPath(item.key) ?? [item.key],
                      item,
                      domEvent: e,
                    });
                }}
              >
                ${item.icon
                  ? html`<ui-icon name=${item.icon} size="var(--icon-md)"></ui-icon>`
                  : nothing}
                <span>${item.label}</span>
                <span class="chevron">›</span>
              </div>
              <div class="submenu-panel" role="menu">${this._renderMenuItems(item.children!)}</div>
            </div>
          `;
        }

        return html`
          <div
            class=${classMap({
              'menu-item': true,
              disabled: !!item.disabled,
              danger: !!item.danger,
              selected: isSelected,
            })}
            role="menuitem"
            aria-disabled=${item.disabled ? 'true' : 'false'}
            @click=${(e: Event) => this._handleMenuItemClick(item, e)}
          >
            ${item.icon
              ? html`<ui-icon name=${item.icon} size="var(--icon-md)"></ui-icon>`
              : nothing}
            <span>${item.label}</span>
          </div>
        `;
      })}
    `;
  }

  private _overlayTemplate() {
    const { side } = parsePlacement(this._effectivePlacement);
    const arrowPlacement = arrowSideForPlacement(side);

    return html`
      <div
        class=${classMap({ overlay: true, 'in-container': this._positionInContainer })}
        style=${styleMap({
          top: `${this._pos.top}px`,
          left: `${this._pos.left}px`,
          zIndex: String(this.zIndex),
          '--dropdown-z': String(this.zIndex),
          '--dropdown-bg': '#fff',
          // Forward host CSS vars into the portal shadow tree.
          '--dropdown-overlay-min-width':
            getComputedStyle(this).getPropertyValue('--dropdown-overlay-min-width').trim() ||
            undefined,
          '--dropdown-overlay-padding-block':
            getComputedStyle(this).getPropertyValue('--dropdown-overlay-padding-block').trim() ||
            undefined,
          '--dropdown-overlay-padding-inline':
            getComputedStyle(this).getPropertyValue('--dropdown-overlay-padding-inline').trim() ||
            undefined,
        })}
        role=${this.overlay ? 'dialog' : 'menu'}
        id=${this._overlayId}
        @mousedown=${(e: MouseEvent) => e.stopPropagation()}
        @click=${(e: MouseEvent) => e.stopPropagation()}
        @mouseenter=${this._onOverlayMouseEnter}
        @mouseleave=${this._onOverlayMouseLeave}
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        ${this._showArrow()
          ? html`
              <div
                class=${classMap({ arrow: true, [`placement-${arrowPlacement}`]: true })}
                style=${styleMap(this._arrowStyle)}
              ></div>
            `
          : nothing}
        ${this.overlay
          ? html`<div class="overlay-body">${this.overlay}</div>`
          : html`<div class="menu">${this._renderMenuItems(this._menuItems())}</div>`}
      </div>
    `;
  }

  private _syncPortal() {
    const overlay = this._getOverlay();
    if (!this._isOpen() || this.disabled) {
      overlay.hideContent();
      this._openSubmenuKey = null;
      return;
    }
    overlay.updatePortalOptions({ zIndex: this.zIndex, popupContainer: this.popupContainer });
    overlay.syncContent(this._overlayTemplate());
  }

  protected render() {
    return html`
      <span
        class="trigger"
        aria-haspopup=${this.overlay ? 'dialog' : 'menu'}
        aria-expanded=${this._isOpen() ? 'true' : 'false'}
        @click=${this._onTriggerClick}
        @mouseenter=${this._onTriggerMouseEnter}
        @mouseleave=${this._onTriggerMouseLeave}
        @contextmenu=${this._onTriggerContextMenu}
      >
        <slot></slot>
      </span>
    `;
  }

  protected firstUpdated() {
    this._triggerEl = this.shadowRoot?.querySelector('.trigger') as HTMLElement | null;
    this._effectivePlacement = this.placement;
    this._prevIsOpen = this._isOpen();
  }

  protected updated(changed: PropertyValues) {
    const isOpen = this._isOpen();
    const wasOpen = this._prevIsOpen;

    this._handleControlledOpenEdge(changed, isOpen, wasOpen);

    if (isOpen !== wasOpen) {
      this._onOpenStateChanged(isOpen);
    } else if (isOpen) {
      this._onOverlayContentChanged(changed);
    }

    if (changed.has('zIndex')) {
      this.style.setProperty('--dropdown-z', String(this.zIndex));
    }

    this._prevIsOpen = isOpen;
  }

  disconnectedCallback() {
    this._clearHoverTimers();
    if (this._globalBound) {
      this._unbindGlobal();
      this._globalBound = false;
    }
    this._overlay?.destroy();
    this._overlay = null;
    super.disconnectedCallback();
  }

  private _handleControlledOpenEdge(changed: PropertyValues, isOpen: boolean, wasOpen: boolean) {
    if (!changed.has('open')) return;

    if (isOpen && !wasOpen) {
      this._dispatch('open', { source: 'trigger' });
    } else if (!isOpen && wasOpen) {
      this._dispatch('close', { source: 'trigger' });
    }
  }

  private _onOpenStateChanged(isOpen: boolean) {
    if (isOpen && this.disabled) return;

    if (isOpen) {
      if (!this._globalBound) {
        this._bindGlobal();
        this._globalBound = true;
      }
      this._syncPortal();
      queueMicrotask(() => {
        if (!this._isOpen() || this.disabled) return;
        this._updatePosition();
        this._syncPortal();
      });
      return;
    }

    this._contextPoint = null;
    if (this._globalBound) {
      this._unbindGlobal();
      this._globalBound = false;
    }
    this._clearHoverTimers();
    if (this.destroyOnClose) {
      this._overlay?.destroyPortal();
    } else {
      this._overlay?.hideContent();
    }
    this._openSubmenuKey = null;
  }

  private _onOverlayContentChanged(changed: PropertyValues) {
    const needsSync =
      changed.has('menu') ||
      changed.has('overlay') ||
      changed.has('arrow') ||
      changed.has('zIndex') ||
      changed.has('popupContainer') ||
      changed.has('placement') ||
      changed.has('_pos') ||
      changed.has('_arrowStyle') ||
      changed.has('_openSubmenuKey') ||
      changed.has('_effectivePlacement');

    if (!needsSync) return;

    this._syncPortal();

    if (changed.has('placement') || changed.has('popupContainer')) {
      queueMicrotask(() => {
        if (!this._isOpen()) return;
        this._updatePosition();
        this._syncPortal();
      });
    }
  }

  private _bindGlobal() {
    const overlay = this._getOverlay();
    overlay.triggers.bindGlobal({
      onOutside: (e) => this._onDocumentMouseDown(e),
      onEsc: (e) => this._onDocumentKeyDown(e),
      onScrollResize: () => overlay.updatePosition(),
    });
  }

  private _unbindGlobal() {
    this._overlay?.triggers.unbindGlobal();
  }

  private _updatePosition() {
    if ((!this._triggerEl && !this._contextPoint) || !this._isOpen()) return;
    this._computePopupPosition();
  }

  private _clearHoverTimers() {
    if (this._hoverOpenTimer) {
      clearTimeout(this._hoverOpenTimer);
      this._hoverOpenTimer = null;
    }
    if (this._hoverCloseTimer) {
      clearTimeout(this._hoverCloseTimer);
      this._hoverCloseTimer = null;
    }
  }

  private _scheduleHoverOpen() {
    if (!this._hasTrigger('hover')) return;
    this._clearHoverTimers();
    this._hoverOpenTimer = setTimeout(() => {
      this._hoverOpenTimer = null;
      if (!this._isOpen()) this._show('trigger');
    }, HOVER_DELAY_MS);
  }

  private _scheduleHoverClose() {
    if (!this._hasTrigger('hover')) return;
    this._clearHoverTimers();
    this._hoverCloseTimer = setTimeout(() => {
      this._hoverCloseTimer = null;
      if (this._isOpen()) this._hide('trigger');
    }, HOVER_DELAY_MS);
  }

  private _cancelHoverClose() {
    if (this._hoverCloseTimer) {
      clearTimeout(this._hoverCloseTimer);
      this._hoverCloseTimer = null;
    }
  }

  private _onTriggerClick = () => {
    if (!this._hasTrigger('click')) return;
    if (this.disabled) return;
    this._contextPoint = null;

    if (this._isOpen()) {
      this._hide('trigger');
    } else {
      this._show('trigger');
    }
  };

  private _onTriggerMouseEnter = () => {
    if (!this._hasTrigger('hover')) return;
    if (this.disabled) return;
    this._contextPoint = null;
    this._cancelHoverClose();
    if (this._isOpen()) return;
    this._scheduleHoverOpen();
  };

  private _onTriggerMouseLeave = () => {
    if (!this._hasTrigger('hover')) return;
    if (!this._isOpen()) {
      this._clearHoverTimers();
      return;
    }
    this._scheduleHoverClose();
  };

  private _onOverlayMouseEnter = () => {
    if (!this._hasTrigger('hover')) return;
    this._cancelHoverClose();
  };

  private _onOverlayMouseLeave = () => {
    if (!this._hasTrigger('hover')) return;
    this._scheduleHoverClose();
  };

  private _onTriggerContextMenu = (e: MouseEvent) => {
    if (!this._hasTrigger('contextMenu')) return;
    if (this.disabled) return;
    e.preventDefault();
    this._contextPoint = { x: e.clientX, y: e.clientY };
    this._show('trigger');
    queueMicrotask(() => {
      if (!this._isOpen()) return;
      this._updatePosition();
      this._syncPortal();
    });
  };

  private _onDocumentMouseDown(e: MouseEvent) {
    if (!this._isOpen()) return;
    if (this._getOverlay().isEventInside(e)) return;
    if (this._hasTrigger('click') || this._hasTrigger('contextMenu')) {
      this._hide('trigger');
    }
  }

  private _onDocumentKeyDown(e: KeyboardEvent) {
    if (!this._isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this._hide('trigger');
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-dropdown': UiDropdown;
  }
}

/** ui-dropdown 事件类型（监听时使用显式类型） */
export interface UiDropdownEventMap {
  'open-change': CustomEvent<DropdownOpenChangeDetail>;
  'update:open': CustomEvent<DropdownOpenChangeDetail>;
  open: CustomEvent<{ source?: DropdownOpenChangeSource }>;
  close: CustomEvent<{ source?: DropdownOpenChangeSource }>;
  'menu-click': CustomEvent<DropdownMenuClickDetail>;
  select: CustomEvent<DropdownSelectDetail>;
}
