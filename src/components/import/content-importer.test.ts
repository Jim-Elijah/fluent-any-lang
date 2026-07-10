import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/import-content.js', () => ({
  importContentFiles: vi.fn().mockResolvedValue({ imported: [], errors: [] }),
}));

import './content-importer.js';
import type { ContentImporter } from './content-importer.js';
import { mount } from '../ui/test-utils.js';

describe('content-importer', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderImporter() {
    const result = mount(html`<content-importer></content-importer>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('content-importer') as ContentImporter;
    await el.updateComplete;
    return el;
  }

  it('renders dropzone and file input', async () => {
    const el = await renderImporter();
    expect(el.shadowRoot?.querySelector('.dropzone')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('input[type="file"]')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('ui-button')).not.toBeNull();
  });
});
