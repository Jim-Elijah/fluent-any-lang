import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayTriggerController } from './overlay-triggers.js';

describe('OverlayTriggerController', () => {
  let host: HTMLElement;
  let controller: OverlayTriggerController;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    controller = new OverlayTriggerController(host);
  });

  afterEach(() => {
    controller.destroy();
    host.remove();
    vi.useRealTimers();
  });

  it('invokes hover callbacks immediately without delay', () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const target = document.createElement('button');
    host.appendChild(target);

    controller.bindHover(target, { onEnter, onLeave });
    target.dispatchEvent(new MouseEvent('mouseenter'));
    target.dispatchEvent(new MouseEvent('mouseleave'));

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('delays hover enter and leave callbacks', () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const target = document.createElement('button');
    host.appendChild(target);

    controller.bindHover(target, { enterDelayMs: 100, leaveDelayMs: 50, onEnter, onLeave });
    target.dispatchEvent(new MouseEvent('mouseenter'));
    expect(onEnter).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onEnter).toHaveBeenCalledTimes(1);

    target.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(50);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('forwards click and contextmenu events', () => {
    const onClick = vi.fn();
    const onContextMenu = vi.fn();
    const target = document.createElement('button');
    host.appendChild(target);

    controller.bindClick(target, { onClick });
    controller.bindContextMenu(target, { onContextMenu });

    const clickEvent = new MouseEvent('click');
    const contextEvent = new MouseEvent('contextmenu');
    target.dispatchEvent(clickEvent);
    target.dispatchEvent(contextEvent);

    expect(onClick).toHaveBeenCalledWith(clickEvent);
    expect(onContextMenu).toHaveBeenCalledWith(contextEvent);
  });

  it('forwards global outside, esc, and scroll events', () => {
    const onOutside = vi.fn();
    const onEsc = vi.fn();
    const onScrollResize = vi.fn();

    controller.bindGlobal({ onOutside, onEsc, onScrollResize });

    const mouseEvent = new MouseEvent('mousedown');
    const keyEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(mouseEvent);
    window.dispatchEvent(keyEvent);
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));

    expect(onOutside).toHaveBeenCalledWith(mouseEvent);
    expect(onEsc).toHaveBeenCalledWith(keyEvent);
    expect(onScrollResize).toHaveBeenCalledTimes(2);
  });

  it('unbinds global listeners', () => {
    const onOutside = vi.fn();
    controller.bindGlobal({ onOutside });
    controller.unbindGlobal();
    window.dispatchEvent(new MouseEvent('mousedown'));
    expect(onOutside).not.toHaveBeenCalled();
  });
});
