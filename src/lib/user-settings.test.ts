import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_USER_SETTINGS,
  getUserSettings,
  setUserSettings,
  shouldSkipEchoTips,
  shouldSkipRecordingCountdown,
  shouldSkipShadowingTips,
  USER_SETTINGS_STORAGE_KEY,
} from './user-settings.js';

describe('user-settings (compat)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns defaults when storage is empty', () => {
    expect(getUserSettings()).toEqual(DEFAULT_USER_SETTINGS);
    expect(shouldSkipRecordingCountdown()).toBe(false);
    expect(shouldSkipShadowingTips()).toBe(false);
    expect(shouldSkipEchoTips()).toBe(false);
  });

  it('persists skipRecordingCountdown', () => {
    setUserSettings({ skipRecordingCountdown: true });
    expect(getUserSettings().skipRecordingCountdown).toBe(true);
    expect(shouldSkipRecordingCountdown()).toBe(true);
  });

  it('persists tip skip preferences', () => {
    setUserSettings({ skipShadowingTips: true, skipEchoTips: true });
    expect(getUserSettings().skipShadowingTips).toBe(true);
    expect(getUserSettings().skipEchoTips).toBe(true);
    expect(shouldSkipShadowingTips()).toBe(true);
    expect(shouldSkipEchoTips()).toBe(true);
  });

  it('falls back to defaults for invalid JSON', () => {
    localStorage.setItem(USER_SETTINGS_STORAGE_KEY, '{not-json');
    expect(getUserSettings()).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('falls back to defaults for invalid shape', () => {
    localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify({ other: true }));
    expect(getUserSettings()).toEqual(DEFAULT_USER_SETTINGS);
  });
});
