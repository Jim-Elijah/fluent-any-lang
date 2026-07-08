import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './button.js';
import { UiButton } from './button.js';
import { mount } from './test-utils.js';

describe('ui-button', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderButton(template = html`<ui-button>Click me</ui-button>`): Promise<UiButton> {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-button') as UiButton;
    await el.updateComplete;
    return el;
  }

  it('renders slot content in shadow DOM', async () => {
    const el = await renderButton();

    const slot = el.shadowRoot?.querySelector('slot');
    const assignedText = (slot?.assignedNodes({ flatten: true }) ?? [])
      .map((node) => node.textContent ?? '')
      .join('');
    expect(assignedText.trim()).toBe('Click me');
    expect(el.shadowRoot?.querySelector('button')?.classList.contains('primary')).toBe(true);
  });

  it.each(['secondary', 'ghost'] as const)('applies %s variant class', async (variant) => {
    const el = await renderButton(html`<ui-button variant=${variant}>Label</ui-button>`);
    expect(el.shadowRoot?.querySelector('button')?.classList.contains(variant)).toBe(true);
  });

  it('applies danger variant class', async () => {
    const el = await renderButton(html`<ui-button variant="danger">Delete</ui-button>`);
    expect(el.shadowRoot?.querySelector('button')?.classList.contains('danger')).toBe(true);
  });

  it('disables the native button', async () => {
    const el = await renderButton(html`<ui-button disabled>Disabled</ui-button>`);
    expect(el.shadowRoot?.querySelector('button')?.disabled).toBe(true);
  });

  it('sets button type attribute', async () => {
    const el = await renderButton(html`<ui-button type="submit">Submit</ui-button>`);
    expect(el.shadowRoot?.querySelector('button')?.type).toBe('submit');
  });

  it('does not propagate host click when disabled', async () => {
    const el = await renderButton(html`<ui-button disabled>Disabled</ui-button>`);
    const hostHandler = vi.fn();
    el.addEventListener('click', hostHandler);
    el.shadowRoot?.querySelector('button')?.click();
    expect(hostHandler).not.toHaveBeenCalled();
  });
});
