import { afterEach, describe, expect, it, vi } from 'vitest';

import { OverlayTriggerController } from './overlay-triggers.js';

describe('OverlayTriggerController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
