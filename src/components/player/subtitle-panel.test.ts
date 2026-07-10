import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import { MediaController } from '../../controllers/media-controller.js';
import { mount } from '../ui/test-utils.js';
import './subtitle-panel.js';
import type { SubtitlePanel } from './subtitle-panel.js';

describe('subtitle-panel', () => {
  let cleanup: (() => void) | undefined;
  let controller: MediaController;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    controller.destroy();
  });

  async function renderPanel() {
    controller = new MediaController();
    const result = mount(
      html`<subtitle-panel .controller=${controller} mode="normal"></subtitle-panel>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('subtitle-panel') as SubtitlePanel;
    await el.updateComplete;
    return el;
  }

  it('renders subtitle panel shell', async () => {
    const el = await renderPanel();
    expect(el.shadowRoot?.querySelector('.surface')).not.toBeNull();
  });
});
