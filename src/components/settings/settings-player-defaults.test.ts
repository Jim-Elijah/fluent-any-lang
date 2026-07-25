import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, type AppSettings } from '../../types/models.js';

const settingsState: { current: AppSettings } = {
  current: { ...DEFAULT_SETTINGS },
};

vi.mock('../../lib/app-settings.js', () => ({
  getAppSettings: vi.fn(() => ({ ...settingsState.current })),
  setAppSettings: vi.fn((partial: Partial<AppSettings>) => {
    settingsState.current = { ...settingsState.current, ...partial };
    return { ...settingsState.current };
  }),
}));

import './settings-player-defaults.js';
import type { SettingsPlayerDefaults } from './settings-player-defaults.js';
import { setAppSettings } from '../../lib/app-settings.js';
import { Message } from '../ui/message.js';
import { mount } from '../ui/test-utils.js';

describe('settings-player-defaults', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    settingsState.current = { ...DEFAULT_SETTINGS };
    vi.clearAllMocks();
    Message.closeAll();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    Message.closeAll();
  });

  async function renderDefaults() {
    const result = mount(html`<settings-player-defaults></settings-player-defaults>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('settings-player-defaults') as SettingsPlayerDefaults;
    await el.updateComplete;
    return el;
  }

  it('saves loop mode changes from select', async () => {
    const success = vi.spyOn(Message, 'success');
    const el = await renderDefaults();
    const select = el.shadowRoot?.querySelector('ui-select') as UiSelectLike;

    select.dispatchEvent(
      new CustomEvent('change', {
        detail: { value: 'segment' },
        bubbles: true,
      }),
    );
    await el.updateComplete;

    expect(setAppSettings).toHaveBeenCalledWith({ defaultLoopMode: 'segment' });
    expect(success).toHaveBeenCalledOnce();
  });

  it('clamps numeric input changes', async () => {
    const el = await renderDefaults();
    const sleepInput = el.shadowRoot?.querySelector('ui-input[type="number"]') as UiInputLike;
    const native = sleepInput.shadowRoot?.querySelector('input.control') as HTMLInputElement;

    native.value = '999';
    native.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    expect(setAppSettings).toHaveBeenCalledWith({ defaultSleepMinutes: 90 });
  });

  it('saves slider changes for volume defaults', async () => {
    const success = vi.spyOn(Message, 'success');
    const el = await renderDefaults();
    const slider = el.shadowRoot?.querySelector('ui-slider') as UiSliderLike;

    slider.dispatchEvent(
      new CustomEvent('change', {
        detail: { value: 0.8 },
        bubbles: true,
      }),
    );
    await el.updateComplete;

    expect(setAppSettings).toHaveBeenCalledWith({ defaultSourceVolume: 0.8 });
    expect(success).toHaveBeenCalledOnce();
  });

  it('does not toast when clamped value is unchanged', async () => {
    const success = vi.spyOn(Message, 'success');
    const el = await renderDefaults();
    const pauseInput = Array.from(
      el.shadowRoot?.querySelectorAll('ui-input[type="number"]') ?? [],
    )[1] as UiInputLike;
    const native = pauseInput.shadowRoot?.querySelector('input.control') as HTMLInputElement;

    native.value = '100';
    native.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    expect(setAppSettings).toHaveBeenCalledWith({ repeatPausePercent: 100 });
    expect(success).not.toHaveBeenCalled();
  });
});

type UiInputLike = HTMLElement & { shadowRoot: ShadowRoot; updateComplete: Promise<boolean> };
type UiSelectLike = HTMLElement & { updateComplete: Promise<boolean> };
type UiSliderLike = HTMLElement & { updateComplete: Promise<boolean> };
