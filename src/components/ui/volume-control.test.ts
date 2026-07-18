import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './volume-control.js';
import { UiVolumeControl } from './volume-control.js';
import { flushUpdates, getPortalShadow, mount } from './test-utils.js';

describe('ui-volume-control', () => {
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

  async function renderControl(
    template = html`<ui-volume-control .value=${0.5}></ui-volume-control>`,
  ) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-volume-control') as UiVolumeControl;
    await el.updateComplete;
    return el;
  }

  it('shows percent on the trigger', async () => {
    const el = await renderControl(html`<ui-volume-control .value=${0.35}></ui-volume-control>`);
    const trigger = el.shadowRoot?.querySelector('.volume-trigger');
    expect(trigger?.textContent?.trim()).toBe('35%');
  });

  it('opens a slider and dispatches change', async () => {
    const el = await renderControl();
    const handler = vi.fn();
    el.addEventListener('change', handler);

    const dropdown = el.shadowRoot?.querySelector('ui-dropdown') as HTMLElement & {
      shadowRoot: ShadowRoot | null;
    };
    dropdown.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    const portal = getPortalShadow('[data-ui-dropdown-portal]');
    const slider = portal?.querySelector('ui-slider') as HTMLElement & { value: number };
    expect(slider).toBeTruthy();

    slider.dispatchEvent(
      new CustomEvent('change', { detail: { value: 0.7 }, bubbles: true, composed: true }),
    );
    await el.updateComplete;

    expect(el.value).toBe(0.7);
    expect(handler).toHaveBeenCalled();
    expect((handler.mock.calls[0][0] as CustomEvent).detail.value).toBe(0.7);
  });
});
