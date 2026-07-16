import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { isControlledOpen } from './internal/controlled-state.js';
import { OverlayTriggerController } from './internal/overlay-triggers.js';
import { Z_INDEX } from './internal/z-index.js';

const DRAWER_ANIMATION_MS = 220;

let bodyScrollLockCount = 0;
let previousBodyOverflow = '';

type DrawerPhase = 'closed' | 'opening' | 'open' | 'closing';

export type DrawerDirection = 'rtl' | 'ltr' | 'ttb' | 'btt';
export type DrawerCloseReason = 'close' | 'mask' | 'keyboard' | 'method' | 'programmatic';
export type DrawerOpenChangeDetail = { open: boolean; reason?: DrawerCloseReason | 'programmatic' };
export type DrawerLifecycleDetail = { reason?: DrawerCloseReason | 'programmatic' };
export type DrawerBeforeCloseDetail = { reason: DrawerCloseReason };
export type DrawerBeforeCloseHandler = (done: () => void, detail: DrawerBeforeCloseDetail) => void;

function hasAssignedContent(slot: HTMLSlotElement): boolean {
  return slot
    .assignedNodes({ flatten: true })
    .some((node) => node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim().length > 0);
}

function acquireBodyScrollLock() {
  if (bodyScrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyScrollLockCount += 1;
}

function releaseBodyScrollLock() {
  if (bodyScrollLockCount === 0) return;

  bodyScrollLockCount -= 1;
  if (bodyScrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
  }
}

@customElement('ui-drawer')
@localized()
export class UiDrawer extends LitElement {
  static styles = css`
    :host {
      position: static;
      --drawer-z: 1600;
    }

    .overlay {
      position: fixed;
      inset: 0;
      display: flex;
      opacity: 0;
      visibility: hidden;
      transition:
        opacity 0.22s ease,
        visibility 0s linear 0.22s;
      z-index: var(--drawer-z, 1600);
    }

    .overlay[data-modal='true'] {
      background: rgba(0, 0, 0, 0.45);
    }

    .overlay[data-modal='false'] {
      background: transparent;
      pointer-events: none;
    }

    .overlay[data-direction='rtl'] {
      justify-content: flex-end;
      align-items: stretch;
    }

    .overlay[data-direction='ltr'] {
      justify-content: flex-start;
      align-items: stretch;
    }

    .overlay[data-direction='ttb'] {
      justify-content: flex-start;
      align-items: stretch;
    }

    .overlay[data-direction='btt'] {
      justify-content: flex-end;
      align-items: stretch;
    }

    .overlay[data-phase='opening'],
    .overlay[data-phase='open'],
    .overlay[data-phase='closing'] {
      visibility: visible;
      transition-delay: 0s;
    }

    .overlay[data-phase='opening'],
    .overlay[data-phase='open'] {
      opacity: 1;
    }

    .panel {
      position: relative;
      display: flex;
      flex-direction: column;
      background: #fff;
      box-sizing: border-box;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
      color: rgba(0, 0, 0, 0.88);
      pointer-events: auto;
      outline: none;
      transition: transform 0.22s ease;
      max-width: 100vw;
      max-height: 100vh;
    }

    .overlay[data-modal='false'] .panel {
      pointer-events: auto;
    }

    .panel[data-direction='rtl'],
    .panel[data-direction='ltr'] {
      height: 100%;
    }

    .panel[data-direction='ttb'],
    .panel[data-direction='btt'] {
      width: 100%;
    }

    .panel[data-direction='rtl'] {
      transform: translateX(100%);
    }

    .panel[data-direction='ltr'] {
      transform: translateX(-100%);
    }

    .panel[data-direction='ttb'] {
      transform: translateY(-100%);
    }

    .panel[data-direction='btt'] {
      transform: translateY(100%);
    }

    .overlay[data-phase='opening'] .panel,
    .overlay[data-phase='open'] .panel {
      transform: translate3d(0, 0, 0);
    }

    .header {
      padding: var(--space-inline) var(--space-stack);
      display: flex;
      align-items: center;
      gap: var(--space-block);
      border-bottom: 1px solid #f0f0f0;
    }

    .header-content {
      flex: 1;
      min-width: 0;
    }

    .title {
      font-weight: 600;
      font-size: 16px;
      line-height: 22px;
      color: rgba(0, 0, 0, 0.88);
    }

    .close {
      border: 0;
      background: transparent;
      cursor: pointer;
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      color: rgba(0, 0, 0, 0.45);
      flex: 0 0 auto;
    }

    .close:hover {
      background: rgba(0, 0, 0, 0.04);
      color: rgba(0, 0, 0, 0.75);
    }

    .body {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: var(--space-inline) var(--space-stack);
    }

    .footer {
      padding: var(--space-sm) var(--space-stack) var(--space-inline);
      border-top: 1px solid #f0f0f0;
    }
  `;

  @property({ type: Boolean }) open?: boolean;
  @property({ type: Boolean, attribute: 'default-open' }) defaultOpen = false;

  @property({ type: Boolean, attribute: 'append-to-body' }) appendToBody = false;
  /**
   * Reserved for Element Plus API parity. The drawer uses a fixed overlay,
   * so it already escapes normal layout clipping in most cases.
   */
  @property({ attribute: 'append-to' }) appendTo: string | HTMLElement | null = null;

  @property({ type: Boolean, attribute: 'lock-scroll' }) lockScroll = true;
  @property({ attribute: false }) beforeClose?: DrawerBeforeCloseHandler;
  @property({ type: Boolean, attribute: 'close-on-click-modal' }) closeOnClickModal = true;
  @property({ type: Boolean, attribute: 'close-on-press-escape' }) closeOnPressEscape = true;
  @property({ type: Number, attribute: 'open-delay' }) openDelay = 0;
  @property({ type: Number, attribute: 'close-delay' }) closeDelay = 0;
  @property({ type: Boolean, attribute: 'destroy-on-close' }) destroyOnClose = false;
  @property({ type: Boolean }) modal = true;
  @property({ type: String }) direction: DrawerDirection = 'rtl';
  @property({ type: Boolean, attribute: 'show-close' }) showClose = true;
  @property() size: number | string = '30%';
  @property({ type: String }) title = '';
  @property({ type: Boolean, attribute: 'with-header' }) withHeader = true;
  @property({ type: Number, attribute: 'z-index' }) zIndex = Z_INDEX.MODAL;

  @state() private _mounted = false;
  @state() private _phase: DrawerPhase = 'closed';
  @state() private _hasFooterSlot = false;
  @state() private _internalOpen = false;

  private readonly _titleId = `ui-drawer-title-${Math.random().toString(36).slice(2, 9)}`;

  private _globalBound = false;
  private _scrollLocked = false;
  private _prevResolvedOpen = false;
  private _delayTimer: ReturnType<typeof setTimeout> | null = null;
  private _transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingTransitionDetail: DrawerLifecycleDetail | null = null;
  private _lastActiveElement: HTMLElement | null = null;
  private readonly _triggers = new OverlayTriggerController(this);

  connectedCallback() {
    super.connectedCallback();
    if (!this._isControlled()) {
      this._internalOpen = this.defaultOpen;
    }
    this._prevResolvedOpen = false;
    if (this._isOpen()) {
      this._pendingTransitionDetail = { reason: 'programmatic' };
    }
  }

  disconnectedCallback() {
    this._clearTimers();
    this._unbindGlobal();
    this._unlockScroll();
    super.disconnectedCallback();
  }

  protected updated(changed: PropertyValues) {
    if (changed.has('zIndex')) {
      this.style.setProperty('--drawer-z', String(this.zIndex));
    }

    const isOpen = this._isOpen();
    if (isOpen !== this._prevResolvedOpen) {
      if (!this._pendingTransitionDetail) {
        this._pendingTransitionDetail = { reason: 'programmatic' };
      }
      this._scheduleResolvedState(isOpen);
    }

    this._prevResolvedOpen = isOpen;
  }

  render() {
    if (!this._mounted) return nothing;

    const sizeValue = this._sizeValue();
    const isVertical = this.direction === 'rtl' || this.direction === 'ltr';
    const panelStyle = isVertical ? `width: ${sizeValue};` : `height: ${sizeValue};`;

    return html`
      <div
        class="overlay"
        data-phase=${this._phase}
        data-direction=${this.direction}
        data-modal=${String(this.modal)}
        style=${`--drawer-z: ${this.zIndex};`}
        @click=${this._onOverlayClick}
      >
        <div
          class="panel"
          data-direction=${this.direction}
          role="dialog"
          aria-modal=${this.modal ? 'true' : 'false'}
          aria-labelledby=${this.withHeader && this.title ? this._titleId : nothing}
          aria-label=${this.withHeader && this.title ? nothing : this.title || msg('抽屉')}
          tabindex="-1"
          style=${panelStyle}
          @click=${(event: Event) => event.stopPropagation()}
        >
          ${this.withHeader
            ? html`
                <div class="header">
                  <div class="header-content">
                    <slot name="header">
                      ${this.title
                        ? html`<div class="title" id=${this._titleId}>${this.title}</div>`
                        : nothing}
                    </slot>
                  </div>
                  ${this.showClose
                    ? html`
                        <button
                          class="close"
                          aria-label=${msg('关闭')}
                          @click=${() => this._requestClose('close')}
                        >
                          ✕
                        </button>
                      `
                    : nothing}
                </div>
              `
            : nothing}
          <div class="body"><slot></slot></div>
          <div class="footer" ?hidden=${!this._hasFooterSlot}>
            <slot name="footer" @slotchange=${this._onFooterSlotChange}></slot>
          </div>
        </div>
      </div>
    `;
  }

  handleClose() {
    this._requestClose('method');
  }

  private _isControlled() {
    return isControlledOpen(this.open);
  }

  private _isOpen() {
    if (isControlledOpen(this.open)) return this.open!;
    return this._internalOpen;
  }

  private _sizeValue() {
    return typeof this.size === 'number' ? `${this.size}px` : String(this.size || '30%');
  }

  private _assignOpen(next: boolean) {
    if (!this._isControlled()) {
      this._internalOpen = next;
    }
  }

  private _dispatch(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _dispatchCancelable(name: string, detail: unknown) {
    const event = new CustomEvent(name, {
      detail,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    this.dispatchEvent(event);
    return event;
  }

  private _emitOpenChange(next: boolean, detail: DrawerLifecycleDetail) {
    const eventDetail: DrawerOpenChangeDetail = next
      ? { open: true, reason: detail.reason }
      : { open: false, reason: detail.reason };
    this._dispatch('open-change', eventDetail);
    this._dispatch('update:open', eventDetail);
  }

  private _scheduleResolvedState(next: boolean) {
    this._clearDelayTimer();
    const detail = this._pendingTransitionDetail ?? { reason: 'programmatic' };
    this._pendingTransitionDetail = null;
    const delay = next ? this.openDelay : this.closeDelay;

    if (delay > 0) {
      this._delayTimer = setTimeout(() => {
        this._delayTimer = null;
        if (next) {
          this._beginOpen(detail);
        } else {
          this._beginClose(detail);
        }
      }, delay);
      return;
    }

    if (next) {
      this._beginOpen(detail);
    } else {
      this._beginClose(detail);
    }
  }

  private _clearDelayTimer() {
    if (!this._delayTimer) return;
    clearTimeout(this._delayTimer);
    this._delayTimer = null;
  }

  private _clearTransitionTimer() {
    if (!this._transitionTimer) return;
    clearTimeout(this._transitionTimer);
    this._transitionTimer = null;
  }

  private _clearTimers() {
    this._clearDelayTimer();
    this._clearTransitionTimer();
  }

  private _bindGlobal() {
    if (this._globalBound) return;
    this._triggers.bindGlobal({
      onEsc: (event) => this._onKeyDown(event),
    });
    this._globalBound = true;
  }

  private _unbindGlobal() {
    if (!this._globalBound) return;
    this._triggers.unbindGlobal();
    this._globalBound = false;
  }

  private _lockScroll() {
    if (!this.lockScroll || this._scrollLocked === true) return;
    acquireBodyScrollLock();
    this._scrollLocked = true;
  }

  private _unlockScroll() {
    if (!this._scrollLocked) return;
    releaseBodyScrollLock();
    this._scrollLocked = false;
  }

  private _beginOpen(detail: DrawerLifecycleDetail) {
    this._clearTransitionTimer();
    this._lastActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    this._mounted = true;
    this._phase = 'closed';
    this._bindGlobal();
    this._lockScroll();
    this._dispatch('open', detail);

    void this.updateComplete.then(() => {
      requestAnimationFrame(() => {
        if (!this._isOpen()) return;

        this._phase = 'opening';
        this._focusPanel();
        this._dispatch('open-auto-focus', detail);
        this._transitionTimer = setTimeout(() => {
          this._transitionTimer = null;
          if (!this._isOpen()) return;
          this._phase = 'open';
          this._dispatch('opened', detail);
        }, DRAWER_ANIMATION_MS);
      });
    });
  }

  private _beginClose(detail: DrawerLifecycleDetail) {
    this._clearTransitionTimer();
    this._unbindGlobal();
    this._unlockScroll();

    if (!this._mounted) {
      this._dispatch('closed', detail);
      return;
    }

    this._phase = 'closing';
    this._dispatch('close', detail);
    this._restoreFocus();
    this._dispatch('close-auto-focus', detail);
    this._transitionTimer = setTimeout(() => {
      this._transitionTimer = null;
      if (this._isOpen()) return;

      this._phase = 'closed';
      if (this.destroyOnClose) {
        this._mounted = false;
      }
      this._dispatch('closed', detail);
    }, DRAWER_ANIMATION_MS);
  }

  private _requestClose(reason: DrawerCloseReason) {
    if (!this._isOpen()) return;

    const detail: DrawerBeforeCloseDetail = { reason };
    const beforeCloseEvent = this._dispatchCancelable('beforeClose', detail);
    if (beforeCloseEvent.defaultPrevented) return;

    if (typeof this.beforeClose === 'function') {
      let doneCalled = false;
      this.beforeClose(() => {
        if (doneCalled) return;
        doneCalled = true;
        this._commitClose(detail);
      }, detail);
      return;
    }

    this._commitClose(detail);
  }

  private _commitClose(detail: DrawerBeforeCloseDetail) {
    this._pendingTransitionDetail = detail;
    this._assignOpen(false);
    this._emitOpenChange(false, detail);
  }

  private _focusPanel() {
    const panel = this.shadowRoot?.querySelector<HTMLElement>('.panel');
    panel?.focus();
  }

  private _restoreFocus() {
    if (!this._lastActiveElement) return;
    if (!document.contains(this._lastActiveElement)) return;
    this._lastActiveElement.focus();
    this._lastActiveElement = null;
  }

  private _onKeyDown(event: KeyboardEvent) {
    if (!this._isOpen()) return;
    if (!this.closeOnPressEscape) return;
    if (event.key !== 'Escape') return;

    event.preventDefault();
    this._requestClose('keyboard');
  }

  private _onOverlayClick(event: MouseEvent) {
    if (!this.modal) return;
    if (!this.closeOnClickModal) return;
    if (event.target !== event.currentTarget) return;
    this._requestClose('mask');
  }

  private _onFooterSlotChange(event: Event) {
    this._hasFooterSlot = hasAssignedContent(event.target as HTMLSlotElement);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-drawer': UiDrawer;
  }
}

export interface UiDrawerEventMap {
  'open-change': CustomEvent<DrawerOpenChangeDetail>;
  'update:open': CustomEvent<DrawerOpenChangeDetail>;
  open: CustomEvent<DrawerLifecycleDetail>;
  opened: CustomEvent<DrawerLifecycleDetail>;
  close: CustomEvent<DrawerLifecycleDetail>;
  closed: CustomEvent<DrawerLifecycleDetail>;
  'open-auto-focus': CustomEvent<DrawerLifecycleDetail>;
  'close-auto-focus': CustomEvent<DrawerLifecycleDetail>;
  beforeClose: CustomEvent<DrawerBeforeCloseDetail>;
}
