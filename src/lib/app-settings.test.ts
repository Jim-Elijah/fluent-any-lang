import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  APP_SETTINGS_STORAGE_KEY,
  DEFAULT_USER_SETTINGS,
  getAppSettings,
  getMaxPlaybackRate,
  getMaxVolumeBoost,
  getUserSettings,
  normalizeAppSettings,
  normalizeDiscriminationSettings,
  setAppSettings,
  setUserSettings,
  shouldSkipDiscriminationTips,
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
      defaultSleepMinutes: 0,
      defaultSourceVolume: 2,
      defaultNoiseVolume: -1,
      maxVolumeBoost: 5,
      maxPlaybackRate: 9,
    });
    expect(next.maxRecordingsPerMedia).toBe(20);
    expect(next.maxEchoPerSegment).toBe(1);
    expect(next.maxStorageMB).toBe(50);
    expect(next.lowStorageThresholdPercent).toBe(50);
    expect(next.repeatPausePercent).toBe(120);
    expect(next.defaultSleepMinutes).toBe(1);
    expect(next.defaultSourceVolume).toBe(1);
    expect(next.defaultNoiseVolume).toBe(0);
    expect(next.maxVolumeBoost).toBe(3);
    expect(next.maxPlaybackRate).toBe(4);
  });

  it('parses default loop mode', () => {
    expect(normalizeAppSettings({ defaultLoopMode: 'invalid' }).defaultLoopMode).toBe('none');
    setAppSettings({ defaultLoopMode: 'segment' });
    expect(getAppSettings().defaultLoopMode).toBe('segment');
  });

  it('parses shadowing gap policy with compress default', () => {
    expect(getAppSettings().shadowingGapPolicy).toBe('compress');
    expect(normalizeAppSettings({ shadowingGapPolicy: 'invalid' }).shadowingGapPolicy).toBe(
      'compress',
    );
    setAppSettings({ shadowingGapPolicy: 'preserve' });
    expect(getAppSettings().shadowingGapPolicy).toBe('preserve');
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

  it('does not prefill last played playlist by default', () => {
    expect(getAppSettings().lastPlayedPlaylistId).toBe('');
  });

  it('persists lastPlayedPlaylistId when provided', () => {
    setAppSettings({ lastPlayedPlaylistId: 'playlist-42' });
    expect(getAppSettings().lastPlayedPlaylistId).toBe('playlist-42');
  });

  it('persists pronunciation scoring API settings', () => {
    setAppSettings({
      speechScoreApiUrl: ' https://speech.example.com/api/v1/pronunciation/score ',
      speechScoreApiKey: ' secret ',
      speechScoreLanguage: 'en',
      speechScoreProsodyBasis: 'match',
    });
    expect(getAppSettings().speechScoreApiUrl).toBe(
      'https://speech.example.com/api/v1/pronunciation/score',
    );
    expect(getAppSettings().speechScoreApiKey).toBe('secret');
    expect(getAppSettings().speechScoreLanguage).toBe('en');
    expect(getAppSettings().speechScoreProsodyBasis).toBe('match');
  });

  it('defaults speechScoreProsodyBasis to naturalness and rejects unknown values', () => {
    expect(getAppSettings().speechScoreProsodyBasis).toBe('naturalness');
    localStorage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        speechScoreProsodyBasis: 'not-a-basis',
      }),
    );
    expect(getAppSettings().speechScoreProsodyBasis).toBe('naturalness');
  });

  it('migrates legacy speechScoreApiBaseUrl to the full v2 score path', () => {
    localStorage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        speechScoreApiBaseUrl: 'https://speech.example.com/',
      }),
    );
    expect(getAppSettings().speechScoreApiUrl).toBe(
      'https://speech.example.com/api/v2/pronunciation/score',
    );
  });

  it('keeps an already-saved v1 score URL unchanged', () => {
    localStorage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        speechScoreApiUrl: 'https://speech.example.com/api/v1/pronunciation/score',
      }),
    );
    expect(getAppSettings().speechScoreApiUrl).toBe(
      'https://speech.example.com/api/v1/pronunciation/score',
    );
  });

  it('exposes max volume boost and playback rate from persisted settings', () => {
    setAppSettings({ maxVolumeBoost: 2.5, maxPlaybackRate: 3 });
    expect(getMaxVolumeBoost()).toBe(2.5);
    expect(getMaxPlaybackRate()).toBe(3);
  });

  it('normalizes discrimination settings and merges partial updates', () => {
    const normalized = normalizeDiscriminationSettings({
      selected: [
        { noiseId: 'n1', volume: 2 },
        { noiseId: '', volume: 0.5 },
        { noiseId: 'n2', volume: 0.3 },
        { noiseId: 'n3', volume: 0.1 },
        { noiseId: 'n4', volume: 0.1 },
      ],
      ladderCount: 99,
      ladderRates: [0.3, 1.25, 9],
    });
    expect(normalized.selected).toEqual([
      { noiseId: 'n1', volume: 1 },
      { noiseId: 'n2', volume: 0.3 },
      { noiseId: 'n3', volume: 0.1 },
    ]);
    expect(normalized.ladderCount).toBe(6);
    expect(normalized.ladderRates).toHaveLength(6);

    setAppSettings({
      discrimination: {
        selected: [{ noiseId: 'rain', volume: 0.6 }],
        ladderCount: 2,
      },
    });
    const settings = getAppSettings();
    expect(settings.discrimination.selected).toEqual([{ noiseId: 'rain', volume: 0.6 }]);
    expect(settings.discrimination.ladderCount).toBe(2);
    expect(shouldSkipDiscriminationTips()).toBe(false);
    setAppSettings({ skipDiscriminationTips: true });
    expect(shouldSkipDiscriminationTips()).toBe(true);
  });

  it('returns default discrimination settings for non-object input', () => {
    expect(normalizeDiscriminationSettings(null).selected).toEqual([]);
    expect(normalizeDiscriminationSettings(undefined).ladderCount).toBe(1);
    expect(normalizeDiscriminationSettings('bad').selected).toEqual([]);
  });

  it('ignores invalid legacy user-settings payloads', () => {
    localStorage.setItem(USER_SETTINGS_STORAGE_KEY, '{bad-json');
    expect(getAppSettings()).toEqual(DEFAULT_SETTINGS);

    localStorage.clear();
    localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify('not-an-object'));
    expect(getAppSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
