import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { navigator } from 'lit-element-router';

import { settingsCardStyles } from './settings-styles.js';

const NavigatorElement = navigator(LitElement);

@customElement('settings-extras')
@localized()
export class SettingsExtras extends NavigatorElement {
  static styles = [
    settingsCardStyles,
    css`
      button.row-action {
        appearance: none;
        border: none;
        background: transparent;
        padding: 0;
        text-align: left;
        width: 100%;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-inline);
        cursor: pointer;
        font: inherit;
        color: inherit;
      }

      button.row-action:disabled {
        cursor: not-allowed;
      }

      .badge {
        flex-shrink: 0;
        font-size: 0.75rem;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--color-border, #d9d9d9);
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.45));
        background: var(--color-surface, #fff);
      }

      .badge.action {
        border-color: var(--color-primary, #1677ff);
        color: var(--color-primary, #1677ff);
        background: rgba(22, 119, 255, 0.06);
      }
    `,
  ];

  private _goLibrary = (): void => {
    this.navigate('/library');
  };

  render() {
    return html`
      <section class="card" aria-labelledby="extras-heading">
        <h2 id="extras-heading">${msg('进阶资源')}</h2>
        <p class="desc">${msg('噪音等进阶素材在资料库中管理；部分能力仍在陆续开放。')}</p>
        <div class="rows">
          <div class="row">
            <button class="row-action" type="button" @click=${this._goLibrary}>
              <div class="label-wrap">
                <span class="label">${msg('噪音素材（辨音训练）')}</span>
                <span class="hint">${msg('前往资料库导入与管理环境噪音。')}</span>
              </div>
              <span class="badge action">${msg('去资料库')}</span>
            </button>
          </div>
          <div class="row">
            <button class="row-action" type="button" disabled aria-disabled="true">
              <div class="label-wrap">
                <span class="label">${msg('媒体封面图')}</span>
                <span class="hint">${msg('为音视频设置自定义封面。')}</span>
              </div>
              <span class="badge">${msg('即将推出')}</span>
            </button>
          </div>
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-extras': SettingsExtras;
  }
}
