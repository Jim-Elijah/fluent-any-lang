import {
  LitElement,
  html,
  css,
  nothing,
  render,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

export type DropdownPlacement =
  | 'top'
  | 'topLeft'
  | 'topRight'
  | 'bottom'
  | 'bottomLeft'
  | 'bottomRight'
  | 'left'
  | 'leftTop'
  | 'leftBottom'
  | 'right'
  | 'rightTop'
  | 'rightBottom';

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

type PlacementSide = 'top' | 'bottom' | 'left' | 'right';
type PlacementAlign = 'start' | 'center' | 'end';

const ARROW_HALF = 5;
const GAP = 8;
const HOVER_DELAY_MS = 100;

const POPUP_PORTAL_STYLES = css`
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
    padding: 4px;
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

  .arrow {
    position: absolute;
    overflow: hidden;
    background: transparent;
    pointer-events: none;
  }

  .arrow::before {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    background: #fff;
    box-sizing: border-box;
    transform: rotate(45deg);
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.06);
  }

  .arrow.placement-bottom {
    width: 10px;
    height: 5px;
  }
  .arrow.placement-bottom::before {
    left: 50%;
    margin-left: -4px;
    top: 0;
  }

  .arrow.placement-top {
    width: 10px;
    height: 5px;
  }
  .arrow.placement-top::before {
    left: 50%;
    margin-left: -4px;
    top: -4px;
  }

  .arrow.placement-left {
    width: 5px;
    height: 10px;
  }
  .arrow.placement-left::before {
    top: 50%;
    margin-top: -4px;
    left: 0;
  }

  .arrow.placement-right {
    width: 5px;
    height: 10px;
  }
  .arrow.placement-right::before {
    top: 50%;
    margin-top: -4px;
    left: -4px;
  }

  .menu {
    position: relative;
    z-index: 1;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 5px 12px;
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
    margin: 4px 0;
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
    padding: 4px;
    display: none;
    z-index: 1;
  }

  .submenu.open .submenu-panel {
    display: block;
  }
`.cssText;

function parsePlacement(placement: DropdownPlacement): {
  side: PlacementSide;
  align: PlacementAlign;
} {
  switch (placement) {
    case 'top':
      return { side: 'top', align: 'center' };
    case 'topLeft':
      return { side: 'top', align: 'start' };
    case 'topRight':
      return { side: 'top', align: 'end' };
    case 'bottom':
      return { side: 'bottom', align: 'center' };
    case 'bottomLeft':
      return { side: 'bottom', align: 'start' };
    case 'bottomRight':
      return { side: 'bottom', align: 'end' };
    case 'left':
      return { side: 'left', align: 'center' };
    case 'leftTop':
      return { side: 'left', align: 'start' };
    case 'leftBottom':
      return { side: 'left', align: 'end' };
    case 'right':
      return { side: 'right', align: 'center' };
    case 'rightTop':
      return { side: 'right', align: 'start' };
    case 'rightBottom':
      return { side: 'right', align: 'end' };
    default:
      return { side: 'bottom', align: 'start' };
  }
}

function flipSide(side: PlacementSide): PlacementSide {
  const map: Record<PlacementSide, PlacementSide> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  };
  return map[side];
}

function arrowSideForPlacement(side: PlacementSide): PlacementSide {
  return flipSide(side);
}

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

  /** antd arrow：boolean 或 { pointAtCenter } */
  @property({ attribute: false }) arrow: DropdownArrowConfig = false;

  /** 逗号分隔或数组，默认 hover */
  @property() trigger: string | DropdownTriggerType[] = 'hover';

  @property({ type: Boolean, attribute: 'auto-adjust-overflow' }) autoAdjustOverflow = true;
  @property({ type: Boolean, attribute: 'destroy-on-close' }) destroyOnClose = false;
  @property({ type: Number, attribute: 'z-index' }) zIndex = 1050;

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
  private _overlayEl: HTMLDivElement | null = null;

  private _portalHost: HTMLDivElement | null = null;
  private _portalShadow: ShadowRoot | null = null;
  private _portalMount: HTMLDivElement | null = null;
  private _portalStyleEl: HTMLStyleElement | null = null;
  private _positionPatchedContainer: HTMLElement | null = null;

  private _globalBound = false;
  private _prevIsOpen = false;
  private _scrollContainer: HTMLElement | null = null;
  private _hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
  private _hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private _contextPoint: { x: number; y: number } | null = null;

  private readonly _captureOptions = { capture: true };
  private _docMouseDown = (e: MouseEvent) => this._onDocumentMouseDown(e);
  private _docKeyDown = (e: KeyboardEvent) => this._onDocumentKeyDown(e);
  private _onScrollOrResize = () => this._updatePosition();

  connectedCallback(): void {
    super.connectedCallback();
    if (typeof this.open !== 'boolean') {
      this._internalOpen = this.defaultOpen;
    }
  }

  private _isOpen(): boolean {
    return typeof this.open === 'boolean' ? this.open : this._internalOpen;
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

  private _getContainer(): HTMLElement {
    const c = this.popupContainer;
    if (!c) return document.body;
    if (typeof c === 'string') {
      if (c === 'body') return document.body;
      return (document.querySelector(c) as HTMLElement | null) ?? document.body;
    }
    return c;
  }

  private _assignOpen(next: boolean) {
    if (typeof this.open !== 'boolean') {
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

  private _computePositionFor(
    placement: DropdownPlacement,
    anchorRect: DOMRect,
    popupWidth: number,
    popupHeight: number,
  ): { top: number; left: number; arrow: Record<string, string>; fits: boolean } {
    const { side, align } = parsePlacement(placement);
    let top: number;
    let left: number;
    const arrow: Record<string, string> = {};

    if (side === 'bottom') {
      top = anchorRect.bottom + GAP;
      if (align === 'start') left = anchorRect.left;
      else if (align === 'end') left = anchorRect.right - popupWidth;
      else left = anchorRect.left + anchorRect.width / 2 - popupWidth / 2;
      arrow.top = `-${ARROW_HALF}px`;
    } else if (side === 'top') {
      top = anchorRect.top - popupHeight - GAP;
      if (align === 'start') left = anchorRect.left;
      else if (align === 'end') left = anchorRect.right - popupWidth;
      else left = anchorRect.left + anchorRect.width / 2 - popupWidth / 2;
      arrow.top = `${popupHeight - ARROW_HALF}px`;
    } else if (side === 'left') {
      left = anchorRect.left - popupWidth - GAP;
      if (align === 'start') top = anchorRect.top;
      else if (align === 'end') top = anchorRect.bottom - popupHeight;
      else top = anchorRect.top + anchorRect.height / 2 - popupHeight / 2;
      arrow.left = `${popupWidth - ARROW_HALF}px`;
    } else {
      left = anchorRect.right + GAP;
      if (align === 'start') top = anchorRect.top;
      else if (align === 'end') top = anchorRect.bottom - popupHeight;
      else top = anchorRect.top + anchorRect.height / 2 - popupHeight / 2;
      arrow.left = `-${ARROW_HALF}px`;
    }

    const container = this._getContainer();
    const inContainer = container !== document.body;
    const containerRect = container.getBoundingClientRect();

    const clampLeft = inContainer ? containerRect.left : 0;
    const clampTop = inContainer ? containerRect.top : 0;
    const clampWidth = inContainer ? container.clientWidth : window.innerWidth;
    const clampHeight = inContainer ? container.clientHeight : window.innerHeight;

    const minLeft = clampLeft + 8;
    const maxLeft = clampLeft + clampWidth - popupWidth - 8;
    const minTop = clampTop + 8;
    const maxTop = clampTop + clampHeight - popupHeight - 8;

    const fits = left >= minLeft && left <= maxLeft && top >= minTop && top <= maxTop;

    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, left));
    const clampedTop = Math.max(minTop, Math.min(maxTop, top));

    if (this._showArrow()) {
      const arrowSide = arrowSideForPlacement(side);
      if (this._arrowPointAtCenter() && anchorRect.width > 0 && anchorRect.height > 0) {
        if (arrowSide === 'top' || arrowSide === 'bottom') {
          const triggerCenterX = anchorRect.left + anchorRect.width / 2;
          arrow.left = `${triggerCenterX - clampedLeft - ARROW_HALF}px`;
        } else {
          const triggerCenterY = anchorRect.top + anchorRect.height / 2;
          arrow.top = `${triggerCenterY - clampedTop - ARROW_HALF}px`;
        }
      } else if (arrowSide === 'top' || arrowSide === 'bottom') {
        const anchorX =
          align === 'start'
            ? anchorRect.left + Math.min(anchorRect.width / 2, 24)
            : align === 'end'
              ? anchorRect.right - Math.min(anchorRect.width / 2, 24)
              : anchorRect.left + anchorRect.width / 2;
        arrow.left = `${Math.max(12, Math.min(popupWidth - 22, anchorX - clampedLeft - ARROW_HALF))}px`;
      } else {
        const anchorY =
          align === 'start'
            ? anchorRect.top + Math.min(anchorRect.height / 2, 16)
            : align === 'end'
              ? anchorRect.bottom - Math.min(anchorRect.height / 2, 16)
              : anchorRect.top + anchorRect.height / 2;
        arrow.top = `${Math.max(12, Math.min(popupHeight - 22, anchorY - clampedTop - ARROW_HALF))}px`;
      }
    }

    return { top: clampedTop, left: clampedLeft, arrow, fits };
  }

  private _resolvePlacement(
    preferred: DropdownPlacement,
    anchorRect: DOMRect,
    popupWidth: number,
    popupHeight: number,
  ): { placement: DropdownPlacement; top: number; left: number; arrow: Record<string, string> } {
    let placement = preferred;
    let result = this._computePositionFor(placement, anchorRect, popupWidth, popupHeight);

    if (!this.autoAdjustOverflow || result.fits || this._contextPoint) {
      return { placement, ...result };
    }

    const { side } = parsePlacement(preferred);
    const flipped =
      `${flipSide(side)}${preferred.replace(/^(top|bottom|left|right)/, '')}` as DropdownPlacement;
    const alt =
      flipped === preferred
        ? ((side === 'bottom' || side === 'top' ? 'top' : 'left') as DropdownPlacement)
        : flipped;

    const altResult = this._computePositionFor(alt, anchorRect, popupWidth, popupHeight);
    if (altResult.fits) {
      placement = alt;
      result = altResult;
    }

    return { placement, ...result };
  }

  private _computePopupPosition() {
    if (!this._triggerEl && !this._contextPoint) return;

    const anchorRect = this._getAnchorRect();
    const container = this._getContainer();
    const inContainer = container !== document.body;
    const containerRect = container.getBoundingClientRect();

    const popupRect = this._overlayEl?.getBoundingClientRect();
    const width = popupRect?.width ?? 120;
    const height = popupRect?.height ?? 80;

    const resolved = this._resolvePlacement(this.placement, anchorRect, width, height);

    let { top, left } = resolved;
    if (inContainer) {
      left = left - containerRect.left + container.scrollLeft;
      top = top - containerRect.top + container.scrollTop;
    }

    this._effectivePlacement = resolved.placement;
    this._positionInContainer = inContainer;
    this._pos = { top, left };
    this._arrowStyle = resolved.arrow;
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
                ${item.icon ? html`<ui-icon name=${item.icon} size="16px"></ui-icon>` : nothing}
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
            ${item.icon ? html`<ui-icon name=${item.icon} size="16px"></ui-icon>` : nothing}
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
        })}
        role="menu"
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
        <div class="menu">${this._renderMenuItems(this._menuItems())}</div>
      </div>
    `;
  }

  private _ensurePortal(): HTMLDivElement {
    const container = this._getContainer();

    if (!this._portalHost) {
      this._portalHost = document.createElement('div');
      this._portalHost.setAttribute('data-ui-dropdown-portal', '');
      this._portalHost.style.pointerEvents = 'none';

      this._portalShadow = this._portalHost.attachShadow({ mode: 'open' });
      this._portalStyleEl = document.createElement('style');
      this._portalStyleEl.textContent = POPUP_PORTAL_STYLES;
      this._portalShadow.appendChild(this._portalStyleEl);

      this._portalMount = document.createElement('div');
      this._portalShadow.appendChild(this._portalMount);
    }

    this._syncPortalHostLayout(container);

    if (!this._portalHost.isConnected || this._portalHost.parentElement !== container) {
      container.appendChild(this._portalHost);
    }

    return this._portalMount!;
  }

  private _syncPortalHostLayout(container: HTMLElement) {
    if (!this._portalHost) return;

    const inContainer = container !== document.body;
    if (inContainer) {
      this._portalHost.style.position = 'absolute';
      this._portalHost.style.inset = '0';
      this._portalHost.style.width = '100%';
      this._portalHost.style.height = '100%';
      this._portalHost.style.zIndex = String(this.zIndex);

      if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
        this._positionPatchedContainer = container;
      }
    } else {
      this._portalHost.style.position = 'fixed';
      this._portalHost.style.inset = '0';
      this._portalHost.style.width = 'auto';
      this._portalHost.style.height = 'auto';
      this._portalHost.style.zIndex = String(this.zIndex);
    }
  }

  private _syncPortal() {
    if (!this._isOpen() || this.disabled) {
      this._hidePortalContent();
      return;
    }

    const mount = this._ensurePortal();
    render(this._overlayTemplate(), mount);
    this._overlayEl = this._portalShadow?.querySelector('.overlay') as HTMLDivElement | null;
  }

  private _hidePortalContent() {
    if (this._portalMount) render(nothing, this._portalMount);
    this._overlayEl = null;
    this._openSubmenuKey = null;
  }

  private _destroyPortal() {
    this._hidePortalContent();
    this._portalHost?.remove();
    this._portalHost = null;
    this._portalShadow = null;
    this._portalMount = null;
    this._portalStyleEl = null;
    if (this._positionPatchedContainer) {
      this._positionPatchedContainer.style.position = '';
      this._positionPatchedContainer = null;
    }
  }

  protected render() {
    return html`
      <span
        class="trigger"
        aria-haspopup="menu"
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
    this._destroyPortal();
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
      this._destroyPortal();
    } else {
      this._hidePortalContent();
    }
  }

  private _onOverlayContentChanged(changed: PropertyValues) {
    const needsSync =
      changed.has('menu') ||
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
    window.addEventListener('mousedown', this._docMouseDown, this._captureOptions);
    window.addEventListener('keydown', this._docKeyDown, this._captureOptions);
    window.addEventListener('scroll', this._onScrollOrResize, { capture: true });
    window.addEventListener('resize', this._onScrollOrResize);

    const container = this._getContainer();
    if (container !== document.body) {
      this._scrollContainer = container;
      container.addEventListener('scroll', this._onScrollOrResize, { capture: true });
    }
  }

  private _unbindGlobal() {
    window.removeEventListener('mousedown', this._docMouseDown, this._captureOptions);
    window.removeEventListener('keydown', this._docKeyDown, this._captureOptions);
    window.removeEventListener('scroll', this._onScrollOrResize, { capture: true });
    window.removeEventListener('resize', this._onScrollOrResize);

    if (this._scrollContainer) {
      this._scrollContainer.removeEventListener('scroll', this._onScrollOrResize, {
        capture: true,
      });
      this._scrollContainer = null;
    }
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

  private _isEventInside(e: Event): boolean {
    const path = e.composedPath();
    if (path.includes(this)) return true;
    if (this._portalHost && path.includes(this._portalHost)) return true;
    return false;
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
    if (this._isEventInside(e)) return;
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
