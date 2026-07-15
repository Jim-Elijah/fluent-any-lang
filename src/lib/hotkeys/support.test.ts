import { afterEach, describe, expect, it, vi } from 'vitest';

import { KEYBOARD_SHORTCUTS_MQ, supportsKeyboardShortcuts } from './support.js';

describe('supportsKeyboardShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when hover + fine pointer media query matches', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === KEYBOARD_SHORTCUTS_MQ,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(supportsKeyboardShortcuts()).toBe(true);
  });

  it('returns false on touch-primary devices', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(supportsKeyboardShortcuts()).toBe(false);
  });
});
