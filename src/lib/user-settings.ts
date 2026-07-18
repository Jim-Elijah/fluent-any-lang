/** @deprecated Import from `./app-settings.js` instead. Re-exports for compatibility. */
export {
  USER_SETTINGS_STORAGE_KEY,
  APP_SETTINGS_STORAGE_KEY,
  DEFAULT_USER_SETTINGS,
  getUserSettings,
  setUserSettings,
  getAppSettings,
  setAppSettings,
  shouldSkipRecordingCountdown,
  shouldSkipShadowingTips,
  shouldSkipEchoTips,
  shouldSkipDiscriminationTips,
  type UserSettings,
} from './app-settings.js';
