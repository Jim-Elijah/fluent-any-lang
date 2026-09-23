import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDecodeAudioData = vi.fn();

vi.mock('../../lib/audio-context.js', () => ({
  getAudioContext: vi.fn(() => ({
    decodeAudioData: mockDecodeAudioData,
  })),
}));

import { MediaController } from '../../controllers/media-controller.js';
import { mount } from '../ui/test-utils.js';
import './speaking-source-align-toolbar.js';
import type { SpeakingSourceAlignToolbar } from './speaking-source-align-toolbar.js';
import type { WaveformPlayer } from './waveform-player.js';

const mockGetAppSettings = vi.fn(() => ({
  speechAlignApiUrl: 'https://align.example/api/v1/pronunciation/align',
  speechScoreApiKey: 'key',
  wordMarkerLayout: 'duration' as const,
}));

vi.mock('../../lib/app-settings.js', () => ({
  getAppSettings: () => mockGetAppSettings(),
  setAppSettings: (patch: Record<string, unknown>) => ({
    ...mockGetAppSettings(),
    ...patch,
  }),
}));

vi.mock('../../db/media.js', () => ({
  getMediaBlob: vi.fn(async () => new Blob(['audio'], { type: 'audio/mpeg' })),
}));

vi.mock('../../lib/pronunciation-align/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/pronunciation-align/index.js')>();
  return {
    ...actual,
    resolveWholeMediaAlignBlockedTip: vi.fn(async () => null),
    hasCurrentMediaSourceWordAlignment: vi.fn(async () => false),
    alignAllPracticeSegments: vi.fn(async () => ({
      ok: true,
      succeeded: 1,
      failed: 0,
      skipped: 0,
    })),
    resolveSegmentSourceWords: vi.fn(async () => []),
  };
});

function makeDecodedBuffer(duration = 5, length = 100): AudioBuffer {
  return {
    duration,
    length,
    sampleRate: 48_000,
    numberOfChannels: 1,
    getChannelData: () => {
      const data = new Float32Array(length);
      data[0] = 0.2;
      data[Math.floor(length / 2)] = -0.8;
      return data;
    },
  } as AudioBuffer;
}

function railToggleButton(el: SpeakingSourceAlignToolbar): HTMLElement | undefined {
  return Array.from(el.shadowRoot?.querySelectorAll('ui-button') ?? []).find((b) =>
    /显示词轨|隐藏词轨/.test(b.textContent ?? ''),
  ) as HTMLElement | undefined;
}

describe('speaking-source-align-toolbar', () => {
  let cleanup: (() => void) | undefined;
  let controller: MediaController;

  beforeEach(() => {
    mockDecodeAudioData.mockResolvedValue(makeDecodedBuffer());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type) =>
      type === '2d'
        ? ({
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
          } as unknown as CanvasRenderingContext2D)
        : null,
    );
    mockGetAppSettings.mockReturnValue({
      speechAlignApiUrl: 'https://align.example/api/v1/pronunciation/align',
      speechScoreApiKey: 'key',
      wordMarkerLayout: 'duration',
    });
    controller = new MediaController();
    controller.segments = [
      { id: 's0', startTime: 0, endTime: 2, text: 'one' },
      { id: 's1', startTime: 2, endTime: 4, text: 'two' },
    ];
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
  });

  it('hides align controls when speech align is not configured', async () => {
    mockGetAppSettings.mockReturnValue({
      speechAlignApiUrl: '',
      speechScoreApiKey: '',
      wordMarkerLayout: 'duration',
    });
    const mounted = mount(
      html`<speaking-source-align-toolbar
        .controller=${controller}
        mediaId="m1"
      ></speaking-source-align-toolbar>`,
    );
    cleanup = mounted.cleanup;
    const el = mounted.container.querySelector(
      'speaking-source-align-toolbar',
    ) as SpeakingSourceAlignToolbar;
    await el.updateComplete;
    expect(el.shadowRoot?.textContent?.trim()).toBe('');
  });

  it('enables rail toggle after source waveform loads', async () => {
    const mounted = mount(
      html`<speaking-source-align-toolbar
        .controller=${controller}
        mediaId="m1"
      ></speaking-source-align-toolbar>`,
    );
    cleanup = mounted.cleanup;
    const el = mounted.container.querySelector(
      'speaking-source-align-toolbar',
    ) as SpeakingSourceAlignToolbar;
    await el.updateComplete;

    await vi.waitFor(async () => {
      await el.updateComplete;
      const toggle = railToggleButton(el) as { disabled?: boolean } | undefined;
      expect(toggle?.disabled).toBe(false);
      expect(toggle?.textContent).toContain('显示词轨');
    });
  });

  it('sets waveform-player non-interactive when sessionLocked', async () => {
    const mounted = mount(
      html`<speaking-source-align-toolbar
        .controller=${controller}
        mediaId="m1"
        .sessionLocked=${true}
      ></speaking-source-align-toolbar>`,
    );
    cleanup = mounted.cleanup;
    const el = mounted.container.querySelector(
      'speaking-source-align-toolbar',
    ) as SpeakingSourceAlignToolbar;
    await el.updateComplete;
    await vi.waitFor(async () => {
      await el.updateComplete;
      const toggle = railToggleButton(el) as { disabled?: boolean } | undefined;
      expect(toggle?.disabled).toBe(false);
    });
    const railToggle = railToggleButton(el);
    railToggle?.click();
    await el.updateComplete;
    await vi.waitFor(async () => {
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('waveform-player')).toBeTruthy();
      expect(railToggleButton(el)?.textContent).toContain('隐藏词轨');
    });
    const player = el.shadowRoot?.querySelector('waveform-player') as WaveformPlayer | null;
    expect(player?.interactive).toBe(false);
  });
});
