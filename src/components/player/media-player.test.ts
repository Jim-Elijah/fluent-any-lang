import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import { MediaController, type LoadedTrack } from '../../controllers/media-controller.js';
import { flushUpdates, getPortalShadow, mount } from '../ui/test-utils.js';
import './media-player.js';
import type { MediaPlayer } from './media-player.js';
import type { UiSlider } from '../ui/slider.js';
import type { UiDropdown } from '../ui/dropdown.js';

function makeTrack(): LoadedTrack {
  return {
    item: {
      id: 'a',
      title: 'Track A',
      filename: 'a.mp3',
      size: 100,
      type: 'audio',
      mimeType: 'audio/mpeg',
      duration: 30,
      createdAt: 1,
      hasSubtitles: false,
    },
    blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    segments: [],
  };
}

describe('media-player', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.querySelectorAll('[data-ui-dropdown-portal]').forEach((el) => el.remove());
  });

  async function renderPlayer(controller?: MediaController) {
    const result = mount(
      controller
        ? html`<media-player .controller=${controller}></media-player>`
        : html`<media-player></media-player>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('media-player') as MediaPlayer;
    await el.updateComplete;
    return el;
  }

  it('renders player shell when no media is selected', async () => {
    const el = await renderPlayer();
    expect(el.shadowRoot?.textContent).toContain('未选择媒体');
  });

  it('renders playback rate as text trigger', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);

    const el = await renderPlayer(controller);
    await el.updateComplete;
    await flushUpdates();

    const rateTrigger = el.shadowRoot?.querySelector('.rate-trigger');
    expect(rateTrigger?.textContent?.trim()).toBe('1.0x');

    controller.destroy();
  });

  it('updates volume overlay after slider change', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);

    const el = await renderPlayer(controller);
    await el.updateComplete;
    await flushUpdates();

    expect(el.controller).toBe(controller);

    const dropdowns = el.shadowRoot?.querySelectorAll('ui-dropdown') ?? [];
    expect(dropdowns.length).toBeGreaterThanOrEqual(2);
    const volumeDropdown = dropdowns[dropdowns.length - 1] as UiDropdown;

    volumeDropdown.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await volumeDropdown.updateComplete;
    await flushUpdates();

    const portal = getPortalShadow('[data-ui-dropdown-portal]');
    const slider = portal?.querySelector('ui-slider') as UiSlider;
    expect(slider).toBeTruthy();

    slider.dispatchEvent(
      new CustomEvent('change', { detail: { value: 0.42 }, bubbles: true, composed: true }),
    );
    await el.updateComplete;
    await volumeDropdown.updateComplete;
    await flushUpdates();

    expect(controller.getSnapshot().volume).toBe(0.42);
    expect(portal?.querySelector('.overlay-panel-label')?.textContent).toContain('42');
    expect((portal?.querySelector('ui-slider') as UiSlider).value).toBe(0.42);

    controller.destroy();
  });

  it('hides advanced settings when advancedSetting is false', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);

    const result = mount(
      html`<media-player
        .controller=${controller}
        .controlsConfig=${{ advancedSetting: false }}
      ></media-player>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('media-player') as MediaPlayer;
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.querySelector('.settings-toggle-btn')).toBeNull();
    expect(el.shadowRoot?.querySelector('.settings-panel')).toBeNull();

    controller.destroy();
  });
});
