import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/error-log.js', () => ({
  getErrorLogCount: vi.fn(),
  clearErrorLogs: vi.fn(),
}));

vi.mock('../../lib/export-error-logs.js', () => ({
  exportErrorLogs: vi.fn(),
}));

vi.mock('../../lib/app-build-info.js', () => ({
  getAppBuildInfo: vi.fn(() => ({
    appVersion: '1.2.3',
    commitHash: 'abc1234',
    buildTime: '2026-01-02T03:04:05.000Z',
  })),
}));

vi.mock('../../lib/error-reporter.js', () => ({
  reportError: vi.fn(),
}));

import './settings-diagnostics.js';
import type { SettingsDiagnostics } from './settings-diagnostics.js';
import { clearErrorLogs, getErrorLogCount } from '../../db/error-log.js';
import { exportErrorLogs } from '../../lib/export-error-logs.js';
import { reportError } from '../../lib/error-reporter.js';
import { Message } from '../ui/message.js';
import { flushUpdates, mount } from '../ui/test-utils.js';

function queryComponentModal<T extends Element = Element>(
  el: SettingsDiagnostics,
  selector: string,
): T | null {
  const modal = el.shadowRoot?.querySelector('ui-modal');
  return modal?.shadowRoot?.querySelector(selector) as T | null;
}

async function confirmOpenModal(el: SettingsDiagnostics) {
  queryComponentModal<HTMLButtonElement>(el, '.btn.primary')?.click();
  await flushUpdates();
  await el.updateComplete;
}

describe('settings-diagnostics', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getErrorLogCount).mockResolvedValue(3);
    Message.closeAll();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    Message.closeAll();
  });

  async function renderDiagnostics() {
    const result = mount(html`<settings-diagnostics></settings-diagnostics>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('settings-diagnostics') as SettingsDiagnostics;
    await el.updateComplete;
    await Promise.resolve();
    return el;
  }

  function actionButton(
    el: SettingsDiagnostics,
    variant: string,
  ): HTMLButtonElement | null | undefined {
    return el.shadowRoot
      ?.querySelector(`ui-button[variant="${variant}"]`)
      ?.shadowRoot?.querySelector('button');
  }

  it('renders build metadata and log count', async () => {
    const el = await renderDiagnostics();

    expect(getErrorLogCount).toHaveBeenCalledOnce();
    expect(el.shadowRoot?.textContent).toContain('1.2.3');
    expect(el.shadowRoot?.textContent).toContain('abc1234');
    expect(el.shadowRoot?.textContent).toContain('2026-01-02T03:04:05.000Z');
    expect(el.shadowRoot?.textContent).toContain('3');
  });

  it('disables actions when there are no logs', async () => {
    vi.mocked(getErrorLogCount).mockResolvedValue(0);
    const el = await renderDiagnostics();

    expect(actionButton(el, 'primary')?.disabled).toBe(true);
    expect(actionButton(el, 'danger')?.disabled).toBe(true);
  });

  it('exports logs and shows success message', async () => {
    vi.mocked(exportErrorLogs).mockResolvedValue({
      exportedAt: 1,
      appVersion: '1.2.3',
      commitHash: 'abc1234',
      buildTime: '',
      entries: [{ id: '1' }, { id: '2' }],
    } as Awaited<ReturnType<typeof exportErrorLogs>>);
    const success = vi.spyOn(Message, 'success');
    const el = await renderDiagnostics();

    actionButton(el, 'primary')?.click();
    await el.updateComplete;

    expect(exportErrorLogs).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledOnce();
    expect(el.shadowRoot?.textContent).toContain('2');
  });

  it('reports export errors', async () => {
    vi.mocked(exportErrorLogs).mockRejectedValue(new Error('export failed'));
    const error = vi.spyOn(Message, 'error');
    const el = await renderDiagnostics();

    actionButton(el, 'primary')?.click();
    await el.updateComplete;

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('export failed');
  });

  it('falls back to zero count when count fetch fails', async () => {
    vi.mocked(getErrorLogCount).mockRejectedValue(new Error('db down'));
    const el = await renderDiagnostics();

    expect(reportError).toHaveBeenCalledOnce();
    expect(el.shadowRoot?.textContent).toContain('0');
  });

  it('clears logs after modal confirmation', async () => {
    vi.mocked(clearErrorLogs).mockResolvedValue(undefined);
    const success = vi.spyOn(Message, 'success');
    const el = await renderDiagnostics();

    actionButton(el, 'danger')?.click();
    await flushUpdates();
    expect(queryComponentModal(el, '.dialog')).not.toBeNull();

    await confirmOpenModal(el);

    expect(clearErrorLogs).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledOnce();
    expect(el.shadowRoot?.textContent).toContain('0');
  });

  it('reports clear errors from modal confirmation', async () => {
    vi.mocked(clearErrorLogs).mockRejectedValue(new Error('clear failed'));
    const error = vi.spyOn(Message, 'error');
    const el = await renderDiagnostics();

    actionButton(el, 'danger')?.click();
    await flushUpdates();
    await confirmOpenModal(el);

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('clear failed');
  });

  it('closes clear modal when ui-modal reports closed', async () => {
    const el = await renderDiagnostics();

    actionButton(el, 'danger')?.click();
    await flushUpdates();
    expect(el.shadowRoot?.querySelector('ui-modal')?.open).toBe(true);

    el.shadowRoot?.querySelector('ui-modal')?.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('ui-modal')?.open).toBe(false);
  });

  it('ignores nested update:open when managing clear modal', async () => {
    const el = await renderDiagnostics();

    actionButton(el, 'danger')?.click();
    await flushUpdates();

    const modal = el.shadowRoot?.querySelector('ui-modal');
    const nested = document.createElement('div');
    modal?.appendChild(nested);
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

  it('does not close clear modal while busy', async () => {
    vi.mocked(clearErrorLogs).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    );
    const el = await renderDiagnostics();

    actionButton(el, 'danger')?.click();
    await flushUpdates();
    void confirmOpenModal(el);
    await el.updateComplete;

    el.shadowRoot?.querySelector('ui-modal')?.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('ui-modal')?.open).toBe(true);
  });

  it('does not open clear modal when busy or log count is zero', async () => {
    const el = await renderDiagnostics();
    (el as unknown as { _busy: boolean })._busy = true;
    actionButton(el, 'danger')?.click();
    await flushUpdates();
    expect(el.shadowRoot?.querySelector('ui-modal')?.open).toBe(false);

    (el as unknown as { _busy: boolean })._busy = false;
    (el as unknown as { _logCount: number })._logCount = 0;
    await el.updateComplete;
    actionButton(el, 'danger')?.click();
    await flushUpdates();
    expect(el.shadowRoot?.querySelector('ui-modal')?.open).toBe(false);
  });

  it('uses fallback message for non-Error clear failures', async () => {
    vi.mocked(clearErrorLogs).mockRejectedValue('clear failed');
    const error = vi.spyOn(Message, 'error');
    const el = await renderDiagnostics();

    actionButton(el, 'danger')?.click();
    await flushUpdates();
    await confirmOpenModal(el);

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it('ignores export while busy', async () => {
    const el = await renderDiagnostics();
    (el as unknown as { _busy: boolean })._busy = true;

    actionButton(el, 'primary')?.click();
    await el.updateComplete;

    expect(exportErrorLogs).not.toHaveBeenCalled();
  });

  it('uses fallback message for non-Error export failures', async () => {
    vi.mocked(exportErrorLogs).mockRejectedValue('export failed');
    const error = vi.spyOn(Message, 'error');
    const el = await renderDiagnostics();

    actionButton(el, 'primary')?.click();
    await el.updateComplete;

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });
});
