import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../i18n/localization.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../i18n/localization.js')>();
  return {
    ...actual,
    getLocale: vi.fn(() => 'zh-CN'),
    changeLocale: vi.fn().mockResolvedValue(undefined),
  };
});

import './index.js';
import type { HomePage } from './index.js';
import { mount } from '../../components/ui/test-utils.js';

describe('home-page', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderPage() {
    const result = mount(html`<home-page></home-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('home-page') as HomePage;
    await el.updateComplete;
    return el;
  }

  it('renders dashboard, importer and library sections', async () => {
    const el = await renderPage();
    expect(el.shadowRoot?.querySelector('practice-stats-dashboard')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('content-importer')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('media-list')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('practice-stats-dashboard')).not.toBeNull();
  });
});
