import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_USER_SETTINGS,
  getUserSettings,
  setUserSettings,
  shouldSkipRecordingCountdown,
  USER_SETTINGS_STORAGE_KEY,
} from './user-settings.js';

describe('user-settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns defaults when storage is empty', () => {
    expect(getUserSettings()).toEqual(DEFAULT_USER_SETTINGS);
    expect(shouldSkipRecordingCountdown()).toBe(false);
  });

  it('persists skipRecordingCountdown', () => {
    setUserSettings({ skipRecordingCountdown: true });
    expect(localStorage.getItem(USER_SETTINGS_STORAGE_KEY)).toContain('true');
    expect(getUserSettings().skipRecordingCountdown).toBe(true);
    expect(shouldSkipRecordingCountdown()).toBe(true);
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
