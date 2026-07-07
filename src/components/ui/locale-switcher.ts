import { msg, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { changeLocale } from '../../i18n/localization.js';
import type { Locale } from '../../i18n/localization.js';
import { allLocales, sourceLocale } from '../../locales/locale-codes.js';
import './select.js';
import { SelectChangeDetail } from './select.js';

@customElement('locale-switcher')
@localized()
export class LocaleSwitcher extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
    }

    select {
      padding: 4px 8px;
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface, #fff);
      color: inherit;
      cursor: pointer;
    }

    select:hover {
      border-color: var(--color-primary, #1677ff);
    }

    select:focus-visible {
      outline: 2px solid var(--color-primary, #1677ff);
      outline-offset: 1px;
    }
  `;

  @property({ type: String })
  value: Locale = sourceLocale;

  private readonly _localeLabels: Record<Locale, string> = {
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    en: 'English',
    ja: '日本語',
  };

  private _handleChange(event: CustomEvent<SelectChangeDetail>): void {
    const locale = event.detail.value as Locale;
    void changeLocale(locale).then(() => {
      this.value = locale;
    });
  }

  render() {
    const options = allLocales.map((locale) => ({
      value: locale,
      label: this._localeLabels[locale],
    }));
    return html` <ui-select
      aria-label="${msg('语言')}"
      .value=${this.value}
      .options=${options}
      @change=${this._handleChange}
    ></ui-select>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'locale-switcher': LocaleSwitcher;
  }
}
