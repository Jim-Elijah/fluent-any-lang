import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, str, localized } from '@lit/localize';

import {
  applyPwaUpdate,
  clearOfflineReady,
  dismissNeedRefresh,
  subscribePwa,
} from '../../lib/pwa.js';
import {
  fetchReleaseNotes,
  highlightsForLocale,
  type ReleaseNotes,
} from '../../lib/release-notes.js';
import { Message } from '../ui/message.js';
import '../ui/button.js';
import { Z_INDEX } from '../ui/internal/z-index.js';

@customElement('pwa-update-banner')
@localized()
export class PwaUpdateBanner extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: ${Z_INDEX.TOAST};
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
      background: var(--color-primary, #1677ff);
      color: #fff;
      font-size: 0.875rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .content {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 0.75rem;
      min-width: 0;
      max-width: min(36rem, 100%);
    }

    .text {
      margin: 0;
    }

    .notes-panel {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      display: flex;
      justify-content: flex-start;
      max-height: min(40vh, 16rem);
      overflow: auto;
      padding: 0.65rem 1rem 0.85rem;
      background: color-mix(in srgb, var(--color-primary, #1677ff) 92%, #000);
      color: #fff;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
    }

    .highlights {
      box-sizing: border-box;
      width: 100%;
      max-width: 36rem;
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      line-height: 1.45;
      opacity: 0.95;
    }

    .highlights li {
      position: relative;
      margin: 0;
      padding-left: 0.9rem;
    }

    .highlights li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0.55em;
      width: 0.35rem;
      height: 0.35rem;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.75);
    }

    @media (min-width: 768px) {
      .notes-panel {
        justify-content: center;
      }
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }

    /* Ghost uses --color-text-secondary / --color-primary inside shadow DOM */
    .banner ui-button[variant='ghost'] {
      --color-text-secondary: rgba(255, 255, 255, 0.95);
      --color-primary: #fff;
    }
  `;

  @state()
  private _needRefresh = false;

  @state()
  private _notes: ReleaseNotes | null = null;

  @state()
  private _notesExpanded = false;

  private _unsubscribe: (() => void) | undefined;
  private _offlineToastShown = false;
  private _notesFetchAttempted = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe = subscribePwa((state) => {
      this._needRefresh = state.needRefresh;
      if (state.needRefresh) {
        void this._ensureNotes();
      } else {
        this._notes = null;
        this._notesFetchAttempted = false;
        this._notesExpanded = false;
      }
      if (state.offlineReady && !this._offlineToastShown) {
        this._offlineToastShown = true;
        Message.success({
          message: msg('应用已可离线使用'),
          duration: 3000,
        });
        clearOfflineReady();
      }
    });
  }

  disconnectedCallback(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    super.disconnectedCallback();
  }

  private async _ensureNotes(): Promise<void> {
    if (this._notesFetchAttempted) return;
    this._notesFetchAttempted = true;
    this._notes = await fetchReleaseNotes();
  }

  private async _onUpdate(): Promise<void> {
    await applyPwaUpdate();
  }

  private _onDismiss(): void {
    dismissNeedRefresh();
  }

  private _onToggleNotes(): void {
    this._notesExpanded = !this._notesExpanded;
  }

  render() {
    if (!this._needRefresh) return nothing;

    const highlights = this._notes ? highlightsForLocale(this._notes) : [];
    const title = this._notes?.version
      ? msg(str`有新版本可用（${this._notes.version}）`)
      : msg('有新版本可用');

    return html`
      <div class="banner" role="status">
        <div class="content">
          <p class="text">${title}</p>
          ${highlights.length > 0
            ? html`
                <ui-button variant="ghost" @click=${this._onToggleNotes}>
                  ${this._notesExpanded ? msg('收起') : msg('查看更新')}
                </ui-button>
              `
            : nothing}
        </div>
        <div class="actions">
          <ui-button variant="secondary" @click=${this._onUpdate}>${msg('立即更新')}</ui-button>
          <ui-button variant="ghost" @click=${this._onDismiss}>${msg('稍后')}</ui-button>
        </div>
        ${this._notesExpanded && highlights.length > 0
          ? html`
              <div class="notes-panel">
                <ul class="highlights">
                  ${highlights.map((item) => html`<li>${item}</li>`)}
                </ul>
              </div>
            `
          : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pwa-update-banner': PwaUpdateBanner;
  }
}
