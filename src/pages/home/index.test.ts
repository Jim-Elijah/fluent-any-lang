import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../i18n/localization.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../i18n/localization.js')>();
  return {
    ...actual,
    getLocale: vi.fn(() => 'zh-CN'),
    changeLocale: vi.fn().mockResolvedValue(undefined),
  };
});

import './index.js';
import type { HomePage } from './index.js';
import type { MediaList } from '../../components/library/media-list.js';
import { mount } from '../../components/ui/test-utils.js';
import * as layoutCompact from '../../lib/layout-compact.js';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('home-page', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  async function renderPage() {
    const result = mount(html`<home-page></home-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('home-page') as HomePage;
    await el.updateComplete;
    return el;
  }

  it('renders dashboard, importer and library sections with fill-height when tall', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    expect(el.shadowRoot?.querySelector('practice-stats-dashboard')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('content-importer')).not.toBeNull();
    const mediaList = el.shadowRoot?.querySelector('media-list') as MediaList | null;
    expect(mediaList).not.toBeNull();
    expect(mediaList?.limit).toBe(10);
    expect(mediaList?.fillHeight).toBe(true);
    expect(el.compact).toBe(false);
  });

  it('disables fill-height in compact short viewport', async () => {
    stubMatchMedia(true);
    const el = await renderPage();
    expect(el.compact).toBe(true);
    const mediaList = el.shadowRoot?.querySelector('media-list') as MediaList | null;
    expect(mediaList?.fillHeight).toBe(false);
  });

  it('enters compact when media-list height is too small', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    expect(el.compact).toBe(false);

    const list = el.shadowRoot?.querySelector('media-list') as HTMLElement;
    Object.defineProperty(list, 'clientHeight', { configurable: true, get: () => 120 });
    (el as unknown as { _syncCompactFromSpace: () => void })._syncCompactFromSpace();
    await el.updateComplete;

    expect(el.compact).toBe(true);
    expect((el.shadowRoot?.querySelector('media-list') as MediaList).fillHeight).toBe(false);
  });

  it('exits compact when enough vertical space becomes available', async () => {
    stubMatchMedia(false);
    const measureSpy = vi.spyOn(layoutCompact, 'measurePageViewportHeight').mockReturnValue(900);
    const el = await renderPage();
    el.compact = true;
    await el.updateComplete;

    const intro = el.shadowRoot?.querySelector('.intro') as HTMLElement;
    Object.defineProperty(intro, 'offsetHeight', { configurable: true, value: 40 });
    for (const child of el.shadowRoot?.querySelector('.stack')?.children ?? []) {
      if (child.tagName.toLowerCase() !== 'media-list') {
        Object.defineProperty(child, 'offsetHeight', { configurable: true, value: 80 });
      }
    }

    (el as unknown as { _syncCompactFromSpace: () => void })._syncCompactFromSpace();
    await el.updateComplete;

    expect(el.compact).toBe(false);
    expect((el.shadowRoot?.querySelector('media-list') as MediaList).fillHeight).toBe(true);
    measureSpy.mockRestore();
  });

  it('navigates to practice when a media item is selected', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    const navigateSpy = vi.spyOn(el, 'navigate').mockImplementation(() => undefined);

    el.shadowRoot?.querySelector('media-list')?.dispatchEvent(
      new CustomEvent('media-selected', {
        detail: { id: 'media-123' },
        bubbles: true,
        composed: true,
      }),
    );

    expect(navigateSpy).toHaveBeenCalledWith('/practice?mediaId=media-123');
  });

  it('refreshes the media list after content import', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    const mediaList = el.shadowRoot?.querySelector('media-list') as MediaList;
    const refreshSpy = vi.spyOn(mediaList, 'refresh').mockResolvedValue(undefined);

    el.shadowRoot
      ?.querySelector('content-importer')
      ?.dispatchEvent(new CustomEvent('content-imported', { bubbles: true, composed: true }));

    expect(refreshSpy).toHaveBeenCalled();
  });

  it('syncs compact mode when matchMedia changes', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    expect(el.compact).toBe(false);

    (
      el as unknown as { _onCompactMqChange: (event: MediaQueryListEvent) => void }
    )._onCompactMqChange({
      matches: true,
    } as MediaQueryListEvent);
    await el.updateComplete;
    expect(el.compact).toBe(true);
  });
});
