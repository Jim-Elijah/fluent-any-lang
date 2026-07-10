import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mount } from '../../components/ui/test-utils.js';
import './index.js';
import type { NotFoundPage } from './index.js';

describe('not-found-page', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.useRealTimers();
  });

  async function renderPage() {
    const result = mount(html`<not-found-page></not-found-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('not-found-page') as NotFoundPage;
    await el.updateComplete;
    return el;
  }

  it('renders countdown message', async () => {
    const el = await renderPage();
    expect(el.shadowRoot?.querySelector('h1')?.textContent).toMatch(/未找到|not found/i);
    expect(el.shadowRoot?.textContent).toMatch(/3/);
  });

  it('decrements countdown over time', async () => {
    const el = await renderPage();
    vi.advanceTimersByTime(1000);
    await el.updateComplete;
    expect(el.shadowRoot?.textContent).toMatch(/2/);
  });
});
