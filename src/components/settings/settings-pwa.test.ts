import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  pwaState,
  unsubscribe,
  isPwaStandalone,
  getPwaState,
  subscribePwa,
  checkForPwaUpdate,
  applyPwaUpdate,
  reportError,
} = vi.hoisted(() => {
  const pwaState = { needRefresh: false };
  const unsubscribe = vi.fn();
  return {
    pwaState,
    unsubscribe,
    isPwaStandalone: vi.fn(() => false),
    getPwaState: vi.fn(() => ({ ...pwaState })),
    subscribePwa: vi.fn(() => unsubscribe),
    checkForPwaUpdate: vi.fn(),
    applyPwaUpdate: vi.fn(),
    reportError: vi.fn(),
  };
});

vi.mock('../../lib/pwa.js', () => ({
  isPwaStandalone,
  getPwaState,
  subscribePwa,
  checkForPwaUpdate,
  applyPwaUpdate,
}));

vi.mock('../../lib/error-reporter.js', () => ({
  reportError,
}));

import './settings-pwa.js';
import type { SettingsPwa } from './settings-pwa.js';
import { Message } from '../ui/message.js';
import { mount } from '../ui/test-utils.js';

describe('settings-pwa', () => {
  let cleanup: (() => void) | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pwaState.needRefresh = false;
    isPwaStandalone.mockClear();
    getPwaState.mockClear();
    subscribePwa.mockClear();
    checkForPwaUpdate.mockClear();
    applyPwaUpdate.mockClear();
    reportError.mockClear();
    unsubscribe.mockClear();
    isPwaStandalone.mockReturnValue(false);
    getPwaState.mockImplementation(() => ({ ...pwaState }));
    subscribePwa.mockReturnValue(unsubscribe);
    fetchMock = vi.fn(async () => new Response('Not Found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    Message.closeAll();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
    Message.closeAll();
  });

  async function renderPwa() {
    const result = mount(html`<settings-pwa></settings-pwa>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('settings-pwa') as SettingsPwa;
    await el.updateComplete;
    return el;
  }

  function primaryButton(el: SettingsPwa): HTMLButtonElement | null | undefined {
    return el.shadowRoot
      ?.querySelector('ui-button[variant="primary"]')
      ?.shadowRoot?.querySelector('button');
  }

  function secondaryButton(el: SettingsPwa): HTMLButtonElement | null | undefined {
    return el.shadowRoot
      ?.querySelector('ui-button[variant="secondary"]')
      ?.shadowRoot?.querySelector('button');
  }

  it('shows browser-tab install status when not standalone', async () => {
    isPwaStandalone.mockReturnValue(false);
    const el = await renderPwa();

    expect(subscribePwa).toHaveBeenCalledOnce();
    expect(el.shadowRoot?.textContent).toMatch(/浏览器标签页/);
    expect(primaryButton(el)).toBeFalsy();
  });

  it('shows standalone install status and needRefresh UI', async () => {
    isPwaStandalone.mockReturnValue(true);
    pwaState.needRefresh = true;
    const el = await renderPwa();
    await el.updateComplete;
    await Promise.resolve();
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toMatch(/已安装/);
    expect(el.shadowRoot?.textContent).toMatch(/有待安装的新版本/);
    expect(primaryButton(el)).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/release-notes.json', { cache: 'no-store' });
  });

  it('shows release highlights when notes are available', async () => {
    pwaState.needRefresh = true;
    fetchMock.mockResolvedValue(
      Response.json({
        version: '0.4.0',
        highlights: { 'zh-CN': ['新功能'] },
      }),
    );

    const el = await renderPwa();

    await vi.waitFor(() => {
      expect(el.shadowRoot?.textContent).toContain('0.4.0');
      expect(el.shadowRoot?.textContent).toContain('更新内容');
      expect(el.shadowRoot?.textContent).toContain('新功能');
    });
  });

  it('updates needRefresh when subscribePwa callback fires', async () => {
    const el = await renderPwa();
    const listener = subscribePwa.mock.calls[0]?.[0];
    expect(listener).toBeTypeOf('function');

    listener?.({ needRefresh: true, offlineReady: false, registered: true });
    await el.updateComplete;

    expect(primaryButton(el)).not.toBeNull();
  });

  it('reports already up to date after a successful check', async () => {
    checkForPwaUpdate.mockResolvedValue(false);
    getPwaState.mockReturnValue({ needRefresh: false });
    const success = vi.spyOn(Message, 'success');
    const el = await renderPwa();

    secondaryButton(el)?.click();
    await el.updateComplete;

    expect(checkForPwaUpdate).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledOnce();
  });

  it('reports update found when check finds or state already has refresh', async () => {
    checkForPwaUpdate.mockResolvedValue(true);
    const info = vi.spyOn(Message, 'info');
    const el = await renderPwa();

    secondaryButton(el)?.click();
    await el.updateComplete;

    expect(info).toHaveBeenCalledOnce();
  });

  it('reports check errors', async () => {
    checkForPwaUpdate.mockRejectedValue(new Error('network down'));
    const error = vi.spyOn(Message, 'error');
    const el = await renderPwa();

    secondaryButton(el)?.click();
    await el.updateComplete;

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('network down');
  });

  it('applies update successfully and stays busy while reload is pending', async () => {
    pwaState.needRefresh = true;
    applyPwaUpdate.mockResolvedValue(undefined);
    const el = await renderPwa();

    primaryButton(el)?.click();
    await el.updateComplete;

    expect(applyPwaUpdate).toHaveBeenCalledOnce();
    expect((el as unknown as { _busy: boolean })._busy).toBe(true);
  });

  it('reports apply errors and clears busy state', async () => {
    pwaState.needRefresh = true;
    applyPwaUpdate.mockRejectedValue(new Error('apply failed'));
    const error = vi.spyOn(Message, 'error');
    const el = await renderPwa();

    primaryButton(el)?.click();
    await el.updateComplete;

    expect(applyPwaUpdate).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('apply failed');
    expect((el as unknown as { _busy: boolean })._busy).toBe(false);
  });

  it('uses fallback message for non-Error apply failures', async () => {
    pwaState.needRefresh = true;
    applyPwaUpdate.mockRejectedValue('apply failed');
    const error = vi.spyOn(Message, 'error');
    const el = await renderPwa();

    primaryButton(el)?.click();
    await el.updateComplete;

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalled();
    expect((el as unknown as { _busy: boolean })._busy).toBe(false);
  });

  it('uses fallback message for non-Error check failures', async () => {
    checkForPwaUpdate.mockRejectedValue('network down');
    const error = vi.spyOn(Message, 'error');
    const el = await renderPwa();

    secondaryButton(el)?.click();
    await el.updateComplete;

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalled();
    expect((el as unknown as { _busy: boolean })._busy).toBe(false);
  });

  it('reports update found when state already has needRefresh', async () => {
    checkForPwaUpdate.mockResolvedValue(false);
    pwaState.needRefresh = true;
    getPwaState.mockReturnValue({ needRefresh: true });
    const info = vi.spyOn(Message, 'info');
    const el = await renderPwa();

    secondaryButton(el)?.click();
    await el.updateComplete;

    expect(info).toHaveBeenCalled();
  });

  it('ignores actions while busy', async () => {
    const el = await renderPwa();
    (el as unknown as { _busy: boolean })._busy = true;

    secondaryButton(el)?.click();
    primaryButton(el)?.click();

    expect(checkForPwaUpdate).not.toHaveBeenCalled();
    expect(applyPwaUpdate).not.toHaveBeenCalled();
  });

  it('unsubscribes from pwa state on disconnect', async () => {
    const el = await renderPwa();
    el.remove();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
