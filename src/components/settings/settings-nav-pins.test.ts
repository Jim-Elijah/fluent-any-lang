import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type PinnableLibraryRoute,
} from '../../types/models.js';

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

import './settings-nav-pins.js';
import type { SettingsNavPins } from './settings-nav-pins.js';
import { setAppSettings } from '../../lib/app-settings.js';
import { mount } from '../ui/test-utils.js';

describe('settings-nav-pins', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    settingsState.current = { ...DEFAULT_SETTINGS, pinnedLibraryRoutes: [] };
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderPins(pinned: PinnableLibraryRoute[] = []) {
    cleanup?.();
    settingsState.current = { ...DEFAULT_SETTINGS, pinnedLibraryRoutes: pinned };
    const result = mount(html`<settings-nav-pins></settings-nav-pins>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('settings-nav-pins') as SettingsNavPins;
    await el.updateComplete;
    return el;
  }

  function switches(el: SettingsNavPins) {
    return Array.from(el.shadowRoot?.querySelectorAll('ui-switch') ?? []) as Array<
      HTMLElement & { checked: boolean; disabled: boolean; shadowRoot: ShadowRoot }
    >;
  }

  it('persists every pinnable route without a cap', async () => {
    const el = await renderPins(['library-media', 'library-sentences']);
    expect(el.shadowRoot?.textContent).toContain('导航快捷入口');
    expect(el.shadowRoot?.textContent).not.toContain('最多 2 项');
    expect(el.shadowRoot?.textContent).not.toContain('噪音素材');
    const all = switches(el);
    expect(all).toHaveLength(4);
    expect(all.every((sw) => !sw.disabled)).toBe(true);
    expect(all[0]?.checked).toBe(true);
    expect(all[2]?.checked).toBe(true);

    all[1]?.shadowRoot.querySelector('button')?.click();
    await el.updateComplete;
    expect(setAppSettings).toHaveBeenCalledWith({
      pinnedLibraryRoutes: ['library-media', 'library-sentences', 'library-playlists'],
    });
  });

  it('removes a pin from the row label', async () => {
    const el = await renderPins(['library-records']);
    const rows = el.shadowRoot?.querySelectorAll('.row');
    rows?.[3]
      ?.querySelector('.label-wrap')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(setAppSettings).toHaveBeenCalledWith({ pinnedLibraryRoutes: [] });
  });
});
