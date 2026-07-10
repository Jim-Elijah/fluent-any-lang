import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SAMPLE_SPRITE =
  "<svg><symbol id='icon-play' viewBox='0 0 24 24'><path d='M0 0'/></symbol></svg>";

import './icon-registry.js';
import './icon.js';
import { UIIcon } from './icon.js';
import { mount } from './test-utils.js';

describe('ui-icon', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    window._iconfont_svg_string_5204781 = SAMPLE_SPRITE;
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderIcon(template = html`<ui-icon name="play"></ui-icon>`) {
    const result = mount(template);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-icon') as UIIcon;
    await el.updateComplete;
    return el;
  }

  it('renders svg after registry loads', async () => {
    const el = await renderIcon();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('svg')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('ui-tooltip')).toBeNull();
  });

  it('renders nothing when name is empty', async () => {
    const el = await renderIcon(html`<ui-icon name=""></ui-icon>`);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('svg')).toBeNull();
  });

  it('does not dispatch click events', async () => {
    const el = await renderIcon();
    await el.updateComplete;
    const clickHandler = vi.fn();
    el.addEventListener('click', clickHandler);
    el.shadowRoot?.querySelector('svg')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clickHandler).not.toHaveBeenCalled();
  });

  it('applies custom size style', async () => {
    const el = await renderIcon(html`<ui-icon name="play" size="24px"></ui-icon>`);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('svg')?.getAttribute('style')).toContain(
      '--ui-icon-size:24px',
    );
  });
});
