import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n/localization.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../i18n/localization.js')>();
  return {
    ...actual,
    getLocale: vi.fn(() => 'zh-CN'),
    changeLocale: vi.fn().mockResolvedValue(undefined),
  };
});

import { html } from 'lit';
import { mount } from '../components/ui/test-utils.js';
import '../app/my-app.js';
import type { MyApp } from '../app/my-app.js';

describe('app-shell', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(async () => {
    const { resetDatabase } = await import('../test/db-helpers.js');
    await resetDatabase();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderApp() {
    const result = mount(html`<app-shell></app-shell>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('app-shell') as MyApp;
    await el.updateComplete;
    return el;
  }

  it('renders navigation and outlet shell', async () => {
    const el = await renderApp();
    expect(el.shadowRoot?.querySelector('.layout')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('locale-switcher')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('ui-menu')).not.toBeNull();
  });
});
