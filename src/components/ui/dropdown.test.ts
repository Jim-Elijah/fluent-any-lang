import { html, render } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './dropdown.js';
import { UiDropdown } from './dropdown.js';
import type { UiSlider } from './slider.js';
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

  it('opens on hover after delay', async () => {
    const el = await renderDropdown(html`
      <ui-dropdown .menu=${MENU} trigger="hover"><button>Menu</button></ui-dropdown>
    `);
    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(100);
    await el.updateComplete;
    await flushUpdates();
    expect(getOverlay()).not.toBeNull();
  });

  it('does not open when disabled', async () => {
    const el = await renderDropdown(html`
      <ui-dropdown disabled .menu=${MENU} trigger="click"><button>Menu</button></ui-dropdown>
    `);
    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();
    expect(getOverlay() ?? null).toBeNull();
  });

  it('closes on Escape when open', async () => {
    const el = await renderDropdown();
    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();
    expect(getOverlay()).not.toBeNull();

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await el.updateComplete;
    expect(getOverlay() ?? null).toBeNull();
  });

  it('opens on contextmenu trigger', async () => {
    const el = await renderDropdown(html`
      <ui-dropdown .menu=${MENU} trigger="contextMenu"><button>Menu</button></ui-dropdown>
    `);
    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();
    expect(getOverlay()).not.toBeNull();
  });

  it('renders custom overlay content instead of menu', async () => {
    const el = await renderDropdown(html`
      <ui-dropdown
        trigger="click"
        .overlay=${html`<span class="overlay-panel-label">Volume</span>
          <div class="custom-slider">slider</div>`}
      >
        <button>Vol</button>
      </ui-dropdown>
    `);
    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    const overlay = getOverlay();
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('role')).toBe('dialog');
    expect(overlay?.querySelector('.overlay-panel-label')?.textContent).toBe('Volume');
    expect(overlay?.querySelector('.custom-slider')?.textContent).toBe('slider');
    expect(overlay?.querySelector('.menu')).toBeNull();
  });

  it('syncs portal when overlay property updates while open', async () => {
    let label = 'Volume 50%';
    const view = () => html`
      <ui-dropdown
        trigger="click"
        .overlay=${html`<span class="overlay-panel-label">${label}</span>`}
      >
        <button>Vol</button>
      </ui-dropdown>
    `;

    const result = mount(view());
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-dropdown') as UiDropdown;
    await el.updateComplete;

    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();
    expect(getOverlay()?.querySelector('.overlay-panel-label')?.textContent).toBe('Volume 50%');

    label = 'Volume 80%';
    render(view(), result.container);
    await el.updateComplete;
    await flushUpdates();

    expect(getOverlay()?.querySelector('.overlay-panel-label')?.textContent).toBe('Volume 80%');
  });

  it('updates controlled slider value inside open overlay', async () => {
    let volume = 0.5;
    await import('./slider.js');
    let result: ReturnType<typeof mount>;

    const view = () => html`
      <ui-dropdown
        trigger="click"
        .overlay=${html`
          <span class="overlay-panel-label">${Math.round(volume * 100)}%</span>
          <ui-slider
            class="vol-slider"
            .value=${volume}
            min="0"
            max="1"
            step="0.01"
            @change=${(e: CustomEvent<{ value: number }>) => {
              volume = e.detail.value;
              render(view(), result.container);
            }}
          ></ui-slider>
        `}
      >
        <button>Vol</button>
      </ui-dropdown>
    `;

    result = mount(view());
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-dropdown') as UiDropdown;
    await el.updateComplete;

    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    const slider = getOverlay()?.querySelector('.vol-slider') as UiSlider;
    expect(slider).toBeTruthy();
    expect(slider.value).toBe(0.5);

    slider.dispatchEvent(
      new CustomEvent('change', { detail: { value: 0.8 }, bubbles: true, composed: true }),
    );
    await el.updateComplete;
    await flushUpdates();
    await slider.updateComplete;

    expect(volume).toBe(0.8);
    expect(getOverlay()?.querySelector('.overlay-panel-label')?.textContent).toBe('80%');
    expect((getOverlay()?.querySelector('.vol-slider') as UiSlider).value).toBe(0.8);
  });
});
