import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './slider.js';
import { UiSlider } from './slider.js';
import { flushUpdates, mount } from './test-utils.js';

describe('ui-slider', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
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

  it('blur() removes active state from handle', async () => {
    const el = await renderSlider();
    el.focus();
    await el.updateComplete;
    el.blur();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.handle')?.classList.contains('active')).toBe(false);
  });

  it('does not respond to keyboard when keyboard is false', async () => {
    const el = await renderSlider(html`<ui-slider value="30" .keyboard=${false}></ui-slider>`);
    const handler = vi.fn();
    el.addEventListener('change', handler);
    el.shadowRoot
      ?.querySelector('[role="slider"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('snaps to step with ArrowLeft and clamps at min', async () => {
    const el = await renderSlider(html`
      <ui-slider default-value="30" min="0" max="100" step="10"></ui-slider>
    `);
    const handler = vi.fn();
    el.addEventListener('change', handler);
    const handle = el.shadowRoot!.querySelector('[role="slider"]')!;

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(handler.mock.calls[0][0].detail.value).toBe(20);

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(handler.mock.calls.at(-1)![0].detail.value).toBe(0);
  });

  it('updates value on drag and dispatches change-complete on pointer up', async () => {
    const el = await renderSlider(html`
      <ui-slider default-value="0" min="0" max="100" step="1"></ui-slider>
    `);
    const changeHandler = vi.fn();
    const completeHandler = vi.fn();
    el.addEventListener('change', changeHandler);
    el.addEventListener('change-complete', completeHandler);

    const rail = el.shadowRoot!.querySelector('.rail') as HTMLElement;
    vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 4,
      right: 200,
      bottom: 4,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const handle = el.shadowRoot!.querySelector('.handle') as HTMLElement;
    handle.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, pointerId: 1 }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 100, pointerId: 1 }),
    );
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    await el.updateComplete;

    expect(changeHandler).toHaveBeenCalled();
    expect(changeHandler.mock.calls.at(-1)![0].detail.value).toBe(50);
    expect(completeHandler).toHaveBeenCalledOnce();
    expect(el.shadowRoot?.querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe(
      '50',
    );
  });

  it('does not drag when disabled', async () => {
    const el = await renderSlider(html`<ui-slider value="30" disabled></ui-slider>`);
    const handler = vi.fn();
    el.addEventListener('change', handler);
    el.shadowRoot
      ?.querySelector('.handle')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('changes value when dot is clicked', async () => {
    const el = await renderSlider(html`
      <ui-slider value="0" min="0" max="100" .marks=${{ 0: '0', 100: '100' }}></ui-slider>
    `);
    const handler = vi.fn();
    el.addEventListener('change', handler);
    el.shadowRoot
      ?.querySelector('.dot:last-child')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail.value).toBe(100);
  });

  it('steps between marks with keyboard when dots is true', async () => {
    const el = await renderSlider(html`
      <ui-slider
        value="0"
        min="0"
        max="100"
        .step=${null}
        dots
        .marks=${{ 0: '0', 50: '50', 100: '100' }}
      ></ui-slider>
    `);
    const handler = vi.fn();
    el.addEventListener('change', handler);
    const handle = el.shadowRoot!.querySelector('[role="slider"]')!;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(handler.mock.calls[0][0].detail.value).toBe(50);
  });

  it('hides track fill when marks use included=false', async () => {
    const el = await renderSlider(html`
      <ui-slider
        value="50"
        min="0"
        max="100"
        .included=${false}
        .marks=${{ 0: '0', 50: '50', 100: '100' }}
      ></ui-slider>
    `);
    const track = el.shadowRoot?.querySelector('.track') as HTMLElement;
    expect(track.style.width).toBe('0%');
  });

  it('supports vertical orientation drag', async () => {
    const el = await renderSlider(html`
      <ui-slider orientation="vertical" value="0" min="0" max="100" step="1"></ui-slider>
    `);
    expect(el.getAttribute('orientation')).toBe('vertical');

    const rail = el.shadowRoot!.querySelector('.rail') as HTMLElement;
    vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 4,
      height: 200,
      right: 4,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const handler = vi.fn();
    el.addEventListener('change', handler);
    el.shadowRoot
      ?.querySelector('.rail')
      ?.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, clientY: 100, pointerId: 2 }),
      );
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail.value).toBe(50);
  });

  it('shows tooltip on handle hover with custom formatter', async () => {
    const el = await renderSlider(html`
      <ui-slider
        value="42"
        min="0"
        max="100"
        .tooltip=${{ formatter: (v: number) => `${v}%` }}
      ></ui-slider>
    `);
    el.shadowRoot?.querySelector('.handle')?.dispatchEvent(new MouseEvent('mouseenter'));
    await el.updateComplete;
    await flushUpdates();

    const tooltip = el.shadowRoot?.querySelector('ui-tooltip') as {
      open?: boolean;
      title?: string;
    };
    expect(tooltip?.open).toBe(true);
    expect(tooltip?.title).toBe('42%');
  });

  it('respects tooltip open=false and formatter=null', async () => {
    const el = await renderSlider(html`
      <ui-slider
        value="30"
        .tooltip=${{ open: false, formatter: (v: number) => String(v) }}
      ></ui-slider>
    `);
    el.shadowRoot?.querySelector('.handle')?.dispatchEvent(new MouseEvent('mouseenter'));
    await el.updateComplete;
    expect((el.shadowRoot?.querySelector('ui-tooltip') as { open?: boolean })?.open).toBe(false);

    el.tooltip = { formatter: null };
    await el.updateComplete;
    expect((el.shadowRoot?.querySelector('ui-tooltip') as { disabled?: boolean })?.disabled).toBe(
      true,
    );
  });

  it('unbinds document drag listeners on disconnect', async () => {
    const el = await renderSlider();
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    el.shadowRoot
      ?.querySelector('.handle')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 3 }));
    cleanup?.();
    cleanup = undefined;
    expect(removeSpy.mock.calls.some(([type]) => type === 'pointermove')).toBe(true);
  });
});
