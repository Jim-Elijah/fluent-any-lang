import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sampleCounts = {
  media: 2,
  subtitles: 3,
  recordings: 4,
  sessions: 1,
  playlists: 1,
  sentenceBank: 0,
  noise: 0,
};

vi.mock('../../lib/clear-local-data.js', () => ({
  getLocalDataCounts: vi.fn(),
  isLocalDataEmpty: vi.fn((counts: typeof sampleCounts) =>
    Object.values(counts).every((value) => value === 0),
  ),
  clearAllLearningData: vi.fn(),
}));

vi.mock('../../lib/error-reporter.js', () => ({
  reportError: vi.fn(),
}));

import './settings-clear-data.js';
import type { SettingsClearData } from './settings-clear-data.js';
import {
  clearAllLearningData,
  getLocalDataCounts,
  isLocalDataEmpty,
} from '../../lib/clear-local-data.js';
import { reportError } from '../../lib/error-reporter.js';
import { UiModal } from '../ui/modal.js';
import { Message } from '../ui/message.js';
import { flushUpdates, mount } from '../ui/test-utils.js';

function queryComponentModal<T extends Element = Element>(
  el: SettingsClearData,
  selector: string,
): T | null {
  const modal = el.shadowRoot?.querySelector('ui-modal');
  return modal?.shadowRoot?.querySelector(selector) as T | null;
}

function modalHost(el: SettingsClearData): UiModal | null {
  return el.shadowRoot?.querySelector('ui-modal') ?? null;
}

async function confirmOpenModal(el: SettingsClearData) {
  queryComponentModal<HTMLButtonElement>(el, '.btn.primary')?.click();
  await flushUpdates();
  await el.updateComplete;
}

describe('settings-clear-data', () => {
  let cleanup: (() => void) | undefined;
  const assign = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLocalDataCounts).mockResolvedValue({ ...sampleCounts });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign },
    });
    Message.closeAll();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    Message.closeAll();
  });

  async function renderClearData() {
    const result = mount(html`<settings-clear-data></settings-clear-data>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('settings-clear-data') as SettingsClearData;
    await el.updateComplete;
    await Promise.resolve();
    return el;
  }

  function dangerButton(el: SettingsClearData): HTMLButtonElement | null | undefined {
    return el.shadowRoot
      ?.querySelector('ui-button[variant="danger"]')
      ?.shadowRoot?.querySelector('button');
  }

  it('enables clear action when local data exists', async () => {
    const el = await renderClearData();

    expect(getLocalDataCounts).toHaveBeenCalledOnce();
    expect(isLocalDataEmpty).toHaveBeenCalled();
    expect(dangerButton(el)?.disabled).toBe(false);
  });

  it('disables clear action and shows hint when data is empty', async () => {
    vi.mocked(getLocalDataCounts).mockResolvedValue({
      media: 0,
      subtitles: 0,
      recordings: 0,
      sessions: 0,
      playlists: 0,
      sentenceBank: 0,
      noise: 0,
    });
    const el = await renderClearData();

    expect(dangerButton(el)?.disabled).toBe(true);
    expect(el.shadowRoot?.textContent).toMatch(/没有可清除的学习数据/);
  });

  it('requires acknowledgement before confirming clear', async () => {
    const el = await renderClearData();

    dangerButton(el)?.click();
    await flushUpdates();

    expect(queryComponentModal(el, '.dialog')).not.toBeNull();
    expect(modalHost(el)?.okButtonPropsDisabled).toBe(true);

    const checkbox = modalHost(el)?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;

    expect(modalHost(el)?.okButtonPropsDisabled).toBe(false);
  });

  it('clears data and redirects home after confirmation', async () => {
    vi.mocked(clearAllLearningData).mockResolvedValue(undefined);
    const success = vi.spyOn(Message, 'success');
    const el = await renderClearData();

    dangerButton(el)?.click();
    await flushUpdates();

    const checkbox = modalHost(el)?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;

    await confirmOpenModal(el);

    expect(clearAllLearningData).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith('/');
  });

  it('reports clear errors', async () => {
    vi.mocked(clearAllLearningData).mockRejectedValue(new Error('clear failed'));
    const error = vi.spyOn(Message, 'error');
    const el = await renderClearData();

    dangerButton(el)?.click();
    await flushUpdates();

    const checkbox = modalHost(el)?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;

    await confirmOpenModal(el);

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('clear failed');
    expect(assign).not.toHaveBeenCalled();
  });

  it('handles count fetch errors', async () => {
    vi.mocked(getLocalDataCounts).mockRejectedValue(new Error('counts failed'));
    const el = await renderClearData();

    expect(reportError).toHaveBeenCalledOnce();
    expect(dangerButton(el)?.disabled).toBe(true);
  });

  it('closes modal and resets acknowledgement when ui-modal reports closed', async () => {
    const el = await renderClearData();

    dangerButton(el)?.click();
    await flushUpdates();

    const checkbox = modalHost(el)?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    expect(modalHost(el)?.okButtonPropsDisabled).toBe(false);

    modalHost(el)?.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(modalHost(el)?.open).toBe(false);
    expect(modalHost(el)?.okButtonPropsDisabled).toBe(true);
  });

  it('ignores nested update:open events when closing the modal', async () => {
    const el = await renderClearData();

    dangerButton(el)?.click();
    await flushUpdates();

    const modal = modalHost(el)!;
    const nested = document.createElement('div');
    modal.appendChild(nested);
    nested.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(modal.open).toBe(true);
  });

  it('does not close modal while clear is in progress', async () => {
    vi.mocked(clearAllLearningData).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    );
    const el = await renderClearData();

    dangerButton(el)?.click();
    await flushUpdates();

    const checkbox = modalHost(el)?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;

    void confirmOpenModal(el);
    await el.updateComplete;

    modalHost(el)?.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(modalHost(el)?.open).toBe(true);
  });

  it('does not confirm clear without acknowledgement', async () => {
    const el = await renderClearData();

    dangerButton(el)?.click();
    await flushUpdates();
    await confirmOpenModal(el);

    expect(clearAllLearningData).not.toHaveBeenCalled();
  });

  it('uses fallback message for non-Error clear failures', async () => {
    vi.mocked(clearAllLearningData).mockRejectedValue('clear failed');
    const error = vi.spyOn(Message, 'error');
    const el = await renderClearData();

    dangerButton(el)?.click();
    await flushUpdates();

    const checkbox = modalHost(el)?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;

    await confirmOpenModal(el);

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it('does not open modal while busy or when data is empty', async () => {
    const el = await renderClearData();
    (el as unknown as { _busy: boolean })._busy = true;
    dangerButton(el)?.click();
    await flushUpdates();
    expect(modalHost(el)?.open).toBe(false);

    (el as unknown as { _busy: boolean })._busy = false;
    vi.mocked(getLocalDataCounts).mockResolvedValue({
      media: 0,
      subtitles: 0,
      recordings: 0,
      sessions: 0,
      playlists: 0,
      sentenceBank: 0,
      noise: 0,
    });
    await (el as unknown as { _refreshCounts: () => Promise<void> })._refreshCounts();
    await el.updateComplete;

    dangerButton(el)?.click();
    await flushUpdates();
    expect(modalHost(el)?.open).toBe(false);
  });
});
