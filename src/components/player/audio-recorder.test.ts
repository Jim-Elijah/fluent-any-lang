import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import { mount } from '../ui/test-utils.js';
import './audio-recorder.js';
import type { AudioRecorder } from './audio-recorder.js';

describe('audio-recorder component', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function renderRecorder() {
    const result = mount(html`<audio-recorder></audio-recorder>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('audio-recorder') as AudioRecorder;
    await el.updateComplete;
    return el;
  }

  it('renders recorder control buttons', async () => {
    const el = await renderRecorder();
    const buttons = el.shadowRoot?.querySelectorAll('ui-button');
    expect(buttons?.length).toBeGreaterThan(0);
  });

  it('starts inactive', async () => {
    const el = await renderRecorder();
    expect(el.shadowRoot?.textContent).toMatch(/inactive|未开始|开始/);
  });
});
