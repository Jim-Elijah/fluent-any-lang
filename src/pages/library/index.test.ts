import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from '../../test/db-helpers.js';
import { mount } from '../../components/ui/test-utils.js';
import './index.js';
import type { LibraryPage } from './index.js';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('library-page', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  async function renderPage() {
    const result = mount(html`<library-page></library-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('library-page') as LibraryPage;
    await el.updateComplete;
    return el;
  }

  it('renders search and sort controls with fill-height when tall', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    expect(el.shadowRoot?.querySelectorAll('ui-select').length).toBe(2);
    expect(el.shadowRoot?.querySelector('ui-input')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('ui-icon[name="search"]')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('media-list')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('record-list')).not.toBeNull();
    expect(el.compact).toBe(false);
    expect(
      (el.shadowRoot?.querySelector('media-list') as HTMLElement).hasAttribute('fill-height'),
    ).toBe(true);
    expect(
      (el.shadowRoot?.querySelector('record-list') as HTMLElement).hasAttribute('fill-height'),
    ).toBe(true);
  });

  it('disables fill-height in compact short viewport', async () => {
    stubMatchMedia(true);
    const el = await renderPage();
    expect(el.compact).toBe(true);
    expect(
      (el.shadowRoot?.querySelector('media-list') as HTMLElement).hasAttribute('fill-height'),
    ).toBe(false);
    expect(
      (el.shadowRoot?.querySelector('record-list') as HTMLElement).hasAttribute('fill-height'),
    ).toBe(false);
  });
});
