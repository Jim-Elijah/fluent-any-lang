import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, str, localized } from '@lit/localize';

import { getAppSettings, setAppSettings } from '../../lib/app-settings.js';
import { APP_SETTINGS_PLAYER_LIMITS, type AppSettings, type LoopMode } from '../../types/models.js';
import { settingsCardStyles } from './settings-styles.js';
import '../ui/input.js';
import type { InputChangeDetail } from '../ui/input.js';
import '../ui/select.js';
import type { SelectChangeDetail } from '../ui/select.js';
import '../ui/slider.js';
import type { SliderChangeDetail } from '../ui/slider.js';
import '../ui/message.js';
import { Message } from '../ui/message.js';

type PlayerNumericKey = keyof Pick<
  AppSettings,
  | 'defaultSleepMinutes'
  | 'repeatPausePercent'
  | 'defaultSourceVolume'
  | 'defaultNoiseVolume'
  | 'maxVolumeBoost'
  | 'maxPlaybackRate'
>;

@customElement('settings-player-defaults')
@localized()
export class SettingsPlayerDefaults extends LitElement {
  static styles = [
    settingsCardStyles,
    css`
      .fields {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-block);
      }

      @media (min-width: 640px) {
        .fields {
          grid-template-columns: 1fr 1fr;
        }
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
      }

      .field-label {
        font-size: 0.9375rem;
        color: var(--color-text, rgba(0, 0, 0, 0.88));
      }

      ui-input,
      ui-select {
        max-width: 100%;
      }

      ui-slider {
        width: 100%;
      }
    `,
  ];

  @state()
  private _settings: AppSettings = getAppSettings();

  private _save(partial: Partial<AppSettings>): void {
    const prev = this._settings;
    this._settings = setAppSettings(partial);
    const changed = (Object.keys(partial) as (keyof AppSettings)[]).some(
      (key) => this._settings[key] !== prev[key],
    );
    if (changed) {
      Message.success(msg('已保存'));
    }
  }

  private _commitNumber(key: PlayerNumericKey, raw: string | number) {
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    const limits = APP_SETTINGS_PLAYER_LIMITS[key];
    const fallback = this._settings[key];
    let value = Number.isFinite(parsed) ? parsed : fallback;
    value = Math.min(limits.max, Math.max(limits.min, value));
    if ('step' in limits && limits.step) {
      value = Math.round(value / limits.step) * limits.step;
      value = Math.min(limits.max, Math.max(limits.min, value));
    }
    this._save({ [key]: value });
  }

  private _onNumberChange(key: PlayerNumericKey) {
    return (event: CustomEvent<InputChangeDetail>) => {
      this._commitNumber(key, event.detail.value);
    };
  }

  private _onSliderChange(
    key: 'defaultSourceVolume' | 'defaultNoiseVolume' | 'maxVolumeBoost' | 'maxPlaybackRate',
  ) {
    return (event: CustomEvent<SliderChangeDetail>) => {
      this._commitNumber(key, event.detail.value);
    };
  }

  private _onLoopModeChange(event: CustomEvent<SelectChangeDetail>): void {
    this._save({ defaultLoopMode: event.detail.value as LoopMode });
  }

  private _rangeHint(key: PlayerNumericKey): string {
    const { min, max } = APP_SETTINGS_PLAYER_LIMITS[key];
    return msg(str`允许范围 ${min}–${max}`);
  }

  private _volumeLabel(key: 'defaultSourceVolume' | 'defaultNoiseVolume', label: string): string {
    const pct = Math.round(this._settings[key] * 100);
    return msg(str`${label}（${pct}%）`);
  }

  private _maxVolumeBoostLabel(): string {
    const pct = Math.round(this._settings.maxVolumeBoost * 100);
    return msg(str`最大音量上限（${pct}%）`);
  }

  private _maxVolumeBoostRangeHint(): string {
    const { min, max } = APP_SETTINGS_PLAYER_LIMITS.maxVolumeBoost;
    return msg(str`允许范围 ${Math.round(min * 100)}%–${Math.round(max * 100)}%`);
  }

  private _maxPlaybackRateLabel(): string {
    const rate = Number(this._settings.maxPlaybackRate.toFixed(1));
    return msg(str`最大播放倍速（${rate}x）`);
  }

  private _maxPlaybackRateRangeHint(): string {
    const { min, max } = APP_SETTINGS_PLAYER_LIMITS.maxPlaybackRate;
    return msg(str`允许范围 ${min}x–${max}x`);
  }

  private _numberField(key: 'repeatPausePercent', label: string) {
    const limits = APP_SETTINGS_PLAYER_LIMITS[key];
    const step = 'step' in limits ? limits.step : undefined;
    return html`
      <div class="field">
        <span class="field-label">${label}</span>
        <ui-input
          type="number"
          .value=${String(this._settings[key])}
          .min=${limits.min}
          .max=${limits.max}
          .step=${step}
          @change=${this._onNumberChange(key)}
        ></ui-input>
        <p class="hint">${this._rangeHint(key)}</p>
      </div>
    `;
  }

  render() {
    const s = this._settings;
    return html`
      <section class="card" aria-labelledby="player-defaults-heading">
        <h2 id="player-defaults-heading">${msg('播放器与练习默认')}</h2>
        <p class="desc">
          ${msg('打开练习或播放时的初始状态；当前会话中仍可在播放器面板随时调整。')}
        </p>
        <div class="fields">
          <div class="field">
            <span class="field-label">${msg('默认循环模式')}</span>
            <ui-select
              .value=${s.defaultLoopMode}
              .options=${[
                { value: 'none', label: msg('关闭') },
                { value: 'single', label: msg('单曲循环') },
                { value: 'segment', label: msg('单句循环') },
                { value: 'list', label: msg('列表循环') },
                { value: 'shuffle', label: msg('随机播放') },
              ]}
              @change=${this._onLoopModeChange}
            ></ui-select>
            <p class="hint">${msg('进入练习时的默认循环模式。')}</p>
          </div>
          <div class="field">
            <span class="field-label">${msg('默认定时关闭（分钟）')}</span>
            <ui-input
              type="number"
              .value=${String(s.defaultSleepMinutes)}
              .min=${APP_SETTINGS_PLAYER_LIMITS.defaultSleepMinutes.min}
              .max=${APP_SETTINGS_PLAYER_LIMITS.defaultSleepMinutes.max}
              @change=${this._onNumberChange('defaultSleepMinutes')}
            ></ui-input>
            <p class="hint">
              ${msg('开启定时关闭时的默认时长。')} ${this._rangeHint('defaultSleepMinutes')}
            </p>
          </div>
          ${this._numberField('repeatPausePercent', msg('默认句间暂停百分比'))}
          <div class="field">
            <span class="field-label"
              >${this._volumeLabel('defaultSourceVolume', msg('默认原音音量'))}</span
            >
            <ui-slider
              .value=${s.defaultSourceVolume}
              min=${APP_SETTINGS_PLAYER_LIMITS.defaultSourceVolume.min}
              max=${APP_SETTINGS_PLAYER_LIMITS.defaultSourceVolume.max}
              step=${APP_SETTINGS_PLAYER_LIMITS.defaultSourceVolume.step}
              .tooltip=${{
                formatter: (v: number) => `${Math.round(v * 100)}%`,
                placement: 'top',
              }}
              @change=${this._onSliderChange('defaultSourceVolume')}
            ></ui-slider>
            <p class="hint">${msg('录音预览时原音的默认音量。')}</p>
          </div>
          <div class="field">
            <span class="field-label"
              >${this._volumeLabel('defaultNoiseVolume', msg('默认噪音音量'))}</span
            >
            <ui-slider
              .value=${s.defaultNoiseVolume}
              min=${APP_SETTINGS_PLAYER_LIMITS.defaultNoiseVolume.min}
              max=${APP_SETTINGS_PLAYER_LIMITS.defaultNoiseVolume.max}
              step=${APP_SETTINGS_PLAYER_LIMITS.defaultNoiseVolume.step}
              .tooltip=${{
                formatter: (v: number) => `${Math.round(v * 100)}%`,
                placement: 'top',
              }}
              @change=${this._onSliderChange('defaultNoiseVolume')}
            ></ui-slider>
            <p class="hint">${msg('抗噪听模式下噪音的默认音量。')}</p>
          </div>
          <div class="field">
            <span class="field-label">${this._maxVolumeBoostLabel()}</span>
            <ui-slider
              .value=${s.maxVolumeBoost}
              min=${APP_SETTINGS_PLAYER_LIMITS.maxVolumeBoost.min}
              max=${APP_SETTINGS_PLAYER_LIMITS.maxVolumeBoost.max}
              step=${APP_SETTINGS_PLAYER_LIMITS.maxVolumeBoost.step}
              .tooltip=${{
                formatter: (v: number) => `${Math.round(v * 100)}%`,
                placement: 'top',
              }}
              @change=${this._onSliderChange('maxVolumeBoost')}
            ></ui-slider>
            <p class="hint">
              ${msg('媒体播放器与录音预览的音量滑块上限。超过 100% 可能产生失真，请适度使用。')}
              ${this._maxVolumeBoostRangeHint()}
            </p>
          </div>
          <div class="field">
            <span class="field-label">${this._maxPlaybackRateLabel()}</span>
            <ui-slider
              .value=${s.maxPlaybackRate}
              min=${APP_SETTINGS_PLAYER_LIMITS.maxPlaybackRate.min}
              max=${APP_SETTINGS_PLAYER_LIMITS.maxPlaybackRate.max}
              step=${APP_SETTINGS_PLAYER_LIMITS.maxPlaybackRate.step}
              .tooltip=${{
                formatter: (v: number) => `${Number(v.toFixed(1))}x`,
                placement: 'top',
              }}
              @change=${this._onSliderChange('maxPlaybackRate')}
            ></ui-slider>
            <p class="hint">
              ${msg('媒体播放器倍速滑块与快捷键上限。超过 1x 可能产生失真，请适度使用。')}
              ${this._maxPlaybackRateRangeHint()}
            </p>
          </div>
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-player-defaults': SettingsPlayerDefaults;
  }
}
