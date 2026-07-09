import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './dropdown.js';
import { UiDropdown } from './dropdown.js';
import { flushUpdates, getPortalShadow, mount } from './test-utils.js';

describe('ui-dropdown', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.querySelector('[data-ui-dropdown-portal]')?.remove();
  });

  const MENU = {
    items: [
      { key: '1', label: 'One' },
      { key: '2', label: 'Two' },
    ],
  };

  async function renderDropdown(
    template = html`
      <ui-dropdown .menu=${MENU} trigger="click"><button>Menu</button></ui-dropdown>
    `,
  ) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-dropdown') as UiDropdown;
    await el.updateComplete;
    return el;
  }

  function getOverlay() {
    return getPortalShadow('[data-ui-dropdown-portal]')?.querySelector('.overlay');
  }

  it('opens on click trigger', async () => {
    const el = await renderDropdown();
    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();
    expect(getOverlay()).not.toBeNull();
  });

  it('dispatches menu-click on item click', async () => {
    const el = await renderDropdown();
    const handler = vi.fn();
    el.addEventListener('menu-click', handler);
    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    getOverlay()
      ?.querySelector('.menu-item')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail.key).toBe('1');
  });

  it('supports controlled open', async () => {
    const el = await renderDropdown(html`
      <ui-dropdown .open=${true} .menu=${MENU} trigger="click"><span>x</span></ui-dropdown>
    `);
    await el.updateComplete;
    await flushUpdates();
    expect(getOverlay()).not.toBeNull();
  });
});
