import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, str, localized } from '@lit/localize';

import { getAppSettings, setAppSettings } from '../../lib/app-settings.js';
import {
  RECORDING_COUNTDOWN_SECONDS_LIMITS,
  type AppSettings,
  type ShadowingGapPolicy,
} from '../../types/models.js';
import { settingsCardStyles } from './settings-styles.js';
import '../ui/switch.js';
import type { SwitchChangeDetail } from '../ui/switch.js';
import '../ui/select.js';
import type { SelectChangeDetail } from '../ui/select.js';
import '../ui/message.js';
import { Message } from '../ui/message.js';

type PreferenceToggleKey = keyof Pick<
  AppSettings,
  | 'reduceSpeakerEcho'
  | 'skipRecordingCountdown'
  | 'skipShadowingTips'
  | 'skipEchoTips'
  | 'skipDiscriminationTips'
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

      .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
        padding: var(--space-sm) 0;
        border-bottom: 1px solid var(--color-border, #f0f0f0);
      }

      .field:last-child {
        border-bottom: none;
      }

      .field-label {
        font-size: 0.9375rem;
        color: var(--color-text, rgba(0, 0, 0, 0.88));
      }

      ui-select {
        max-width: 100%;
      }
    `,
  ];

  @state()
  private _settings: AppSettings = getAppSettings();

  private _setToggle(key: PreferenceToggleKey, checked: boolean) {
    this._settings = setAppSettings({ [key]: checked });
  }

  private _onSwitch(key: PreferenceToggleKey) {
    return (event: CustomEvent<SwitchChangeDetail>) => {
      event.stopPropagation();
      this._setToggle(key, event.detail.checked);
    };
  }

  private _onRowClick(key: PreferenceToggleKey) {
    return (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('ui-switch')) return;
      this._setToggle(key, !this._settings[key]);
    };
  }

  private _onGapPolicyChange(event: CustomEvent<SelectChangeDetail>): void {
    const value = event.detail.value as ShadowingGapPolicy;
    const prev = this._settings.shadowingGapPolicy;
    this._settings = setAppSettings({ shadowingGapPolicy: value });
    if (this._settings.shadowingGapPolicy !== prev) {
      Message.success(msg('已保存'));
    }
  }

  private _recordingCountdownSecondOptions() {
    const options = [];
    for (
      let sec = RECORDING_COUNTDOWN_SECONDS_LIMITS.min;
      sec <= RECORDING_COUNTDOWN_SECONDS_LIMITS.max;
      sec += 1
    ) {
      options.push({ value: String(sec), label: msg(str`${sec} 秒`) });
    }
    return options;
  }

  private _onRecordingCountdownSecondsChange(event: CustomEvent<SelectChangeDetail>): void {
    const raw = event.detail.value;
    if (typeof raw !== 'string') {
      return;
    }
    const seconds = Number.parseInt(raw, 10);
    if (!Number.isFinite(seconds)) {
      return;
    }
    const prev = this._settings.recordingCountdownSeconds;
    this._settings = setAppSettings({ recordingCountdownSeconds: seconds });
    if (this._settings.recordingCountdownSeconds !== prev) {
      Message.success(msg('已保存'));
    }
  }

  render() {
    const s = this._settings;
    return html`
      <section class="card" aria-labelledby="prefs-heading">
        <h2 id="prefs-heading">${msg('偏好与提示')}</h2>
        <p class="desc">
          ${msg('控制录音麦克风处理、练习流程倒计时，以及各练习模式说明是否自动跳过。')}
        </p>
        <div class="rows">
          <div class="field">
            <span class="field-label">${msg('影子跟读 · 句间空隙')}</span>
            <ui-select
              .value=${s.shadowingGapPolicy}
              .options=${[
                { value: 'compress', label: msg('压缩为约 1 秒（推荐）') },
                { value: 'preserve', label: msg('保留完整空隙') },
              ]}
              @change=${this._onGapPolicyChange}
            ></ui-select>
            <p class="hint">
              ${s.shadowingGapPolicy === 'compress'
                ? msg(
                    '录制时跳过字幕间的长静音，句间只留约 1 秒；对照时按句同步播放，便于逐句对比。',
                  )
                : msg(
                    '按原音完整时间轴跟读（含句间长静音）；对照时为连续双轨，更贴近真实影子节奏。',
                  )}
            </p>
          </div>
          <div
            class="row"
            role="button"
            tabindex="0"
            @click=${this._onRowClick('reduceSpeakerEcho')}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._setToggle('reduceSpeakerEcho', !s.reduceSpeakerEcho);
              }
            }}
          >
            <div class="label-wrap">
              <span class="label">${msg('减少外放回声')}</span>
              <span class="hint"
                >${msg(
                  '耳机练习时建议关闭（推荐）；外放练习时建议开启，但可能偶发录音缺音。下次录音时生效。',
                )}</span
              >
            </div>
            <ui-switch
              .checked=${s.reduceSpeakerEcho}
              .label=${msg('减少外放回声')}
              @change=${this._onSwitch('reduceSpeakerEcho')}
            ></ui-switch>
          </div>
          <div
            class="row"
            role="button"
            tabindex="0"
            @click=${this._onRowClick('skipRecordingCountdown')}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._setToggle('skipRecordingCountdown', !s.skipRecordingCountdown);
              }
            }}
          >
            <div class="label-wrap">
              <span class="label">${msg('跳过录音倒计时')}</span>
              <span class="hint"
                >${msg('开启后录音前不再显示倒计时（回声与影子跟读均生效）。')}</span
              >
            </div>
            <ui-switch
              .checked=${s.skipRecordingCountdown}
              .label=${msg('跳过录音倒计时')}
              @change=${this._onSwitch('skipRecordingCountdown')}
            ></ui-switch>
          </div>
          <div class="field">
            <span class="field-label">${msg('录音前倒计时')}</span>
            <ui-select
              .value=${String(s.recordingCountdownSeconds)}
              .options=${this._recordingCountdownSecondOptions()}
              ?disabled=${s.skipRecordingCountdown}
              @change=${this._onRecordingCountdownSecondsChange}
            ></ui-select>
            <p class="hint">
              ${s.skipRecordingCountdown
                ? msg('已跳过倒计时；关闭上方开关后可选择 3–10 秒。')
                : msg('回声与影子跟读在开始录音前显示的固定等待秒数（3–10 秒）。')}
            </p>
          </div>
          <div
            class="row"
            role="button"
            tabindex="0"
            @click=${this._onRowClick('skipShadowingTips')}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._setToggle('skipShadowingTips', !s.skipShadowingTips);
              }
            }}
          >
            <div class="label-wrap">
              <span class="label">${msg('跳过影子跟读模式提示')}</span>
              <span class="hint">${msg('开启后进入影子跟读模式时不再弹出说明。')}</span>
            </div>
            <ui-switch
              .checked=${s.skipShadowingTips}
              .label=${msg('跳过影子跟读模式提示')}
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
                this._setToggle('skipEchoTips', !s.skipEchoTips);
              }
            }}
          >
            <div class="label-wrap">
              <span class="label">${msg('跳过回声跟读模式提示')}</span>
              <span class="hint">${msg('开启后进入回声跟读模式时不再弹出说明。')}</span>
            </div>
            <ui-switch
              .checked=${s.skipEchoTips}
              .label=${msg('跳过回声跟读模式提示')}
              @change=${this._onSwitch('skipEchoTips')}
            ></ui-switch>
          </div>
          <div
            class="row"
            role="button"
            tabindex="0"
            @click=${this._onRowClick('skipDiscriminationTips')}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._setToggle('skipDiscriminationTips', !s.skipDiscriminationTips);
              }
            }}
          >
            <div class="label-wrap">
              <span class="label">${msg('跳过抗噪听模式提示')}</span>
              <span class="hint">${msg('开启后进入抗噪听模式时不再弹出说明。')}</span>
            </div>
            <ui-switch
              .checked=${s.skipDiscriminationTips}
              .label=${msg('跳过抗噪听模式提示')}
              @change=${this._onSwitch('skipDiscriminationTips')}
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
