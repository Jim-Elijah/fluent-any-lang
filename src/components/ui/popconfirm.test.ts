import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './popconfirm.js';
import { UiPopconfirm } from './popconfirm.js';
import { flushUpdates, getPortalShadow, mount } from './test-utils.js';

describe('ui-popconfirm', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
    document.querySelector('[data-ui-popconfirm-portal]')?.remove();
  });

  async function renderPopconfirm(
    template = html`<ui-popconfirm title="Delete item?"><button>Delete</button></ui-popconfirm>`,
  ) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-popconfirm') as UiPopconfirm;
    await el.updateComplete;
    return el;
  }

  function getPopup() {
    return getPortalShadow('[data-ui-popconfirm-portal]')?.querySelector('.popup');
  }

  it('opens popup on trigger click', async () => {
    const el = await renderPopconfirm();
    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();
    expect(getPopup()?.querySelector('.title')?.textContent).toContain('Delete item?');
  });

  it('dispatches confirm and closes on confirm click', async () => {
    vi.useFakeTimers();
    const el = await renderPopconfirm();
    const confirmHandler = vi.fn();
    el.addEventListener('confirm', confirmHandler);

    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    getPopup()?.querySelector<HTMLButtonElement>('.btn.primary')?.click();
    vi.runAllTimers();
    await el.updateComplete;

    expect(confirmHandler).toHaveBeenCalledOnce();
    expect(getPopup() ?? null).toBeNull();
    vi.useRealTimers();
  });

  it('dispatches cancel and closes on cancel click', async () => {
    const el = await renderPopconfirm();
    const cancelHandler = vi.fn();
    el.addEventListener('cancel', cancelHandler);

    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    getPopup()?.querySelector<HTMLButtonElement>('.btn.ghost')?.click();
    await el.updateComplete;

    expect(cancelHandler).toHaveBeenCalledOnce();
    expect(getPopup() ?? null).toBeNull();
  });

  it('respects beforeOpen preventDefault', async () => {
    const el = await renderPopconfirm();
    el.addEventListener('beforeOpen', (e) => e.preventDefault());
    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    expect(getPopup() ?? null).toBeNull();
  });

  it('does not open when disabled', async () => {
    const el = await renderPopconfirm(html`
      <ui-popconfirm disabled title="No"><button>x</button></ui-popconfirm>
    `);
    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    expect(getPopup() ?? null).toBeNull();
  });

  it('closes on Escape', async () => {
    const el = await renderPopconfirm();
    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();
    expect(getPopup()).not.toBeNull();

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await el.updateComplete;
    expect(getPopup() ?? null).toBeNull();
  });
});
