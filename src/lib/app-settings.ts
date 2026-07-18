import {
  APP_SETTINGS_LIMITS,
  DEFAULT_DISCRIMINATION_SETTINGS,
  DEFAULT_SETTINGS,
  DISCRIMINATION_LADDER_COUNT_MAX,
  DISCRIMINATION_LADDER_COUNT_MIN,
  DISCRIMINATION_MAX_NOISE_TRACKS,
  DISCRIMINATION_RATE_STEPS,
  type AppSettings,
  type DiscriminationNoiseSelection,
  type DiscriminationSettings,
} from '../types/models.js';

export const APP_SETTINGS_STORAGE_KEY = 'fluent-any-lang:app-settings';

/** Legacy tip-only prefs key; migrated once into APP_SETTINGS_STORAGE_KEY. */
export const USER_SETTINGS_STORAGE_KEY = 'fluent-any-lang:user-settings';

export type UserSettings = Pick<
  AppSettings,
  'skipRecordingCountdown' | 'skipShadowingTips' | 'skipEchoTips' | 'skipDiscriminationTips'
>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  skipRecordingCountdown: DEFAULT_SETTINGS.skipRecordingCountdown,
  skipShadowingTips: DEFAULT_SETTINGS.skipShadowingTips,
  skipEchoTips: DEFAULT_SETTINGS.skipEchoTips,
  skipDiscriminationTips: DEFAULT_SETTINGS.skipDiscriminationTips,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  step?: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  let n = Math.min(max, Math.max(min, value));
  if (step && step > 0) {
    n = Math.round(n / step) * step;
    n = Math.min(max, Math.max(min, n));
  }
  return n;
}

function snapRate(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const steps: readonly number[] = DISCRIMINATION_RATE_STEPS;
  let best = steps[0];
  let bestDist = Math.abs(value - best);
  for (const step of steps) {
    const dist = Math.abs(value - step);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}

function parseDiscriminationSelection(raw: unknown): DiscriminationNoiseSelection[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: DiscriminationNoiseSelection[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.noiseId !== 'string' || !entry.noiseId) {
      continue;
    }
    out.push({
      noiseId: entry.noiseId,
      volume: clampNumber(entry.volume, 0.5, 0, 1),
    });
    if (out.length >= DISCRIMINATION_MAX_NOISE_TRACKS) {
      break;
    }
  }
  return out;
}

export function normalizeDiscriminationSettings(raw: unknown): DiscriminationSettings {
  const defaults = DEFAULT_DISCRIMINATION_SETTINGS;
  if (!isRecord(raw)) {
    return {
      selected: [],
      ladderCount: defaults.ladderCount,
      ladderRates: [...defaults.ladderRates],
    };
  }

  const ladderCount = clampNumber(
    raw.ladderCount,
    defaults.ladderCount,
    DISCRIMINATION_LADDER_COUNT_MIN,
    DISCRIMINATION_LADDER_COUNT_MAX,
  );

  const rawRates = Array.isArray(raw.ladderRates) ? raw.ladderRates : [];
  const ladderRates: number[] = [];
  for (let i = 0; i < ladderCount; i += 1) {
    ladderRates.push(snapRate(rawRates[i], defaults.ladderRates[0] ?? 1));
  }

  return {
    selected: parseDiscriminationSelection(raw.selected),
    ladderCount,
    ladderRates,
  };
}

function parseAppSettings(raw: unknown): AppSettings {
  if (!isRecord(raw)) {
    return {
      ...DEFAULT_SETTINGS,
      discrimination: {
        selected: [],
        ladderCount: DEFAULT_DISCRIMINATION_SETTINGS.ladderCount,
        ladderRates: [...DEFAULT_DISCRIMINATION_SETTINGS.ladderRates],
      },
    };
  }

  const limits = APP_SETTINGS_LIMITS;
  return {
    maxRecordingsPerMedia: clampNumber(
      raw.maxRecordingsPerMedia,
      DEFAULT_SETTINGS.maxRecordingsPerMedia,
      limits.maxRecordingsPerMedia.min,
      limits.maxRecordingsPerMedia.max,
    ),
    maxEchoPerSegment: clampNumber(
      raw.maxEchoPerSegment,
      DEFAULT_SETTINGS.maxEchoPerSegment,
      limits.maxEchoPerSegment.min,
      limits.maxEchoPerSegment.max,
    ),
    maxStorageMB: clampNumber(
      raw.maxStorageMB,
      DEFAULT_SETTINGS.maxStorageMB,
      limits.maxStorageMB.min,
      limits.maxStorageMB.max,
    ),
    lowStorageThresholdPercent: clampNumber(
      raw.lowStorageThresholdPercent,
      DEFAULT_SETTINGS.lowStorageThresholdPercent,
      limits.lowStorageThresholdPercent.min,
      limits.lowStorageThresholdPercent.max,
    ),
    repeatPausePercent: clampNumber(
      raw.repeatPausePercent,
      DEFAULT_SETTINGS.repeatPausePercent,
      limits.repeatPausePercent.min,
      limits.repeatPausePercent.max,
      limits.repeatPausePercent.step,
    ),
    skipRecordingCountdown: parseBoolean(
      raw.skipRecordingCountdown,
      DEFAULT_SETTINGS.skipRecordingCountdown,
    ),
    skipShadowingTips: parseBoolean(raw.skipShadowingTips, DEFAULT_SETTINGS.skipShadowingTips),
    skipEchoTips: parseBoolean(raw.skipEchoTips, DEFAULT_SETTINGS.skipEchoTips),
    skipDiscriminationTips: parseBoolean(
      raw.skipDiscriminationTips,
      DEFAULT_SETTINGS.skipDiscriminationTips,
    ),
    lastPlayedPlaylistId:
      typeof raw.lastPlayedPlaylistId === 'string'
        ? raw.lastPlayedPlaylistId
        : DEFAULT_SETTINGS.lastPlayedPlaylistId,
    discrimination: normalizeDiscriminationSettings(raw.discrimination),
  };
}

function readLocalStorage(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota / private mode — keep in-memory behavior via return value of setters.
  }
}

function removeLocalStorage(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function loadLegacyUserSettings(): Partial<UserSettings> | null {
  const raw = readLocalStorage(USER_SETTINGS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    return {
      skipRecordingCountdown: parseBoolean(
        parsed.skipRecordingCountdown,
        DEFAULT_SETTINGS.skipRecordingCountdown,
      ),
      skipShadowingTips: parseBoolean(parsed.skipShadowingTips, DEFAULT_SETTINGS.skipShadowingTips),
      skipEchoTips: parseBoolean(parsed.skipEchoTips, DEFAULT_SETTINGS.skipEchoTips),
    };
  } catch {
    return null;
  }
}

/** Normalize and clamp a partial settings object (e.g. from backup import). */
export function normalizeAppSettings(raw: unknown): AppSettings {
  return parseAppSettings(raw);
}

export function getAppSettings(): AppSettings {
  const stored = readLocalStorage(APP_SETTINGS_STORAGE_KEY);
  if (stored) {
    try {
      return parseAppSettings(JSON.parse(stored));
    } catch {
      return parseAppSettings(null);
    }
  }

  const legacy = loadLegacyUserSettings();
  if (legacy) {
    const migrated = parseAppSettings({ ...DEFAULT_SETTINGS, ...legacy });
    writeLocalStorage(APP_SETTINGS_STORAGE_KEY, JSON.stringify(migrated));
    removeLocalStorage(USER_SETTINGS_STORAGE_KEY);
    return migrated;
  }

  return parseAppSettings(null);
}

export function setAppSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const merged: Record<string, unknown> = { ...current, ...partial };
  if (partial.discrimination) {
    merged.discrimination = {
      ...current.discrimination,
      ...partial.discrimination,
    };
  }
  const next = parseAppSettings(merged);
  writeLocalStorage(APP_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** @deprecated Prefer getAppSettings(); kept for tip-field consumers. */
export function getUserSettings(): UserSettings {
  const s = getAppSettings();
  return {
    skipRecordingCountdown: s.skipRecordingCountdown,
    skipShadowingTips: s.skipShadowingTips,
    skipEchoTips: s.skipEchoTips,
    skipDiscriminationTips: s.skipDiscriminationTips,
  };
}

/** @deprecated Prefer setAppSettings(); kept for tip-field consumers. */
export function setUserSettings(partial: Partial<UserSettings>): UserSettings {
  const next = setAppSettings(partial);
  return {
    skipRecordingCountdown: next.skipRecordingCountdown,
    skipShadowingTips: next.skipShadowingTips,
    skipEchoTips: next.skipEchoTips,
    skipDiscriminationTips: next.skipDiscriminationTips,
  };
}

export function shouldSkipRecordingCountdown(): boolean {
  return getAppSettings().skipRecordingCountdown;
}

export function shouldSkipShadowingTips(): boolean {
  return getAppSettings().skipShadowingTips;
}

export function shouldSkipEchoTips(): boolean {
  return getAppSettings().skipEchoTips;
}

export function shouldSkipDiscriminationTips(): boolean {
  return getAppSettings().skipDiscriminationTips;
}
