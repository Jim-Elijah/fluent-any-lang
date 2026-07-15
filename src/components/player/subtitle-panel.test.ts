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
      seekDisabled?: boolean;
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
        .seekDisabled=${options.seekDisabled ?? false}
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

  it('shows import subtitle CTA when media has no subtitles', async () => {
    controller = new MediaController();
    await controller.loadTracks([makeTrack('a', 'Track A', [])]);

    const result = mount(html`<subtitle-panel .controller=${controller}></subtitle-panel>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('subtitle-panel') as SubtitlePanel;
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.textContent).toContain('当前媒体没有字幕');
    expect(el.shadowRoot?.textContent).toContain('导入字幕');
    expect(el.shadowRoot?.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('labels echo recordings by creation order with newest first in the menu', async () => {
    const el = await renderPanel();
    el.echoMode = true;
    el.echoRecordingsBySegmentId = {
      s1: [
        {
          id: 'newest',
          mediaId: 'a',
          mediaTitle: 'Track A',
          mediaFilename: 'Track A.mp3',
          mode: 'echo',
          segmentId: 's1',
          mimeType: 'audio/webm',
          createdAt: 300,
          sourceDuration: 2,
          recordingDuration: 2,
          segments: [],
        },
        {
          id: 'oldest',
          mediaId: 'a',
          mediaTitle: 'Track A',
          mediaFilename: 'Track A.mp3',
          mode: 'echo',
          segmentId: 's1',
          mimeType: 'audio/webm',
          createdAt: 100,
          sourceDuration: 2,
          recordingDuration: 2,
          segments: [],
        },
        {
          id: 'middle',
          mediaId: 'a',
          mediaTitle: 'Track A',
          mediaFilename: 'Track A.mp3',
          mode: 'echo',
          segmentId: 's1',
          mimeType: 'audio/webm',
          createdAt: 200,
          sourceDuration: 2,
          recordingDuration: 2,
          segments: [],
        },
      ],
    };
    await el.updateComplete;
    await flushUpdates();

    const dropdown = el.shadowRoot?.querySelector('ui-dropdown.echo-select') as {
      menu?: { items: Array<{ key: string; label: string }> };
    } | null;
    expect(dropdown?.menu?.items).toEqual([
      { key: 'newest', label: '录音 3' },
      { key: 'middle', label: '录音 2' },
      { key: 'oldest', label: '录音 1' },
    ]);
  });

  it('does not seek when seekDisabled and marks list as navigation-locked', async () => {
    const el = await renderPanel({ seekDisabled: true });
    const seekSpy = vi.spyOn(controller, 'seekToSegment');

    expect(el.shadowRoot?.querySelector('ul.list')?.classList.contains('navigation-locked')).toBe(
      true,
    );

    const secondRow = el.shadowRoot?.querySelector(
      '[data-segment-index="1"]',
    ) as HTMLElement | null;
    secondRow?.click();
    await el.updateComplete;

    expect(seekSpy).not.toHaveBeenCalled();
  });

  it('seeks on segment click when seek is enabled', async () => {
    const el = await renderPanel();
    const seekSpy = vi.spyOn(controller, 'seekToSegment');

    expect(el.shadowRoot?.querySelector('ul.list')?.classList.contains('navigation-locked')).toBe(
      false,
    );

    const secondRow = el.shadowRoot?.querySelector(
      '[data-segment-index="1"]',
    ) as HTMLElement | null;
    secondRow?.click();
    await el.updateComplete;

    expect(seekSpy).toHaveBeenCalledWith(1);
  });
});
