import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SAMPLE_SPRITE =
  "<svg><symbol id='icon-play' viewBox='0 0 24 24'><path d='M0 0'/></symbol></svg>";

import './icon-registry.js';
import './tooltip.js';
import './icon.js';
import './icon-button.js';
import { UIIconButton } from './icon-button.js';
import { mount } from './test-utils.js';

describe('ui-icon-button', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    window._iconfont_svg_string_5204781 = SAMPLE_SPRITE;
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderIconButton(
    template = html`<ui-icon-button name="play" title="Play"></ui-icon-button>`,
  ) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-icon-button') as UIIconButton;
    await el.updateComplete;
    return el;
  }

  it('renders button with icon and tooltip', async () => {
    const el = await renderIconButton();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('ui-tooltip')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('button')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('ui-icon')).not.toBeNull();
  });

  it('sets aria-label from title', async () => {
    const el = await renderIconButton();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('button')?.getAttribute('aria-label')).toBe('Play');
  });

  it('disables button when disabled', async () => {
    const el = await renderIconButton(
      html`<ui-icon-button name="play" title="Play" disabled></ui-icon-button>`,
    );
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('button')?.disabled).toBe(true);
  });

  it('forwards click to host when enabled', async () => {
    const el = await renderIconButton();
    await el.updateComplete;
    const clickHandler = vi.fn();
    el.addEventListener('click', clickHandler);
    el.shadowRoot?.querySelector('button')?.click();
    expect(clickHandler).toHaveBeenCalledOnce();
  });
});
