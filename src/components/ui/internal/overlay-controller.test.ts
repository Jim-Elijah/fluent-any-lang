import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayController } from './overlay-controller.js';
import { OverlayTriggerController } from './overlay-triggers.js';

describe('OverlayTriggerController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls onEnter immediately when hover has no enter delay', () => {
    const host = document.createElement('div');
    const target = document.createElement('button');
    const onEnter = vi.fn();
    const ctrl = new OverlayTriggerController(host);
    ctrl.bindHover(target, { onEnter, onLeave: vi.fn() });

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(onEnter).toHaveBeenCalledOnce();

    ctrl.destroy();
  });

  it('delays hover enter and leave callbacks', () => {
    const host = document.createElement('div');
    const target = document.createElement('button');
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const ctrl = new OverlayTriggerController(host);
    ctrl.bindHover(target, { onEnter, onLeave, enterDelayMs: 100, leaveDelayMs: 50 });

    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(onEnter).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onEnter).toHaveBeenCalledOnce();

    target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(onLeave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(onLeave).toHaveBeenCalledOnce();

    ctrl.destroy();
  });

  it('clears pending hover timers on re-enter', () => {
    const host = document.createElement('div');
    const target = document.createElement('button');
    const onLeave = vi.fn();
    const ctrl = new OverlayTriggerController(host);
    ctrl.bindHover(target, { onEnter: vi.fn(), onLeave, leaveDelayMs: 100 });

    target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(100);
    expect(onLeave).not.toHaveBeenCalled();

    ctrl.destroy();
  });

  it('forwards click and contextmenu to handlers', () => {
    const host = document.createElement('div');
    const target = document.createElement('button');
    const onClick = vi.fn();
    const onContextMenu = vi.fn();
    const ctrl = new OverlayTriggerController(host);
    ctrl.bindClick(target, { onClick });
    ctrl.bindContextMenu(target, { onContextMenu });

    const clickEvent = new MouseEvent('click', { bubbles: true });
    const contextEvent = new MouseEvent('contextmenu', { bubbles: true });
    target.dispatchEvent(clickEvent);
    target.dispatchEvent(contextEvent);

    expect(onClick).toHaveBeenCalledWith(clickEvent);
    expect(onContextMenu).toHaveBeenCalledWith(contextEvent);

    ctrl.destroy();
  });

  it('calls onScrollResize on scroll and resize', () => {
    const host = document.createElement('div');
    const onScrollResize = vi.fn();
    const ctrl = new OverlayTriggerController(host);
    ctrl.bindGlobal({ onScrollResize });

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    expect(onScrollResize).toHaveBeenCalledTimes(2);

    ctrl.destroy();
  });

  it('unbindGlobal stops outside and esc handlers', () => {
    const host = document.createElement('div');
    const outside = vi.fn();
    const onEsc = vi.fn();
    const ctrl = new OverlayTriggerController(host);
    ctrl.bindGlobal({
      onOutside: outside,
      onEsc: (e) => {
        if (e.key === 'Escape') onEsc();
      },
    });

    ctrl.unbindGlobal();
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(outside).not.toHaveBeenCalled();
    expect(onEsc).not.toHaveBeenCalled();
  });

  it('calls onOutside on document mousedown', () => {
    const host = document.createElement('div');
    const outside = vi.fn();
    const ctrl = new OverlayTriggerController(host);
    ctrl.bindGlobal({ onOutside: outside });

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(outside).toHaveBeenCalledOnce();

    ctrl.destroy();
  });

  it('calls onEsc on Escape key', () => {
    const host = document.createElement('div');
    const onEsc = vi.fn();
    const ctrl = new OverlayTriggerController(host);
    ctrl.bindGlobal({
      onEsc: (e) => {
        if (e.key === 'Escape') onEsc();
      },
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onEsc).toHaveBeenCalledOnce();

    ctrl.destroy();
  });
});

describe('OverlayController', () => {
  afterEach(() => {
    document.querySelector('[data-test-overlay]')?.remove();
    vi.restoreAllMocks();
  });

  it('syncContent renders into portal when open', () => {
    const host = document.createElement('div');
    let internalOpen = false;
    const ctrl = new OverlayController({
      host,
      portal: {
        dataAttr: 'data-test-overlay',
        styleText: '.popup { color: red; }',
        zIndex: 100,
        popupContainer: 'body',
      },
      readOpen: () => internalOpen,
      writeOpen: (next) => {
        internalOpen = next;
      },
      isControlledOpen: () => false,
    });

    internalOpen = true;
    ctrl.syncContent(html`<div class="popup">Hello</div>`);

    const popup = ctrl.getPopupEl('.popup');
    expect(popup?.textContent).toBe('Hello');

    ctrl.destroy();
  });

  it('setOpen writes internal state and dispatches update:open', () => {
    const host = document.createElement('div');
    let internalOpen = false;
    const handler = vi.fn();
    host.addEventListener('update:open', handler);

    const ctrl = new OverlayController({
      host,
      portal: {
        dataAttr: 'data-test-overlay',
        styleText: '',
        zIndex: 100,
        popupContainer: 'body',
      },
      readOpen: () => internalOpen,
      writeOpen: (next) => {
        internalOpen = next;
      },
      isControlledOpen: () => false,
    });

    ctrl.setOpen(true, { trigger: 'click' });
    expect(internalOpen).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail).toEqual({ open: true, trigger: 'click' });

    ctrl.destroy();
  });

  it('isEventInside returns true for events within portal host', () => {
    const host = document.createElement('div');
    let internalOpen = true;
    const ctrl = new OverlayController({
      host,
      portal: {
        dataAttr: 'data-test-overlay',
        styleText: '.popup {}',
        zIndex: 100,
        popupContainer: 'body',
      },
      readOpen: () => internalOpen,
      isControlledOpen: () => false,
    });

    ctrl.syncContent(html`<div class="popup">x</div>`);
    const popup = ctrl.getPopupEl('.popup')!;
    const inside = vi.fn();
    popup.addEventListener('click', inside);
    popup.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(inside).toHaveBeenCalledOnce();
    expect(ctrl.isEventInside(new MouseEvent('click', { bubbles: true }))).toBe(false);

    ctrl.destroy();
  });
});
