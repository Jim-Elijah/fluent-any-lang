import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';

import { getAppSettings, setAppSettings } from '../../lib/app-settings.js';
import type { AppSettings } from '../../types/models.js';
import { settingsCardStyles } from './settings-styles.js';
import '../ui/switch.js';
import type { SwitchChangeDetail } from '../ui/switch.js';

type TipKey = keyof Pick<
  AppSettings,
  'skipRecordingCountdown' | 'skipShadowingTips' | 'skipEchoTips'
>;

@customElement('settings-preferences')
@localized()
export class SettingsPreferences extends LitElement {
  static styles = [
    settingsCardStyles,
    css`
      .row {
        cursor: pointer;
      }

      ui-switch {
        flex-shrink: 0;
        margin-top: 2px;
      }
    `,
  ];

  @state()
  private _settings: AppSettings = getAppSettings();

  private _setTip(key: TipKey, checked: boolean) {
    this._settings = setAppSettings({ [key]: checked });
  }

  private _onSwitch(key: TipKey) {
    return (event: CustomEvent<SwitchChangeDetail>) => {
      event.stopPropagation();
      this._setTip(key, event.detail.checked);
    };
  }

  private _onRowClick(key: TipKey) {
    return (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('ui-switch')) return;
      this._setTip(key, !this._settings[key]);
    };
  }

  render() {
    const s = this._settings;
    return html`
      <section class="card" aria-labelledby="prefs-heading">
        <h2 id="prefs-heading">${msg('偏好与提示')}</h2>
        <p class="desc">${msg('控制练习流程中的倒计时与模式说明是否自动跳过。')}</p>
        <div class="rows">
          <div
            class="row"
            role="button"
            tabindex="0"
            @click=${this._onRowClick('skipRecordingCountdown')}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._setTip('skipRecordingCountdown', !s.skipRecordingCountdown);
              }
            }}
          >
            <div class="label-wrap">
              <span class="label">${msg('跳过录音倒计时')}</span>
              <span class="hint">${msg('开启后录音前不再显示 3 秒倒计时。')}</span>
            </div>
            <ui-switch
              .checked=${s.skipRecordingCountdown}
              .label=${msg('跳过录音倒计时')}
              @change=${this._onSwitch('skipRecordingCountdown')}
            ></ui-switch>
          </div>
          <div
            class="row"
            role="button"
            tabindex="0"
            @click=${this._onRowClick('skipShadowingTips')}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._setTip('skipShadowingTips', !s.skipShadowingTips);
              }
            }}
          >
            <div class="label-wrap">
              <span class="label">${msg('跳过跟读模式提示')}</span>
              <span class="hint">${msg('开启后进入跟读模式时不再弹出说明。')}</span>
            </div>
            <ui-switch
              .checked=${s.skipShadowingTips}
              .label=${msg('跳过跟读模式提示')}
              @change=${this._onSwitch('skipShadowingTips')}
            ></ui-switch>
          </div>
          <div
            class="row"
            role="button"
            tabindex="0"
            @click=${this._onRowClick('skipEchoTips')}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._setTip('skipEchoTips', !s.skipEchoTips);
              }
            }}
          >
            <div class="label-wrap">
              <span class="label">${msg('跳过回声模式提示')}</span>
              <span class="hint">${msg('开启后进入回声模式时不再弹出说明。')}</span>
            </div>
            <ui-switch
              .checked=${s.skipEchoTips}
              .label=${msg('跳过回声模式提示')}
              @change=${this._onSwitch('skipEchoTips')}
            ></ui-switch>
          </div>
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-preferences': SettingsPreferences;
  }
}
