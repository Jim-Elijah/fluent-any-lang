import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import { mount } from '../ui/test-utils.js';
import './media-player.js';
import type { MediaPlayer } from './media-player.js';

describe('media-player', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderPlayer() {
    const result = mount(html`<media-player></media-player>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('media-player') as MediaPlayer;
    await el.updateComplete;
    return el;
  }

  it('renders player shell when no media is selected', async () => {
    const el = await renderPlayer();
    expect(el.shadowRoot?.textContent).toContain('未选择媒体');
  });
});
