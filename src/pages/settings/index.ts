import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';

import '../../components/settings/settings-preferences.js';
import '../../components/settings/settings-limits.js';
import '../../components/settings/settings-backup.js';
import '../../components/settings/settings-pwa.js';
import '../../components/settings/settings-diagnostics.js';

@customElement('settings-page')
@localized()
export class SettingsPage extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .page {
      display: flex;
      flex-direction: column;
      gap: var(--space-stack);
      max-width: 40rem;
      width: 100%;
    }

    .intro {
      margin: 0;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.9375rem;
    }
  `;

  render() {
    return html`
      <div class="page">
        <p class="intro">${msg('管理偏好、练习限额、数据备份、应用更新与诊断。')}</p>
        <settings-preferences></settings-preferences>
        <settings-limits></settings-limits>
        <settings-backup></settings-backup>
        <settings-pwa></settings-pwa>
        <settings-diagnostics></settings-diagnostics>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-page': SettingsPage;
  }
}
