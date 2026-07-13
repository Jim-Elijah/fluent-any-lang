import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { Z_INDEX } from './internal/z-index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageType = 'primary' | 'success' | 'info' | 'warning' | 'error';

export type MessageOptions = {
  message?: string;
  type?: MessageType;
  plain?: boolean;
  duration?: number;
  showClose?: boolean;
  grouping?: boolean;
  repeatNum?: number;
  offset?: number;
  appendTo?: string | HTMLElement;
  zIndex?: number;
  customClass?: string;
  icon?: string;
  id?: string;
  onClose?: () => void;
};

export type MessageConfig = {
  max?: number;
  duration?: number;
  offset?: number;
  showClose?: boolean;
  plain?: boolean;
  grouping?: boolean;
  zIndex?: number;
};

export type MessageInstance = {
  close: () => void;
};

type ResolvedMessageOptions = Required<
  Pick<
    MessageOptions,
    | 'message'
    | 'type'
    | 'plain'
    | 'duration'
    | 'showClose'
    | 'grouping'
    | 'repeatNum'
    | 'offset'
    | 'zIndex'
    | 'customClass'
  >
> &
  Pick<MessageOptions, 'icon' | 'onClose' | 'appendTo'> & {
    id: string;
  };

// ---------------------------------------------------------------------------
// Defaults & icons
// ---------------------------------------------------------------------------

const MESSAGE_GAP = 16;
const LEAVE_DURATION_MS = 200;

let globalConfig: MessageConfig = {};
let idCounter = 0;

const TYPE_ICONS: Record<MessageType, string> = {
  primary: '●',
  success: '✓',
  info: 'ℹ',
  warning: '!',
  error: '✕',
};

function nextId(): string {
  idCounter += 1;
  return `ui-message-${idCounter}`;
}

function normalizeMessage(message: string): string {
  return message.trim();
}

function resolveAppendTo(appendTo?: string | HTMLElement): HTMLElement {
  if (!appendTo) return document.body;
  if (typeof appendTo === 'string') {
    return (document.querySelector(appendTo) as HTMLElement | null) ?? document.body;
  }
  return appendTo;
}

function resolveOptions(input: string | MessageOptions): ResolvedMessageOptions {
  const opts: MessageOptions = typeof input === 'string' ? { message: input } : input;

  return {
    message: opts.message ?? '',
    type: opts.type ?? 'info',
    plain: opts.plain ?? globalConfig.plain ?? false,
    duration: opts.duration ?? globalConfig.duration ?? 3000,
    showClose: opts.showClose ?? globalConfig.showClose ?? false,
    grouping: opts.grouping ?? globalConfig.grouping ?? false,
    repeatNum: opts.repeatNum ?? 1,
    offset: opts.offset ?? globalConfig.offset ?? 16,
    zIndex: opts.zIndex ?? globalConfig.zIndex ?? Z_INDEX.TOAST,
    customClass: opts.customClass ?? '',
    icon: opts.icon,
    id: opts.id ?? nextId(),
    onClose: opts.onClose,
    appendTo: opts.appendTo,
  };
}

// ---------------------------------------------------------------------------
// ui-message-item
// ---------------------------------------------------------------------------

@customElement('ui-message-item')
@localized()
export class UiMessageItem extends LitElement {
  static styles = css`
    :host {
      display: block;
      pointer-events: auto;
      margin-bottom: var(--message-gap, var(--space-inline));
      transition:
        opacity 0.2s ease,
        transform 0.2s ease;
      opacity: 0;
      transform: translateY(-8px);
    }

    :host([visible]) {
      opacity: 1;
      transform: translateY(0);
    }

    :host([leaving]) {
      opacity: 0;
      transform: translateY(-8px);
    }

    .message {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      min-width: 200px;
      max-width: min(480px, calc(100vw - 32px));
      padding: var(--space-sm) var(--space-inline);
      border-radius: var(--radius-md, 8px);
      font-size: 14px;
      line-height: 1.5;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
      border: 1px solid transparent;
      box-sizing: border-box;
      background: #fff;
      color: rgba(0, 0, 0, 0.88);
    }

    .message.plain.info {
      background: #e6f4ff;
      border-color: #91caff;
      color: #0958d9;
    }
    .message.plain.success {
      background: #f6ffed;
      border-color: #b7eb8f;
      color: #389e0d;
    }
    .message.plain.warning {
      background: #fffbe6;
      border-color: #ffe58f;
      color: #d48806;
    }
    .message.plain.error {
      background: #fff2f0;
      border-color: #ffccc7;
      color: #cf1322;
    }
    .message.plain.primary {
      background: #e6f4ff;
      border-color: #91caff;
      color: #1677ff;
    }

    .icon {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      display: grid;
      place-items: center;
      font-size: 14px;
      font-weight: 600;
      line-height: 1;
    }

    .icon.info {
      color: #1677ff;
    }
    .icon.success {
      color: #52c41a;
    }
    .icon.warning {
      color: #faad14;
    }
    .icon.error {
      color: #ff4d4f;
    }
    .icon.primary {
      color: #1677ff;
    }

    .content {
      flex: 1;
      word-break: break-word;
    }

    .close {
      flex-shrink: 0;
      border: 0;
      background: transparent;
      cursor: pointer;
      width: 22px;
      height: 22px;
      border-radius: 4px;
      display: grid;
      place-items: center;
      color: rgba(0, 0, 0, 0.45);
      font-size: 14px;
      line-height: 1;
      padding: 0;
    }
    .close:hover {
      background: rgba(0, 0, 0, 0.06);
      color: rgba(0, 0, 0, 0.75);
    }

    .badge {
      position: absolute;
      top: -8px;
      right: -8px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: #ff4d4f;
      color: #fff;
      font-size: 12px;
      line-height: 18px;
      text-align: center;
      box-sizing: border-box;
    }
  `;

  @property({ type: String }) message = '';
  @property({ type: String }) type: MessageType = 'info';
  @property({ type: Boolean }) plain = false;
  @property({ type: Boolean, attribute: 'show-close' }) showClose = false;
  @property({ type: Number, attribute: 'repeat-num' }) repeatNum = 1;
  @property() icon?: string;
  @property({ type: String, attribute: 'custom-class' }) customClass = '';

  @property({ type: Boolean, reflect: true }) visible = false;
  @property({ type: Boolean, reflect: true }) leaving = false;

  show(): void {
    this.leaving = false;
    requestAnimationFrame(() => {
      this.visible = true;
    });
  }

  async hide(): Promise<void> {
    this.visible = false;
    this.leaving = true;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, LEAVE_DURATION_MS);
    });
  }

  render() {
    const iconText = this.icon ?? TYPE_ICONS[this.type];

    return html`
      <div
        class=${classMap({
          message: true,
          plain: this.plain,
          [this.type]: true,
          [this.customClass]: Boolean(this.customClass),
        })}
        role="alert"
      >
        <span class=${classMap({ icon: true, [this.type]: true })} aria-hidden="true"
          >${iconText}</span
        >
        <span class="content">${this.message}</span>
        ${this.showClose
          ? html`<button
              class="close"
              type="button"
              aria-label="${msg('关闭')}"
              @click=${this._onClose}
            >
              ✕
            </button>`
          : nothing}
        ${this.repeatNum > 1 ? html`<span class="badge">${this.repeatNum}</span>` : nothing}
      </div>
    `;
  }

  private _onClose = () => {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-message-item': UiMessageItem;
  }
}

// ---------------------------------------------------------------------------
// MessageManager
// ---------------------------------------------------------------------------

type ManagedInstance = {
  id: string;
  el: UiMessageItem;
  options: ResolvedMessageOptions;
  timerId: ReturnType<typeof setTimeout> | null;
  remainingMs: number;
  timerStartedAt: number;
  paused: boolean;
};

class MessageManager {
  private readonly _instances: ManagedInstance[] = [];
  private readonly _groupingMap = new Map<string, string>();
  private _container: HTMLDivElement | null = null;
  private _containerHost: HTMLElement | null = null;
  private _baseOffset = 16;

  open(input: string | MessageOptions): MessageInstance {
    const options = resolveOptions(input);

    if (options.grouping && options.message) {
      const key = normalizeMessage(options.message);
      const existingId = this._groupingMap.get(key);
      if (existingId) {
        const existing = this._instances.find((i) => i.id === existingId);
        if (existing) {
          existing.options.repeatNum += 1;
          existing.el.repeatNum = existing.options.repeatNum;
          this._resetTimer(existing);
          return { close: () => this.close(existing.id) };
        }
        this._groupingMap.delete(key);
      }
    }

    const max = globalConfig.max;
    if (max && max > 0 && this._instances.length >= max) {
      const oldest = this._instances[0];
      if (oldest) this.close(oldest.id, false);
    }

    const container = this._ensureContainer(options);
    this._baseOffset = options.offset;
    container.style.setProperty('--message-gap', `${MESSAGE_GAP}px`);
    container.style.zIndex = String(options.zIndex);

    const el = document.createElement('ui-message-item') as UiMessageItem;
    el.id = options.id;
    el.message = options.message;
    el.type = options.type;
    el.plain = options.plain;
    el.showClose = options.showClose;
    el.repeatNum = options.repeatNum;
    el.icon = options.icon;
    el.customClass = options.customClass;

    const managed: ManagedInstance = {
      id: options.id,
      el,
      options,
      timerId: null,
      remainingMs: options.duration,
      timerStartedAt: 0,
      paused: false,
    };

    el.addEventListener('close', () => this.close(managed.id));
    el.addEventListener('mouseenter', () => this._pauseTimer(managed));
    el.addEventListener('mouseleave', () => this._resumeTimer(managed));

    container.appendChild(el);
    this._instances.push(managed);

    if (options.grouping && options.message) {
      this._groupingMap.set(normalizeMessage(options.message), managed.id);
    }

    this._layout();
    el.show();
    this._startTimer(managed);

    return { close: () => this.close(managed.id) };
  }

  config(partial: MessageConfig): void {
    globalConfig = { ...globalConfig, ...partial };
  }

  closeAll(): void {
    [...this._instances].forEach((inst) => this.close(inst.id, false));
  }

  private async close(id: string, animate = true): Promise<void> {
    const index = this._instances.findIndex((i) => i.id === id);
    if (index < 0) return;

    const managed = this._instances[index]!;
    this._clearTimer(managed);

    if (managed.options.grouping && managed.options.message) {
      const key = normalizeMessage(managed.options.message);
      if (this._groupingMap.get(key) === id) {
        this._groupingMap.delete(key);
      }
    }

    if (animate) {
      await managed.el.hide();
    }

    managed.el.remove();
    this._instances.splice(index, 1);
    this._layout();

    managed.options.onClose?.();

    if (this._instances.length === 0) {
      this._destroyContainer();
    }
  }

  private _ensureContainer(options: ResolvedMessageOptions): HTMLDivElement {
    const host = resolveAppendTo(options.appendTo);

    if (this._container && this._containerHost === host) {
      return this._container;
    }

    this._destroyContainer();

    const container = document.createElement('div');
    container.setAttribute('data-ui-message-container', '');
    container.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'pointer-events:none',
      'padding:0 var(--space-lg)',
      'box-sizing:border-box',
    ].join(';');

    host.appendChild(container);
    this._container = container;
    this._containerHost = host;
    return container;
  }

  private _destroyContainer(): void {
    this._container?.remove();
    this._container = null;
    this._containerHost = null;
  }

  private _layout(): void {
    if (!this._container) return;
    this._container.style.paddingTop = `${this._baseOffset}px`;
  }

  private _startTimer(managed: ManagedInstance): void {
    this._clearTimer(managed);
    if (managed.options.duration <= 0) return;

    managed.remainingMs = managed.options.duration;
    managed.timerStartedAt = Date.now();
    managed.paused = false;

    managed.timerId = setTimeout(() => {
      this.close(managed.id);
    }, managed.remainingMs);
  }

  private _resetTimer(managed: ManagedInstance): void {
    if (managed.options.duration <= 0) return;
    this._startTimer(managed);
  }

  private _pauseTimer(managed: ManagedInstance): void {
    if (managed.options.duration <= 0 || managed.paused || !managed.timerId) return;

    const elapsed = Date.now() - managed.timerStartedAt;
    managed.remainingMs = Math.max(0, managed.remainingMs - elapsed);
    this._clearTimer(managed);
    managed.paused = true;
  }

  private _resumeTimer(managed: ManagedInstance): void {
    if (managed.options.duration <= 0 || !managed.paused) return;

    managed.paused = false;
    if (managed.remainingMs <= 0) {
      this.close(managed.id);
      return;
    }

    managed.timerStartedAt = Date.now();
    managed.timerId = setTimeout(() => {
      this.close(managed.id);
    }, managed.remainingMs);
  }

  private _clearTimer(managed: ManagedInstance): void {
    if (managed.timerId) {
      clearTimeout(managed.timerId);
      managed.timerId = null;
    }
  }
}

const manager = new MessageManager();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type MessageFn = ((input: string | MessageOptions) => MessageInstance) & {
  success: (input: string | MessageOptions) => MessageInstance;
  warning: (input: string | MessageOptions) => MessageInstance;
  info: (input: string | MessageOptions) => MessageInstance;
  error: (input: string | MessageOptions) => MessageInstance;
  primary: (input: string | MessageOptions) => MessageInstance;
  config: (partial: MessageConfig) => void;
  closeAll: () => void;
};

function withType(type: MessageType, input: string | MessageOptions): MessageInstance {
  const opts: MessageOptions = typeof input === 'string' ? { message: input } : { ...input };
  return manager.open({ ...opts, type });
}

function createMessage(input: string | MessageOptions): MessageInstance {
  return manager.open(input);
}

export const Message = createMessage as MessageFn;

Message.success = (input) => withType('success', input);
Message.warning = (input) => withType('warning', input);
Message.info = (input) => withType('info', input);
Message.error = (input) => withType('error', input);
Message.primary = (input) => withType('primary', input);
Message.config = (partial) => manager.config(partial);
Message.closeAll = () => manager.closeAll();
