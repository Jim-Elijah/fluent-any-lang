import { msg, localized } from '@lit/localize';
import { html, LitElement, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { WaveformController } from '../../controllers/waveform-controller.js';
import { PortalHost } from '../ui/internal/portal-host.js';
import { Z_INDEX } from '../ui/internal/z-index.js';
import '../ui/button.js';
import '../ui/icon.js';
import './waveform-player.js';

/** Shared session phases for Echo (preparing→listening→draining→…) and Shadowing (recording only). */
export type RecordingSessionPhase =
  | 'idle'
  | 'preparing'
  | 'stopping'
  | 'listening'
  | 'draining'
  | 'countdown'
  | 'recording';

/** @deprecated Prefer {@link RecordingSessionPhase}. */
export type EchoSessionPhase = RecordingSessionPhase;

export const EchoSessionDockEventType = {
  STOP: 'echo-session-stop',
  CANCEL: 'echo-session-cancel',
} as const;

/** Approx. dock *content* height for the taller recording state (with waveform). */
export const SESSION_DOCK_INSET_PX = 180;

/** @deprecated Prefer {@link SESSION_DOCK_INSET_PX}. */
export const ECHO_SESSION_DOCK_INSET_PX = SESSION_DOCK_INSET_PX;

const DOCK_PORTAL_STYLES = `
  .dock {
    position: fixed;
    left: 0;
    right: 0;
    /* Cover the mobile bottom nav during the session to keep focus on practice. */
    bottom: 0;
    z-index: var(--session-dock-z, ${Z_INDEX.ECHO_SESSION_DOCK});
    pointer-events: auto;
    padding: var(--space-sm) var(--space-inline) calc(var(--space-sm) + env(safe-area-inset-bottom, 0px));
    background: var(--color-surface, #fff);
    border-top: 1px solid var(--color-border, #d9d9d9);
    box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.08);
    display: grid;
    gap: var(--space-sm);
  }

  .dock.pulse {
    animation: session-dock-pulse 0.9s ease;
  }

  @keyframes session-dock-pulse {
    0% {
      border-top-color: var(--color-border, #d9d9d9);
      box-shadow: 0 -8px 24px rgba(22, 119, 255, 0.08);
    }
    40% {
      border-top-color: var(--color-primary, #1677ff);
      box-shadow: 0 -8px 32px rgba(22, 119, 255, 0.4);
      background-color: rgba(22, 119, 255, 0.03);
    }
    100% {
      border-top-color: var(--color-border, #d9d9d9);
      box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.08);
    }
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-block);
  }

  .status {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .status-title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text, rgba(0, 0, 0, 0.88));
  }

  .status-hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
  }

  .waveform {
    min-height: 48px;
  }
`;

/**
 * Viewport-anchored recording feedback for Echo and Shadowing.
 * Visible during `listening` and `recording`; hidden during `countdown` (fullscreen overlay).
 */
@customElement('echo-session-dock')
@localized()
export class EchoSessionDock extends LitElement {
  @property({ type: String })
  phase: RecordingSessionPhase = 'idle';

  @property({ attribute: false })
  waveformController: WaveformController | null = null;

  @property({ type: Boolean })
  speakCue = false;

  @property({ type: Number, attribute: 'z-index' })
  zIndex = Z_INDEX.ECHO_SESSION_DOCK;

  @property()
  popupContainer: string | HTMLElement | null = 'body';

  @state()
  private _pulse = false;

  private _portal: PortalHost | null = null;
  private _insetApplied = false;
  /** Tallest dock content height seen this session (listening vs recording). */
  private _maxDockContentPx = 0;
  private _pulseTimer: ReturnType<typeof setTimeout> | null = null;
  private _measureFrame: number | null = null;

  disconnectedCallback(): void {
    this._clearPulseTimer();
    this._cancelMeasure();
    this._clearInset();
    this._portal?.destroy();
    this._portal = null;
    super.disconnectedCallback();
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has('speakCue') && this.speakCue) {
      this._triggerPulse();
    }

    if (
      changed.has('phase') ||
      changed.has('waveformController') ||
      changed.has('zIndex') ||
      changed.has('speakCue') ||
      changed.has('_pulse')
    ) {
      this._syncPortal();
    }
  }

  render() {
    return nothing;
  }

  /** Reserve scroll room for the whole session, including preparing / countdown. */
  private _shouldReserveInset(): boolean {
    return this.phase !== 'idle';
  }

  private _isVisible(): boolean {
    return this.phase === 'listening' || this.phase === 'draining' || this.phase === 'recording';
  }

  private _getPortal(): PortalHost {
    if (!this._portal) {
      this._portal = new PortalHost({
        dataAttr: 'data-echo-session-dock-portal',
        styleText: DOCK_PORTAL_STYLES,
        zIndex: this.zIndex,
        popupContainer: this.popupContainer,
      });
    }
    return this._portal;
  }

  private _syncPortal(): void {
    const portal = this._getPortal();
    portal.updateOptions({ zIndex: this.zIndex, popupContainer: this.popupContainer });

    if (!this._shouldReserveInset()) {
      portal.hide();
      this._clearInset();
      return;
    }

    // Apply the tallest-state floor before paint so lyric scroll sees dock clearance.
    this._applyInset();

    if (!this._isVisible()) {
      portal.ensureMount();
      portal.hide();
      return;
    }

    portal.render(this._dockTemplate(), this);
    this._scheduleMeasureInset();
  }

  private _dockTemplate() {
    const isRecording = this.phase === 'recording';
    const isDraining = this.phase === 'draining';
    const title = isRecording
      ? msg('录音中')
      : isDraining
        ? msg('准备录音…')
        : msg('正在播放原音…');
    const hint = isRecording
      ? this.speakCue
        ? msg('请开始跟读')
        : msg('跟读完成后点击停止')
      : isDraining
        ? msg('原音已结束，即将开始录音')
        : msg('听完后将开始录音');

    return html`
      <div
        class="dock ${this._pulse ? 'pulse' : ''}"
        style=${`--session-dock-z: ${this.zIndex}`}
        role="status"
        aria-live="polite"
      >
        <div class="row">
          <div class="status">
            <p class="status-title">${title}</p>
            <p class="status-hint">${hint}</p>
          </div>
          <ui-button
            variant="${isRecording ? 'primary' : 'secondary'}"
            @click=${isRecording ? this._onStop : this._onCancel}
          >
            ${isRecording ? msg('停止') : msg('取消')}
          </ui-button>
        </div>
        ${isRecording && this.waveformController
          ? html`<div class="waveform">
              <waveform-player
                .controller=${this.waveformController}
                .canvasHeight=${56}
                .interactive=${false}
              ></waveform-player>
            </div>`
          : nothing}
      </div>
    `;
  }

  private _onStop = (): void => {
    this.dispatchEvent(
      new CustomEvent(EchoSessionDockEventType.STOP, {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private _onCancel = (): void => {
    this.dispatchEvent(
      new CustomEvent(EchoSessionDockEventType.CANCEL, {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private _triggerPulse(): void {
    this._clearPulseTimer();
    this._pulse = true;
    this._pulseTimer = setTimeout(() => {
      this._pulse = false;
      this._pulseTimer = null;
    }, 900);
  }

  private _clearPulseTimer(): void {
    if (this._pulseTimer !== null) {
      clearTimeout(this._pulseTimer);
      this._pulseTimer = null;
    }
  }

  private _cancelMeasure(): void {
    if (this._measureFrame !== null) {
      cancelAnimationFrame(this._measureFrame);
      this._measureFrame = null;
    }
  }

  private _scheduleMeasureInset(): void {
    this._cancelMeasure();
    this._measureFrame = requestAnimationFrame(() => {
      this._measureFrame = null;
      const dockEl = this._portal?.getPopupEl('.dock');
      if (!dockEl) {
        return;
      }
      const measured = Math.ceil(dockEl.getBoundingClientRect().height);
      if (measured > this._maxDockContentPx) {
        this._maxDockContentPx = measured;
        this._applyInset();
      }
    });
  }

  /**
   * Publishes dock content clearance (max of listening/recording heights).
   * Dock is bottom:0 and covers the mobile nav during the session.
   */
  private _applyInset(): void {
    if (typeof document === 'undefined') {
      return;
    }
    const contentPx = Math.max(SESSION_DOCK_INSET_PX, this._maxDockContentPx);
    this._maxDockContentPx = contentPx;
    const value = `${contentPx}px`;
    document.documentElement.style.setProperty('scroll-padding-bottom', value);
    document.documentElement.style.setProperty('--session-dock-inset', value);
    // Compat for subtitle fullscreen padding until consumers migrate.
    document.documentElement.style.setProperty('--echo-dock-inset', value);
    const main = this._findMainContent();
    if (main) {
      main.style.scrollPaddingBottom = value;
    }
    this._insetApplied = true;
  }

  private _clearInset(): void {
    this._cancelMeasure();
    this._maxDockContentPx = 0;
    if (!this._insetApplied || typeof document === 'undefined') {
      return;
    }
    document.documentElement.style.removeProperty('scroll-padding-bottom');
    document.documentElement.style.removeProperty('--session-dock-inset');
    document.documentElement.style.removeProperty('--echo-dock-inset');
    const main = this._findMainContent();
    if (main) {
      main.style.scrollPaddingBottom = '';
    }
    this._insetApplied = false;
  }

  private _findMainContent(): HTMLElement | null {
    const fromShell = document
      .querySelector('app-shell')
      ?.shadowRoot?.querySelector('.main-content');
    if (fromShell instanceof HTMLElement) {
      return fromShell;
    }
    const fallback = document.querySelector('.main-content');
    return fallback instanceof HTMLElement ? fallback : null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'echo-session-dock': EchoSessionDock;
  }
}
