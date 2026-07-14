export type {
  HotkeyAction,
  HotkeyBinding,
  HotkeyHandler,
  HotkeyScope,
  HotkeyScopeId,
} from './types.js';
export { shouldIgnoreHotkey } from './guards.js';
export {
  PRACTICE_HOTKEY_BINDINGS,
  RECORDING_PREVIEW_HOTKEY_BINDINGS,
  findActionForCode,
  getBindingsForScope,
} from './default-map.js';
export { HotkeyManager, getHotkeyManager, setHotkeyManagerForTests } from './hotkey-manager.js';
export type { HotkeyCatalogRow, HotkeyCatalogSection } from './catalog.js';
export {
  PLAYBACK_RATE_HOTKEY_STEPS,
  VOLUME_HOTKEY_STEP,
  formatHotkeyCodeLabel,
  getHotkeyActionLabel,
  getHotkeyCatalog,
  stepPlaybackRate,
} from './catalog.js';
