import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './alert.js';
import { UiAlert } from './alert.js';
import { mount } from './test-utils.js';

describe('ui-alert', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderAlert(
    template = html`<ui-alert title="Title" description="Details"></ui-alert>`,
  ) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-alert') as UiAlert;
    await el.updateComplete;
    return el;
  }

  it('renders title and description', async () => {
    const el = await renderAlert();
    expect(el.shadowRoot?.querySelector('.title')?.textContent?.trim()).toBe('Title');
    expect(el.shadowRoot?.querySelector('.description')?.textContent?.trim()).toBe('Details');
  });

  it.each(['success', 'warning', 'error', 'info', 'primary'] as const)(
    'applies type and effect classes for %s',
    async (type) => {
      const el = await renderAlert(html`<ui-alert type=${type} title="Alert"></ui-alert>`);
      const alert = el.shadowRoot?.querySelector('.alert');
      expect(alert?.classList.contains(type)).toBe(true);
      expect(alert?.classList.contains('light')).toBe(true);
    },
  );

  it('shows icon when show-icon is set', async () => {
    const el = await renderAlert(html`<ui-alert show-icon title="Info"></ui-alert>`);
    const iconWrap = el.shadowRoot?.querySelector('.icon-wrap');
    expect(iconWrap?.hasAttribute('hidden')).toBe(false);
  });

  it('hides close button when not closable', async () => {
    const el = await renderAlert(html`<ui-alert closable title="Info"></ui-alert>`);
    expect(el.shadowRoot?.querySelector('.close')).not.toBeNull();

    el.closable = false;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.close')).toBeNull();
  });

  it('dispatches close event and hides on close click', async () => {
    const el = await renderAlert();
    const closeHandler = vi.fn();
    el.addEventListener('close', closeHandler);

    el.shadowRoot?.querySelector<HTMLButtonElement>('.close')?.click();
    await el.updateComplete;

    expect(closeHandler).toHaveBeenCalledOnce();
    expect(el.hidden).toBe(true);
    expect(el.shadowRoot?.querySelector('.alert')).toBeNull();
  });

  it('renders slot content for title and default slot', async () => {
    const el = await renderAlert(html`
      <ui-alert>
        <span slot="title">Slot Title</span>
        Slot body
      </ui-alert>
    `);

    const titleSlot = el.shadowRoot?.querySelector('slot[name="title"]') as HTMLSlotElement;
    const defaultSlot = el.shadowRoot?.querySelector('slot:not([name])') as HTMLSlotElement;
    titleSlot?.dispatchEvent(new Event('slotchange'));
    defaultSlot?.dispatchEvent(new Event('slotchange'));
    await el.updateComplete;

    const titleText = titleSlot
      .assignedNodes({ flatten: true })
      .map((n) => n.textContent ?? '')
      .join('');
    const bodyText = defaultSlot
      .assignedNodes({ flatten: true })
      .map((n) => n.textContent ?? '')
      .join('');

    expect(titleText).toContain('Slot Title');
    expect(bodyText).toContain('Slot body');
    expect(el.shadowRoot?.querySelector('.title')?.hasAttribute('hidden')).toBe(false);
    expect(el.shadowRoot?.querySelector('.description')?.hasAttribute('hidden')).toBe(false);
  });

  it('applies center class when center is true', async () => {
    const el = await renderAlert(html`<ui-alert center title="Centered"></ui-alert>`);
    expect(el.shadowRoot?.querySelector('.alert')?.classList.contains('center')).toBe(true);
  });
});
