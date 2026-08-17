import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, str, localized } from '@lit/localize';

import { getAppSettings, setAppSettings } from '../../lib/app-settings.js';
import { checkSpeechScoreHealth } from '../../lib/pronunciation-score/client.js';
import type { AppSettings } from '../../types/models.js';
import { settingsCardStyles } from './settings-styles.js';
import '../ui/button.js';
import '../ui/input.js';
import type { InputChangeDetail } from '../ui/input.js';
import '../ui/select.js';
import type { SelectChangeDetail } from '../ui/select.js';
import '../ui/message.js';
import { Message } from '../ui/message.js';

const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'auto' },
  { value: 'en', label: 'en' },
  { value: 'zh', label: 'zh' },
  { value: 'ja', label: 'ja' },
  { value: 'ko', label: 'ko' },
] as const;

@customElement('settings-speech-score')
@localized()
export class SettingsSpeechScore extends LitElement {
  static styles = [
    settingsCardStyles,
    css`
      .fields {
        display: flex;
        flex-direction: column;
        gap: var(--space-block);
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

      .privacy {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
        line-height: 1.5;
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
  private _settings: AppSettings = getAppSettings();

  @state()
  private _testing = false;

  private _commit(partial: Partial<AppSettings>): void {
    this._settings = setAppSettings(partial);
    Message.success(msg('已保存'));
  }

  private _onUrlChange(event: CustomEvent<InputChangeDetail>): void {
    const next = event.detail.value.trim();
    if (next === this._settings.speechScoreApiBaseUrl) return;
    this._commit({ speechScoreApiBaseUrl: next });
  }

  private _onKeyChange(event: CustomEvent<InputChangeDetail>): void {
    const next = event.detail.value.trim();
    if (next === this._settings.speechScoreApiKey) return;
    this._commit({ speechScoreApiKey: next });
  }

  private _onLanguageChange(event: CustomEvent<SelectChangeDetail>): void {
    const next = String(event.detail.value);
    if (next === this._settings.speechScoreLanguage) return;
    this._commit({ speechScoreLanguage: next });
  }

  private async _onTestConnection(): Promise<void> {
    const baseUrl = this._settings.speechScoreApiBaseUrl.trim();
    if (!baseUrl) {
      Message.warning(msg('请先填写评分服务地址'));
      return;
    }
    this._testing = true;
    try {
      const health = await checkSpeechScoreHealth(baseUrl);
      if (health.status === 'ok') {
        Message.success(
          msg(str`连接成功（${health.device}${health.model_loaded ? '，模型已加载' : ''}）`),
        );
      } else {
        Message.warning(msg(str`服务响应：${health.status}`));
      }
    } catch (error) {
      Message.error(error instanceof Error ? error.message : msg('无法连接评分服务'));
    } finally {
      this._testing = false;
    }
  }

  render() {
    const s = this._settings;
    const languageOptions: Array<{ value: string; label: string }> = LANGUAGE_OPTIONS.map(
      (option) => ({
        value: option.value,
        label: option.value === 'auto' ? msg('自动检测') : option.label,
      }),
    );
    if (!languageOptions.some((option) => option.value === s.speechScoreLanguage)) {
      languageOptions.push({ value: s.speechScoreLanguage, label: s.speechScoreLanguage });
    }

    return html`
      <section class="card" aria-labelledby="speech-score-heading">
        <h2 id="speech-score-heading">${msg('发音评分')}</h2>
        <p class="desc">${msg('按需将口语录音发送到评分服务，结果保存在本设备。')}</p>
        <div class="fields">
          <div class="field">
            <span class="field-label">${msg('API 地址')}</span>
            <ui-input
              .value=${s.speechScoreApiBaseUrl}
              placeholder="https://speech.example.com"
              autocomplete="url"
              @change=${this._onUrlChange}
            ></ui-input>
          </div>
          <div class="field">
            <span class="field-label">${msg('API Key')}</span>
            <ui-input-password
              .value=${s.speechScoreApiKey}
              autocomplete="off"
              @change=${this._onKeyChange}
            ></ui-input-password>
          </div>
          <div class="field">
            <span class="field-label">${msg('默认语言')}</span>
            <ui-select
              .value=${s.speechScoreLanguage}
              .options=${languageOptions}
              @change=${this._onLanguageChange}
            ></ui-select>
          </div>
          <div class="actions">
            <ui-button
              variant="secondary"
              ?disabled=${this._testing}
              @click=${() => this._onTestConnection()}
            >
              ${this._testing ? msg('测试中…') : msg('测试连接')}
            </ui-button>
          </div>
          <p class="privacy">
            ${msg(
              '评分时录音会上传到上述服务器用于计算分数；服务端不保存音频。结果只存在本设备的 IndexedDB。',
            )}
          </p>
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-speech-score': SettingsSpeechScore;
  }
}
