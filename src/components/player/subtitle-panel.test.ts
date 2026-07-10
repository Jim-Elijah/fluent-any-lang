import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MediaController, type LoadedTrack } from '../../controllers/media-controller.js';
import type { SubtitleSegment } from '../../types/models.js';
import { flushUpdates, getPortalShadow, mount } from '../ui/test-utils.js';
import './subtitle-panel.js';
import type { SubtitlePanel } from './subtitle-panel.js';

function makeTrack(id: string, title: string, segments: SubtitleSegment[] = []): LoadedTrack {
  return {
    item: {
      id,
      title,
      filename: `${title}.mp3`,
      size: 100,
      type: 'audio',
      mimeType: 'audio/mpeg',
      duration: 30,
      createdAt: 1,
      hasSubtitles: segments.length > 0,
    },
    blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    segments,
  };
}

describe('subtitle-panel', () => {
  let cleanup: (() => void) | undefined;
  let controller: MediaController;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    controller.destroy();
    document.querySelector('[data-subtitle-fullscreen-portal]')?.remove();
  });

  async function renderPanel(
    options: {
      fullscreen?: boolean;
      defaultFullscreen?: boolean;
      showFullscreenIcon?: boolean;
    } = {},
  ) {
    controller = new MediaController();
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 2, text: 'hello' },
      { id: 's2', startTime: 2, endTime: 4, text: 'world' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', segments)]);

    const result = mount(html`
      <subtitle-panel
        .controller=${controller}
        .fullscreen=${options.fullscreen}
        ?default-fullscreen=${options.defaultFullscreen ?? false}
        .showFullscreenIcon=${options.showFullscreenIcon ?? true}
      ></subtitle-panel>
    `);
    cleanup = result.cleanup;
    const el = result.container.querySelector('subtitle-panel') as SubtitlePanel;
    await el.updateComplete;
    await flushUpdates();
    return el;
  }

  it('renders subtitle panel shell', async () => {
    const el = await renderPanel();
    expect(el.shadowRoot?.querySelector('.surface')).not.toBeNull();
  });

  function clickShadowButton(el: SubtitlePanel, index: number): void {
    const button = el.shadowRoot?.querySelectorAll('ui-button')[index];
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  }

  it('opens fullscreen portal in uncontrolled mode', async () => {
    const el = await renderPanel();
    expect(el.shadowRoot?.querySelectorAll('ui-button').length).toBeGreaterThan(1);
    clickShadowButton(el, 1);
    await el.updateComplete;
    await flushUpdates();

    const portal = getPortalShadow('[data-subtitle-fullscreen-portal]');
    expect(portal?.querySelector('.list.fullscreen')).not.toBeNull();
    expect(portal?.querySelector('.list.fullscreen')?.textContent).toContain('hello');
  });

  it('closes fullscreen when close icon is clicked', async () => {
    const el = await renderPanel({ defaultFullscreen: true });
    const portal = getPortalShadow('[data-subtitle-fullscreen-portal]');
    expect(portal?.querySelector('.fullscreen-panel')).not.toBeNull();

    portal?.querySelector('ui-button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(
      getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector('.fullscreen-panel'),
    ).toBeNull();
  });

  it('supports controlled fullscreen from parent', async () => {
    const el = await renderPanel({ fullscreen: false });

    el.fullscreen = true;
    await el.updateComplete;
    await flushUpdates();

    expect(
      getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector('.fullscreen-panel'),
    ).not.toBeNull();

    el.fullscreen = false;
    await el.updateComplete;
    await flushUpdates();

    expect(
      getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector('.fullscreen-panel'),
    ).toBeNull();
  });

  it('emits update:fullscreen when toggled in uncontrolled mode', async () => {
    const el = await renderPanel();
    const handler = vi.fn();
    el.addEventListener('update:fullscreen', handler);

    clickShadowButton(el, 1);
    await el.updateComplete;
    await flushUpdates();

    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls.at(-1)?.[0].detail).toEqual({ fullscreen: true });
  });

  it('closes fullscreen on Escape', async () => {
    const el = await renderPanel({ defaultFullscreen: true });
    expect(
      getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector('.fullscreen-panel'),
    ).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(
      getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector('.fullscreen-panel'),
    ).toBeNull();
    expect(el.fullscreen).toBeUndefined();
  });
});
