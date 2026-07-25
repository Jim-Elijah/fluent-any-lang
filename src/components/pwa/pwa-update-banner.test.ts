import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PwaSubscriber = (state: {
  needRefresh: boolean;
  offlineReady: boolean;
  registered: boolean;
}) => void;

const subscribePwa = vi.fn<(listener: PwaSubscriber) => () => void>();
const applyPwaUpdate = vi.fn(async () => undefined);
const clearOfflineReady = vi.fn();
const dismissNeedRefresh = vi.fn();

let pwaListener: PwaSubscriber | undefined;
const unsubscribe = vi.fn();

vi.mock('../../lib/pwa.js', () => ({
  subscribePwa: (listener: PwaSubscriber) => {
    subscribePwa(listener);
    pwaListener = listener;
    listener({ needRefresh: false, offlineReady: false, registered: false });
    return unsubscribe;
  },
  applyPwaUpdate: () => applyPwaUpdate(),
  clearOfflineReady: () => clearOfflineReady(),
  dismissNeedRefresh: () => dismissNeedRefresh(),
}));

const messageSuccess = vi.fn();

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

  beforeEach(() => {
    subscribePwa.mockClear();
    applyPwaUpdate.mockClear();
    clearOfflineReady.mockClear();
    dismissNeedRefresh.mockClear();
    messageSuccess.mockClear();
    unsubscribe.mockClear();
    pwaListener = undefined;
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
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
    expect(subscribePwa).toHaveBeenCalledOnce();
  });

  it('shows banner when needRefresh becomes true', async () => {
    const el = await renderBanner();
    pwaListener?.({ needRefresh: true, offlineReady: false, registered: true });
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.banner')).not.toBeNull();
    expect(el.shadowRoot?.textContent).toContain('有新版本可用');
  });

  it('calls applyPwaUpdate when update button is clicked', async () => {
    const el = await renderBanner();
    pwaListener?.({ needRefresh: true, offlineReady: false, registered: true });
    await el.updateComplete;

    const buttons = el.shadowRoot?.querySelectorAll('ui-button');
    buttons?.[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(applyPwaUpdate).toHaveBeenCalledOnce();
  });

  it('calls dismissNeedRefresh when dismiss button is clicked', async () => {
    const el = await renderBanner();
    pwaListener?.({ needRefresh: true, offlineReady: false, registered: true });
    await el.updateComplete;

    const buttons = el.shadowRoot?.querySelectorAll('ui-button');
    buttons?.[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(dismissNeedRefresh).toHaveBeenCalledOnce();
  });

  it('shows offline-ready toast once and clears offline state', async () => {
    const el = await renderBanner();

    pwaListener?.({ needRefresh: false, offlineReady: true, registered: true });
    await el.updateComplete;
    pwaListener?.({ needRefresh: false, offlineReady: true, registered: true });
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
