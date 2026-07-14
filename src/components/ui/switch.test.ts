import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './switch.js';
import { UiSwitch } from './switch.js';
import { mount } from './test-utils.js';

describe('ui-switch', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderSwitch(template = html`<ui-switch></ui-switch>`): Promise<UiSwitch> {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-switch') as UiSwitch;
    await el.updateComplete;
    return el;
  }

  it('renders an unchecked switch by default', async () => {
    const el = await renderSwitch();
    const btn = el.shadowRoot?.querySelector('button');
    expect(btn?.getAttribute('role')).toBe('switch');
    expect(btn?.getAttribute('aria-checked')).toBe('false');
    expect(btn?.classList.contains('checked')).toBe(false);
  });

  it('reflects checked state', async () => {
    const el = await renderSwitch(html`<ui-switch checked></ui-switch>`);
    const btn = el.shadowRoot?.querySelector('button');
    expect(btn?.getAttribute('aria-checked')).toBe('true');
    expect(btn?.classList.contains('checked')).toBe(true);
  });

  it('toggles and emits change on click', async () => {
    const el = await renderSwitch();
    const onChange = vi.fn();
    el.addEventListener('change', onChange);
    el.shadowRoot?.querySelector('button')?.click();
    await el.updateComplete;
    expect(el.checked).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
    expect((onChange.mock.calls[0][0] as CustomEvent).detail.checked).toBe(true);
  });

  it('does not toggle when disabled', async () => {
    const el = await renderSwitch(html`<ui-switch disabled></ui-switch>`);
    const onChange = vi.fn();
    el.addEventListener('change', onChange);
    el.shadowRoot?.querySelector('button')?.click();
    await el.updateComplete;
    expect(el.checked).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});
