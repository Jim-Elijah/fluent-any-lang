import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  APP_SETTINGS_STORAGE_KEY,
  DEFAULT_USER_SETTINGS,
  getAppSettings,
  getUserSettings,
  normalizeAppSettings,
  setAppSettings,
  setUserSettings,
  shouldSkipEchoTips,
  shouldSkipRecordingCountdown,
  shouldSkipShadowingTips,
  USER_SETTINGS_STORAGE_KEY,
} from './app-settings.js';
import { DEFAULT_SETTINGS } from '../types/models.js';

describe('app-settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns defaults when storage is empty', () => {
    expect(getAppSettings()).toEqual(DEFAULT_SETTINGS);
    expect(getUserSettings()).toEqual(DEFAULT_USER_SETTINGS);
    expect(shouldSkipRecordingCountdown()).toBe(false);
    expect(shouldSkipShadowingTips()).toBe(false);
    expect(shouldSkipEchoTips()).toBe(false);
  });

  it('persists tip preferences via setAppSettings', () => {
    setAppSettings({ skipRecordingCountdown: true, skipShadowingTips: true });
    expect(getAppSettings().skipRecordingCountdown).toBe(true);
    expect(getAppSettings().skipShadowingTips).toBe(true);
    expect(shouldSkipRecordingCountdown()).toBe(true);
    expect(shouldSkipShadowingTips()).toBe(true);
  });

  it('clamps numeric settings to allowed ranges', () => {
    const next = setAppSettings({
      maxRecordingsPerMedia: 999,
      maxEchoPerSegment: 0,
      maxStorageMB: 10,
      lowStorageThresholdPercent: 99,
      repeatPausePercent: 123,
    });
    expect(next.maxRecordingsPerMedia).toBe(20);
    expect(next.maxEchoPerSegment).toBe(1);
    expect(next.maxStorageMB).toBe(50);
    expect(next.lowStorageThresholdPercent).toBe(50);
    expect(next.repeatPausePercent).toBe(120);
  });

  it('migrates legacy user-settings once', () => {
    localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ skipEchoTips: true, skipRecordingCountdown: true }),
    );
    const settings = getAppSettings();
    expect(settings.skipEchoTips).toBe(true);
    expect(settings.skipRecordingCountdown).toBe(true);
    expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)).toBeTruthy();
    expect(localStorage.getItem(USER_SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it('keeps setUserSettings compatibility', () => {
    setUserSettings({ skipShadowingTips: true, skipEchoTips: true });
    expect(getUserSettings().skipShadowingTips).toBe(true);
    expect(getUserSettings().skipEchoTips).toBe(true);
    expect(shouldSkipShadowingTips()).toBe(true);
    expect(shouldSkipEchoTips()).toBe(true);
  });

  it('falls back for invalid JSON', () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, '{not-json');
    expect(getAppSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('normalizeAppSettings clamps backup payloads', () => {
    const normalized = normalizeAppSettings({
      maxRecordingsPerMedia: 3,
      skipRecordingCountdown: true,
      unknown: true,
    });
    expect(normalized.maxRecordingsPerMedia).toBe(3);
    expect(normalized.skipRecordingCountdown).toBe(true);
    expect(normalized.maxStorageMB).toBe(DEFAULT_SETTINGS.maxStorageMB);
  });
});
