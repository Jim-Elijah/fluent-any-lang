import { html } from 'lit';
import { afterEach, describe, expect, it } from 'vitest';

import { flushUpdates, getPortalShadow, mount } from './test-utils.js';

describe('ui test-utils', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('mount renders template into document body', () => {
    const result = mount(html`<span id="mounted">ok</span>`);
    cleanup = result.cleanup;
    expect(result.container.querySelector('#mounted')?.textContent).toBe('ok');
    expect(document.body.contains(result.container)).toBe(true);
  });

  it('cleanup removes mounted container', () => {
    const result = mount(html`<span>tmp</span>`);
    result.cleanup();
    expect(document.body.contains(result.container)).toBe(false);
  });

  it('flushUpdates resolves after animation frame', async () => {
    await expect(flushUpdates()).resolves.toBeUndefined();
  });

  it('getPortalShadow returns null when host is missing', () => {
    expect(getPortalShadow('#missing-portal')).toBeNull();
  });
});
