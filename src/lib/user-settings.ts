export const USER_SETTINGS_STORAGE_KEY = 'fluent-any-lang:user-settings';

/** User-editable preferences persisted in localStorage. */
export type UserSettings = {
  /** When true, recording countdown overlay is skipped. */
  skipRecordingCountdown: boolean;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  skipRecordingCountdown: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseStoredSettings(raw: string | null): UserSettings {
  if (!raw) {
    return { ...DEFAULT_USER_SETTINGS };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return { ...DEFAULT_USER_SETTINGS };
    }

    return {
      skipRecordingCountdown:
        typeof parsed.skipRecordingCountdown === 'boolean'
          ? parsed.skipRecordingCountdown
          : DEFAULT_USER_SETTINGS.skipRecordingCountdown,
    };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function getUserSettings(): UserSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_USER_SETTINGS };
  }
  return parseStoredSettings(localStorage.getItem(USER_SETTINGS_STORAGE_KEY));
}

export function setUserSettings(partial: Partial<UserSettings>): UserSettings {
  const next = { ...getUserSettings(), ...partial };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function shouldSkipRecordingCountdown(): boolean {
  return getUserSettings().skipRecordingCountdown;
}
