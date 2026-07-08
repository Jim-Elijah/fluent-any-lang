import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MenuItem } from './menu.js';
import './menu.js';
import { UiMenu } from './menu.js';
import { mount } from './test-utils.js';

const ITEMS: MenuItem[] = [
  { key: 'home', label: 'Home' },
  { key: 'settings', label: 'Settings', disabled: true },
  {
    key: 'more',
    label: 'More',
    children: [
      { key: 'profile', label: 'Profile' },
      { key: 'logout', label: 'Logout' },
    ],
  },
];

describe('ui-menu', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderMenu(template = html`<ui-menu .items=${ITEMS}></ui-menu>`) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-menu') as UiMenu;
    await el.updateComplete;
    return el;
  }

  it('renders menu items in vertical mode by default', async () => {
    const el = await renderMenu();
    expect(el.shadowRoot?.querySelector('.menu.vertical')).not.toBeNull();
    const labels = [...(el.shadowRoot?.querySelectorAll('.item span') ?? [])].map((n) =>
      n.textContent?.trim(),
    );
    expect(labels).toContain('Home');
    expect(labels).toContain('More');
  });

  it('dispatches select when clicking a leaf item', async () => {
    const el = await renderMenu();
    const handler = vi.fn();
    el.addEventListener('select', handler);

    const home = [...(el.shadowRoot?.querySelectorAll('.item') ?? [])].find((item) =>
      item.textContent?.includes('Home'),
    );
    home?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail.key).toBe('home');
    expect(handler.mock.calls[0][0].detail.keyPath).toEqual(['home']);
  });

  it('does not select disabled items', async () => {
    const el = await renderMenu();
    const handler = vi.fn();
    el.addEventListener('select', handler);

    const settings = [...(el.shadowRoot?.querySelectorAll('.item') ?? [])].find((item) =>
      item.textContent?.includes('Settings'),
    );
    settings?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('toggles submenu open state in vertical mode', async () => {
    const el = await renderMenu(html`<ui-menu .items=${ITEMS} .openKeys=${[]}></ui-menu>`);
    const openHandler = vi.fn();
    el.addEventListener('open-change', openHandler);

    const more = [...(el.shadowRoot?.querySelectorAll('.item') ?? [])].find((item) =>
      item.textContent?.includes('More'),
    );
    more?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(openHandler).toHaveBeenCalledOnce();
    expect(openHandler.mock.calls[0][0].detail.openKeys).toEqual(['more']);
  });

  it('marks selected item with aria-current', async () => {
    const el = await renderMenu(
      html`<ui-menu .items=${ITEMS} .selectedKeys=${['home']}></ui-menu>`,
    );
    const home = [...(el.shadowRoot?.querySelectorAll('.item') ?? [])].find((item) =>
      item.textContent?.includes('Home'),
    );
    expect(home?.getAttribute('aria-current')).toBe('page');
  });

  it('renders horizontal mode', async () => {
    const el = await renderMenu(html`<ui-menu mode="horizontal" .items=${ITEMS}></ui-menu>`);
    expect(el.shadowRoot?.querySelector('.menu.horizontal')).not.toBeNull();
  });

  it('dispatches menu-click for submenu header', async () => {
    const el = await renderMenu();
    const handler = vi.fn();
    el.addEventListener('menu-click', handler);

    const more = [...(el.shadowRoot?.querySelectorAll('.item') ?? [])].find((item) =>
      item.textContent?.includes('More'),
    );
    more?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail.key).toBe('more');
  });
});
