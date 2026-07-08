import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './tooltip.js';
import { UiTooltip } from './tooltip.js';
import { flushUpdates, getPortalShadow, mount } from './test-utils.js';

describe('ui-tooltip', () => {
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
    document.querySelector('[data-ui-tooltip-portal]')?.remove();
  });

  async function renderTooltip(
    template = html`<ui-tooltip title="Hint"><button>Trigger</button></ui-tooltip>`,
  ) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-tooltip') as UiTooltip;
    el.addEventListener('open-change', (e) => {
      el.open = (e as CustomEvent<{ open: boolean }>).detail.open;
    });
    el.addEventListener('update:open', (e) => {
      el.open = (e as CustomEvent<{ open: boolean }>).detail.open;
    });
    await el.updateComplete;
    return el;
  }

  function getPopup() {
    return getPortalShadow('[data-ui-tooltip-portal]')?.querySelector('.popup');
  }

  it('renders trigger slot content', async () => {
    const el = await renderTooltip();
    const slot = el.shadowRoot?.querySelector('slot');
    const text = (slot?.assignedNodes({ flatten: true }) ?? [])
      .map((n) => n.textContent ?? '')
      .join('');
    expect(text).toContain('Trigger');
  });

  it('shows popup on hover after enter delay', async () => {
    const el = await renderTooltip();
    const trigger = el.shadowRoot?.querySelector('.trigger');
    expect(trigger).not.toBeNull();
    trigger!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    vi.advanceTimersByTime(100);
    await el.updateComplete;
    await flushUpdates();
    expect(getPopup()?.textContent).toContain('Hint');
  });

  it('opens and closes on click trigger', async () => {
    const el = await renderTooltip(html`
      <ui-tooltip title="Click me" trigger="click"><span>Btn</span></ui-tooltip>
    `);
    const closeHandler = vi.fn();
    el.addEventListener('close', closeHandler);

    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();
    expect(getPopup()).not.toBeNull();

    el.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    expect(closeHandler).toHaveBeenCalled();
  });

  it('does not show when title is empty or disabled', async () => {
    const el = await renderTooltip(html`<ui-tooltip title="  "><span>x</span></ui-tooltip>`);
    el.open = true;
    await el.updateComplete;
    expect(getPopup() ?? null).toBeNull();

    el.title = 'Tip';
    el.disabled = true;
    el.open = true;
    await el.updateComplete;
    expect(getPopup() ?? null).toBeNull();
  });

  it('closes on Escape when open', async () => {
    const el = await renderTooltip();
    el.open = true;
    await el.updateComplete;
    await flushUpdates();

    const closeHandler = vi.fn();
    el.addEventListener('close', closeHandler);
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    el.open = false;
    await el.updateComplete;
    expect(closeHandler).toHaveBeenCalled();
  });

  it('uses visible as open alias', async () => {
    const result = mount(html`<ui-tooltip visible title="Visible"><span>x</span></ui-tooltip>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-tooltip') as UiTooltip;
    await el.updateComplete;
    await flushUpdates();
    expect(getPopup()?.textContent).toContain('Visible');
  });
});
