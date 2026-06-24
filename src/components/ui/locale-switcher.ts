import { msg, updateWhenLocaleChanges } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { changeLocale } from '../../i18n/localization.js';
import type { Locale } from '../../i18n/localization.js';
import { sourceLocale, targetLocales } from '../../locales/locale-codes.js';

@customElement('locale-switcher')
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

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  private readonly _localeLabels: Record<Locale, string> = {
    'zh-CN': '中文',
    en: 'English',
  };

  private _handleChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const locale = select.value as Locale;
    console.log('locale-switcher _handleChange', locale);
    void changeLocale(locale).then(() => {
      this.value = locale;
    });
  }

  render() {
    const locales: Locale[] = [sourceLocale, ...targetLocales];

    return html`
      <select .value="${this.value}" @change="${this._handleChange}" aria-label="${msg('语言')}">
        ${locales.map(
          (locale) => html` <option value="${locale}">${this._localeLabels[locale]}</option> `,
        )}
      </select>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'locale-switcher': LocaleSwitcher;
  }
}
