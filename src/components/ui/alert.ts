import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

export type AlertType = 'primary' | 'success' | 'info' | 'warning' | 'error';
export type AlertEffect = 'light' | 'dark';

const TYPE_ICONS: Record<AlertType, string> = {
  primary: '●',
  success: '✓',
  info: 'ℹ',
  warning: '!',
  error: '✕',
};

@customElement('ui-alert')
export class UiAlert extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    :host([hidden]) {
      display: none;
    }

    .alert {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 16px;
      border: 1px solid transparent;
      border-radius: var(--radius-md, 4px);
      font-size: 14px;
      line-height: 1.5;
      box-sizing: border-box;
    }

    .alert.center {
      justify-content: center;
      text-align: center;
    }

    .alert.center .content {
      flex: 0 1 auto;
    }

    .icon-wrap {
      flex-shrink: 0;
      width: 16px;
      height: 22px;
      display: grid;
      place-items: center;
    }

    .icon-wrap[hidden] {
      display: none;
    }

    .icon {
      font-size: 14px;
      font-weight: 600;
      line-height: 1;
    }

    .content {
      flex: 1;
      min-width: 0;
      word-break: break-word;
    }

    .title {
      font-size: 14px;
      font-weight: 500;
      line-height: 1.5;
    }

    .title[hidden] {
      display: none;
    }

    .title:not([hidden]):not(:last-child) {
      margin-bottom: 4px;
    }

    .description {
      font-size: 13px;
      line-height: 1.5;
    }

    .description[hidden] {
      display: none;
    }

    .close {
      flex-shrink: 0;
      border: 0;
      background: transparent;
      cursor: pointer;
      padding: 0;
      margin-left: 4px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      font-size: 12px;
      line-height: 1;
      opacity: 0.65;
      transition: opacity 0.15s ease;
    }

    .close:hover {
      opacity: 1;
    }

    .close-icon {
      width: 16px;
      height: 16px;
      display: grid;
      place-items: center;
      font-size: 14px;
    }

    /* light effect */
    .alert.light.primary {
      background: #ecf5ff;
      border-color: #b3d8ff;
      color: #409eff;
    }
    .alert.light.primary .title,
    .alert.light.primary .description {
      color: #409eff;
    }
    .alert.light.primary .icon {
      color: #409eff;
    }
    .alert.light.primary .close {
      color: #409eff;
    }

    .alert.light.success {
      background: #f0f9eb;
      border-color: #e1f3d8;
      color: #67c23a;
    }
    .alert.light.success .title,
    .alert.light.success .description {
      color: #67c23a;
    }
    .alert.light.success .icon {
      color: #67c23a;
    }
    .alert.light.success .close {
      color: #67c23a;
    }

    .alert.light.info {
      background: #f4f4f5;
      border-color: #e9e9eb;
      color: #909399;
    }
    .alert.light.info .title,
    .alert.light.info .description {
      color: #909399;
    }
    .alert.light.info .icon {
      color: #909399;
    }
    .alert.light.info .close {
      color: #909399;
    }

    .alert.light.warning {
      background: #fdf6ec;
      border-color: #faecd8;
      color: #e6a23c;
    }
    .alert.light.warning .title,
    .alert.light.warning .description {
      color: #e6a23c;
    }
    .alert.light.warning .icon {
      color: #e6a23c;
    }
    .alert.light.warning .close {
      color: #e6a23c;
    }

    .alert.light.error {
      background: #fef0f0;
      border-color: #fde2e2;
      color: #f56c6c;
    }
    .alert.light.error .title,
    .alert.light.error .description {
      color: #f56c6c;
    }
    .alert.light.error .icon {
      color: #f56c6c;
    }
    .alert.light.error .close {
      color: #f56c6c;
    }

    /* dark effect */
    .alert.dark.primary {
      background: #409eff;
      border-color: #409eff;
      color: #fff;
    }
    .alert.dark.success {
      background: #67c23a;
      border-color: #67c23a;
      color: #fff;
    }
    .alert.dark.info {
      background: #909399;
      border-color: #909399;
      color: #fff;
    }
    .alert.dark.warning {
      background: #e6a23c;
      border-color: #e6a23c;
      color: #fff;
    }
    .alert.dark.error {
      background: #f56c6c;
      border-color: #f56c6c;
      color: #fff;
    }

    .alert.dark .title,
    .alert.dark .description,
    .alert.dark .icon,
    .alert.dark .close {
      color: #fff;
    }
  `;

  /** Alert 标题 */
  @property({ type: String })
  title = '';

  /** Alert 类型 */
  @property({ type: String })
  type: AlertType = 'info';

  /** 描述性文本 */
  @property({ type: String })
  description = '';

  /** 受控显隐；未传时为非受控 */
  @property({ type: Boolean }) open?: boolean;
  @property({ type: Boolean, attribute: 'default-open' }) defaultOpen = true;

  /** 是否可以关闭 */
  @property({ type: Boolean })
  closable = true;

  /** 文字是否居中 */
  @property({ type: Boolean })
  center = false;

  /** 自定义关闭按钮文本 */
  @property({ type: String, attribute: 'close-text' })
  closeText = '';

  /** 是否显示类型图标 */
  @property({ type: Boolean, attribute: 'show-icon' })
  showIcon = false;

  /** 主题样式 */
  @property({ type: String })
  effect: AlertEffect = 'light';

  @state()
  private _internalOpen = true;

  @state()
  private _hasTitleSlot = false;

  @state()
  private _hasDefaultSlot = false;

  connectedCallback(): void {
    super.connectedCallback();
    if (typeof this.open !== 'boolean') {
      this._internalOpen = this.defaultOpen;
    }
  }

  private _isOpen(): boolean {
    return typeof this.open === 'boolean' ? this.open : this._internalOpen;
  }

  render() {
    if (!this._isOpen()) {
      return nothing;
    }

    const showTitle = Boolean(this.title) || this._hasTitleSlot;
    const showDescription = Boolean(this.description) || this._hasDefaultSlot;

    return html`
      <div
        class=${classMap({
          alert: true,
          [this.effect]: true,
          [this.type]: true,
          center: this.center,
        })}
        role="alert"
      >
        <div class="icon-wrap" ?hidden=${!this.showIcon} aria-hidden="true">
          <span class="icon">
            <slot name="icon">${TYPE_ICONS[this.type]}</slot>
          </span>
        </div>

        <div class="content">
          <div class="title" ?hidden=${!showTitle}>
            <slot name="title" @slotchange=${this._onTitleSlotChange}>${this.title}</slot>
          </div>
          <div class="description" ?hidden=${!showDescription}>
            <slot @slotchange=${this._onDefaultSlotChange}>${this.description}</slot>
          </div>
        </div>

        ${this.closable
          ? html`
              <button class="close" type="button" aria-label="Close" @click=${this._handleClose}>
                ${this.closeText
                  ? html`<span class="close-text">${this.closeText}</span>`
                  : html`<span class="close-icon">✕</span>`}
              </button>
            `
          : nothing}
      </div>
    `;
  }

  private _hasSlotContent(slot: HTMLSlotElement): boolean {
    return slot.assignedNodes({ flatten: true }).some((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return Boolean(node.textContent?.trim());
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        return (node as HTMLElement).tagName !== 'STYLE';
      }
      return false;
    });
  }

  private _onTitleSlotChange = (event: Event) => {
    this._hasTitleSlot = this._hasSlotContent(event.target as HTMLSlotElement);
  };

  private _onDefaultSlotChange = (event: Event) => {
    this._hasDefaultSlot = this._hasSlotContent(event.target as HTMLSlotElement);
  };

  override firstUpdated(): void {
    const root = this.shadowRoot;
    if (!root) return;

    const titleSlot = root.querySelector('slot[name="title"]');
    const defaultSlot = root.querySelector('slot:not([name])');
    if (titleSlot) {
      this._hasTitleSlot = this._hasSlotContent(titleSlot as HTMLSlotElement);
    }
    if (defaultSlot) {
      this._hasDefaultSlot = this._hasSlotContent(defaultSlot as HTMLSlotElement);
    }
  }

  private _handleClose = () => {
    if (typeof this.open !== 'boolean') {
      this._internalOpen = false;
    }
    this.hidden = true;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    this.dispatchEvent(
      new CustomEvent('open-change', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );
    this.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-alert': UiAlert;
  }
}

export interface UiAlertEventMap {
  close: CustomEvent<void>;
  'open-change': CustomEvent<{ open: boolean }>;
  'update:open': CustomEvent<{ open: boolean }>;
}
