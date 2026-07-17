import { msg } from '@lit/localize';

import {
  PRACTICE_HOTKEY_BINDINGS,
  RECORDING_PREVIEW_HOTKEY_BINDINGS,
  SENTENCE_PRACTICE_HOTKEY_BINDINGS,
} from './default-map.js';
import type { HotkeyAction, HotkeyBinding, HotkeyScopeId } from './types.js';

export type HotkeyCatalogRow = {
  code: string;
  codeLabel: string;
  action: HotkeyAction;
  actionLabel: string;
};

export type HotkeyCatalogSection = {
  scopeId: HotkeyScopeId;
  title: string;
  rows: HotkeyCatalogRow[];
};

/** Discrete rates used by practice `[` / `]` hotkeys. */
export const PLAYBACK_RATE_HOTKEY_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const VOLUME_HOTKEY_STEP = 0.05;

const CODE_LABELS: Record<string, string> = {
  Space: 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  BracketLeft: '[',
  BracketRight: ']',
  KeyQ: 'Q',
  KeyW: 'W',
  KeyE: 'E',
};

export function formatHotkeyCodeLabel(code: string): string {
  const mapped = CODE_LABELS[code];
  if (mapped) {
    return mapped;
  }
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3);
  }
  return code;
}

export function getHotkeyActionLabel(action: HotkeyAction): string {
  switch (action) {
    case 'togglePlay':
      return msg('播放/暂停');
    case 'previousSegment':
      return msg('上一句');
    case 'nextSegment':
      return msg('下一句');
    case 'volumeUp':
      return msg('增大音量');
    case 'volumeDown':
      return msg('减小音量');
    case 'rateUp':
      return msg('加快倍速');
    case 'rateDown':
      return msg('减慢倍速');
    case 'playSource':
      return msg('播放原音');
    case 'playRecording':
      return msg('播放录音');
    case 'playSync':
      return msg('同步播放');
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function rowsFromBindings(bindings: readonly HotkeyBinding[]): HotkeyCatalogRow[] {
  return bindings.map((binding) => ({
    code: binding.code,
    codeLabel: formatHotkeyCodeLabel(binding.code),
    action: binding.action,
    actionLabel: getHotkeyActionLabel(binding.action),
  }));
}

/**
 * Read-only help catalog derived from the default keymap (single source of truth).
 */
export function getHotkeyCatalog(): HotkeyCatalogSection[] {
  return [
    {
      scopeId: 'practice',
      title: msg('练习播放器'),
      rows: rowsFromBindings(PRACTICE_HOTKEY_BINDINGS),
    },
    {
      scopeId: 'recording-preview',
      title: msg('录音预览'),
      rows: rowsFromBindings(RECORDING_PREVIEW_HOTKEY_BINDINGS),
    },
    {
      scopeId: 'sentence-practice',
      title: msg('句库练习'),
      rows: rowsFromBindings(SENTENCE_PRACTICE_HOTKEY_BINDINGS),
    },
  ];
}

/** Move to the next/previous discrete playback-rate step. */
export function stepPlaybackRate(current: number, direction: 1 | -1): number {
  const steps = PLAYBACK_RATE_HOTKEY_STEPS;
  if (direction > 0) {
    return steps.find((rate) => rate > current + 1e-9) ?? steps[steps.length - 1];
  }
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i] < current - 1e-9) {
      return steps[i];
    }
  }
  return steps[0];
}
