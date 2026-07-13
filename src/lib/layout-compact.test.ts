import { describe, expect, it } from 'vitest';

import { gapPx, measurePageViewportHeight, sumOffsetHeights } from './layout-compact.js';

describe('layout-compact', () => {
  it('sums HTMLElement offset heights only', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    Object.defineProperty(a, 'offsetHeight', { value: 40 });
    Object.defineProperty(b, 'offsetHeight', { value: 60 });
    expect(sumOffsetHeights([a, document.createTextNode('x'), b])).toBe(100);
  });

  it('returns 0 when page is not under main-content', () => {
    const host = document.createElement('div');
    document.body.append(host);
    expect(measurePageViewportHeight(host)).toBe(0);
    host.remove();
  });

  it('measures main-content viewport below header', () => {
    const mainContent = document.createElement('div');
    const header = document.createElement('header');
    const main = document.createElement('main');
    const host = document.createElement('div');
    mainContent.append(header, main);
    main.append(host);
    document.body.append(mainContent);

    Object.defineProperty(mainContent, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(header, 'offsetHeight', { value: 56, configurable: true });
    mainContent.style.paddingTop = '12px';
    mainContent.style.paddingBottom = '12px';
    header.style.marginBottom = '20px';

    // jsdom may not resolve computed padding; tolerate 800 - 56 or with pads/margins
    const measured = measurePageViewportHeight(host);
    expect(measured).toBeGreaterThan(0);
    expect(measured).toBeLessThanOrEqual(800 - 56);

    mainContent.remove();
  });

  it('reads gap with fallback', () => {
    const el = document.createElement('div');
    el.style.display = 'flex';
    el.style.gap = '24px';
    document.body.append(el);
    expect(gapPx(el, 16)).toBe(24);
    expect(gapPx(null, 16)).toBe(16);
    el.remove();
  });
});
