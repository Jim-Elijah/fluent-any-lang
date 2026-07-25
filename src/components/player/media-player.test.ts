import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

class MockGainNode {
  gain = { value: 1 };
  disconnect = vi.fn();
  connect = vi.fn();
}

class MockMediaElementSource {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);

  createGain(): MockGainNode {
    return new MockGainNode();
  }

  createMediaElementSource(): MockMediaElementSource {
    return new MockMediaElementSource();
  }
}

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('webkitAudioContext', MockAudioContext);

import { MediaController, type LoadedTrack } from '../../controllers/media-controller.js';
import { MediaEventType, MAX_SLEEP_MINUTES } from '../../lib/playback-utils.js';
import type { SubtitleSegment } from '../../types/models.js';
import { flushUpdates, getPortalShadow, mount } from '../ui/test-utils.js';
import './media-player.js';
import type { MediaPlayer } from './media-player.js';
import type { UiDropdown } from '../ui/dropdown.js';
import type { UiSlider } from '../ui/slider.js';
import type { UiSelect } from '../ui/select.js';

const sampleSegments: SubtitleSegment[] = [
  { id: 's0', startTime: 0, endTime: 5, text: 'one' },
  { id: 's1', startTime: 5, endTime: 10, text: 'two' },
];

function makeTrack(
  options: {
    id?: string;
    title?: string;
    type?: 'audio' | 'video';
    segments?: SubtitleSegment[];
    cover?: string;
  } = {},
): LoadedTrack {
  const type = options.type ?? 'audio';
  const segments = options.segments ?? [];
  return {
    item: {
      id: options.id ?? 'a',
      title: options.title ?? 'Track A',
      filename: `${options.id ?? 'a'}.${type === 'video' ? 'mp4' : 'mp3'}`,
      size: 100,
      type,
      mimeType: type === 'video' ? 'video/mp4' : 'audio/mpeg',
      duration: 30,
      createdAt: 1,
      hasSubtitles: segments.length > 0,
      cover: options.cover,
    },
    blob: new Blob([type], { type: type === 'video' ? 'video/mp4' : 'audio/mpeg' }),
    segments,
  };
}

const defaultControls = {
  loopMode: true,
  sleepMode: true,
  pauseMode: true,
  playPause: true,
  volume: true,
  playbackRate: true,
  progress: true,
  previousNextTrack: true,
  previousNextSegment: false,
  replay: false,
  switchMode: false,
  advancedSetting: true,
} as const;

describe('media-player', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.querySelectorAll('[data-ui-dropdown-portal]').forEach((el) => el.remove());
    document.querySelectorAll('[data-ui-select-portal]').forEach((el) => el.remove());
  });

  async function renderPlayer(
    controller?: MediaController,
    attrs: {
      mode?: MediaPlayer['mode'];
      controlsConfig?: Partial<MediaPlayer['controlsConfig']>;
      collapsed?: boolean;
      disabled?: boolean;
    } = {},
  ) {
    const result = mount(
      controller
        ? html`<media-player
            .controller=${controller}
            mode=${attrs.mode ?? 'normal'}
            ?collapsed=${attrs.collapsed ?? false}
            ?disabled=${attrs.disabled ?? false}
            .controlsConfig=${{ ...defaultControls, ...attrs.controlsConfig }}
          ></media-player>`
        : html`<media-player></media-player>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('media-player') as MediaPlayer;
    await el.updateComplete;
    await flushUpdates();
    return el;
  }

  function clickIcon(el: MediaPlayer, name: string): HTMLElement | null {
    const buttons = el.shadowRoot?.querySelectorAll('ui-icon-button') ?? [];
    for (const button of buttons) {
      if (button.getAttribute('name') === name) {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return button as HTMLElement;
      }
    }
    return null;
  }

  function openSettings(el: MediaPlayer): void {
    el.shadowRoot
      ?.querySelector('.settings-toggle-btn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  it('renders player shell when no media is selected', async () => {
    const el = await renderPlayer();
    expect(el.shadowRoot?.textContent).toContain('未选择媒体');
  });

  it('renders playback rate as text trigger', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);

    const el = await renderPlayer(controller);
    const rateTrigger = el.shadowRoot?.querySelector('.rate-trigger');
    expect(rateTrigger?.textContent?.trim()).toBe('1.0x');

    controller.destroy();
  });

  it('highlights volume icon when boosted above 1', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    controller.setVolume(1.2);

    const el = await renderPlayer(controller);
    expect(el.shadowRoot?.querySelector('.volume-trigger--boosted')).toBeTruthy();

    controller.setVolume(1);
    await el.updateComplete;
    await flushUpdates();
    expect(el.shadowRoot?.querySelector('.volume-trigger--boosted')).toBeNull();

    controller.destroy();
  });

  it('updates volume overlay after slider change', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);

    const el = await renderPlayer(controller);
    const dropdowns = el.shadowRoot?.querySelectorAll('ui-dropdown') ?? [];
    const volumeDropdown = dropdowns[dropdowns.length - 1] as UiDropdown;

    volumeDropdown.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await volumeDropdown.updateComplete;
    await flushUpdates();

    const portal = getPortalShadow('[data-ui-dropdown-portal]');
    const slider = portal?.querySelector('ui-slider') as UiSlider;
    slider.dispatchEvent(
      new CustomEvent('change', { detail: { value: 0.42 }, bubbles: true, composed: true }),
    );
    await el.updateComplete;
    await flushUpdates();

    expect(controller.getSnapshot().volume).toBe(0.42);
    expect(portal?.querySelector('.overlay-panel-label')?.textContent).toContain('42');

    controller.destroy();
  });

  it('hides advanced settings when advancedSetting is false', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);

    const result = mount(
      html`<media-player
        .controller=${controller}
        .controlsConfig=${{ ...defaultControls, advancedSetting: false }}
      ></media-player>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('media-player') as MediaPlayer;
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.settings-toggle-btn')).toBeNull();
    controller.destroy();
  });

  it('toggles play and pause from the main control', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    const toggleSpy = vi.spyOn(controller, 'togglePlay').mockResolvedValue(undefined);

    const el = await renderPlayer(controller);
    clickIcon(el, 'play');
    expect(toggleSpy).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('seeks when progress slider changes', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    const seekSpy = vi.spyOn(controller, 'seek');

    const el = await renderPlayer(controller);
    const slider = el.shadowRoot?.querySelector('.progress-bar-wrap ui-slider') as UiSlider;
    slider.dispatchEvent(
      new CustomEvent('change', { detail: { value: 12.5 }, bubbles: true, composed: true }),
    );

    expect(seekSpy).toHaveBeenCalledWith(12.5);
    controller.destroy();
  });

  it('updates playback rate from rate dropdown slider', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);

    const el = await renderPlayer(controller);
    const rateDropdown = el.shadowRoot?.querySelector('ui-dropdown') as UiDropdown;
    rateDropdown.shadowRoot
      ?.querySelector('.trigger')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await rateDropdown.updateComplete;
    await flushUpdates();

    const portal = getPortalShadow('[data-ui-dropdown-portal]');
    const slider = portal?.querySelector('ui-slider') as UiSlider;
    slider.dispatchEvent(
      new CustomEvent('change', { detail: { value: 1.5 }, bubbles: true, composed: true }),
    );

    expect(controller.getSnapshot().playbackRate).toBe(1.5);
    controller.destroy();
  });

  it('navigates tracks and segments from control buttons', async () => {
    const controller = new MediaController();
    await controller.loadTracks([
      makeTrack({ id: 'a', title: 'A', segments: sampleSegments }),
      makeTrack({ id: 'b', title: 'B' }),
    ]);
    controller.seekToSegment(1);

    const el = await renderPlayer(controller, {
      controlsConfig: { previousNextSegment: true, replay: true },
    });
    const prevTrack = vi.spyOn(controller, 'previousTrack');
    const nextTrack = vi.spyOn(controller, 'nextTrack');
    const prevSegment = vi.spyOn(controller, 'previousSegment');
    const nextSegment = vi.spyOn(controller, 'nextSegment');
    const replay = vi.spyOn(controller, 'replaySegment');

    clickIcon(el, 'previous');
    clickIcon(el, 'next');
    clickIcon(el, 'backward');
    clickIcon(el, 'forward');
    clickIcon(el, 'replay');

    expect(prevTrack).toHaveBeenCalled();
    expect(nextTrack).toHaveBeenCalled();
    expect(prevSegment).toHaveBeenCalled();
    expect(nextSegment).toHaveBeenCalled();
    expect(replay).toHaveBeenCalled();
    controller.destroy();
  });

  it('updates advanced settings controls', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack({ segments: sampleSegments })]);
    controller.setPauseMode('seconds');
    controller.setSleepMode('minutes');

    const el = await renderPlayer(controller);
    openSettings(el);
    await el.updateComplete;
    await flushUpdates();

    const selects = el.shadowRoot?.querySelectorAll('ui-select') ?? [];
    expect(selects.length).toBeGreaterThan(0);

    (selects[0] as UiSelect).dispatchEvent(
      new CustomEvent('change', { detail: { value: 'single' }, bubbles: true, composed: true }),
    );
    expect(controller.getSnapshot().loopMode).toBe('single');

    const pauseSecondsSlider = [
      ...el.shadowRoot!.querySelectorAll('.settings-grid ui-slider'),
    ].find((slider) => Number((slider as UiSlider).max) === 30) as UiSlider;
    pauseSecondsSlider.dispatchEvent(
      new CustomEvent('change', { detail: { value: 8 }, bubbles: true, composed: true }),
    );
    expect(controller.getSnapshot().pauseSeconds).toBe(8);

    const pauseModeSelect = [...selects].find((node) =>
      node.closest('.setting-item')?.textContent?.includes('单句暂停模式'),
    ) as UiSelect;
    pauseModeSelect.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'percentage' }, bubbles: true, composed: true }),
    );
    await el.updateComplete;
    await flushUpdates();

    const pausePercentSlider = [
      ...el.shadowRoot!.querySelectorAll('.settings-grid ui-slider'),
    ].find((slider) => Number((slider as UiSlider).max) === 500) as UiSlider;
    pausePercentSlider.dispatchEvent(
      new CustomEvent('change', { detail: { value: 200 }, bubbles: true, composed: true }),
    );
    expect(controller.getSnapshot().pausePercent).toBe(200);

    const sleepModeSelect = [...selects].find((node) =>
      node.closest('.setting-item')?.textContent?.includes('睡眠模式'),
    ) as UiSelect;
    sleepModeSelect.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'minutes' }, bubbles: true, composed: true }),
    );
    await el.updateComplete;

    const sleepSlider = [...el.shadowRoot!.querySelectorAll('.settings-grid ui-slider')].find(
      (slider) => Number((slider as UiSlider).max) === MAX_SLEEP_MINUTES,
    ) as UiSlider;
    expect(sleepSlider).toBeTruthy();
    sleepSlider.dispatchEvent(
      new CustomEvent('change', { detail: { value: 15 }, bubbles: true, composed: true }),
    );
    expect(controller.getSnapshot().sleepMinutes).toBe(15);

    controller.destroy();
  });

  it('shows sleep banner and cancels sleep timer', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    controller.setSleepMode('until-end');

    const el = await renderPlayer(controller);
    expect(el.shadowRoot?.querySelector('.sleep-status')).not.toBeNull();

    const cancelSpy = vi.spyOn(controller, 'cancelSleep');
    el.shadowRoot
      ?.querySelector('.sleep-status ui-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cancelSpy).toHaveBeenCalled();
    controller.destroy();
  });

  it('renders mini mode controls and cycles back to normal', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack({ cover: 'cover.png' })]);

    const el = await renderPlayer(controller, {
      mode: 'mini',
      controlsConfig: { switchMode: true },
    });
    expect(el.shadowRoot?.querySelector('.mini-player')).not.toBeNull();

    const onModeChange = vi.fn();
    el.addEventListener('mode-change', onModeChange);
    el.shadowRoot
      ?.querySelector('.mini-expand-btn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    expect(onModeChange).toHaveBeenCalled();
    controller.destroy();
  });

  it('toggles video visibility without removing the video element', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack({ type: 'video' })]);

    const el = await renderPlayer(controller);
    const wrap = el.shadowRoot?.querySelector('.media-wrap.is-video');
    expect(wrap?.classList.contains('video-hidden')).toBe(false);
    expect(clickIcon(el, 'video-off')).not.toBeNull();

    await el.updateComplete;
    expect(wrap?.classList.contains('video-hidden')).toBe(true);
    expect(el.shadowRoot?.querySelector('video')).not.toBeNull();
    expect(clickIcon(el, 'video')).not.toBeNull();

    await el.updateComplete;
    expect(wrap?.classList.contains('video-hidden')).toBe(false);
    controller.destroy();
  });

  it('does not show video visibility toggle for audio tracks', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack({ type: 'audio' })]);

    const el = await renderPlayer(controller);
    expect(clickIcon(el, 'video-off')).toBeNull();
    expect(clickIcon(el, 'video')).toBeNull();
    controller.destroy();
  });

  it('toggles fixed collapse and renders video surface', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack({ type: 'video' })]);

    const el = await renderPlayer(controller, { mode: 'fixed' });
    expect(el.shadowRoot?.querySelector('video')).not.toBeNull();

    el.shadowRoot
      ?.querySelector('.fixed-switcher')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    expect(el.collapsed).toBe(true);
    controller.destroy();
  });

  it('forwards controller media events and supports resetSettings', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);
    const resetSpy = vi.spyOn(controller, 'resetSettings');

    const el = await renderPlayer(controller);
    const forwarded = vi.fn();
    el.addEventListener(MediaEventType.PLAY, forwarded);
    controller.dispatchEvent(new CustomEvent(MediaEventType.PLAY, { detail: {} }));

    expect(forwarded).toHaveBeenCalledTimes(1);
    el.resetSettings();
    expect(resetSpy).toHaveBeenCalled();

    const nextController = new MediaController();
    await nextController.loadTracks([makeTrack({ id: 'b', title: 'B' })]);
    el.controller = nextController;
    await el.updateComplete;
    controller.destroy();
    nextController.destroy();
  });

  it('plays from cover art and video click targets', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack({ type: 'video', cover: 'cover.png' })]);
    const toggleSpy = vi.spyOn(controller, 'togglePlay').mockResolvedValue(undefined);

    const el = await renderPlayer(controller);
    el.shadowRoot
      ?.querySelector('.pic-wrap')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    el.shadowRoot
      ?.querySelector('video')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(toggleSpy).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it('cycles display modes when switchMode is enabled', async () => {
    const controller = new MediaController();
    await controller.loadTracks([makeTrack()]);

    const el = await renderPlayer(controller, { controlsConfig: { switchMode: true } });
    const onModeChange = vi.fn();
    el.addEventListener('mode-change', onModeChange);

    clickIcon(el, 'media');
    await el.updateComplete;
    expect(el.mode).toBe('fixed');
    expect(onModeChange).toHaveBeenCalled();

    clickIcon(el, 'media');
    await el.updateComplete;
    expect(el.mode).toBe('mini');

    el.shadowRoot
      ?.querySelector('.mini-expand-btn')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    expect(el.mode).toBe('normal');
    controller.destroy();
  });
});
