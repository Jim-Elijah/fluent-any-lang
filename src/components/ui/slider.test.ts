import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './slider.js';
import { UiSlider } from './slider.js';
import { mount } from './test-utils.js';

describe('ui-slider', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderSlider(
    template = html`<ui-slider value="30" min="0" max="100" step="10"></ui-slider>`,
  ) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-slider') as UiSlider;
    await el.updateComplete;
    return el;
  }

  it('renders handle with aria attributes', async () => {
    const el = await renderSlider();
    const handle = el.shadowRoot?.querySelector('[role="slider"]');
    expect(handle?.getAttribute('aria-valuemin')).toBe('0');
    expect(handle?.getAttribute('aria-valuemax')).toBe('100');
    expect(handle?.getAttribute('aria-valuenow')).toBe('30');
  });

  it('dispatches change on arrow key', async () => {
    const el = await renderSlider();
    const handler = vi.fn();
    el.addEventListener('change', handler);

    el.shadowRoot
      ?.querySelector('[role="slider"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail.value).toBe(40);
  });

  it('dispatches change-complete on keyup after keyboard change', async () => {
    const el = await renderSlider();
    const handler = vi.fn();
    el.addEventListener('change-complete', handler);
    const handle = el.shadowRoot!.querySelector('[role="slider"]');
    expect(handle).not.toBeNull();

    handle!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    handle!.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail.value).toBe(30);
  });

  it('snaps to Home and End keys', async () => {
    const el = await renderSlider();
    const handler = vi.fn();
    el.addEventListener('change', handler);
    const handle = el.shadowRoot!.querySelector('[role="slider"]');
    expect(handle).not.toBeNull();

    handle!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(handler.mock.calls[0][0].detail.value).toBe(0);

    handle!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(handler.mock.calls[1][0].detail.value).toBe(100);
  });

  it('does not respond to keyboard when disabled', async () => {
    const el = await renderSlider(html`<ui-slider value="30" disabled></ui-slider>`);
    const handler = vi.fn();
    el.addEventListener('change', handler);
    el.shadowRoot
      ?.querySelector('[role="slider"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('renders marks and dots when marks are provided', async () => {
    const el = await renderSlider(html`
      <ui-slider value="0" min="0" max="100" .marks=${{ 0: '0', 50: '50', 100: '100' }}></ui-slider>
    `);
    expect(el.hasAttribute('with-marks')).toBe(true);
    expect(el.shadowRoot?.querySelectorAll('.mark-text').length).toBe(3);
    expect(el.shadowRoot?.querySelectorAll('.dot').length).toBe(3);
  });

  it('changes value when mark is clicked', async () => {
    const el = await renderSlider(html`
      <ui-slider value="0" min="0" max="100" .marks=${{ 0: '0', 50: '50', 100: '100' }}></ui-slider>
    `);
    const handler = vi.fn();
    el.addEventListener('change', handler);

    const mark50 = [...(el.shadowRoot?.querySelectorAll('.mark-text') ?? [])].find((m) =>
      m.textContent?.includes('50'),
    );
    mark50?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail.value).toBe(50);
  });

  it('supports uncontrolled defaultValue on drag', async () => {
    const el = await renderSlider(html`
      <ui-slider default-value="20" min="0" max="100" step="10"></ui-slider>
    `);
    const handler = vi.fn();
    el.addEventListener('change', handler);
    el.shadowRoot
      ?.querySelector('[role="slider"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await el.updateComplete;
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail.value).toBe(30);
    expect(el.shadowRoot?.querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe(
      '30',
    );
  });

  it('focus() focuses the handle', async () => {
    const el = await renderSlider();
    el.focus();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.handle')?.classList.contains('active')).toBe(true);
  });
});
