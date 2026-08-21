import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import './index.js';
import type { SettingsPage } from './index.js';
import { mount } from '../../components/ui/test-utils.js';

const CHILD_TAGS = [
  'settings-preferences',
  'settings-player-defaults',
  'settings-limits',
  'settings-speech-score',
  'settings-backup',
  'settings-pwa',
  'settings-diagnostics',
  'settings-clear-data',
] as const;

describe('settings-page', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderPage() {
    const result = mount(html`<settings-page></settings-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('settings-page') as SettingsPage;
    await el.updateComplete;
    await Promise.all(
      CHILD_TAGS.map(async (tag) => {
        const child = el.shadowRoot?.querySelector(tag) as HTMLElement | null;
        if (child && 'updateComplete' in child) {
          await (child as LitElementLike).updateComplete;
        }
      }),
    );
    return el;
  }

  it('renders sticky nav groups and all settings child sections', async () => {
    const el = await renderPage();

    expect(el.shadowRoot?.querySelector('.nav')).not.toBeNull();
    expect(el.shadowRoot?.querySelectorAll('.group').length).toBe(4);

    for (const tag of CHILD_TAGS) {
      expect(el.shadowRoot?.querySelector(tag)).not.toBeNull();
    }
  });
});

type LitElementLike = { updateComplete: Promise<boolean> };
