import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';

import {
  applyPwaUpdate,
  clearOfflineReady,
  dismissNeedRefresh,
  subscribePwa,
} from '../../lib/pwa.js';
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

    .text {
      margin: 0;
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

  private _unsubscribe: (() => void) | undefined;
  private _offlineToastShown = false;

  connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe = subscribePwa((state) => {
      this._needRefresh = state.needRefresh;
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

  private async _onUpdate(): Promise<void> {
    await applyPwaUpdate();
  }

  private _onDismiss(): void {
    dismissNeedRefresh();
  }

  render() {
    if (!this._needRefresh) return nothing;

    return html`
      <div class="banner" role="status">
        <p class="text">${msg('有新版本可用')}</p>
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
