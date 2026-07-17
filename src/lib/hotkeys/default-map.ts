import type { HotkeyAction, HotkeyBinding, HotkeyScopeId } from './types.js';

export const PRACTICE_HOTKEY_BINDINGS: readonly HotkeyBinding[] = [
  { code: 'Space', action: 'togglePlay' },
  { code: 'ArrowLeft', action: 'previousSegment' },
  { code: 'ArrowRight', action: 'nextSegment' },
  { code: 'ArrowUp', action: 'volumeUp' },
  { code: 'ArrowDown', action: 'volumeDown' },
  { code: 'BracketLeft', action: 'rateDown' },
  { code: 'BracketRight', action: 'rateUp' },
] as const;

export const RECORDING_PREVIEW_HOTKEY_BINDINGS: readonly HotkeyBinding[] = [
  { code: 'KeyQ', action: 'playSource' },
  { code: 'KeyW', action: 'playRecording' },
  { code: 'KeyE', action: 'playSync' },
  { code: 'Space', action: 'togglePlay' },
  { code: 'ArrowLeft', action: 'previousSegment' },
  { code: 'ArrowRight', action: 'nextSegment' },
  { code: 'ArrowUp', action: 'volumeUp' },
  { code: 'ArrowDown', action: 'volumeDown' },
] as const;

export const SENTENCE_PRACTICE_HOTKEY_BINDINGS: readonly HotkeyBinding[] = [
  { code: 'Space', action: 'togglePlay' },
  { code: 'ArrowUp', action: 'volumeUp' },
  { code: 'ArrowDown', action: 'volumeDown' },
  { code: 'BracketLeft', action: 'rateDown' },
  { code: 'BracketRight', action: 'rateUp' },
] as const;

const SCOPE_BINDINGS: Record<HotkeyScopeId, readonly HotkeyBinding[]> = {
  practice: PRACTICE_HOTKEY_BINDINGS,
  'recording-preview': RECORDING_PREVIEW_HOTKEY_BINDINGS,
  'sentence-practice': SENTENCE_PRACTICE_HOTKEY_BINDINGS,
};

export function getBindingsForScope(scopeId: HotkeyScopeId): readonly HotkeyBinding[] {
  return SCOPE_BINDINGS[scopeId];
}

export function findActionForCode(scopeId: HotkeyScopeId, code: string): HotkeyAction | undefined {
  return getBindingsForScope(scopeId).find((binding) => binding.code === code)?.action;
}
