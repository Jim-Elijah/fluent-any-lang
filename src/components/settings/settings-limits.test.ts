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

vi.mock('../../lib/export-content.js', () => ({
  estimateStorage: vi.fn(),
}));

import './settings-limits.js';
import type { SettingsLimits } from './settings-limits.js';
import { estimateStorage } from '../../lib/export-content.js';
import { setAppSettings } from '../../lib/app-settings.js';
import { Message } from '../ui/message.js';
import { mount } from '../ui/test-utils.js';

describe('settings-limits', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    settingsState.current = { ...DEFAULT_SETTINGS };
    vi.clearAllMocks();
    vi.mocked(estimateStorage).mockResolvedValue({ usage: 50_000_000, quota: 200_000_000 });
    Message.closeAll();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    Message.closeAll();
  });

  async function renderLimits() {
    const result = mount(html`<settings-limits></settings-limits>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('settings-limits') as SettingsLimits;
    await el.updateComplete;
    await Promise.resolve();
    return el;
  }

  function numberInputs(el: SettingsLimits) {
    return Array.from(el.shadowRoot?.querySelectorAll('ui-input[type="number"]') ?? []);
  }

  it('renders storage usage after estimateStorage resolves', async () => {
    const el = await renderLimits();

    expect(estimateStorage).toHaveBeenCalledOnce();
    expect(el.shadowRoot?.querySelector('.storage')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.storage-fill')?.getAttribute('style')).toContain('width');
  });

  it('saves clamped numeric changes and shows success message', async () => {
    const success = vi.spyOn(Message, 'success');
    const el = await renderLimits();
    const input = numberInputs(el)[0] as UiInputLike;
    const native = input.shadowRoot?.querySelector('input.control') as HTMLInputElement;

    native.value = '999';
    native.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    expect(setAppSettings).toHaveBeenCalledWith({ maxRecordingsPerMedia: 20 });
    expect(success).toHaveBeenCalledOnce();
  });

  it('clamps empty numeric input to the allowed minimum', async () => {
    const success = vi.spyOn(Message, 'success');
    const el = await renderLimits();
    const input = numberInputs(el)[0] as UiInputLike;
    const native = input.shadowRoot?.querySelector('input.control') as HTMLInputElement;

    native.value = '';
    native.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    expect(setAppSettings).toHaveBeenCalledWith({ maxRecordingsPerMedia: 1 });
    expect(success).toHaveBeenCalledOnce();
  });

  it('reloads storage when maxStorageMB changes', async () => {
    const el = await renderLimits();
    const maxStorageInput = numberInputs(el)[2] as UiInputLike;
    const native = maxStorageInput.shadowRoot?.querySelector('input.control') as HTMLInputElement;

    native.value = '300';
    native.dispatchEvent(new Event('input', { bubbles: true }));
    await el.updateComplete;

    expect(setAppSettings).toHaveBeenCalledWith({ maxStorageMB: 300 });
    expect(estimateStorage).toHaveBeenCalledTimes(2);
  });
});

type UiInputLike = HTMLElement & {
  shadowRoot: ShadowRoot;
  updateComplete: Promise<boolean>;
};
