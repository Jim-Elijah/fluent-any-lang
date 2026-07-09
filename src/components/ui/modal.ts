import { css, CSSResultGroup, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

// type ModalProps = {
//   open?: boolean; // antd: open / visible
//   visible?: boolean; // antd: visible (兼容)
//   title?: string | TemplateStringsArray | unknown;
//   okText?: string;
//   cancelText?: string;

//   width?: number | string;
//   centered?: boolean;
//   mask?: boolean;
//   maskClosable?: boolean;
//   keyboard?: boolean; // Esc

//   closable?: boolean; // antd
//   destroyOnClose?: boolean;
//   confirmLoading?: boolean;
//   okButtonPropsDisabled?: boolean; // 简化：是否禁用 OK
//   cancelButtonPropsDisabled?: boolean; // 简化：是否禁用 Cancel

//   zIndex?: number;
//   footer?: boolean | unknown; // antd allow custom footer; 这里简化为 true/false/slot
// };

@customElement('ui-modal')
export class UiModal extends LitElement {
  static styles: CSSResultGroup = [
    css`
      :host {
        position: relative;
        z-index: var(--modal-z, 1000);
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

      /* 简化的“淡入淡出” */
      .dialog {
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
    `,
  ];

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
  @property() zIndex = 1000;

  @property({ attribute: 'confirm-loading', type: Boolean }) confirmLoading = false;

  // 简化两个“disabled”控制（更完整的写法可引入 okButton/cancelButton props）
  @property({ attribute: 'ok-disabled', type: Boolean }) okButtonPropsDisabled = false;
  @property({ attribute: 'cancel-disabled', type: Boolean }) cancelButtonPropsDisabled = false;

  // footer：true/false 或者允许使用 slot[name="footer"] 自定义
  @property({ type: Boolean }) footer = true;

  @state() private _rendered = false; // 控制是否渲染
  @state() private _internalOpen = false;
  private _escHandler = (e: KeyboardEvent) => this._onKeyDown(e);

  // antd 事件语义：beforeClose 可阻止关闭；通过 dispatchEvent 返回值不适合，
  // 这里采用：事件携带 detail，并提供 cancelable 事件；如果 preventDefault，则不关闭。
  private _dispatchCancelable(name: string, detail: object) {
    const evt = new CustomEvent(name, { detail, bubbles: true, composed: true, cancelable: true });
    this.dispatchEvent(evt);
    return evt;
  }

  connectedCallback() {
    super.connectedCallback();
    if (typeof this.open !== 'boolean') {
      this._internalOpen = this.defaultOpen;
    }
  }

  protected firstUpdated() {
    // 初始渲染不需要
  }

  protected updated() {
    const wantOpen = this._isOpen();
    if (wantOpen && !this._rendered) {
      this._rendered = true;
      this._bindGlobal();
    }

    if (!wantOpen && this._rendered) {
      // 关闭流程：这里先解绑 Escape，再决定是否 destroy
      this._unbindGlobal();
      if (this.destroyOnClose) {
        // 立即销毁
        const afterClose = () => this._afterClose();
        // 给一个微任务/帧让 UI 更新（可加动画）
        requestAnimationFrame(afterClose);
        this._rendered = false;
      } else {
        // 不 destroy：但 overlay 不显示（用 open 控制）
        // 仍然保持渲染一小会会更合理；这里直接通过 open=false 让 overlay 不显示
        // 为了避免残留 esc 监听，这里已经解绑。
      }
    }

    // zIndex/width CSS var 更新
    const root = this.style;
    root.setProperty('--modal-z', String(this.zIndex ?? 1000));
    root.setProperty(
      '--modal-width',
      typeof this.width === 'number' ? `${this.width}px` : String(this.width),
    );
  }

  disconnectedCallback() {
    this._unbindGlobal();
    super.disconnectedCallback();
  }

  private _isOpen() {
    return typeof this.open === 'boolean' ? this.open : this._internalOpen;
  }

  private _assignOpen(next: boolean) {
    if (typeof this.open !== 'boolean') {
      this._internalOpen = next;
    }
  }

  private _bindGlobal() {
    window.addEventListener('keydown', this._escHandler, { capture: true });
  }

  private _unbindGlobal() {
    window.removeEventListener('keydown', this._escHandler, { capture: true });
  }

  private _onKeyDown(e: KeyboardEvent) {
    const isOpen = this._isOpen();
    if (!isOpen) return;

    if (!this.keyboard) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this._handleCancel({ type: 'keyboard' });
    }
  }

  private _handleClose(reason: 'mask' | 'close' | 'keyboard' | 'cancel' | 'ok', extra?: object) {
    const isOpen = this._isOpen();
    if (!isOpen) return;

    const detail = { reason, ...extra };
    // beforeClose：可阻止
    const beforeEvt = this._dispatchCancelable('beforeClose', detail);
    if (beforeEvt.defaultPrevented) return;

    // 触发 close/cancel/ok：按 reason
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

    // 关闭：受控时由父组件更新 open；非受控写内部状态
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
    // OK 时 beforeClose 语义上通常是 beforeClose + ok 相关，这里复用 beforeClose，detail 里标明 ok
    const isOkDisabled = this.confirmLoading || this.okButtonPropsDisabled;
    if (isOkDisabled) return;

    const detail = { reason: 'ok' };
    const beforeEvt = this._dispatchCancelable('beforeOk', { ...detail });
    if (beforeEvt.defaultPrevented) return;

    this.dispatchEvent(new CustomEvent('ok', { detail, bubbles: true, composed: true }));

    // antd 的 confirm 一般也会触发 beforeClose/close（视实现）
    // 这里：默认关闭
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

  render() {
    if (!this._rendered) return nothing;

    const isOpen = this._isOpen();
    if (!isOpen && !this.destroyOnClose) {
      // 不 destroy 时：overlay 隐藏（避免遮罩残留）
      return nothing;
    }

    const overlayClasses = ['overlay'];
    if (this.centered) overlayClasses.push('centered');

    return html`
      <div
        class=${overlayClasses.join(' ')}
        style="z-index:${this.zIndex};"
        data-open="${isOpen ? 'true' : 'false'}"
        @click=${(e: MouseEvent) => {
          // 点击 overlay 才触发遮罩逻辑，避免点到 dialog 内部
          if (e.target === e.currentTarget) this._onMaskClick();
        }}
      >
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          style=${`width: ${typeof this.width === 'number' ? `${this.width}px` : String(this.width)};`}
          @click=${(e: Event) => e.stopPropagation()}
        >
          <div class="header">
            <div class="title">${this.title ? html`${this.title}` : nothing}</div>
            ${this.closable
              ? html`<button class="close" aria-label="Close" @click=${this._onClickCloseX}>
                  ✕
                </button>`
              : nothing}
          </div>

          <div class="body">
            <slot></slot>
          </div>

          ${this.footer
            ? html`
                <div class="footer">
                  <!-- Cancel -->
                  <button
                    class="btn ghost"
                    ?disabled=${this.cancelButtonPropsDisabled}
                    @click=${() => this._handleCancel({ type: 'cancel' })}
                  >
                    ${this.cancelText}
                  </button>

                  <!-- OK -->
                  <button
                    class="btn primary"
                    @click=${this._handleOk}
                    ?disabled=${this.confirmLoading || this.okButtonPropsDisabled}
                  >
                    ${this.confirmLoading
                      ? html`<span class="spin"></span>${this.okText}`
                      : this.okText}
                  </button>
                </div>
              `
            : html`<slot name="footer"></slot>`}

          <!-- 使用自定义footer slot -->
          <!-- <div class="footer">
            <ui-button>关闭</ui-button>
          </div> -->
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
