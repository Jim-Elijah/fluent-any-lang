import { LitElement, html, css, nothing, render, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

export type PopconfirmTriggerType = 'click' | 'hover';

export type PopconfirmPlacement = 'top' | 'bottom' | 'left' | 'right';

export type PopconfirmCloseReason =
  | 'clickOutside'
  | 'cancel'
  | 'confirm'
  | 'esc'
  | 'trigger'
  | 'manual';

export type PopconfirmBeforeCloseDetail = {
  reason: PopconfirmCloseReason;
};

export type PopconfirmBeforeOpenDetail = {
  trigger?: PopconfirmTriggerType | 'manual';
};

export type PopconfirmOpenChangeDetail = {
  open: boolean;
  trigger?: PopconfirmTriggerType | 'manual';
  reason?: PopconfirmCloseReason;
};

const HOVER_DELAY_MS = 100;
const ARROW_HALF = 5;

/** Portal 内 popup 样式（渲染在 light DOM，需独立注入） */
const POPUP_PORTAL_STYLES = css`
  .popup {
    position: fixed;
    z-index: var(--popconfirm-z, 1060);
    min-width: 160px;
    max-width: 260px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    padding: 10px 12px;
    color: rgba(0, 0, 0, 0.88);
    font-size: 14px;
    line-height: 1.5;
    user-select: none;
    pointer-events: auto;
    box-sizing: border-box;
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
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.08);
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

  .title {
    margin-bottom: 8px;
    color: rgba(0, 0, 0, 0.88);
    font-weight: 500;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn {
    height: 28px;
    padding: 0 12px;
    border-radius: 6px;
    border: 1px solid transparent;
    cursor: pointer;
    font-size: 13px;
    line-height: 28px;
    background: transparent;
  }

  .btn.primary {
    background: #1677ff;
    color: #fff;
    border-color: #1677ff;
  }
  .btn.primary:hover {
    filter: brightness(0.98);
  }
  .btn.primary:disabled {
    background: #8ab9ff;
    border-color: #8ab9ff;
    cursor: not-allowed;
  }

  .btn.ghost {
    border-color: rgba(0, 0, 0, 0.15);
    color: rgba(0, 0, 0, 0.88);
  }
  .btn.ghost:hover {
    background: rgba(0, 0, 0, 0.03);
  }
  .btn.ghost:disabled {
    color: rgba(0, 0, 0, 0.25);
    border-color: rgba(0, 0, 0, 0.12);
    cursor: not-allowed;
  }

  .spin {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.65);
    border-top-color: #fff;
    animation: spin 0.8s linear infinite;
    vertical-align: -2px;
    margin-right: 6px;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`.cssText;

@customElement('ui-popconfirm')
@localized()
export class UiPopconfirm extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
    }

    .trigger {
      display: inline;
    }
  `;

  @property({ type: Boolean }) open?: boolean;
  @property({ type: Boolean, attribute: 'default-open' }) defaultOpen = false;
  @property() title = '';

  @property() okText = '';
  @property() cancelText = '';

  @property({ type: String }) placement: PopconfirmPlacement = 'top';
  @property({ type: String }) trigger: PopconfirmTriggerType = 'click';

  @property({ type: Boolean, attribute: 'disabled' }) disabled = false;
  @property({ type: Boolean, attribute: 'confirm-loading' }) confirmLoading = false;
  @property({ type: Boolean, attribute: 'auto-close' }) autoClose = true;
  @property({ type: Boolean, attribute: 'close-on-esc' }) closeOnEsc = true;
  @property({ type: Boolean, attribute: 'destroy-on-close' }) destroyOnClose = false;
  @property({ type: Number, attribute: 'z-index' }) zIndex = 1060;

  /** 类似 antd getPopupContainer：selector 或 HTMLElement，默认 body */
  @property() popupContainer: string | HTMLElement | null = 'body';

  @state() private _internalOpen = false;
  @state() private _pos = { top: 0, left: 0 };
  @state() private _arrowStyle: Record<string, string> = {};
  @state() private _positionInContainer = false;

  private readonly _titleId = `ui-popconfirm-title-${Math.random().toString(36).slice(2, 9)}`;

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
  private _hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;

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

  private _isOpen() {
    return typeof this.open === 'boolean' ? this.open : this._internalOpen;
  }

  private _dispatchCancelable(name: string, detail: unknown) {
    const evt = new CustomEvent(name, {
      detail,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    this.dispatchEvent(evt);
    return evt;
  }

  private _dispatch(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _beforeOpen(trigger?: PopconfirmTriggerType | 'manual') {
    const evt = this._dispatchCancelable('beforeOpen', {
      trigger,
    } as PopconfirmBeforeOpenDetail);
    return !evt.defaultPrevented;
  }

  private _beforeClose(reason: PopconfirmCloseReason) {
    const evt = this._dispatchCancelable('beforeClose', {
      reason,
    } as PopconfirmBeforeCloseDetail);
    return !evt.defaultPrevented;
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

  private _setOpen(
    next: boolean,
    meta: {
      trigger?: PopconfirmTriggerType | 'manual';
      reason?: PopconfirmCloseReason;
    } = {},
  ) {
    const prev = this._isOpen();
    if (prev === next) return;

    if (next) {
      if (this.disabled) return;
      if (!this._beforeOpen(meta.trigger)) return;
    } else {
      if (this.confirmLoading) return;
      if (meta.reason && !this._beforeClose(meta.reason)) return;
    }

    this._assignOpen(next);

    if (next) {
      this._dispatch('update:open', { open: true, trigger: meta.trigger });
      this._dispatch('open', { trigger: meta.trigger });
    } else {
      this._dispatch('close', { reason: meta.reason });
      this._dispatch('update:open', { open: false, reason: meta.reason });
    }
  }

  private _show(trigger?: PopconfirmTriggerType | 'manual') {
    this._setOpen(true, { trigger });
  }

  private _hide(reason: PopconfirmCloseReason) {
    this._setOpen(false, { reason });
  }

  private _computePopupPosition() {
    if (!this._triggerEl) return;

    const triggerRect = this._triggerEl.getBoundingClientRect();
    const container = this._getContainer();
    const inContainer = container !== document.body;
    const containerRect = container.getBoundingClientRect();

    const popupRect = this._popupEl?.getBoundingClientRect();
    const width = popupRect?.width ?? 200;
    const height = popupRect?.height ?? 90;
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

    if (placement === 'top' || placement === 'bottom') {
      const triggerCenterX = triggerRect.left + triggerRect.width / 2;
      const arrowLeft = triggerCenterX - clampedLeft - 5;
      arrow.left = `${Math.max(12, Math.min(width - 22, arrowLeft))}px`;
    } else {
      const triggerCenterY = triggerRect.top + triggerRect.height / 2;
      const arrowTop = triggerCenterY - clampedTop - 5;
      arrow.top = `${Math.max(12, Math.min(height - 22, arrowTop))}px`;
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
        style=${styleMap({
          top: `${this._pos.top}px`,
          left: `${this._pos.left}px`,
          zIndex: String(this.zIndex),
          '--popconfirm-z': String(this.zIndex),
        })}
        role="dialog"
        aria-modal="false"
        aria-labelledby=${this._titleId}
        @mousedown=${(e: MouseEvent) => e.stopPropagation()}
        @click=${(e: MouseEvent) => e.stopPropagation()}
        @mouseenter=${this._onPopupMouseEnter}
        @mouseleave=${this._onPopupMouseLeave}
      >
        <div
          class=${classMap({ arrow: true, [`placement-${this.placement}`]: true })}
          style=${styleMap(this._arrowStyle)}
        ></div>
        <div class="title" id=${this._titleId}>${this.title || msg('确定要执行此操作吗？')}</div>
        <div class="actions">
          <button
            class="btn ghost"
            ?disabled=${this.confirmLoading}
            @click=${() => this._onCancel()}
          >
            ${this.cancelText || msg('取消')}
          </button>
          <button
            class="btn primary"
            ?disabled=${this.confirmLoading || this.disabled}
            @click=${() => this._onConfirm()}
          >
            ${this.confirmLoading
              ? html`<span class="spin"></span>${this.okText || msg('确定')}`
              : this.okText || msg('确定')}
          </button>
        </div>
      </div>
    `;
  }

  private _ensurePortal(): HTMLDivElement {
    const container = this._getContainer();

    if (!this._portalHost) {
      this._portalHost = document.createElement('div');
      this._portalHost.setAttribute('data-ui-popconfirm-portal', '');
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
    if (!this._isOpen()) {
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
    this.style.setProperty('--popconfirm-z', String(this.zIndex));
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
      this.style.setProperty('--popconfirm-z', String(this.zIndex));
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
      if (!this._beforeOpen('manual')) {
        this._assignOpen(false);
        this._prevIsOpen = false;
        return;
      }
      this._dispatch('open', { trigger: 'manual' });
    } else if (!isOpen && wasOpen) {
      this._dispatch('close', { reason: 'manual' });
    }
  }

  private _onOpenStateChanged(isOpen: boolean) {
    if (isOpen) {
      if (!this._globalBound) {
        this._bindGlobal();
        this._globalBound = true;
      }
      this._syncPortal();
      queueMicrotask(() => {
        if (!this._isOpen()) return;
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
      changed.has('okText') ||
      changed.has('cancelText') ||
      changed.has('confirmLoading') ||
      changed.has('disabled') ||
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
    if (this._hoverCloseTimer) {
      clearTimeout(this._hoverCloseTimer);
      this._hoverCloseTimer = null;
    }
  }

  private _scheduleHoverClose() {
    if (this.trigger !== 'hover' || !this.autoClose) return;
    this._clearHoverTimers();
    this._hoverCloseTimer = setTimeout(() => {
      this._hoverCloseTimer = null;
      if (this._isOpen()) this._hide('trigger');
    }, HOVER_DELAY_MS);
  }

  private _cancelHoverClose() {
    this._clearHoverTimers();
  }

  private _isEventInside(e: Event): boolean {
    const path = e.composedPath();
    if (path.includes(this)) return true;
    if (this._portalHost && path.includes(this._portalHost)) return true;
    return false;
  }

  private _onTriggerClick = () => {
    if (this.trigger !== 'click') return;
    if (this.disabled) return;

    if (this._isOpen()) {
      this._hide('trigger');
    } else {
      this._show('click');
    }
  };

  private _onTriggerMouseEnter = () => {
    if (this.trigger !== 'hover') return;
    if (this.disabled) return;
    this._cancelHoverClose();
    if (!this._isOpen()) this._show('hover');
  };

  private _onTriggerMouseLeave = () => {
    if (this.trigger !== 'hover') return;
    if (!this._isOpen()) return;
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
    if (this.confirmLoading) return;
    if (this._isEventInside(e)) return;
    if (this.autoClose) this._hide('clickOutside');
  }

  private _onDocumentKeyDown(e: KeyboardEvent) {
    if (!this._isOpen()) return;
    if (this.confirmLoading) return;
    if (this.closeOnEsc && e.key === 'Escape') {
      e.preventDefault();
      this._hide('esc');
    }
  }

  private _onCancel() {
    if (this.confirmLoading || this.disabled) return;
    this._dispatch('cancel', {});
    this._hide('cancel');
  }

  private _onConfirm() {
    if (this.confirmLoading || this.disabled) return;

    const beforeEvt = this._dispatchCancelable('beforeConfirm', {});
    if (beforeEvt.defaultPrevented) return;

    this._dispatch('confirm', {});
    // 宏任务等待父组件同步更新 confirm-loading 后再决定是否关闭
    setTimeout(() => {
      if (!this.confirmLoading) {
        this._hide('confirm');
      }
    }, 0);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-popconfirm': UiPopconfirm;
  }
}
