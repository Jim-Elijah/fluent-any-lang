import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  arrowSideForPlacement,
  computePlacement12,
  computePlacement4,
  flipSide,
  parsePlacement,
  type DropdownPlacement,
} from './placement.js';

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockContainerRect(
  el: HTMLElement,
  rect: { left?: number; top?: number; width?: number; height?: number },
) {
  const left = rect.left ?? 0;
  const top = rect.top ?? 0;
  const width = rect.width ?? 800;
  const height = rect.height ?? 600;
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(domRect(left, top, width, height));
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  Object.defineProperty(el, 'scrollLeft', { value: 0, writable: true, configurable: true });
  Object.defineProperty(el, 'scrollTop', { value: 0, writable: true, configurable: true });
}

describe('parsePlacement', () => {
  it.each([
    ['top', { side: 'top', align: 'center' }],
    ['bottom', { side: 'bottom', align: 'center' }],
    ['left', { side: 'left', align: 'center' }],
    ['right', { side: 'right', align: 'center' }],
    ['topLeft', { side: 'top', align: 'start' }],
    ['topRight', { side: 'top', align: 'end' }],
    ['bottomLeft', { side: 'bottom', align: 'start' }],
    ['bottomRight', { side: 'bottom', align: 'end' }],
    ['leftTop', { side: 'left', align: 'start' }],
    ['leftBottom', { side: 'left', align: 'end' }],
    ['rightTop', { side: 'right', align: 'start' }],
    ['rightBottom', { side: 'right', align: 'end' }],
  ] as const)('parses %s', (placement, expected) => {
    expect(parsePlacement(placement)).toEqual(expected);
  });
});

describe('flipSide', () => {
  it.each([
    ['top', 'bottom'],
    ['bottom', 'top'],
    ['left', 'right'],
    ['right', 'left'],
  ] as const)('flips %s to %s', (side, flipped) => {
    expect(flipSide(side)).toBe(flipped);
    expect(arrowSideForPlacement(side)).toBe(flipped);
  });
});

describe('computePlacement4', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('places popup below trigger on body container', () => {
    const triggerRect = domRect(100, 50, 80, 24);
    const result = computePlacement4({
      placement: 'bottom',
      triggerRect,
      popupWidth: 120,
      popupHeight: 40,
      gap: 8,
      container: document.body,
    });

    expect(result.inContainer).toBe(false);
    expect(result.top).toBe(82);
    expect(result.left).toBe(80);
    expect(result.popupWidth).toBe(120);
    expect(result.arrow.top).toBe('-5px');
  });

  it('aligns popup width to trigger when alignTo is trigger-width', () => {
    const triggerRect = domRect(100, 50, 80, 24);
    const result = computePlacement4({
      placement: 'bottom',
      triggerRect,
      popupWidth: 200,
      popupHeight: 40,
      container: document.body,
      alignTo: 'trigger-width',
    });

    expect(result.popupWidth).toBe(80);
    expect(result.left).toBe(100);
  });

  it('flips to top when bottom overflows viewport', () => {
    const triggerRect = domRect(100, window.innerHeight - 30, 80, 24);
    const result = computePlacement4({
      placement: 'bottom',
      triggerRect,
      popupWidth: 120,
      popupHeight: 100,
      gap: 8,
      container: document.body,
      flip: true,
    });

    expect(result.top).toBeLessThan(triggerRect.top);
    expect(result.arrow.top).toBe('100px');
  });

  it('converts coordinates relative to scrollable container', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    mockContainerRect(container, { left: 50, top: 40, width: 400, height: 300 });
    container.scrollLeft = 10;
    container.scrollTop = 20;

    const triggerRect = domRect(100, 80, 60, 20);
    const result = computePlacement4({
      placement: 'bottom',
      triggerRect,
      popupWidth: 100,
      popupHeight: 50,
      container,
    });

    expect(result.inContainer).toBe(true);
    expect(result.left).toBe(40);
    expect(result.top).toBe(88);

    container.remove();
  });
});

describe('computePlacement12', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('places bottomLeft aligned popup at trigger start', () => {
    const triggerRect = domRect(200, 100, 80, 30);
    const result = computePlacement12({
      placement: 'bottomLeft',
      triggerRect,
      popupWidth: 100,
      popupHeight: 60,
      container: document.body,
      autoAdjustOverflow: false,
    });

    expect(result.effectivePlacement).toBe('bottomLeft');
    expect(result.top).toBe(138);
    expect(result.left).toBe(200);
  });

  it('flips to opposite side when autoAdjustOverflow and placement does not fit', () => {
    const triggerRect = domRect(100, window.innerHeight - 40, 80, 30);
    const result = computePlacement12({
      placement: 'bottom',
      triggerRect,
      popupWidth: 120,
      popupHeight: 120,
      container: document.body,
      autoAdjustOverflow: true,
    });

    expect(result.effectivePlacement).toBe('top');
    expect(result.top).toBeLessThan(triggerRect.top);
  });

  it.each([
    'top',
    'topLeft',
    'topRight',
    'bottom',
    'bottomLeft',
    'bottomRight',
    'left',
    'leftTop',
    'leftBottom',
    'right',
    'rightTop',
    'rightBottom',
  ] as DropdownPlacement[])('computes placement for %s without throwing', (placement) => {
    const triggerRect = domRect(200, 150, 80, 30);
    const result = computePlacement12({
      placement,
      triggerRect,
      popupWidth: 100,
      popupHeight: 60,
      container: document.body,
    });

    expect(typeof result.top).toBe('number');
    expect(typeof result.left).toBe('number');
    expect(result.arrow).toBeTruthy();
  });
});
