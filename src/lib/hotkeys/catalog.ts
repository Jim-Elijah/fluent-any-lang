import { msg } from '@lit/localize';

import { getBindingsForScope } from './default-map.js';
import type { HotkeyAction, HotkeyScopeId } from './types.js';

export type HotkeyCatalogRow = {
  code: string;
  codeLabel: string;
  action: HotkeyAction;
  actionLabel: string;
  /**
   * Present when this binding only applies in a subset of the requested scopes
   * (e.g. recording-preview-only Q/W/E while viewing the media practice help).
   */
  scopeNote?: string;
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
  KeyR: 'R',
};

function getHotkeyScopeTitle(scopeId: HotkeyScopeId): string {
  switch (scopeId) {
    case 'practice':
      return msg('练习播放器');
    case 'recording-preview':
      return msg('录音预览');
    case 'sentence-practice':
      return msg('句库练习');
    default: {
      const _exhaustive: never = scopeId;
      return _exhaustive;
    }
  }
}

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
    case 'replaySegment':
      return msg('重播本句');
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
    case 'toggleSubtitles':
      return msg('显示/隐藏字幕');
    case 'toggleTranslation':
      return msg('显示/隐藏翻译');
    case 'toggleSubtitleFullscreen':
      return msg('字幕全屏/退出');
    case 'toggleHotkeysHelp':
      return msg('快捷键说明');
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

type CatalogEntry = {
  code: string;
  action: HotkeyAction;
  scopeIds: HotkeyScopeId[];
};

function bindingKey(code: string, action: HotkeyAction): string {
  return `${code}\0${action}`;
}

/**
 * Read-only help rows derived from the default keymap for the given scopes.
 * Shared code+action bindings are merged and listed first; scope-specific ones follow.
 */
export function getHotkeyCatalog(scopes: readonly HotkeyScopeId[]): HotkeyCatalogRow[] {
  if (scopes.length === 0) {
    return [];
  }

  const uniqueScopes = [...new Set(scopes)];
  const entries = new Map<string, CatalogEntry>();
  const order: string[] = [];

  for (const scopeId of uniqueScopes) {
    for (const binding of getBindingsForScope(scopeId)) {
      const key = bindingKey(binding.code, binding.action);
      const existing = entries.get(key);
      if (existing) {
        if (!existing.scopeIds.includes(scopeId)) {
          existing.scopeIds.push(scopeId);
        }
        continue;
      }
      entries.set(key, {
        code: binding.code,
        action: binding.action,
        scopeIds: [scopeId],
      });
      order.push(key);
    }
  }

  const shared: CatalogEntry[] = [];
  const scoped: CatalogEntry[] = [];
  for (const key of order) {
    const entry = entries.get(key)!;
    if (entry.scopeIds.length === uniqueScopes.length) {
      shared.push(entry);
    } else {
      scoped.push(entry);
    }
  }

  const annotateScope = uniqueScopes.length > 1;

  return [...shared, ...scoped].map((entry) => {
    const row: HotkeyCatalogRow = {
      code: entry.code,
      codeLabel: formatHotkeyCodeLabel(entry.code),
      action: entry.action,
      actionLabel: getHotkeyActionLabel(entry.action),
    };
    if (annotateScope && entry.scopeIds.length < uniqueScopes.length) {
      row.scopeNote = entry.scopeIds.map((id) => getHotkeyScopeTitle(id)).join(' / ');
    }
    return row;
  });
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
