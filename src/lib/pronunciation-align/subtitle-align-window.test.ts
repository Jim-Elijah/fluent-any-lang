import { describe, expect, it } from 'vitest';

import {
  resolveSubtitleAlignWindow,
  subtitleAlignWindowDurationSec,
} from './subtitle-align-window.js';

describe('resolveSubtitleAlignWindow', () => {
  it('uses first and last timed segments with reference text', () => {
    const window = resolveSubtitleAlignWindow([
      { startTime: 10, endTime: 12, text: 'A' },
      { startTime: 5, endTime: 8, text: 'B' },
      { startTime: 20, endTime: 24, text: 'C' },
    ]);
    expect(window).toEqual({ startTime: 5, endTime: 24 });
    expect(subtitleAlignWindowDurationSec(window!)).toBe(19);
  });

  it('ignores empty lines', () => {
    const window = resolveSubtitleAlignWindow([
      { startTime: 0, endTime: 2, text: '   ' },
      { startTime: 100, endTime: 104, text: 'Hi' },
    ]);
    expect(window).toEqual({ startTime: 100, endTime: 104 });
  });

  it('returns null when no reference text', () => {
    expect(
      resolveSubtitleAlignWindow([{ startTime: 0, endTime: 2, text: '' }]),
    ).toBeNull();
  });
});
