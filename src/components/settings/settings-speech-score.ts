import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';

import { getAppSettings, setAppSettings } from '../../lib/app-settings.js';
import { SCORE_API_PATH } from '../../lib/pronunciation-score/constants.js';
import type { AppSettings, SpeechScoreProsodyBasis } from '../../types/models.js';
import { settingsCardStyles } from './settings-styles.js';
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
] as const;

const SCORE_API_URL_PLACEHOLDER = `https://speech.example.com${SCORE_API_PATH}`;

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

      .field-hint {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
        line-height: 1.5;
      }

      .privacy {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
        line-height: 1.5;
      }
    `,
  ];

  @state()
  private _settings: AppSettings = getAppSettings();

  private _commit(partial: Partial<AppSettings>): void {
    this._settings = setAppSettings(partial);
    Message.success(msg('已保存'));
  }

  private _onUrlChange(event: CustomEvent<InputChangeDetail>): void {
    const next = event.detail.value.trim();
    if (next === this._settings.speechScoreApiUrl) return;
    this._commit({ speechScoreApiUrl: next });
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

  private _onProsodyBasisChange(event: CustomEvent<SelectChangeDetail>): void {
    const next = String(event.detail.value) as SpeechScoreProsodyBasis;
    if (next === this._settings.speechScoreProsodyBasis) return;
    this._commit({ speechScoreProsodyBasis: next });
  }

  private _prosodyBasisHint(basis: SpeechScoreProsodyBasis): string {
    if (basis === 'match') {
      return msg(
        'Echo 会对照示范音频的节奏与语调打分，可能额外上传原声片段（已有缓存时流量更少）；取不到原声时改按自然度评。Shadowing 始终只评自然度，不受此选项影响。',
      );
    }
    return msg(
      '只根据你的录音评语速、节奏是否自然。Echo 与 Shadowing 都只上传录音，不上传原声，更省流量。',
    );
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

    const prosodyBasisOptions = [
      { value: 'naturalness', label: msg('自然度') },
      { value: 'match', label: msg('像原声') },
    ];

    return html`
      <section class="card" aria-labelledby="speech-score-heading">
        <h2 id="speech-score-heading">${msg('发音评分')}</h2>
        <p class="desc">${msg('按需将口语录音发送到评分服务，结果保存在本设备。')}</p>
        <div class="fields">
          <div class="field">
            <span class="field-label">${msg('评分接口地址')}</span>
            <ui-input
              .value=${s.speechScoreApiUrl}
              placeholder=${SCORE_API_URL_PLACEHOLDER}
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
          <div class="field">
            <span class="field-label">${msg('Echo 评分依据')}</span>
            <ui-select
              .value=${s.speechScoreProsodyBasis}
              .options=${prosodyBasisOptions}
              @change=${this._onProsodyBasisChange}
            ></ui-select>
            <p class="field-hint">${this._prosodyBasisHint(s.speechScoreProsodyBasis)}</p>
          </div>
          <p class="privacy">
            ${msg(
              '评分时会把录音上传到你配置的服务器以计算分数；选「像原声」时 Echo 还可能上传原声片段。服务端不保存音频；分数只保存在本设备。',
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
