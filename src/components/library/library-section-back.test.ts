import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import { flushUpdates, mount } from '../ui/test-utils.js';
import type { LibrarySectionBack } from './library-section-back.js';
import './library-section-back.js';

describe('library-section-back', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    window.history.replaceState({}, '', '/library/records');
  });

  async function renderBack() {
    const result = mount(html`<library-section-back></library-section-back>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('library-section-back') as LibrarySectionBack;
    await el.updateComplete;
    await flushUpdates();
    return el;
  }

  it('hides when the hub hash is absent', async () => {
    const el = await renderBack();
    expect(el.hidden).toBe(true);
    expect(el.shadowRoot?.querySelector('button')).toBeNull();
  });

  it('shows 返回库 when opened with the hub hash', async () => {
    window.history.replaceState({}, '', '/library/records#k3');
    const el = await renderBack();
    expect(el.hidden).toBe(false);
    expect(el.shadowRoot?.textContent).toContain('返回库');
  });

  it('follows hash changes on the route event', async () => {
    const el = await renderBack();
    expect(el.hidden).toBe(true);

    window.history.replaceState({}, '', '/library/records#k3');
    window.dispatchEvent(new CustomEvent('route'));
    await el.updateComplete;

    expect(el.hidden).toBe(false);
    expect(el.shadowRoot?.querySelector('button')).not.toBeNull();
  });
});
