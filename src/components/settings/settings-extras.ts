import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';

import { settingsCardStyles } from './settings-styles.js';

@customElement('settings-extras')
@localized()
export class SettingsExtras extends LitElement {
  static styles = [
    settingsCardStyles,
    css`
      .card {
        opacity: 0.85;
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
        cursor: not-allowed;
        font: inherit;
        color: inherit;
      }
    `,
  ];

  render() {
    return html`
      <section class="card" aria-labelledby="extras-heading">
        <h2 id="extras-heading">${msg('进阶资源')}</h2>
        <p class="desc">${msg('以下能力尚未开放，入口预留以便后续扩展。')}</p>
        <div class="rows">
          <div class="row">
            <button class="row-action" type="button" disabled aria-disabled="true">
              <div class="label-wrap">
                <span class="label">${msg('噪音素材（辨音训练）')}</span>
                <span class="hint">${msg('导入环境噪音，用于听力辨音训练。')}</span>
              </div>
              <span class="badge">${msg('即将推出')}</span>
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
