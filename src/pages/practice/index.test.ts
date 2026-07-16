import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/media-loader.js', () => ({
  loadPlaylistForPlayback: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../lib/export-content.js', () => ({
  estimateStorage: vi.fn().mockResolvedValue({
    usage: 0,
    quota: 100,
    remaining: 100,
    remainingPercent: 100,
  }),
}));

import './index.js';
import type { PracticePage } from './index.js';
import { mount } from '../../components/ui/test-utils.js';

describe('practice-page', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderPage() {
    const result = mount(
      html`<practice-page
        .routeContext=${{
          route: 'practice',
          params: {},
          query: { mediaId: 'media-1' },
          data: {},
        }}
      ></practice-page>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-page') as PracticePage;
    await el.updateComplete;
    return el;
  }

  it('renders practice-view with route context', async () => {
    const el = await renderPage();
    const view = el.shadowRoot?.querySelector('practice-view');
    expect(view).not.toBeNull();
  });
});
