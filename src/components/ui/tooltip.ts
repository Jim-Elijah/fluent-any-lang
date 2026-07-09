import { LitElement, html, css, nothing, render, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { isControlledOpen } from './internal/controlled-state.js';

export type TooltipTriggerType = 'click' | 'hover';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export type TooltipCloseReason = 'clickOutside' | 'esc' | 'trigger' | 'manual';

export type TooltipOpenChangeDetail = {
  open: boolean;
  trigger?: TooltipTriggerType | 'manual';
  reason?: TooltipCloseReason;
};

const ARROW_HALF = 5;
const DEFAULT_ENTER_DELAY_S = 0.1;
const DEFAULT_LEAVE_DELAY_S = 0.1;

/** Portal 内 popup 样式（渲染在 light DOM，需独立注入） */
const POPUP_PORTAL_STYLES = css`
  .popup {
    position: fixed;
    z-index: var(--tooltip-z, 1070);
    max-width: var(--tooltip-max-width, 250px);
    min-height: 32px;
    padding: 6px 8px;
    background: var(--tooltip-bg, rgba(0, 0, 0, 0.85));
    color: var(--tooltip-color, #fff);
    font-size: 14px;
    line-height: 1.5714285714285714;
    border-radius: 6px;
    box-sizing: border-box;
    word-wrap: break-word;
    user-select: none;
    pointer-events: auto;
  }

  .popup.in-container {
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
    background: var(--tooltip-bg, rgba(0, 0, 0, 0.85));
    box-sizing: border-box;
    transform: rotate(45deg);
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

  .content {
    position: relative;
    z-index: 1;
  }
`.cssText;

@customElement('ui-tooltip')
export class UiTooltip extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
    }

    .trigger {
      display: inline;
    }
  `;

  /** 受控显隐；未传时为非受控 */
  @property({ type: Boolean }) open?: boolean;
  @property({ type: Boolean, attribute: 'default-open' }) defaultOpen = false;

  @property() title = '';
  @property({ type: String }) placement: TooltipPlacement = 'top';
  @property({ type: String }) trigger: TooltipTriggerType = 'hover';

  @property({ type: Boolean }) arrow = true;
  @property({ type: Boolean }) disabled = false;
  @property() color = '';
  @property({ type: Boolean, attribute: 'destroy-on-close' }) destroyOnClose = false;
  @property({ type: Boolean, attribute: 'close-on-esc' }) closeOnEsc = true;
  @property({ type: Number, attribute: 'z-index' }) zIndex = 1070;

  /** 鼠标移入后延时显示，单位：秒（antd mouseEnterDelay） */
  @property({ type: Number, attribute: 'mouse-enter-delay' }) mouseEnterDelay =
    DEFAULT_ENTER_DELAY_S;
  /** 鼠标移出后延时隐藏，单位：秒（antd mouseLeaveDelay） */
  @property({ type: Number, attribute: 'mouse-leave-delay' }) mouseLeaveDelay =
    DEFAULT_LEAVE_DELAY_S;

  /** 类似 antd getPopupContainer：selector 或 HTMLElement，默认 body */
  @property() popupContainer: string | HTMLElement | null = 'body';

  @state() private _internalOpen = false;
  @state() private _pos = { top: 0, left: 0 };
  @state() private _arrowStyle: Record<string, string> = {};
  @state() private _positionInContainer = false;

  private readonly _tooltipId = `ui-tooltip-${Math.random().toString(36).slice(2, 9)}`;

  private _triggerEl: HTMLElement | null = null;
  private _popupEl: HTMLDivElement | null = null;

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

  private readonly _captureOptions = { capture: true };
  private _docMouseDown = (e: MouseEvent) => this._onDocumentMouseDown(e);
  private _docKeyDown = (e: KeyboardEvent) => this._onDocumentKeyDown(e);
  private _onScrollOrResize = () => this._updatePosition();

  connectedCallback(): void {
    super.connectedCallback();
    if (!isControlledOpen(this.open)) {
      this._internalOpen = this.defaultOpen;
    }
  }

  private _isOpen(): boolean {
    return isControlledOpen(this.open) ? this.open : this._internalOpen;
  }

  private _assignOpen(next: boolean): void {
    if (!isControlledOpen(this.open)) {
      this._internalOpen = next;
    }
  }

  private _isDisabled(): boolean {
    if (this.disabled) return true;
    return !this.title.trim();
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

  private _emitOpenChange(
    next: boolean,
    meta: {
      trigger?: TooltipTriggerType | 'manual';
      reason?: TooltipCloseReason;
    } = {},
  ) {
    const detail: TooltipOpenChangeDetail = next
      ? { open: true, trigger: meta.trigger }
      : { open: false, trigger: meta.trigger, reason: meta.reason };

    this._dispatch('open-change', detail);
    this._dispatch('update:open', detail);

    if (next) {
      this._dispatch('open', { trigger: meta.trigger });
    } else {
      this._dispatch('close', { reason: meta.reason });
    }
  }

  private _setOpen(
    next: boolean,
    meta: {
      trigger?: TooltipTriggerType | 'manual';
      reason?: TooltipCloseReason;
    } = {},
  ) {
    if (this._isOpen() === next) return;

    if (next) {
      if (this._isDisabled()) return;
    }

    this._assignOpen(next);
    this._emitOpenChange(next, meta);
  }

  private _show(trigger?: TooltipTriggerType | 'manual') {
    this._setOpen(true, { trigger });
  }

  private _hide(reason: TooltipCloseReason) {
    this._setOpen(false, { reason });
  }

  private _enterDelayMs(): number {
    return Math.max(0, this.mouseEnterDelay) * 1000;
  }

  private _leaveDelayMs(): number {
    return Math.max(0, this.mouseLeaveDelay) * 1000;
  }

  private _popupStyleVars(): Record<string, string> {
    const vars: Record<string, string> = {
      top: `${this._pos.top}px`,
      left: `${this._pos.left}px`,
      zIndex: String(this.zIndex),
      '--tooltip-z': String(this.zIndex),
    };
    if (this.color) {
      vars['--tooltip-bg'] = this.color;
      vars['--tooltip-color'] = '#fff';
    }
    return vars;
  }

  private _computePopupPosition() {
    if (!this._triggerEl) return;

    const triggerRect = this._triggerEl.getBoundingClientRect();
    const container = this._getContainer();
    const inContainer = container !== document.body;
    const containerRect = container.getBoundingClientRect();

    const popupRect = this._popupEl?.getBoundingClientRect();
    const width = popupRect?.width ?? 120;
    const height = popupRect?.height ?? 32;
    const gap = 8;
    const { placement } = this;

    let top: number;
    let left: number;
    let arrow: Record<string, string>;

    if (placement === 'top') {
      top = triggerRect.top - height - gap;
      left = triggerRect.left + triggerRect.width / 2 - width / 2;
      arrow = {
        left: `${width / 2 - ARROW_HALF}px`,
        top: `${height - ARROW_HALF}px`,
      };
    } else if (placement === 'bottom') {
      top = triggerRect.bottom + gap;
      left = triggerRect.left + triggerRect.width / 2 - width / 2;
      arrow = {
        left: `${width / 2 - ARROW_HALF}px`,
        top: `-${ARROW_HALF}px`,
      };
    } else if (placement === 'left') {
      top = triggerRect.top + triggerRect.height / 2 - height / 2;
      left = triggerRect.left - width - gap;
      arrow = {
        top: `${height / 2 - ARROW_HALF}px`,
        left: `${width - ARROW_HALF}px`,
      };
    } else {
      top = triggerRect.top + triggerRect.height / 2 - height / 2;
      left = triggerRect.right + gap;
      arrow = {
        top: `${height / 2 - ARROW_HALF}px`,
        left: `-${ARROW_HALF}px`,
      };
    }

    const clampLeft = inContainer ? containerRect.left : 0;
    const clampTop = inContainer ? containerRect.top : 0;
    const clampWidth = inContainer ? container.clientWidth : window.innerWidth;
    const clampHeight = inContainer ? container.clientHeight : window.innerHeight;

    const minLeft = clampLeft + 8;
    const maxLeft = clampLeft + clampWidth - width - 8;
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, left));

    const minTop = clampTop + 8;
    const maxTop = clampTop + clampHeight - height - 8;
    const clampedTop = Math.max(minTop, Math.min(maxTop, top));

    if (this.arrow) {
      if (placement === 'top' || placement === 'bottom') {
        const triggerCenterX = triggerRect.left + triggerRect.width / 2;
        const arrowLeft = triggerCenterX - clampedLeft - 5;
        arrow.left = `${Math.max(12, Math.min(width - 22, arrowLeft))}px`;
      } else {
        const triggerCenterY = triggerRect.top + triggerRect.height / 2;
        const arrowTop = triggerCenterY - clampedTop - 5;
        arrow.top = `${Math.max(12, Math.min(height - 22, arrowTop))}px`;
      }
    }

    if (inContainer) {
      left = clampedLeft - containerRect.left + container.scrollLeft;
      top = clampedTop - containerRect.top + container.scrollTop;
    } else {
      left = clampedLeft;
      top = clampedTop;
    }

    this._positionInContainer = inContainer;
    this._pos = { top, left };
    this._arrowStyle = arrow;
  }

  private _popupTemplate() {
    return html`
      <div
        class=${classMap({ popup: true, 'in-container': this._positionInContainer })}
        style=${styleMap(this._popupStyleVars())}
        role="tooltip"
        id=${this._tooltipId}
        @mousedown=${(e: MouseEvent) => e.stopPropagation()}
        @click=${(e: MouseEvent) => e.stopPropagation()}
        @mouseenter=${this._onPopupMouseEnter}
        @mouseleave=${this._onPopupMouseLeave}
      >
        ${this.arrow
          ? html`
              <div
                class=${classMap({ arrow: true, [`placement-${this.placement}`]: true })}
                style=${styleMap(this._arrowStyle)}
              ></div>
            `
          : nothing}
        <div class="content">${this.title}</div>
      </div>
    `;
  }

  private _ensurePortal(): HTMLDivElement {
    const container = this._getContainer();

    if (!this._portalHost) {
      this._portalHost = document.createElement('div');
      this._portalHost.setAttribute('data-ui-tooltip-portal', '');
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
    if (!this._isOpen() || this._isDisabled()) {
      this._hidePortalContent();
      return;
    }

    const mount = this._ensurePortal();
    render(this._popupTemplate(), mount);
    this._popupEl = this._portalShadow?.querySelector('.popup') as HTMLDivElement | null;
  }

  private _hidePortalContent() {
    if (this._portalMount) render(nothing, this._portalMount);
    this._popupEl = null;
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
        aria-describedby=${this._isOpen() && !this._isDisabled() ? this._tooltipId : nothing}
        @click=${this._onTriggerClick}
        @mouseenter=${this._onTriggerMouseEnter}
        @mouseleave=${this._onTriggerMouseLeave}
      >
        <slot></slot>
      </span>
    `;
  }

  protected firstUpdated() {
    this._triggerEl = this.shadowRoot?.querySelector('.trigger') as HTMLElement | null;
    this.style.setProperty('--tooltip-z', String(this.zIndex));
    this._prevIsOpen = this._isOpen();
  }

  protected updated(changed: PropertyValues) {
    const isOpen = this._isOpen();
    const wasOpen = this._prevIsOpen;

    this._handleControlledOpenEdge(changed, isOpen, wasOpen);

    if (isOpen !== wasOpen) {
      this._onOpenStateChanged(isOpen);
    } else if (isOpen) {
      this._onPopupContentChanged(changed);
    }

    if (changed.has('zIndex')) {
      this.style.setProperty('--tooltip-z', String(this.zIndex));
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
      this._dispatch('open', { trigger: 'manual' });
    } else if (!isOpen && wasOpen) {
      this._dispatch('close', { reason: 'manual' });
    }
  }

  private _onOpenStateChanged(isOpen: boolean) {
    if (isOpen && this._isDisabled()) {
      return;
    }

    if (isOpen) {
      if (!this._globalBound) {
        this._bindGlobal();
        this._globalBound = true;
      }
      this._syncPortal();
      queueMicrotask(() => {
        if (!this._isOpen() || this._isDisabled()) return;
        this._updatePosition();
        this._syncPortal();
      });
      return;
    }

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

  private _onPopupContentChanged(changed: PropertyValues) {
    const needsSync =
      changed.has('title') ||
      changed.has('color') ||
      changed.has('arrow') ||
      changed.has('zIndex') ||
      changed.has('popupContainer') ||
      changed.has('placement') ||
      changed.has('_pos') ||
      changed.has('_arrowStyle');

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
    if (!this._triggerEl || !this._isOpen()) return;
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
    if (this.trigger !== 'hover') return;
    this._clearHoverTimers();
    this._hoverOpenTimer = setTimeout(() => {
      this._hoverOpenTimer = null;
      if (!this._isOpen()) this._show('hover');
    }, this._enterDelayMs());
  }

  private _scheduleHoverClose() {
    if (this.trigger !== 'hover') return;
    this._clearHoverTimers();
    this._hoverCloseTimer = setTimeout(() => {
      this._hoverCloseTimer = null;
      if (this._isOpen()) this._hide('trigger');
    }, this._leaveDelayMs());
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
    if (this.trigger !== 'click') return;
    if (this._isDisabled()) return;

    if (this._isOpen()) {
      this._hide('trigger');
    } else {
      this._show('click');
    }
  };

  private _onTriggerMouseEnter = () => {
    if (this.trigger !== 'hover') return;
    if (this._isDisabled()) return;
    this._cancelHoverClose();
    if (this._isOpen()) return;
    this._scheduleHoverOpen();
  };

  private _onTriggerMouseLeave = () => {
    if (this.trigger !== 'hover') return;
    if (!this._isOpen()) {
      this._clearHoverTimers();
      return;
    }
    this._scheduleHoverClose();
  };

  private _onPopupMouseEnter = () => {
    if (this.trigger !== 'hover') return;
    this._cancelHoverClose();
  };

  private _onPopupMouseLeave = () => {
    if (this.trigger !== 'hover') return;
    this._scheduleHoverClose();
  };

  private _onDocumentMouseDown(e: MouseEvent) {
    if (!this._isOpen()) return;
    if (this._isEventInside(e)) return;
    if (this.trigger === 'click') {
      this._hide('clickOutside');
    }
  }

  private _onDocumentKeyDown(e: KeyboardEvent) {
    if (!this._isOpen()) return;
    if (this.closeOnEsc && e.key === 'Escape') {
      e.preventDefault();
      this._hide('esc');
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-tooltip': UiTooltip;
  }
}

/** ui-tooltip 事件类型（监听时使用显式类型） */
export interface UiTooltipEventMap {
  'open-change': CustomEvent<TooltipOpenChangeDetail>;
  'update:open': CustomEvent<TooltipOpenChangeDetail>;
  open: CustomEvent<{ trigger?: TooltipTriggerType | 'manual' }>;
  close: CustomEvent<{ reason?: TooltipCloseReason }>;
}
