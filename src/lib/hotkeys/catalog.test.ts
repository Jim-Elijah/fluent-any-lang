import { describe, expect, it } from 'vitest';

import {
  PLAYBACK_RATE_HOTKEY_STEPS,
  formatHotkeyCodeLabel,
  getHotkeyCatalog,
  stepPlaybackRate,
} from './catalog.js';
import { PRACTICE_HOTKEY_BINDINGS, RECORDING_PREVIEW_HOTKEY_BINDINGS } from './default-map.js';

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
  });
});

describe('getHotkeyCatalog', () => {
  it('has practice and recording-preview sections derived from default map', () => {
    const catalog = getHotkeyCatalog();

    const practice = catalog.find((section) => section.scopeId === 'practice');
    const preview = catalog.find((section) => section.scopeId === 'recording-preview');

    expect(practice?.rows).toHaveLength(PRACTICE_HOTKEY_BINDINGS.length);
    expect(preview?.rows).toHaveLength(RECORDING_PREVIEW_HOTKEY_BINDINGS.length);

    expect(practice?.rows.map((row) => row.code)).toEqual(
      PRACTICE_HOTKEY_BINDINGS.map((binding) => binding.code),
    );
    expect(preview?.rows.map((row) => row.code)).toEqual(
      RECORDING_PREVIEW_HOTKEY_BINDINGS.map((binding) => binding.code),
    );
    expect(practice?.rows.every((row) => row.codeLabel && row.actionLabel)).toBe(true);
  });
});

describe('stepPlaybackRate', () => {
  it('steps within PLAYBACK_RATE_HOTKEY_STEPS and clamps at ends', () => {
    expect(stepPlaybackRate(1, 1)).toBe(1.25);
    expect(stepPlaybackRate(1, -1)).toBe(0.75);
    expect(stepPlaybackRate(PLAYBACK_RATE_HOTKEY_STEPS[0], -1)).toBe(PLAYBACK_RATE_HOTKEY_STEPS[0]);
    expect(stepPlaybackRate(PLAYBACK_RATE_HOTKEY_STEPS.at(-1)!, 1)).toBe(
      PLAYBACK_RATE_HOTKEY_STEPS.at(-1),
    );
    expect(stepPlaybackRate(1.1, 1)).toBe(1.25);
    expect(stepPlaybackRate(1.1, -1)).toBe(1);
  });
});
