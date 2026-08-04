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

import './settings-preferences.js';
import type { SettingsPreferences } from './settings-preferences.js';
import { setAppSettings } from '../../lib/app-settings.js';
import { mount } from '../ui/test-utils.js';

type TipKey =
  | 'skipRecordingCountdown'
  | 'skipShadowingTips'
  | 'skipEchoTips'
  | 'skipDiscriminationTips';

const PREFERENCE_TOGGLES: ReadonlyArray<{ key: TipKey; rowIndex: number }> = [
  { key: 'skipRecordingCountdown', rowIndex: 0 },
  { key: 'skipShadowingTips', rowIndex: 1 },
  { key: 'skipEchoTips', rowIndex: 2 },
  { key: 'skipDiscriminationTips', rowIndex: 3 },
];

describe('settings-preferences', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    settingsState.current = { ...DEFAULT_SETTINGS };
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderPreferences(overrides: Partial<AppSettings> = {}) {
    settingsState.current = { ...DEFAULT_SETTINGS, ...overrides };
    const result = mount(html`<settings-preferences></settings-preferences>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('settings-preferences') as SettingsPreferences;
    await el.updateComplete;
    return el;
  }

  function switches(el: SettingsPreferences) {
    return Array.from(el.shadowRoot?.querySelectorAll('ui-switch') ?? []);
  }

  function rows(el: SettingsPreferences) {
    return Array.from(el.shadowRoot?.querySelectorAll('.row') ?? []) as HTMLElement[];
  }

  it('renders all preference switches from current settings', async () => {
    const el = await renderPreferences();
    expect(switches(el).length).toBe(4);
    expect(switches(el).every((sw) => !(sw as UiSwitchLike).checked)).toBe(true);
    expect(el.shadowRoot?.querySelector('ui-select')).not.toBeNull();
  });

  it('persists shadowing gap policy from the select control', async () => {
    const el = await renderPreferences();
    const select = el.shadowRoot?.querySelector('ui-select') as HTMLElement & {
      dispatchEvent: (event: Event) => boolean;
    };
    select.dispatchEvent(
      new CustomEvent('change', {
        detail: { value: 'preserve', option: { value: 'preserve', label: 'preserve' } },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    expect(setAppSettings).toHaveBeenCalledWith({ shadowingGapPolicy: 'preserve' });
  });

  it.each(PREFERENCE_TOGGLES)(
    'persists $key from the switch control',
    async ({ key, rowIndex }) => {
      const el = await renderPreferences();
      const sw = switches(el)[rowIndex] as UiSwitchLike;
      sw.shadowRoot?.querySelector('button')?.click();
      await el.updateComplete;

      expect(setAppSettings).toHaveBeenCalledWith({ [key]: true });
      expect(sw.checked).toBe(true);
    },
  );

  it.each(PREFERENCE_TOGGLES)(
    'toggles $key from row click outside the switch',
    async ({ key, rowIndex }) => {
      const el = await renderPreferences();
      rows(el)[rowIndex]?.querySelector('.label-wrap')?.click();
      await el.updateComplete;

      expect(setAppSettings).toHaveBeenCalledWith({ [key]: true });
    },
  );

  it.each(PREFERENCE_TOGGLES)('toggles $key from Enter on a row', async ({ key, rowIndex }) => {
    const el = await renderPreferences();
    rows(el)[rowIndex]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await el.updateComplete;

    expect(setAppSettings).toHaveBeenCalledWith({ [key]: true });
  });

  it.each(PREFERENCE_TOGGLES)('toggles $key from Space on a row', async ({ key, rowIndex }) => {
    const el = await renderPreferences();
    rows(el)[rowIndex]?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await el.updateComplete;

    expect(setAppSettings).toHaveBeenCalledWith({ [key]: true });
  });

  it.each(PREFERENCE_TOGGLES)('turns $key off when already enabled', async ({ key, rowIndex }) => {
    const el = await renderPreferences({ [key]: true });
    rows(el)[rowIndex]?.querySelector('.label-wrap')?.click();
    await el.updateComplete;

    expect(setAppSettings).toHaveBeenCalledWith({ [key]: false });
    expect((switches(el)[rowIndex] as UiSwitchLike).checked).toBe(false);
  });

  it('does not toggle from row click on the switch element', async () => {
    const el = await renderPreferences();
    const sw = switches(el)[0] as UiSwitchLike;
    sw.click();
    await el.updateComplete;

    expect(setAppSettings).toHaveBeenCalledTimes(0);
  });

  it('ignores unrelated keyboard keys on a row', async () => {
    const el = await renderPreferences();
    rows(el)[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    await el.updateComplete;

    expect(setAppSettings).not.toHaveBeenCalled();
  });
});

type UiSwitchLike = HTMLElement & {
  checked: boolean;
  shadowRoot: ShadowRoot;
  updateComplete: Promise<boolean>;
};
