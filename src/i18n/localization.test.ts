import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  LOCALE_STORAGE_KEY,
  changeLocale,
  initializeLocalization,
  isLocale,
} from './localization.js';
import { allLocales, sourceLocale, targetLocales } from '../locales/locale-codes.js';

describe('isLocale', () => {
  it('accepts source and target locale codes', () => {
    expect(isLocale(sourceLocale)).toBe(true);
    for (const locale of targetLocales) {
      expect(isLocale(locale)).toBe(true);
    }
  });

  it('rejects unknown locale codes', () => {
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('')).toBe(false);
  });
});

describe('initializeLocalization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('restores saved locale from localStorage', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    await expect(initializeLocalization()).resolves.toBeUndefined();
  });

  it('falls back to source locale when storage is empty', async () => {
    await initializeLocalization();
    const { getLocale } = await import('./localization.js');
    expect(getLocale()).toBe(sourceLocale);
  });
});

describe('changeLocale', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists locale and updates document lang', async () => {
    await changeLocale('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('locale catalog', () => {
  it('lists all supported locales', () => {
    expect(allLocales).toEqual(expect.arrayContaining([sourceLocale, ...targetLocales]));
    expect(allLocales.length).toBe(4);
  });
});
