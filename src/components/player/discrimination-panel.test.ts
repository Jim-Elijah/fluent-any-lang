import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_DISCRIMINATION_SETTINGS,
  DISCRIMINATION_MAX_NOISE_TRACKS,
  type DiscriminationSettings,
  type NoiseItem,
} from '../../types/models.js';

const getMaxPlaybackRate = vi.fn(() => 2);

vi.mock('../../lib/app-settings.js', () => ({
  getMaxPlaybackRate: () => getMaxPlaybackRate(),
}));

import './discrimination-panel.js';
import type { DiscriminationPanel } from './discrimination-panel.js';
import { mount } from '../ui/test-utils.js';

function makeNoise(id: string, title: string): NoiseItem {
  return {
    id,
    title,
    filename: `${id}.mp3`,
    size: 100,
    mimeType: 'audio/mpeg',
    duration: 30,
    createdAt: 1,
  };
}

describe('discrimination-panel', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    getMaxPlaybackRate.mockReturnValue(2);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
  });

  async function renderPanel(
    options: {
      settings?: DiscriminationSettings;
      noiseItems?: NoiseItem[];
      ladderSequence?: number[];
      ladderDisplayIndex?: number;
      currentRate?: number;
    } = {},
  ) {
    const settings = options.settings ?? {
      ...DEFAULT_DISCRIMINATION_SETTINGS,
      ladderCount: 2,
      ladderRates: [1, 1.5],
    };
    const result = mount(html`
      <discrimination-panel
        .settings=${settings}
        .noiseItems=${options.noiseItems ?? []}
        .ladderSequence=${options.ladderSequence ?? []}
        .ladderDisplayIndex=${options.ladderDisplayIndex ?? 0}
        .currentRate=${options.currentRate ?? 1}
      ></discrimination-panel>
    `);
    cleanup = result.cleanup;
    const el = result.container.querySelector('discrimination-panel') as DiscriminationPanel;
    await el.updateComplete;
    return el;
  }

  it('shows empty noise hint and emits open-library', async () => {
    const el = await renderPanel();
    expect(el.shadowRoot?.textContent).toContain('暂无噪音素材');

    const openLibrary = vi.fn();
    el.addEventListener('open-library', openLibrary);
    el.shadowRoot
      ?.querySelector('.hint ui-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(openLibrary).toHaveBeenCalledOnce();
  });

  it('emits open-tips when tips button is clicked', async () => {
    const el = await renderPanel();
    const openTips = vi.fn();
    el.addEventListener('open-tips', openTips);

    el.shadowRoot
      ?.querySelector('.tips-summary ui-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(openTips).toHaveBeenCalledOnce();
  });

  it('renders noise rows and emits toggle and volume events', async () => {
    const noiseItems = [makeNoise('n1', 'Rain'), makeNoise('n2', 'Traffic')];
    const settings: DiscriminationSettings = {
      selected: [{ noiseId: 'n1', volume: 0.4 }],
      ladderCount: 1,
      ladderRates: [1],
    };
    const el = await renderPanel({ noiseItems, settings });

    const rows = el.shadowRoot?.querySelectorAll('.noise-item-row');
    expect(rows?.length).toBe(2);
    expect(el.shadowRoot?.querySelector('ui-volume-control')).not.toBeNull();

    const toggleHandler = vi.fn();
    el.addEventListener('noise-toggle', toggleHandler);
    const unchecked = el.shadowRoot?.querySelector(
      '.noise-item-row:nth-child(2) input[type="checkbox"]',
    ) as HTMLInputElement;
    unchecked.checked = true;
    unchecked.dispatchEvent(new Event('change', { bubbles: true }));
    expect(toggleHandler).toHaveBeenCalledOnce();
    expect(toggleHandler.mock.calls[0][0].detail).toEqual({ noiseId: 'n2', on: true });

    const volumeHandler = vi.fn();
    el.addEventListener('noise-volume', volumeHandler);
    el.shadowRoot?.querySelector('ui-volume-control')?.dispatchEvent(
      new CustomEvent('change', {
        detail: { value: 0.8 },
        bubbles: true,
        composed: true,
      }),
    );
    expect(volumeHandler).toHaveBeenCalledOnce();
    expect(volumeHandler.mock.calls[0][0].detail).toEqual({ noiseId: 'n1', volume: 0.8 });
  });

  it('clamps selection at DISCRIMINATION_MAX_NOISE_TRACKS', async () => {
    const noiseItems = [
      makeNoise('n1', 'A'),
      makeNoise('n2', 'B'),
      makeNoise('n3', 'C'),
      makeNoise('n4', 'D'),
    ];
    const settings: DiscriminationSettings = {
      selected: [
        { noiseId: 'n1', volume: 0.5 },
        { noiseId: 'n2', volume: 0.5 },
        { noiseId: 'n3', volume: 0.5 },
      ],
      ladderCount: 1,
      ladderRates: [1],
    };
    expect(settings.selected.length).toBe(DISCRIMINATION_MAX_NOISE_TRACKS);

    const el = await renderPanel({ noiseItems, settings });
    const toggleHandler = vi.fn();
    el.addEventListener('noise-toggle', toggleHandler);

    const fourth = el.shadowRoot?.querySelector(
      '.noise-item-row:nth-child(4) input[type="checkbox"]',
    ) as HTMLInputElement;
    fourth.checked = true;
    fourth.dispatchEvent(new Event('change', { bubbles: true }));

    expect(fourth.checked).toBe(false);
    expect(toggleHandler).toHaveBeenCalledOnce();
    expect(toggleHandler.mock.calls[0][0].detail).toEqual({ noiseId: 'n4', on: true });
  });

  it('emits ladder-count and ladder-rate events from selects', async () => {
    const el = await renderPanel({
      settings: {
        selected: [],
        ladderCount: 2,
        ladderRates: [1, 1.5],
      },
    });

    const countHandler = vi.fn();
    const rateHandler = vi.fn();
    el.addEventListener('ladder-count', countHandler);
    el.addEventListener('ladder-rate', rateHandler);

    const countSelect = el.shadowRoot?.querySelector(
      '.discrimination-ladder-row ui-select',
    ) as HTMLElement;
    countSelect.dispatchEvent(
      new CustomEvent('change', {
        detail: { value: '3' },
        bubbles: true,
        composed: true,
      }),
    );
    expect(countHandler).toHaveBeenCalledOnce();
    expect(countHandler.mock.calls[0][0].detail).toEqual({ count: 3 });

    const rateSelects = el.shadowRoot?.querySelectorAll('.discrimination-ladder-rates ui-select');
    rateSelects?.[1]?.dispatchEvent(
      new CustomEvent('change', {
        detail: { value: '1.25' },
        bubbles: true,
        composed: true,
      }),
    );
    expect(rateHandler).toHaveBeenCalledOnce();
    expect(rateHandler.mock.calls[0][0].detail).toEqual({ index: 1, rate: 1.25 });
  });

  it('filters ladder rate options by getMaxPlaybackRate', async () => {
    getMaxPlaybackRate.mockReturnValue(1.5);
    const el = await renderPanel({
      settings: {
        selected: [],
        ladderCount: 1,
        ladderRates: [1],
      },
    });

    const rateSelect = el.shadowRoot?.querySelector(
      '.discrimination-ladder-rates ui-select',
    ) as HTMLElement & { options: { value: string }[] };
    await rateSelect.updateComplete;
    const values = rateSelect.options.map((option) => Number(option.value));
    expect(values.every((rate) => rate <= 1.5 + 1e-9)).toBe(true);
    expect(values).toContain(1.5);
    expect(values).not.toContain(2);
  });

  it('shows sequence preview and step progress when ladderSequence is non-empty', async () => {
    const el = await renderPanel({
      ladderSequence: [1, 1.5, 1],
      ladderDisplayIndex: 1,
      currentRate: 1.5,
    });

    const preview = el.shadowRoot?.querySelector('.ladder-sequence-preview');
    expect(preview?.textContent).toContain('1x → 1.5x → 1x');
    expect(el.shadowRoot?.querySelector('.ladder-progress')?.textContent).toContain('2/3');
    expect(el.shadowRoot?.querySelector('.ladder-progress')?.textContent).toContain('1.5x');
  });

  it('omits step progress when ladderSequence is empty', async () => {
    const el = await renderPanel({ ladderSequence: [] });
    expect(el.shadowRoot?.querySelector('.ladder-sequence-preview')?.textContent).toContain(
      '将播放：',
    );
    expect(el.shadowRoot?.querySelector('.ladder-progress')?.textContent?.trim()).toBe('');
  });
});
