import { LitElement, html, css, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { arrowStyles } from './internal/arrow-styles.js';
import { isControlledOpen } from './internal/controlled-state.js';
import { OverlayController } from './internal/overlay-controller.js';
import { arrowSideForPlacement, computePlacement4 } from './internal/placement.js';
import { Z_INDEX } from './internal/z-index.js';

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

const DEFAULT_ENTER_DELAY_S = 0.1;
const DEFAULT_LEAVE_DELAY_S = 0.15;

const POPUP_PORTAL_STYLES = `
  .popup {
    position: fixed;
    z-index: var(--popconfirm-z, 1080);
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

  ${arrowStyles({
    backgroundVar: '--popconfirm-bg',
    backgroundFallback: '#fff',
    borderColor: 'rgba(0, 0, 0, 0.08)',
  })}

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
`;

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
  @property({ type: Number, attribute: 'z-index' }) zIndex = Z_INDEX.POPCONFIRM;

  /** 鼠标移入后延时显示，单位：秒（hover trigger） */
  @property({ type: Number, attribute: 'mouse-enter-delay' }) mouseEnterDelay =
    DEFAULT_ENTER_DELAY_S;
  /** 鼠标移出后延时隐藏，单位：秒（hover trigger） */
  @property({ type: Number, attribute: 'mouse-leave-delay' }) mouseLeaveDelay =
    DEFAULT_LEAVE_DELAY_S;

  /** 类似 antd getPopupContainer：selector 或 HTMLElement，默认 body */
  @property() popupContainer: string | HTMLElement | null = 'body';

  @state() private _internalOpen = false;
  @state() private _pos = { top: 0, left: 0 };
  @state() private _arrowStyle: Record<string, string> = {};
  @state() private _positionInContainer = false;

  private readonly _titleId = `ui-popconfirm-title-${Math.random().toString(36).slice(2, 9)}`;

  private _triggerEl: HTMLElement | null = null;
  private _overlay: OverlayController | null = null;
  private _globalBound = false;
  private _prevIsOpen = false;
  private _hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
  private _hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private _openingLock = false;
  private _openingLockTimer: ReturnType<typeof setTimeout> | null = null;

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
          dataAttr: 'data-ui-popconfirm-portal',
          styleText: POPUP_PORTAL_STYLES,
          zIndex: this.zIndex,
          popupContainer: this.popupContainer,
        },
        isControlledOpen: () => isControlledOpen(this.open),
        readOpen: () => this._isOpen(),
        writeOpen: (next) => {
          this._internalOpen = next;
        },
      });
      this._overlay.onLayoutChange(() => this._updatePosition());
    }
    return this._overlay;
  }

  private _isOpen() {
    return isControlledOpen(this.open) ? this.open! : this._internalOpen;
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

  private _assignOpen(next: boolean) {
    if (!isControlledOpen(this.open)) {
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

    const overlay = this._getOverlay();
    const popupEl = overlay.getPopupEl('.popup');
    const popupRect = popupEl?.getBoundingClientRect();
    const width = popupRect?.width ?? 200;
    const height = popupRect?.height ?? 90;

    const placed = computePlacement4({
      placement: this.placement,
      triggerRect: this._triggerEl.getBoundingClientRect(),
      popupWidth: width,
      popupHeight: height,
      container: overlay.portal.getContainer(),
    });

    this._positionInContainer = placed.inContainer;
    this._pos = { top: placed.top, left: placed.left };
    this._arrowStyle = placed.arrow;
  }

  private _popupTemplate() {
    const arrowPlacement = arrowSideForPlacement(this.placement);
    return html`
      <div
        class=${classMap({ popup: true, 'in-container': this._positionInContainer })}
        style=${styleMap({
          top: `${this._pos.top}px`,
          left: `${this._pos.left}px`,
          zIndex: String(this.zIndex),
          '--popconfirm-z': String(this.zIndex),
          '--popconfirm-bg': '#fff',
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
          class=${classMap({ arrow: true, [`placement-${arrowPlacement}`]: true })}
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

  private _syncPortal() {
    const overlay = this._getOverlay();
    if (!this._isOpen()) {
      overlay.hideContent();
      return;
    }
    overlay.updatePortalOptions({ zIndex: this.zIndex, popupContainer: this.popupContainer });
    overlay.syncContent(this._popupTemplate());
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
    this._clearOpeningLock();
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
      this._setOpeningLock();
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
    this._clearOpeningLock();
    if (this.destroyOnClose) {
      this._overlay?.destroyPortal();
    } else {
      this._overlay?.hideContent();
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
    if (!this._triggerEl || !this._isOpen()) return;
    this._computePopupPosition();
  }

  private _enterDelayMs(): number {
    return Math.max(0, this.mouseEnterDelay) * 1000;
  }

  private _leaveDelayMs(): number {
    return Math.max(0, this.mouseLeaveDelay) * 1000;
  }

  private _setOpeningLock() {
    this._openingLock = true;
    if (this._openingLockTimer) {
      clearTimeout(this._openingLockTimer);
    }
    this._openingLockTimer = setTimeout(() => {
      this._openingLock = false;
      this._openingLockTimer = null;
    }, 0);
  }

  private _clearOpeningLock() {
    this._openingLock = false;
    if (this._openingLockTimer) {
      clearTimeout(this._openingLockTimer);
      this._openingLockTimer = null;
    }
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
    if (this.trigger !== 'hover' || !this.autoClose) return;
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

  private _onTriggerClick = () => {
    if (this.trigger !== 'click') return;
    if (this.disabled) return;
    if (this._isOpen()) return;
    this._show('click');
  };

  private _onTriggerMouseEnter = () => {
    if (this.trigger !== 'hover') return;
    if (this.disabled) return;
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
    if (this.confirmLoading) return;
    if (this._openingLock) return;
    if (this._getOverlay().isEventInside(e)) return;
    if (!this.autoClose || this.trigger !== 'click') return;
    this._hide('clickOutside');
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

/** ui-popconfirm 事件类型（监听时使用显式类型） */
export interface UiPopconfirmEventMap {
  'update:open': CustomEvent<PopconfirmOpenChangeDetail>;
  open: CustomEvent<{ trigger?: PopconfirmTriggerType | 'manual' }>;
  close: CustomEvent<{ reason?: PopconfirmCloseReason }>;
  beforeOpen: CustomEvent<PopconfirmBeforeOpenDetail>;
  beforeClose: CustomEvent<PopconfirmBeforeCloseDetail>;
  beforeConfirm: CustomEvent<Record<string, never>>;
  confirm: CustomEvent<Record<string, never>>;
  cancel: CustomEvent<Record<string, never>>;
}
