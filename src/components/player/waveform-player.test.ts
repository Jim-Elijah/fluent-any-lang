import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    vi.useRealTimers();
  });

  async function renderPlayer() {
    controller = new WaveformController();
    const trackId = controller.prepareLiveTrack('track');
    controller.updateLivePeaks(trackId, new Float32Array([0.2, 0.5, 0.3]), 10);
    controller.setActiveId(trackId);
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

  it('keeps view range on simple click so seek uses the zoomed timeline', async () => {
    vi.useFakeTimers();
    const el = await renderPlayer();
    const canvas = el.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    const setViewRangeSpy = vi.spyOn(controller, 'setViewRange');

    controller.setViewRange({ start: 2, end: 5 });
    setViewRangeSpy.mockClear();
    vi.spyOn(controller, 'seek').mockImplementation(() => {});
    vi.spyOn(controller, 'play').mockResolvedValue(undefined);

    const rect = { left: 0, top: 0, width: 100, height: 120, right: 100, bottom: 120 } as DOMRect;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect);

    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 10, bubbles: true }));
    vi.advanceTimersByTime(300);

    expect(setViewRangeSpy).not.toHaveBeenCalled();
  });

  it('resets view range on double click', async () => {
    const el = await renderPlayer();
    const canvas = el.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    const setViewRangeSpy = vi.spyOn(controller, 'setViewRange');

    controller.setViewRange({ start: 2, end: 5 });
    setViewRangeSpy.mockClear();

    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(setViewRangeSpy).toHaveBeenCalledWith(null);
  });

  it('pauses when clicking the active track while playing', async () => {
    vi.useFakeTimers();
    const el = await renderPlayer();
    const canvas = el.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    const pauseSpy = vi.spyOn(controller, 'pause');
    const playSpy = vi.spyOn(controller, 'play').mockResolvedValue(undefined);
    const seekSpy = vi.spyOn(controller, 'seek').mockImplementation(() => {});

    controller.isPlaying = true;
    const rect = { left: 0, top: 0, width: 100, height: 120, right: 100, bottom: 120 } as DOMRect;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect);

    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 10, bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).not.toHaveBeenCalled();
    expect(seekSpy).not.toHaveBeenCalled();
  });

  it('seeks and plays when clicking while paused', async () => {
    vi.useFakeTimers();
    const el = await renderPlayer();
    const canvas = el.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    const pauseSpy = vi.spyOn(controller, 'pause');
    const playSpy = vi.spyOn(controller, 'play').mockResolvedValue(undefined);
    const seekSpy = vi.spyOn(controller, 'seek').mockImplementation(() => {});

    controller.isPlaying = false;
    const rect = { left: 0, top: 0, width: 100, height: 120, right: 100, bottom: 120 } as DOMRect;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect);

    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 10, bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);

    expect(pauseSpy).not.toHaveBeenCalled();
    expect(seekSpy).toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
