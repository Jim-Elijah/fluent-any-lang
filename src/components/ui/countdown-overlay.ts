import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { setUserSettings, shouldSkipRecordingCountdown } from '../../lib/user-settings.js';
import { Z_INDEX } from './internal/z-index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CountdownOverlayOptions = {
  seconds?: number;
  hint?: string;
  fullscreen?: boolean;
  target?: string | HTMLElement;
  lock?: boolean;
  showSkipOption?: boolean;
  background?: string;
};

export type CountdownOverlayInstance = {
  cancel: () => void;
};

type ResolvedCountdownOptions = Required<
  Pick<
    CountdownOverlayOptions,
    'seconds' | 'hint' | 'fullscreen' | 'lock' | 'showSkipOption' | 'background'
  >
> &
  Pick<CountdownOverlayOptions, 'target'> & {
    mountTarget: HTMLElement;
  };

export class CountdownCancelledError extends Error {
  constructor() {
    super('Countdown cancelled');
    this.name = 'CountdownCancelledError';
  }
}

const PARENT_HIDDEN_CLASS = 'ui-countdown-parent--hidden';
const PARENT_RELATIVE_CLASS = 'ui-countdown-parent--relative';
const DEFAULT_BACKGROUND = 'rgba(0, 0, 0, 0.55)';
const GO_PHASE_MS = 400;

function resolveTarget(target?: string | HTMLElement): HTMLElement {
  if (!target) return document.body;
  if (typeof target === 'string') {
    const el = document.querySelector(target);
    if (el instanceof HTMLElement) return el;
    console.warn(`[Countdown] target "${target}" not found, fallback to document.body`);
    return document.body;
  }
  return target;
}

function resolveOptions(options: CountdownOverlayOptions = {}): ResolvedCountdownOptions {
  const fullscreen = options.fullscreen ?? true;
  const mountTarget = fullscreen ? document.body : resolveTarget(options.target);

  return {
    seconds: options.seconds ?? 3,
    hint: options.hint ?? msg('倒计时结束后请跟读'),
    fullscreen,
    target: options.target,
    lock: options.lock ?? true,
    showSkipOption: options.showSkipOption ?? false,
    background: options.background ?? DEFAULT_BACKGROUND,
    mountTarget,
  };
}

// ---------------------------------------------------------------------------
// ui-countdown-overlay
// ---------------------------------------------------------------------------

@customElement('ui-countdown-overlay')
@localized()
export class UiCountdownOverlay extends LitElement {
  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      z-index: var(--countdown-z-index, 1500);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      pointer-events: auto;
    }

    :host([fullscreen]) {
      position: fixed;
    }

    .panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      width: min(100%, 360px);
      padding: 28px 24px 24px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.98);
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.24);
      text-align: center;
    }

    .hint {
      margin: 0;
      color: rgba(0, 0, 0, 0.65);
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .number-wrap {
      width: 100%;
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .number {
      margin: 0;
      font-size: clamp(72px, 18vw, 120px);
      font-weight: 700;
      line-height: 1;
      color: var(--color-primary, #1677ff);
      font-variant-numeric: tabular-nums;
      animation: countdown-pop 0.35s ease;
    }

    .number.go {
      width: 100%;
      text-align: center;
      font-size: clamp(48px, 12vw, 72px);
      font-variant-numeric: normal;
      color: #389e0d;
    }

    @keyframes countdown-pop {
      0% {
        transform: scale(0.6);
        opacity: 0.2;
      }
      70% {
        transform: scale(1.08);
        opacity: 1;
      }
      100% {
        transform: scale(1);
        opacity: 1;
      }
    }

    .actions {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      width: 100%;
    }

    .cancel {
      min-width: 120px;
      height: 36px;
      padding: 0 18px;
      border: 1px solid #d9d9d9;
      border-radius: 8px;
      background: #fff;
      color: rgba(0, 0, 0, 0.88);
      font-size: 0.875rem;
      cursor: pointer;
    }

    .cancel:hover {
      border-color: #bfbfbf;
      color: rgba(0, 0, 0, 0.95);
    }

    .skip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      color: rgba(0, 0, 0, 0.55);
      font-size: 0.8125rem;
      line-height: 1.4;
      cursor: pointer;
      user-select: none;
    }

    .skip input {
      width: 16px;
      height: 16px;
      margin: 0;
      cursor: pointer;
      accent-color: var(--color-primary, #1677ff);
    }

    @media (max-width: 480px) {
      .panel {
        width: 100%;
        padding: 24px 20px 20px;
        border-radius: 14px;
      }

      .number-wrap {
        min-height: 96px;
      }
    }
  `;

  @property({ type: Number }) seconds = 3;
  @property({ type: String }) hint = '';
  @property({ type: Boolean }) showSkipOption = false;
  @property({ type: Boolean, reflect: true }) fullscreen = false;
  @property({ type: String }) background = DEFAULT_BACKGROUND;

  @state() private _remaining = 0;
  @state() private _showGo = false;

  private _timerId: ReturnType<typeof setInterval> | null = null;
  private _goTimerId: ReturnType<typeof setTimeout> | null = null;
  private _started = false;

  connectedCallback(): void {
    super.connectedCallback();
    this.style.background = this.background;
    this._remaining = Math.max(1, Math.round(this.seconds));
  }

  disconnectedCallback(): void {
    this._clearTimers();
    super.disconnectedCallback();
  }

  firstUpdated(): void {
    if (this._started) {
      return;
    }
    this._started = true;
    this._startCountdown();
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('background')) {
      this.style.background = this.background;
    }
  }

  render() {
    const display = this._showGo ? msg('开始！') : String(this._remaining);

    return html`
      <div
        class="panel"
        role="dialog"
        aria-modal="true"
        aria-live="assertive"
        @click=${(e: Event) => e.stopPropagation()}
      >
        ${this.hint ? html`<p class="hint">${this.hint}</p>` : nothing}
        <div class="number-wrap">
          <p class="number ${this._showGo ? 'go' : ''}" aria-atomic="true">${display}</p>
        </div>
        <div class="actions">
          <button type="button" class="cancel" @click=${this._handleCancel}>${msg('取消')}</button>
          ${this.showSkipOption
            ? html`
                <label class="skip">
                  <input type="checkbox" @change=${this._handleSkipChange} />
                  ${msg('以后跳过倒计时')}
                </label>
              `
            : nothing}
        </div>
      </div>
    `;
  }

  private _startCountdown(): void {
    this._clearTimers();
    this._showGo = false;
    this._remaining = Math.max(1, Math.round(this.seconds));

    this._timerId = setInterval(() => {
      if (this._remaining <= 1) {
        this._clearInterval();
        this._showGo = true;
        this._goTimerId = setTimeout(() => {
          this._dispatchComplete();
        }, GO_PHASE_MS);
        return;
      }
      this._remaining -= 1;
    }, 1000);
  }

  cancel(): void {
    this._clearTimers();
    this.dispatchEvent(
      new CustomEvent('cancel', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _handleCancel(): void {
    this.cancel();
  }

  private _handleSkipChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      setUserSettings({ skipRecordingCountdown: true });
    }
  }

  private _dispatchComplete(): void {
    this.dispatchEvent(
      new CustomEvent('complete', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _clearInterval(): void {
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
  }

  private _clearTimers(): void {
    this._clearInterval();
    if (this._goTimerId !== null) {
      clearTimeout(this._goTimerId);
      this._goTimerId = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Countdown manager
// ---------------------------------------------------------------------------

type ManagedCountdown = {
  overlay: UiCountdownOverlay;
  mountTarget: HTMLElement;
  lock: boolean;
  fullscreen: boolean;
  parentPositionChanged: boolean;
  parentOverflowChanged: boolean;
  bodyOverflowChanged: boolean;
  savedParentPosition: string;
  savedParentOverflow: string;
  savedBodyOverflow: string;
  onComplete: () => void;
  onCancel: () => void;
};

class CountdownManager {
  private _active: ManagedCountdown | null = null;

  run(options: CountdownOverlayOptions = {}): Promise<void> {
    const resolved = resolveOptions(options);

    if (this._active) {
      this._teardown(this._active);
      this._active = null;
    }

    return new Promise((resolve, reject) => {
      const overlay = document.createElement('ui-countdown-overlay') as UiCountdownOverlay;
      overlay.seconds = resolved.seconds;
      overlay.hint = resolved.hint;
      overlay.showSkipOption = resolved.showSkipOption;
      overlay.fullscreen = resolved.fullscreen;
      overlay.background = resolved.background;
      overlay.style.zIndex = String(Z_INDEX.FULLSCREEN);

      const styleParent = resolved.fullscreen ? document.body : resolved.mountTarget;
      const savedParentPosition = styleParent.style.position;
      const savedParentOverflow = styleParent.style.overflow;
      const savedBodyOverflow = document.body.style.overflow;

      let parentPositionChanged = false;
      let parentOverflowChanged = false;
      let bodyOverflowChanged = false;

      if (!resolved.fullscreen) {
        const computed = getComputedStyle(resolved.mountTarget).position;
        if (computed === 'static') {
          resolved.mountTarget.classList.add(PARENT_RELATIVE_CLASS);
          resolved.mountTarget.style.position = 'relative';
          parentPositionChanged = true;
        }
      }

      if (resolved.lock) {
        if (resolved.fullscreen) {
          document.body.classList.add(PARENT_HIDDEN_CLASS);
          document.body.style.overflow = 'hidden';
          bodyOverflowChanged = true;
        } else {
          resolved.mountTarget.classList.add(PARENT_HIDDEN_CLASS);
          resolved.mountTarget.style.overflow = 'hidden';
          parentOverflowChanged = true;
        }
      }

      const managed: ManagedCountdown = {
        overlay,
        mountTarget: resolved.mountTarget,
        lock: resolved.lock,
        fullscreen: resolved.fullscreen,
        parentPositionChanged,
        parentOverflowChanged,
        bodyOverflowChanged,
        savedParentPosition,
        savedParentOverflow,
        savedBodyOverflow,
        onComplete: () => {
          this._teardown(managed);
          if (this._active === managed) {
            this._active = null;
          }
          resolve();
        },
        onCancel: () => {
          this._teardown(managed);
          if (this._active === managed) {
            this._active = null;
          }
          reject(new CountdownCancelledError());
        },
      };

      overlay.addEventListener('complete', managed.onComplete, { once: true });
      overlay.addEventListener('cancel', managed.onCancel, { once: true });

      resolved.mountTarget.appendChild(overlay);
      this._active = managed;
    });
  }

  cancel(): void {
    if (!this._active) {
      return;
    }
    this._active.overlay.cancel();
  }

  private _teardown(managed: ManagedCountdown): void {
    managed.overlay.removeEventListener('complete', managed.onComplete);
    managed.overlay.removeEventListener('cancel', managed.onCancel);
    managed.overlay.remove();

    if (managed.parentPositionChanged) {
      managed.mountTarget.classList.remove(PARENT_RELATIVE_CLASS);
      managed.mountTarget.style.position = managed.savedParentPosition;
    }

    if (managed.parentOverflowChanged) {
      managed.mountTarget.classList.remove(PARENT_HIDDEN_CLASS);
      managed.mountTarget.style.overflow = managed.savedParentOverflow;
    }

    if (managed.bodyOverflowChanged) {
      document.body.classList.remove(PARENT_HIDDEN_CLASS);
      document.body.style.overflow = managed.savedBodyOverflow;
    }
  }
}

const manager = new CountdownManager();

type CountdownService = {
  (options?: CountdownOverlayOptions): Promise<void>;
  run: (options?: CountdownOverlayOptions) => Promise<void>;
  cancel: () => void;
};

function createCountdown(options?: CountdownOverlayOptions): Promise<void> {
  return manager.run(options);
}

export const Countdown = createCountdown as CountdownService;
Countdown.run = (options) => manager.run(options);
Countdown.cancel = () => manager.cancel();

/** Runs the recording countdown unless the user opted to skip it. */
export async function runRecordingCountdown(options: CountdownOverlayOptions = {}): Promise<void> {
  if (shouldSkipRecordingCountdown()) {
    return;
  }

  return Countdown.run({
    seconds: 3,
    showSkipOption: true,
    ...options,
  });
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-countdown-overlay': UiCountdownOverlay;
  }
}
