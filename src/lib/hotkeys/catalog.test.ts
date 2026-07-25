import { describe, expect, it } from 'vitest';

import { formatHotkeyCodeLabel, getHotkeyCatalog } from './catalog.js';
import {
  PRACTICE_HOTKEY_BINDINGS,
  RECORDING_PREVIEW_HOTKEY_BINDINGS,
  SENTENCE_PRACTICE_HOTKEY_BINDINGS,
} from './default-map.js';

describe('formatHotkeyCodeLabel', () => {
  it('maps common codes to display labels', () => {
    expect(formatHotkeyCodeLabel('Space')).toBe('Space');
    expect(formatHotkeyCodeLabel('ArrowLeft')).toBe('←');
    expect(formatHotkeyCodeLabel('ArrowRight')).toBe('→');
    expect(formatHotkeyCodeLabel('ArrowUp')).toBe('↑');
    expect(formatHotkeyCodeLabel('ArrowDown')).toBe('↓');
    expect(formatHotkeyCodeLabel('BracketLeft')).toBe('[');
    expect(formatHotkeyCodeLabel('BracketRight')).toBe(']');
    expect(formatHotkeyCodeLabel('KeyQ')).toBe('Q');
    expect(formatHotkeyCodeLabel('KeyR')).toBe('R');
  });
});

describe('getHotkeyCatalog', () => {
  it('merges shared bindings first and annotates scope-specific rows', () => {
    const catalog = getHotkeyCatalog(['practice', 'recording-preview']);

    const sharedCodes = PRACTICE_HOTKEY_BINDINGS.filter((binding) =>
      RECORDING_PREVIEW_HOTKEY_BINDINGS.some(
        (preview) => preview.code === binding.code && preview.action === binding.action,
      ),
    ).map((binding) => binding.code);

    const codes = catalog.map((row) => row.code);
    expect(codes.slice(0, sharedCodes.length)).toEqual(sharedCodes);

    const practiceOnly = catalog.filter((row) => row.scopeNote === '练习播放器');
    expect(practiceOnly.map((row) => row.code)).toEqual([
      'BracketLeft',
      'BracketRight',
      'KeyC',
      'KeyT',
      'KeyF',
      'KeyH',
    ]);
    const previewOnly = catalog.filter((row) => row.scopeNote === '录音预览');
    expect(previewOnly.map((row) => row.code)).toEqual(['KeyQ', 'KeyW', 'KeyE']);

    expect(catalog.filter((row) => !row.scopeNote)).toHaveLength(sharedCodes.length);
    expect(catalog.every((row) => row.codeLabel && row.actionLabel)).toBe(true);
  });

  it('omits scope notes when a single scope is requested', () => {
    const catalog = getHotkeyCatalog(['sentence-practice']);

    expect(catalog).toHaveLength(SENTENCE_PRACTICE_HOTKEY_BINDINGS.length);
    expect(catalog.map((row) => row.code)).toEqual(
      SENTENCE_PRACTICE_HOTKEY_BINDINGS.map((binding) => binding.code),
    );
    expect(catalog.every((row) => row.scopeNote === undefined)).toBe(true);
  });

  it('returns an empty list for empty scopes', () => {
    expect(getHotkeyCatalog([])).toEqual([]);
  });
});
