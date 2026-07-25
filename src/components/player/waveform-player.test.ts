import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mount } from '../ui/test-utils.js';
import './waveform-player.js';
import type { WaveformPlayer } from './waveform-player.js';
import { WaveformController } from '../../controllers/waveform-controller.js';
import { WaveformPlayerEventType } from './waveform-player.js';

describe('waveform-player', () => {
  let cleanup: (() => void) | undefined;
  let controller: WaveformController;
  let mockCtx: {
    setTransform: ReturnType<typeof vi.fn>;
    clearRect: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    strokeRect: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    stroke: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
    arc: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockCtx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) =>
      type === '2d' ? (mockCtx as unknown as CanvasRenderingContext2D) : null,
    );
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    controller?.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setupCanvas(canvas: HTMLCanvasElement, width = 200, height = 120): DOMRect {
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: width });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: height });
    const rect = {
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
    } as DOMRect;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect);
    return rect;
  }

  async function renderPlayer(
    options: {
      tracks?: 'single' | 'multi';
      layout?: 'stack' | 'overlay';
      interactive?: boolean;
      canvasHeight?: number;
      resolveTrackViewRange?: WaveformPlayer['resolveTrackViewRange'];
    } = {},
  ) {
    controller = new WaveformController();
    const id1 = controller.prepareLiveTrack('Track 1');
    controller.updateLivePeaks(id1, new Float32Array([0.2, 0.5, 0.3, 0.4]), 10);
    if (options.tracks === 'multi') {
      const id2 = controller.prepareLiveTrack('Track 2');
      controller.updateLivePeaks(id2, new Float32Array([0.1, 0.8, 0.2, 0.6]), 10);
    }
    controller.setActiveId(id1);
    if (options.layout) {
      controller.setLayout(options.layout);
    }
    controller.currentTime = 3;

    const result = mount(
      html`<waveform-player
        .controller=${controller}
        .interactive=${options.interactive ?? true}
        .canvasHeight=${options.canvasHeight ?? 320}
        .resolveTrackViewRange=${options.resolveTrackViewRange ?? null}
      ></waveform-player>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('waveform-player') as WaveformPlayer;
    await el.updateComplete;
    const canvas = el.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    setupCanvas(canvas, 200, options.canvasHeight ?? 320);
    el.requestUpdate();
    await el.updateComplete;
    return { el, canvas };
  }

  async function clickCanvas(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY = 40,
    useTimers = true,
  ): Promise<void> {
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX, clientY, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('click', { clientX, clientY, bubbles: true }));
    if (useTimers) {
      await vi.advanceTimersByTimeAsync(300);
    }
  }

  it('renders canvas for waveform drawing', async () => {
    const { el } = await renderPlayer();
    expect(el.shadowRoot?.querySelector('canvas')).not.toBeNull();
  });

  it('keeps view range on simple click so seek uses the zoomed timeline', async () => {
    vi.useFakeTimers();
    const { canvas } = await renderPlayer();
    const setViewRangeSpy = vi.spyOn(controller, 'setViewRange');

    controller.setViewRange({ start: 2, end: 5 });
    setViewRangeSpy.mockClear();
    vi.spyOn(controller, 'seek').mockImplementation(() => {});
    vi.spyOn(controller, 'play').mockResolvedValue(undefined);

    await clickCanvas(canvas, 10);

    expect(setViewRangeSpy).not.toHaveBeenCalled();
  });

  it('resets view range on double click', async () => {
    const { canvas } = await renderPlayer();
    const setViewRangeSpy = vi.spyOn(controller, 'setViewRange');

    controller.setViewRange({ start: 2, end: 5 });
    setViewRangeSpy.mockClear();

    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(setViewRangeSpy).toHaveBeenCalledWith(null);
  });

  it('pauses when clicking the active track while playing', async () => {
    vi.useFakeTimers();
    const { canvas } = await renderPlayer();
    const pauseSpy = vi.spyOn(controller, 'pause');
    const playSpy = vi.spyOn(controller, 'play').mockResolvedValue(undefined);
    const seekSpy = vi.spyOn(controller, 'seek').mockImplementation(() => {});

    controller.isPlaying = true;
    await clickCanvas(canvas, 10);

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).not.toHaveBeenCalled();
    expect(seekSpy).not.toHaveBeenCalled();
  });

  it('seeks and plays when clicking while paused', async () => {
    vi.useFakeTimers();
    const { canvas } = await renderPlayer();
    const pauseSpy = vi.spyOn(controller, 'pause');
    const playSpy = vi.spyOn(controller, 'play').mockResolvedValue(undefined);
    const seekSpy = vi.spyOn(controller, 'seek').mockImplementation(() => {});

    controller.isPlaying = false;
    await clickCanvas(canvas, 10);

    expect(pauseSpy).not.toHaveBeenCalled();
    expect(seekSpy).toHaveBeenCalled();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('zooms view range when dragging a selection wider than the minimum', async () => {
    const { canvas } = await renderPlayer();
    const setViewRangeSpy = vi.spyOn(controller, 'setViewRange');

    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 20, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(setViewRangeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        start: expect.any(Number),
        end: expect.any(Number),
      }),
    );
    const call = setViewRangeSpy.mock.calls.at(-1)?.[0];
    expect(call!.end - call!.start).toBeGreaterThanOrEqual(0.05);
  });

  it('suppresses click seek after a drag selection', async () => {
    vi.useFakeTimers();
    const { canvas } = await renderPlayer();
    const seekSpy = vi.spyOn(controller, 'seek').mockImplementation(() => {});
    vi.spyOn(controller, 'play').mockResolvedValue(undefined);

    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 180, bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);

    expect(seekSpy).not.toHaveBeenCalled();
  });

  it('renders track legend and toggles track visibility', async () => {
    const { el } = await renderPlayer({ tracks: 'multi', layout: 'stack' });
    const labels = el.shadowRoot!.querySelectorAll('.track-label');
    expect(labels.length).toBe(2);

    (labels[1] as HTMLButtonElement).click();
    await el.updateComplete;
    expect(labels[1].classList.contains('hidden')).toBe(true);

    (labels[1] as HTMLButtonElement).click();
    await el.updateComplete;
    expect(labels[1].classList.contains('hidden')).toBe(false);
  });

  it('draws overlay layout waveforms for multiple tracks', async () => {
    const { el } = await renderPlayer({ tracks: 'multi', layout: 'overlay' });
    expect(el.shadowRoot?.querySelector('.track-legend')).not.toBeNull();
    expect(mockCtx.stroke).toHaveBeenCalled();
  });

  it('activates the clicked stack lane track on seek', async () => {
    vi.useFakeTimers();
    const { canvas } = await renderPlayer({ tracks: 'multi', layout: 'stack', canvasHeight: 120 });
    const tracks = controller.getSnapshot().tracks;
    const lowerTrackId = tracks[1]!.id;
    vi.spyOn(controller, 'play').mockResolvedValue(undefined);
    const setActiveSpy = vi.spyOn(controller, 'setActiveId');

    await clickCanvas(canvas, 50, 80);

    expect(setActiveSpy).toHaveBeenCalledWith(lowerTrackId);
  });

  it('dispatches seek-request and respects defaultPrevented', async () => {
    vi.useFakeTimers();
    const { el, canvas } = await renderPlayer();
    const onSeek = vi.fn((event: Event) => event.preventDefault());
    el.addEventListener(WaveformPlayerEventType.SEEK_REQUEST, onSeek);
    const playSpy = vi.spyOn(controller, 'play').mockResolvedValue(undefined);

    await clickCanvas(canvas, 50);
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('ignores pointer interaction when not interactive', async () => {
    vi.useFakeTimers();
    const { canvas } = await renderPlayer({ interactive: false });
    const setViewRangeSpy = vi.spyOn(controller, 'setViewRange');
    const seekSpy = vi.spyOn(controller, 'seek').mockImplementation(() => {});

    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 10, bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);

    expect(setViewRangeSpy).not.toHaveBeenCalled();
    expect(seekSpy).not.toHaveBeenCalled();
  });

  it('uses resolveTrackViewRange when drawing overlay tracks', async () => {
    const resolveTrackViewRange = vi.fn((_track, viewRange) => viewRange);
    await renderPlayer({
      tracks: 'multi',
      layout: 'overlay',
      resolveTrackViewRange,
    });
    expect(resolveTrackViewRange).toHaveBeenCalled();
  });

  it('syncs canvas height and re-renders on resize', async () => {
    const { el, canvas } = await renderPlayer({ canvasHeight: 180 });
    expect(canvas.style.height).toBe('180px');

    el.canvasHeight = 240;
    await el.updateComplete;
    expect(canvas.style.height).toBe('240px');

    window.dispatchEvent(new Event('resize'));
    await el.updateComplete;
    expect(canvas.width).toBeGreaterThan(0);
  });

  it('draws playhead for active track with view range', async () => {
    const { el } = await renderPlayer();
    controller.setViewRange({ start: 0, end: 10 });
    controller.currentTime = 5;
    await el.updateComplete;
    const canvas = el.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.width).toBeGreaterThan(0);
  });

  it('cleans up listeners on disconnect', async () => {
    const { el } = await renderPlayer();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    el.remove();
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });

  it('prunes hidden track ids when tracks are removed', async () => {
    const { el } = await renderPlayer({ tracks: 'multi', layout: 'stack' });
    const removedId = controller.getSnapshot().tracks[1]!.id;
    const labels = el.shadowRoot!.querySelectorAll('.track-label');
    (labels[1] as HTMLButtonElement).click();
    await el.updateComplete;

    controller.removeTrack(removedId);
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.track-legend')).toBeNull();
  });
});
