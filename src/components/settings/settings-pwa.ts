import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';

import {
  applyPwaUpdate,
  checkForPwaUpdate,
  getPwaState,
  isPwaStandalone,
  subscribePwa,
} from '../../lib/pwa.js';
import { reportError } from '../../lib/error-reporter.js';
import { settingsCardStyles } from './settings-styles.js';
import '../ui/button.js';
import '../ui/message.js';
import { Message } from '../ui/message.js';

@customElement('settings-pwa')
@localized()
export class SettingsPwa extends LitElement {
  static styles = [
    settingsCardStyles,
    css`
      .meta {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 0.875rem;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-sm);
        align-items: center;
      }
    `,
  ];

  @state()
  private _needRefresh = false;

  @state()
  private _busy = false;

  @state()
  private _standalone = false;

  private _unsubscribe: (() => void) | undefined;

  connectedCallback(): void {
    super.connectedCallback();
    this._standalone = isPwaStandalone();
    this._needRefresh = getPwaState().needRefresh;
    this._unsubscribe = subscribePwa((state) => {
      this._needRefresh = state.needRefresh;
    });
  }

  disconnectedCallback(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    super.disconnectedCallback();
  }

  private async _onCheck(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      const found = await checkForPwaUpdate();
      if (found || getPwaState().needRefresh) {
        Message.info(msg('发现新版本，可立即更新'));
      } else {
        Message.success(msg('已是最新版本'));
      }
    } catch (error) {
      void reportError(error, { where: 'settings-pwa.check' });
      Message.error(error instanceof Error ? error.message : msg('检查更新失败'));
    } finally {
      this._busy = false;
    }
  }

  private async _onUpdate(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      await applyPwaUpdate();
    } catch (error) {
      void reportError(error, { where: 'settings-pwa.update' });
      Message.error(error instanceof Error ? error.message : msg('更新失败'));
      this._busy = false;
    }
  }

  render() {
    return html`
      <section class="card" aria-labelledby="pwa-heading">
        <h2 id="pwa-heading">${msg('应用与更新')}</h2>
        <p class="desc">
          ${msg('可将本应用安装到桌面或主屏幕。更新只刷新应用壳，不会删除本机媒体、字幕与录音。')}
        </p>

        <ul class="meta">
          <li>
            ${msg('安装状态')}：${this._standalone
              ? msg('已安装（独立窗口）')
              : msg('浏览器标签页（可从浏览器菜单添加到主屏幕）')}
          </li>
          ${this._needRefresh ? html`<li>${msg('状态')}：${msg('有待安装的新版本')}</li>` : nothing}
        </ul>

        <div class="actions">
          <ui-button variant="secondary" ?disabled=${this._busy} @click=${this._onCheck}>
            ${msg('检查更新')}
          </ui-button>
          ${this._needRefresh
            ? html`
                <ui-button variant="primary" ?disabled=${this._busy} @click=${this._onUpdate}>
                  ${msg('立即更新')}
                </ui-button>
              `
            : nothing}
          ${this._busy ? html`<span class="hint">${msg('处理中…')}</span>` : nothing}
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-pwa': SettingsPwa;
  }
}
