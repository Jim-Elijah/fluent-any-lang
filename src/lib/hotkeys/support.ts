/** Devices with hover + fine pointer (typical mouse/keyboard desktop). */
export const KEYBOARD_SHORTCUTS_MQ = '(hover: hover) and (pointer: fine)';

/** True when physical keyboard shortcuts are a meaningful input modality. */
export function supportsKeyboardShortcuts(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(KEYBOARD_SHORTCUTS_MQ).matches;
}
