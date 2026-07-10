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

import './practice-view.js';
import type { PracticeView } from './practice-view.js';
import { mount } from '../ui/test-utils.js';

describe('practice-view', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderView() {
    const result = mount(
      html`<practice-view
        .routeContext=${{
          route: 'practice',
          params: { id: 'media-1' },
          query: {},
          data: {},
        }}
      ></practice-view>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-view') as PracticeView;
    await el.updateComplete;
    return el;
  }

  it('renders practice layout shell', async () => {
    const el = await renderView();
    expect(el.shadowRoot?.querySelector('.layout')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('media-player')).not.toBeNull();
  });
});
