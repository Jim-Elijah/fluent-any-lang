import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import { mount } from '../ui/test-utils.js';
import './recording-preview.js';
import type { RecordingPreview } from './recording-preview.js';

describe('recording-preview', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderPreview() {
    const result = mount(html`<recording-preview></recording-preview>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('recording-preview') as RecordingPreview;
    await el.updateComplete;
    return el;
  }

  it('renders preview shell without blobs', async () => {
    const el = await renderPreview();
    expect(el.shadowRoot?.querySelector('.preview')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('waveform-player')).not.toBeNull();
  });

  it('shows idle dual-track status by default', async () => {
    const el = await renderPreview();
    expect(el.shadowRoot?.textContent).toMatch(/idle|空闲|同步/);
  });
});
