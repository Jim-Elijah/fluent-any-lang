import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PwaSubscriber = (state: {
  needRefresh: boolean;
  offlineReady: boolean;
  registered: boolean;
}) => void;

const {
  subscribePwaFn,
  applyPwaUpdate,
  clearOfflineReady,
  dismissNeedRefresh,
  unsubscribe,
  pwaRef,
  messageSuccess,
} = vi.hoisted(() => {
  const pwaRef: { listener: PwaSubscriber | undefined } = { listener: undefined };
  const unsubscribe = vi.fn();
  const subscribePwaFn = vi.fn<(listener: PwaSubscriber) => () => void>();
  return {
    subscribePwaFn,
    applyPwaUpdate: vi.fn(async () => undefined),
    clearOfflineReady: vi.fn(),
    dismissNeedRefresh: vi.fn(),
    unsubscribe,
    pwaRef,
    messageSuccess: vi.fn(),
  };
});

vi.mock('../../lib/pwa.js', () => ({
  subscribePwa: (listener: PwaSubscriber) => {
    subscribePwaFn(listener);
    pwaRef.listener = listener;
    listener({ needRefresh: false, offlineReady: false, registered: false });
    return unsubscribe;
  },
  applyPwaUpdate: () => applyPwaUpdate(),
  clearOfflineReady: () => clearOfflineReady(),
  dismissNeedRefresh: () => dismissNeedRefresh(),
}));

vi.mock('../ui/message.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ui/message.js')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: (...args: unknown[]) => messageSuccess(...args),
    },
  };
});

import './pwa-update-banner.js';
import type { PwaUpdateBanner } from './pwa-update-banner.js';
import { mount } from '../ui/test-utils.js';

describe('pwa-update-banner', () => {
  let cleanup: (() => void) | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    subscribePwaFn.mockClear();
    applyPwaUpdate.mockClear();
    clearOfflineReady.mockClear();
    dismissNeedRefresh.mockClear();
    messageSuccess.mockClear();
    unsubscribe.mockClear();
    pwaRef.listener = undefined;
    fetchMock = vi.fn(async () => new Response('Not Found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  async function renderBanner() {
    const result = mount(html`<pwa-update-banner></pwa-update-banner>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('pwa-update-banner') as PwaUpdateBanner;
    await el.updateComplete;
    return el;
  }

  it('stays hidden when needRefresh is false', async () => {
    const el = await renderBanner();
    expect(el.shadowRoot?.querySelector('.banner')).toBeNull();
    expect(subscribePwaFn).toHaveBeenCalledOnce();
  });

  it('shows banner when needRefresh becomes true', async () => {
    const el = await renderBanner();
    pwaRef.listener?.({ needRefresh: true, offlineReady: false, registered: true });
    await el.updateComplete;
    await Promise.resolve();
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.banner')).not.toBeNull();
    expect(el.shadowRoot?.textContent).toContain('有新版本可用');
    expect(fetchMock).toHaveBeenCalledWith('/release-notes.json', { cache: 'no-store' });
  });

  it('shows version and expand control when release notes load, highlights stay collapsed', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        version: '0.4.0',
        highlights: { 'zh-CN': ['要点一'], en: ['Tip one'] },
      }),
    );

    const el = await renderBanner();
    pwaRef.listener?.({ needRefresh: true, offlineReady: false, registered: true });
    await el.updateComplete;

    await vi.waitFor(() => {
      expect(el.shadowRoot?.textContent).toContain('0.4.0');
      expect(el.shadowRoot?.textContent).toContain('展开');
    });
    expect(el.shadowRoot?.querySelector('.notes-panel')).toBeNull();
    expect(el.shadowRoot?.textContent).not.toContain('要点一');
  });

  it('toggles release notes panel with expand and collapse', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        version: '0.4.0',
        highlights: { 'zh-CN': ['要点一'], en: ['Tip one'] },
      }),
    );

    const el = await renderBanner();
    pwaRef.listener?.({ needRefresh: true, offlineReady: false, registered: true });
    await el.updateComplete;

    await vi.waitFor(() => {
      expect(el.shadowRoot?.textContent).toContain('展开');
    });

    const expandBtn = [...(el.shadowRoot?.querySelectorAll('ui-button') ?? [])].find((btn) =>
      btn.textContent?.includes('展开'),
    );
    expandBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.notes-panel')).not.toBeNull();
    expect(el.shadowRoot?.textContent).toContain('要点一');
    expect(el.shadowRoot?.textContent).toContain('收起');

    const collapseBtn = [...(el.shadowRoot?.querySelectorAll('ui-button') ?? [])].find((btn) =>
      btn.textContent?.includes('收起'),
    );
    collapseBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.notes-panel')).toBeNull();
    expect(el.shadowRoot?.textContent).toContain('展开');
  });

  it('keeps generic title when release notes fetch fails', async () => {
    const el = await renderBanner();
    pwaRef.listener?.({ needRefresh: true, offlineReady: false, registered: true });
    await el.updateComplete;
    await Promise.resolve();
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('有新版本可用');
    expect(el.shadowRoot?.querySelector('.highlights')).toBeNull();
  });

  it('calls applyPwaUpdate when update button is clicked', async () => {
    const el = await renderBanner();
    pwaRef.listener?.({ needRefresh: true, offlineReady: false, registered: true });
    await el.updateComplete;

    const updateBtn = [...(el.shadowRoot?.querySelectorAll('ui-button') ?? [])].find((btn) =>
      btn.textContent?.includes('立即更新'),
    );
    updateBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(applyPwaUpdate).toHaveBeenCalledOnce();
  });

  it('calls dismissNeedRefresh when dismiss button is clicked', async () => {
    const el = await renderBanner();
    pwaRef.listener?.({ needRefresh: true, offlineReady: false, registered: true });
    await el.updateComplete;

    const dismissBtn = [...(el.shadowRoot?.querySelectorAll('ui-button') ?? [])].find((btn) =>
      btn.textContent?.includes('稍后'),
    );
    dismissBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(dismissNeedRefresh).toHaveBeenCalledOnce();
  });

  it('shows offline-ready toast once and clears offline state', async () => {
    const el = await renderBanner();

    pwaRef.listener?.({ needRefresh: false, offlineReady: true, registered: true });
    await el.updateComplete;
    pwaRef.listener?.({ needRefresh: false, offlineReady: true, registered: true });
    await el.updateComplete;

    expect(messageSuccess).toHaveBeenCalledOnce();
    expect(messageSuccess.mock.calls[0][0]).toMatchObject({
      message: '应用已可离线使用',
      duration: 3000,
    });
    expect(clearOfflineReady).toHaveBeenCalledOnce();
  });

  it('unsubscribes from PWA updates on disconnect', async () => {
    const el = await renderBanner();
    el.remove();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
