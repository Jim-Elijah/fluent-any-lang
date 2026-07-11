import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { USER_SETTINGS_STORAGE_KEY } from '../../lib/user-settings.js';
import { mount } from './test-utils.js';
import {
  Countdown,
  CountdownCancelledError,
  runRecordingCountdown,
  UiCountdownOverlay,
} from './countdown-overlay.js';

describe('ui-countdown-overlay', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.querySelectorAll('ui-countdown-overlay').forEach((el) => el.remove());
    document.body.classList.remove('ui-countdown-parent--hidden');
    document.body.style.overflow = '';
    localStorage.clear();
    vi.useRealTimers();
  });

  async function renderOverlay(seconds = 3) {
    const result = mount(html`<ui-countdown-overlay .seconds=${seconds}></ui-countdown-overlay>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('ui-countdown-overlay') as UiCountdownOverlay;
    await el.updateComplete;
    return el;
  }

  it('renders initial countdown number', async () => {
    const el = await renderOverlay(3);
    expect(el.shadowRoot?.querySelector('.number')?.textContent?.trim()).toBe('3');
  });

  it('decrements every second and shows go before complete', async () => {
    const el = await renderOverlay(2);
    const onComplete = vi.fn();
    el.addEventListener('complete', onComplete);

    await vi.advanceTimersByTimeAsync(1000);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.number')?.textContent?.trim()).toBe('1');

    await vi.advanceTimersByTimeAsync(1000);
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.number.go')?.textContent?.trim()).toBe('开始！');

    await vi.advanceTimersByTimeAsync(400);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('dispatches cancel when cancel button is clicked', async () => {
    const el = await renderOverlay(3);
    const onCancel = vi.fn();
    el.addEventListener('cancel', onCancel);

    el.shadowRoot?.querySelector<HTMLButtonElement>('.cancel')?.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('persists skip preference when checkbox is checked', async () => {
    const el = await renderOverlay(3);
    el.showSkipOption = true;
    await el.updateComplete;

    const checkbox = el.shadowRoot?.querySelector<HTMLInputElement>('.skip input');
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem(USER_SETTINGS_STORAGE_KEY)).toContain('true');
  });
});

describe('Countdown service', () => {
  afterEach(() => {
    document.querySelectorAll('ui-countdown-overlay').forEach((el) => el.remove());
    document.body.classList.remove('ui-countdown-parent--hidden');
    document.body.style.overflow = '';
    localStorage.clear();
  });

  async function waitForOverlay(): Promise<UiCountdownOverlay> {
    for (let i = 0; i < 20; i += 1) {
      const overlay = document.querySelector('ui-countdown-overlay') as UiCountdownOverlay | null;
      if (overlay) {
        await overlay.updateComplete;
        return overlay;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error('ui-countdown-overlay not mounted');
  }

  it('mounts fullscreen overlay on body', async () => {
    const promise = Countdown.run({ seconds: 1 });
    const overlay = await waitForOverlay();

    expect(overlay.fullscreen).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    await new Promise((resolve) => setTimeout(resolve, 1500));
    await promise;

    expect(document.querySelector('ui-countdown-overlay')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('rejects when cancelled', async () => {
    const promise = Countdown.run({ seconds: 3 });
    const overlay = await waitForOverlay();
    overlay.cancel();

    await expect(promise).rejects.toBeInstanceOf(CountdownCancelledError);
  });

  it('skips overlay when user opted out', async () => {
    localStorage.setItem(
      USER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ skipRecordingCountdown: true }),
    );

    await runRecordingCountdown();
    expect(document.querySelector('ui-countdown-overlay')).toBeNull();
  });
});
