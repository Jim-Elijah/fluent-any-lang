import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { isControlledOpen } from './internal/controlled-state.js';
import { OverlayTriggerController } from './internal/overlay-triggers.js';
import { Z_INDEX } from './internal/z-index.js';

@customElement('ui-modal')
export class UiModal extends LitElement {
  static styles = css`
    :host {
      position: static;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: flex;
      justify-content: center;
      align-items: flex-start;
      overflow: auto;
      padding: 56px 16px;
      pointer-events: auto;
      z-index: var(--modal-z, 1050);
    }

    .overlay.centered {
      align-items: center;
      padding: 16px;
    }

    .dialog {
      position: relative;
      width: var(--modal-width, 520px);
      max-width: calc(100vw - 32px);
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      transform: translateY(-6px);
      opacity: 0;
      transition:
        opacity 0.18s ease,
        transform 0.18s ease;
    }

    .overlay[data-open='true'] .dialog {
      transform: translateY(0);
      opacity: 1;
    }

    .header {
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid #f0f0f0;
    }

    .title {
      flex: 1;
      font-weight: 600;
      font-size: 16px;
      line-height: 22px;
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
    }

    .close:hover {
      background: rgba(0, 0, 0, 0.04);
      color: rgba(0, 0, 0, 0.75);
    }

    .body {
      padding: 16px 24px;
    }

    .footer {
      padding: 10px 24px 16px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      border-top: 1px solid #f0f0f0;
    }

    .btn {
      height: 32px;
      padding: 0 15px;
      border-radius: 6px;
      border: 1px solid transparent;
      cursor: pointer;
      font-size: 14px;
      line-height: 30px;
    }

    .btn.primary {
      background: #1677ff;
      color: #fff;
    }

    .btn.primary:hover {
      background: #0f6fe8;
    }

    .btn.primary:disabled {
      background: #8ab9ff;
      cursor: not-allowed;
    }

    .btn.ghost {
      background: transparent;
      border-color: #d9d9d9;
      color: rgba(0, 0, 0, 0.88);
    }

    .btn.ghost:hover {
      border-color: #bfbfbf;
    }

    .btn.ghost:disabled {
      color: rgba(0, 0, 0, 0.25);
      border-color: #d9d9d9;
      cursor: not-allowed;
    }

    .spin {
      display: inline-block;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.45);
      border-top-color: rgba(255, 255, 255, 1);
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

  @property({ type: Boolean }) open?: boolean;
  @property({ type: Boolean, attribute: 'default-open' }) defaultOpen = false;
  @property({ attribute: 'ok-text' }) okText = 'OK';
  @property({ attribute: 'cancel-text' }) cancelText = 'Cancel';

  @property({ type: String }) title: string = '';
  @property({ type: Boolean }) centered = false;
  @property({ type: Boolean }) mask = true;
  @property({ type: Boolean, attribute: 'mask-closable' }) maskClosable = true;
  @property({ type: Boolean }) keyboard = true;
  @property({ type: Boolean }) closable = true;
  @property({ type: Boolean, attribute: 'destroy-on-close' }) destroyOnClose = false;

  @property() width: number | string = 520;
  @property({ type: Number, attribute: 'z-index' }) zIndex = Z_INDEX.MODAL;

  /** Like antd getPopupContainer; reserved for future use. */
  @property() popupContainer: string | HTMLElement | null = 'body';

  @property({ attribute: 'confirm-loading', type: Boolean }) confirmLoading = false;

  @property({ attribute: 'ok-disabled', type: Boolean }) okButtonPropsDisabled = false;
  @property({ attribute: 'cancel-disabled', type: Boolean }) cancelButtonPropsDisabled = false;

  @property({ type: Boolean }) footer = true;

  @state() private _rendered = false;
  @state() private _internalOpen = false;

  private _triggers = new OverlayTriggerController(this);
  private _globalBound = false;
  private _prevIsOpen = false;

  private _dispatchCancelable(name: string, detail: object) {
    const evt = new CustomEvent(name, { detail, bubbles: true, composed: true, cancelable: true });
    this.dispatchEvent(evt);
    return evt;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!isControlledOpen(this.open)) {
      this._internalOpen = this.defaultOpen;
    }
  }

  disconnectedCallback() {
    if (this._globalBound) {
      this._unbindGlobal();
      this._globalBound = false;
    }
    super.disconnectedCallback();
  }

  protected updated(changed: PropertyValues) {
    const isOpen = this._isOpen();
    const wasOpen = this._prevIsOpen;

    if (isOpen && !this._rendered) {
      this._rendered = true;
    }

    if (isOpen !== wasOpen) {
      this._onOpenStateChanged(isOpen);
    }

    if (changed.has('zIndex') || changed.has('_rendered')) {
      this.style.setProperty('--modal-z', String(this.zIndex));
    }

    this._prevIsOpen = isOpen;
  }

  private _isOpen() {
    return isControlledOpen(this.open) ? this.open! : this._internalOpen;
  }

  private _assignOpen(next: boolean) {
    if (!isControlledOpen(this.open)) {
      this._internalOpen = next;
    }
  }

  private _bindGlobal() {
    this._triggers.bindGlobal({
      onEsc: (e) => this._onKeyDown(e),
    });
  }

  private _unbindGlobal() {
    this._triggers.unbindGlobal();
  }

  private _onKeyDown(e: KeyboardEvent) {
    if (!this._isOpen()) return;
    if (!this.keyboard) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this._handleCancel({ type: 'keyboard' });
    }
  }

  private _handleClose(reason: 'mask' | 'close' | 'keyboard' | 'cancel' | 'ok', extra?: object) {
    if (!this._isOpen()) return;

    const detail = { reason, ...extra };
    const beforeEvt = this._dispatchCancelable('beforeClose', detail);
    if (beforeEvt.defaultPrevented) return;

    if (reason === 'ok') {
      this.dispatchEvent(new CustomEvent('ok', { detail, bubbles: true, composed: true }));
    } else if (
      reason === 'cancel' ||
      reason === 'mask' ||
      reason === 'keyboard' ||
      reason === 'close'
    ) {
      this.dispatchEvent(new CustomEvent('cancel', { detail, bubbles: true, composed: true }));
    }

    this._assignOpen(false);
    this.dispatchEvent(
      new CustomEvent('open-change', {
        detail: { open: false, ...detail },
        bubbles: true,
        composed: true,
      }),
    );
    this.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false, ...detail },
        bubbles: true,
        composed: true,
      }),
    );
    this.dispatchEvent(new CustomEvent('close', { detail, bubbles: true, composed: true }));
  }

  private _handleCancel(extra?: unknown) {
    this._handleClose('cancel', extra ?? {});
  }

  private _handleOk() {
    const isOkDisabled = this.confirmLoading || this.okButtonPropsDisabled;
    if (isOkDisabled) return;

    const detail = { reason: 'ok' };
    const beforeEvt = this._dispatchCancelable('beforeOk', { ...detail });
    if (beforeEvt.defaultPrevented) return;

    this.dispatchEvent(new CustomEvent('ok', { detail, bubbles: true, composed: true }));
    this._handleClose('ok', {});
  }

  private _afterClose() {
    this.dispatchEvent(new CustomEvent('afterClose', { bubbles: true, composed: true }));
  }

  private _onMaskClick() {
    if (!this.mask) return;
    if (!this.maskClosable) return;
    this._handleClose('mask', {});
  }

  private _onClickCloseX() {
    if (!this.closable) return;
    this._handleClose('close', {});
  }

  private _onOpenStateChanged(isOpen: boolean) {
    if (isOpen) {
      if (!this._globalBound) {
        this._bindGlobal();
        this._globalBound = true;
      }
      return;
    }

    if (this._globalBound) {
      this._unbindGlobal();
      this._globalBound = false;
    }

    if (this.destroyOnClose) {
      requestAnimationFrame(() => this._afterClose());
      this._rendered = false;
    }
  }

  render() {
    if (!this._rendered || !this._isOpen()) return nothing;

    const overlayClasses = ['overlay'];
    if (this.centered) overlayClasses.push('centered');

    const widthValue = typeof this.width === 'number' ? `${this.width}px` : String(this.width);

    return html`
      <div
        class=${overlayClasses.join(' ')}
        data-open="true"
        style=${`--modal-z: ${this.zIndex}; --modal-width: ${widthValue};`}
        @click=${(e: MouseEvent) => {
          if (e.target === e.currentTarget) this._onMaskClick();
        }}
      >
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          style=${`width: ${widthValue};`}
          @click=${(e: Event) => e.stopPropagation()}
        >
          <div class="header">
            <div class="title">${this.title ? html`${this.title}` : nothing}</div>
            ${this.closable
              ? html`<button class="close" aria-label="Close" @click=${() => this._onClickCloseX()}>
                  ✕
                </button>`
              : nothing}
          </div>

          <div class="body"><slot></slot></div>

          ${this.footer
            ? html`
                <div class="footer">
                  <button
                    class="btn ghost"
                    ?disabled=${this.cancelButtonPropsDisabled}
                    @click=${() => this._handleCancel({ type: 'cancel' })}
                  >
                    ${this.cancelText}
                  </button>
                  <button
                    class="btn primary"
                    @click=${() => this._handleOk()}
                    ?disabled=${this.confirmLoading || this.okButtonPropsDisabled}
                  >
                    ${this.confirmLoading
                      ? html`<span class="spin"></span>${this.okText}`
                      : this.okText}
                  </button>
                </div>
              `
            : html`<div class="footer"><slot name="footer"></slot></div>`}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-modal': UiModal;
  }
}

export interface UiModalEventMap {
  ok: CustomEvent<{ reason: string }>;
  cancel: CustomEvent<{ reason: string }>;
  close: CustomEvent<{ reason: string }>;
  beforeClose: CustomEvent<{ reason: string }>;
  beforeOk: CustomEvent<{ reason: string }>;
  afterClose: CustomEvent<void>;
  'open-change': CustomEvent<{ open: boolean; reason?: string }>;
  'update:open': CustomEvent<{ open: boolean; reason?: string }>;
}

/** Shadow root mount for ui-modal (used in tests). */
export function getModalPortalRoot(): ShadowRoot | null {
  return document.querySelector('ui-modal')?.shadowRoot ?? null;
}
