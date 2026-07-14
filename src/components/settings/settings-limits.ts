import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, str, localized } from '@lit/localize';

import { getAppSettings, setAppSettings } from '../../lib/app-settings.js';
import { estimateStorage } from '../../lib/export-content.js';
import { formatStorageUsage } from '../../lib/playback-utils.js';
import { APP_SETTINGS_LIMITS, type AppSettings } from '../../types/models.js';
import { settingsCardStyles } from './settings-styles.js';
import '../ui/input.js';
import type { InputChangeDetail } from '../ui/input.js';
import '../ui/message.js';
import { Message } from '../ui/message.js';

type NumericKey = keyof typeof APP_SETTINGS_LIMITS;

@customElement('settings-limits')
@localized()
export class SettingsLimits extends LitElement {
  static styles = [
    settingsCardStyles,
    css`
      .storage {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
        padding: var(--space-sm) var(--space-inline);
        border-radius: var(--radius-md, 8px);
        background: rgba(22, 119, 255, 0.06);
      }

      .storage-text {
        margin: 0;
        font-size: 0.875rem;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      }

      .storage-bar {
        height: 6px;
        border-radius: 999px;
        background: rgba(22, 119, 255, 0.12);
        overflow: hidden;
      }

      .storage-fill {
        height: 100%;
        border-radius: inherit;
        background: var(--color-primary, #1677ff);
        transition: width 0.2s ease;
      }

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

      ui-input {
        max-width: 100%;
      }
    `,
  ];

  @state()
  private _settings: AppSettings = getAppSettings();

  @state()
  private _storageText = '';

  @state()
  private _storageRatio = 0;

  connectedCallback(): void {
    super.connectedCallback();
    void this._loadStorage();
  }

  private async _loadStorage() {
    const est = await estimateStorage();
    this._storageText = msg(
      str`已用 ${formatStorageUsage(est.usage)} / 上限 ${formatStorageUsage(est.quota)}`,
    );
    this._storageRatio = est.quota > 0 ? Math.min(1, Math.max(0, est.usage / est.quota)) : 0;
  }

  private _commitNumber(key: NumericKey, raw: string) {
    const parsed = Number(raw);
    const limits = APP_SETTINGS_LIMITS[key];
    const fallback = this._settings[key];
    let value = Number.isFinite(parsed) ? parsed : fallback;
    value = Math.min(limits.max, Math.max(limits.min, value));
    if ('step' in limits && limits.step) {
      value = Math.round(value / limits.step) * limits.step;
      value = Math.min(limits.max, Math.max(limits.min, value));
    }
    const prev = this._settings[key];
    this._settings = setAppSettings({ [key]: value });
    if (value !== prev) {
      Message.success(msg('已保存'));
    }
    if (key === 'maxStorageMB') {
      void this._loadStorage();
    }
  }

  private _onNumberChange(key: NumericKey) {
    return (event: CustomEvent<InputChangeDetail>) => {
      this._commitNumber(key, event.detail.value);
    };
  }

  private _rangeHint(key: NumericKey): string {
    const { min, max } = APP_SETTINGS_LIMITS[key];
    return msg(str`允许范围 ${min}–${max}`);
  }

  private _field(key: NumericKey, label: string) {
    const limits = APP_SETTINGS_LIMITS[key];
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
    const fillPct = `${Math.round(this._storageRatio * 100)}%`;
    return html`
      <section class="card" aria-labelledby="limits-heading">
        <h2 id="limits-heading">${msg('练习与存储限额')}</h2>
        <p class="desc">${msg('调整后仅影响之后的新建录音与存储提示；不会删除已有录音。')}</p>
        ${this._storageText
          ? html`
              <div class="storage" aria-label=${msg('当前存储用量')}>
                <p class="storage-text">${this._storageText}</p>
                <div class="storage-bar" aria-hidden="true">
                  <div class="storage-fill" style=${`width: ${fillPct}`}></div>
                </div>
              </div>
            `
          : null}
        <div class="fields">
          ${this._field('maxRecordingsPerMedia', msg('单个媒体最大跟读录音数'))}
          ${this._field('maxEchoPerSegment', msg('每句最大回声录音数'))}
          ${this._field('maxStorageMB', msg('最大媒体容量（MB）'))}
          ${this._field('lowStorageThresholdPercent', msg('低存储告警阈值（%）'))}
          ${this._field('repeatPausePercent', msg('默认句间暂停百分比'))}
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-limits': SettingsLimits;
  }
}
