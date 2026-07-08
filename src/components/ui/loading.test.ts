import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Loading, UiLoadingMask } from './loading.js';
import { mount } from './test-utils.js';

describe('ui-loading-mask', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('renders spinner and optional text', async () => {
    const result = mount(html`<ui-loading-mask text="Loading..."></ui-loading-mask>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-loading-mask') as UiLoadingMask;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.circular')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.text')?.textContent).toBe('Loading...');
  });

  it('applies background style', async () => {
    const result = mount(html`<ui-loading-mask background="rgba(0,0,0,0.5)"></ui-loading-mask>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-loading-mask') as UiLoadingMask;
    await el.updateComplete;
    expect(el.style.background).toContain('rgba(0, 0, 0, 0.5)');
  });
});

describe('Loading service', () => {
  afterEach(() => {
    document.querySelectorAll('ui-loading-mask').forEach((el) => el.remove());
    document.body.classList.remove('ui-loading-parent--hidden');
    document.body.style.overflow = '';
  });

  it('creates fullscreen loading mask on body', () => {
    const instance = Loading({ text: 'Please wait' });
    const mask = document.querySelector('ui-loading-mask') as UiLoadingMask;
    expect(mask).not.toBeNull();
    expect(mask.text).toBe('Please wait');
    expect(mask.fullscreen).toBe(true);
    instance.close();
    expect(document.querySelector('ui-loading-mask')).toBeNull();
  });

  it('targets a specific element', () => {
    const target = document.createElement('div');
    target.id = 'loading-target';
    document.body.appendChild(target);

    const instance = Loading({ target: '#loading-target', fullscreen: false, text: 'Target' });
    expect(target.querySelector('ui-loading-mask')).not.toBeNull();
    instance.close();
    target.remove();
  });

  it('locks scroll when lock is true', () => {
    const instance = Loading({ lock: true });
    expect(document.body.classList.contains('ui-loading-parent--hidden')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    instance.close();
    expect(document.body.classList.contains('ui-loading-parent--hidden')).toBe(false);
  });

  it('reuses fullscreen instance and increments ref count', () => {
    const first = Loading({ text: 'One' });
    const second = Loading({ text: 'Two' });
    expect(document.querySelectorAll('ui-loading-mask').length).toBe(1);
    first.close();
    expect(document.querySelector('ui-loading-mask')).not.toBeNull();
    second.close();
    expect(document.querySelector('ui-loading-mask')).toBeNull();
  });

  it('calls closed callback after close', () => {
    const closed = vi.fn();
    const instance = Loading({ closed });
    instance.close();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('respects beforeClose returning false', async () => {
    const instance = Loading({
      beforeClose: () => false,
    });
    instance.close();
    expect(document.querySelector('ui-loading-mask')).not.toBeNull();
    Loading({ beforeClose: () => true }).close();
    document.querySelectorAll('ui-loading-mask').forEach((el) => el.remove());
  });
});
