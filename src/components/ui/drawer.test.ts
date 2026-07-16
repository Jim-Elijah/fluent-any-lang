import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './drawer.js';
import { UiDrawer } from './drawer.js';
import { mount } from './test-utils.js';

function queryDrawer<T extends Element = Element>(drawer: UiDrawer, selector: string): T | null {
  return drawer.shadowRoot?.querySelector(selector) as T | null;
}

describe('ui-drawer', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.useRealTimers();
  });

  async function renderDrawer(
    template = html`<ui-drawer open title="Test Drawer">Body</ui-drawer>`,
  ) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-drawer') as UiDrawer;
    await el.updateComplete;
    return el;
  }

  it('renders an open drawer with direction and size styles', async () => {
    vi.useFakeTimers();
    const el = await renderDrawer(
      html`<ui-drawer open title="Drawer Title" direction="ltr" .size=${480}>Body</ui-drawer>`,
    );

    await vi.advanceTimersByTimeAsync(250);

    expect(queryDrawer(el, '.overlay')?.getAttribute('data-phase')).toBe('open');
    expect(queryDrawer(el, '.title')?.textContent?.trim()).toBe('Drawer Title');
    expect(queryDrawer(el, '.panel')?.getAttribute('data-direction')).toBe('ltr');
    expect(queryDrawer<HTMLElement>(el, '.panel')?.style.width).toBe('480px');
  });

  it('emits update:open with mask reason on overlay click', async () => {
    vi.useFakeTimers();
    const el = await renderDrawer();
    const updateHandler = vi.fn();
    el.addEventListener('update:open', updateHandler);

    await vi.advanceTimersByTimeAsync(250);
    queryDrawer<HTMLElement>(el, '.overlay')?.click();

    expect(updateHandler).toHaveBeenCalledOnce();
    expect(updateHandler.mock.calls[0][0].detail).toEqual({ open: false, reason: 'mask' });
  });

  it('waits for beforeClose callback before closing', async () => {
    vi.useFakeTimers();
    const el = await renderDrawer(html`<ui-drawer default-open title="Guarded">Body</ui-drawer>`);
    const updateHandler = vi.fn();
    let closeNow: (() => void) | undefined;

    el.beforeClose = (done) => {
      closeNow = done;
    };
    el.addEventListener('update:open', updateHandler);

    await vi.advanceTimersByTimeAsync(250);
    el.handleClose();

    expect(updateHandler).not.toHaveBeenCalled();

    closeNow?.();
    await el.updateComplete;

    expect(updateHandler).toHaveBeenCalledOnce();
    expect(updateHandler.mock.calls[0][0].detail).toEqual({ open: false, reason: 'method' });
  });

  it('removes content after close when destroyOnClose is enabled', async () => {
    vi.useFakeTimers();
    const el = await renderDrawer(
      html`<ui-drawer default-open destroy-on-close title="Disposable">Body</ui-drawer>`,
    );

    await vi.advanceTimersByTimeAsync(250);
    el.handleClose();
    await vi.advanceTimersByTimeAsync(250);
    await el.updateComplete;

    expect(queryDrawer(el, '.panel')).toBeNull();
  });
});
