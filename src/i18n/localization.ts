import { configureLocalization } from '@lit/localize';

import { allLocales, sourceLocale, targetLocales } from '../locales/locale-codes.js';

export type Locale = (typeof allLocales)[number];

export const LOCALE_STORAGE_KEY = 'fluent-any-lang:locale';

const localization = configureLocalization({
  sourceLocale,
  targetLocales,
  // Explicit imports so locale-codes.ts is not pulled into the dynamic glob.
  loadLocale: (locale) => {
    switch (locale) {
      case 'en':
        return import('../locales/en.js');
      case 'ja':
        return import('../locales/ja.js');
      case 'zh-TW':
        return import('../locales/zh-TW.js');
      default:
        return Promise.reject(new Error(`Unsupported locale: ${locale}`));
    }
  },
});

export const { getLocale, setLocale } = localization;

export function initializeLocalization(): Promise<void> {
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && isLocale(saved)) {
    return setLocale(saved);
  }
  return setLocale(sourceLocale);
}

export async function changeLocale(locale: Locale): Promise<void> {
  await setLocale(locale);
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.documentElement.lang = locale;
}

export function isLocale(value: string): value is Locale {
  return value === sourceLocale || (targetLocales as readonly string[]).includes(value);
}
