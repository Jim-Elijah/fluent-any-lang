import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../../test/db-helpers.js';
import { mount } from '../../components/ui/test-utils.js';
import './index.js';
import type { LibraryPage } from './index.js';

describe('library-page', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderPage() {
    const result = mount(html`<library-page></library-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('library-page') as LibraryPage;
    await el.updateComplete;
    return el;
  }

  it('renders search and sort controls', async () => {
    const el = await renderPage();
    expect(el.shadowRoot?.querySelectorAll('ui-select').length).toBe(2);
    expect(el.shadowRoot?.querySelector('ui-input')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('ui-icon[name="search"]')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('media-list')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('record-list')).not.toBeNull();
    expect(
      (el.shadowRoot?.querySelector('media-list') as HTMLElement).hasAttribute('fill-height'),
    ).toBe(true);
    expect(
      (el.shadowRoot?.querySelector('record-list') as HTMLElement).hasAttribute('fill-height'),
    ).toBe(true);
  });
});
