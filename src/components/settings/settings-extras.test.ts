import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './settings-extras.js';
import type { SettingsExtras } from './settings-extras.js';
import { mount } from '../ui/test-utils.js';

describe('settings-extras', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderExtras() {
    const result = mount(html`<settings-extras></settings-extras>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('settings-extras') as SettingsExtras;
    await el.updateComplete;
    return el;
  }

  it('renders the extras card with library and coming-soon rows', async () => {
    const el = await renderExtras();

    expect(el.shadowRoot?.querySelector('.card')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('#extras-heading')).not.toBeNull();
    expect(el.shadowRoot?.querySelectorAll('button.row-action').length).toBe(2);
    expect(el.shadowRoot?.querySelector('button.row-action:not([disabled])')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('button.row-action[disabled]')).not.toBeNull();
  });

  it('navigates to library when the library row is clicked', async () => {
    const el = await renderExtras();
    const navigate = vi.spyOn(el, 'navigate');

    el.shadowRoot?.querySelector('button.row-action:not([disabled])')?.click();

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/library');
  });
});
