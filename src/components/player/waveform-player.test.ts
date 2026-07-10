import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import { mount } from '../ui/test-utils.js';
import './waveform-player.js';
import type { WaveformPlayer } from './waveform-player.js';
import { WaveformController } from '../../controllers/waveform-controller.js';

describe('waveform-player', () => {
  let cleanup: (() => void) | undefined;
  let controller: WaveformController;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    controller.destroy();
  });

  async function renderPlayer() {
    controller = new WaveformController();
    const result = mount(html`<waveform-player .controller=${controller}></waveform-player>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('waveform-player') as WaveformPlayer;
    await el.updateComplete;
    return el;
  }

  it('renders canvas for waveform drawing', async () => {
    const el = await renderPlayer();
    expect(el.shadowRoot?.querySelector('canvas')).not.toBeNull();
  });
});
