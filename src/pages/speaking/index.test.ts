import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import { mount } from '../../components/ui/test-utils.js';
import './index.js';
import type { SpeakingPage } from './index.js';

describe('speaking-page', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderPage() {
    const result = mount(html`<speaking-page></speaking-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('speaking-page') as SpeakingPage;
    await el.updateComplete;
    return el;
  }

  it('renders audio recorder', async () => {
    const el = await renderPage();
    expect(el.shadowRoot?.querySelector('audio-recorder')).not.toBeNull();
    expect(el.shadowRoot?.textContent).toContain('speaking');
  });
});
