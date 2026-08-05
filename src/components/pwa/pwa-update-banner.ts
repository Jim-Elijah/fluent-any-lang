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
      align-items: flex-start;
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
      flex-direction: column;
      gap: 0.35rem;
      min-width: 0;
      max-width: min(36rem, 100%);
    }

    .text {
      margin: 0;
    }

    .highlights {
      margin: 0;
      padding-left: 1.1rem;
      max-height: 6.5rem;
      overflow: auto;
      opacity: 0.95;
    }

    .highlights li {
      margin: 0.15rem 0;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }

    .actions ui-button[variant='ghost'] {
      color: #fff;
    }
  `;

  @state()
  private _needRefresh = false;

  @state()
  private _notes: ReleaseNotes | null = null;

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
                <ul class="highlights">
                  ${highlights.map((item) => html`<li>${item}</li>`)}
                </ul>
              `
            : nothing}
        </div>
        <div class="actions">
          <ui-button variant="secondary" @click=${this._onUpdate}>${msg('立即更新')}</ui-button>
          <ui-button variant="ghost" @click=${this._onDismiss}>${msg('稍后')}</ui-button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pwa-update-banner': PwaUpdateBanner;
  }
}
