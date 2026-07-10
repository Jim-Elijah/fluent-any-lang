import { describe, expect, it } from 'vitest';

import { arrowStyles } from './arrow-styles.js';

describe('arrowStyles', () => {
  it('returns base arrow CSS with defaults', () => {
    const css = arrowStyles();
    expect(css).toContain('.arrow {');
    expect(css).toContain('var(--overlay-bg, rgba(0, 0, 0, 0.85))');
    expect(css).toContain('.arrow.placement-bottom');
    expect(css).toContain('.arrow.placement-top');
    expect(css).toContain('.arrow.placement-left');
    expect(css).toContain('.arrow.placement-right');
  });

  it('uses custom background variable and fallback', () => {
    const css = arrowStyles({
      backgroundVar: '--tooltip-bg',
      backgroundFallback: '#fff',
    });
    expect(css).toContain('var(--tooltip-bg, #fff)');
  });

  it('adds bordered ::after fill rules when borderColor is set', () => {
    const css = arrowStyles({ borderColor: '#ccc' });
    expect(css).toContain('.arrow.placement-bottom::after');
    expect(css).toContain('.arrow.placement-top::after');
    expect(css).toContain('.arrow.placement-left::after');
    expect(css).toContain('.arrow.placement-right::after');
    expect(css).toContain('#ccc');
  });

  it('omits placement-specific ::after fill rules when borderColor is omitted', () => {
    const css = arrowStyles();
    expect(css).not.toContain('.arrow.placement-bottom::after');
    expect(css).not.toContain('.arrow.placement-top::after');
  });
});
