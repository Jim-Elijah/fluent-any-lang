import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n/localization.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../i18n/localization.js')>();
  return {
    ...actual,
    getLocale: vi.fn(() => 'zh-CN'),
    changeLocale: vi.fn().mockResolvedValue(undefined),
  };
});

import { html } from 'lit';
import { mount } from '../components/ui/test-utils.js';
import '../app/my-app.js';
import type { MyApp } from '../app/my-app.js';
import { LOCALE_STORAGE_KEY } from '../i18n/localization.js';
import type { MenuOpenChangeDetail, MenuSelectDetail } from '../components/ui/menu.js';

function stubMatchMedia(initialMatches = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    matches: initialMatches,
    media: '(max-width: 767px)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
    dispatchEvent: vi.fn(),
  };

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );

  return {
    mql,
    emitChange(matches: boolean) {
      mql.matches = matches;
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  };
}

describe('app-shell', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(async () => {
    localStorage.clear();
    const { resetDatabase } = await import('../test/db-helpers.js');
    await resetDatabase();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  async function renderApp() {
    const result = mount(html`<app-shell></app-shell>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('app-shell') as MyApp;
    await el.updateComplete;
    return el;
  }

  it('renders navigation and outlet shell', async () => {
    stubMatchMedia(false);
    const el = await renderApp();
    expect(el.shadowRoot?.querySelector('.layout')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('locale-switcher')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('ui-menu')).not.toBeNull();
  });

  it('uses saved locale from localStorage when valid', async () => {
    stubMatchMedia(false);
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    const el = await renderApp();
    expect(el.locale).toBe('en');
  });

  it('falls back to getLocale when saved locale is invalid', async () => {
    stubMatchMedia(false);
    localStorage.setItem(LOCALE_STORAGE_KEY, 'invalid-locale');
    const el = await renderApp();
    expect(el.locale).toBe('zh-CN');
  });

  it('updates route context and selected menu key from router()', async () => {
    stubMatchMedia(false);
    const el = await renderApp();

    el.router('library', { id: '1' }, { tab: 'media' }, { title: 'Library' });
    await el.updateComplete;

    expect(el.activeRoute).toBe('library');
    expect(el.routeContext).toEqual({
      route: 'library',
      params: { id: '1' },
      query: { tab: 'media' },
      data: { title: 'Library' },
    });
    expect(el.selectedKeys).toEqual(['library']);
    expect(el.shadowRoot?.querySelector('library-page')).not.toBeNull();
  });

  it('maps sentence-practice route to sentences menu selection', async () => {
    stubMatchMedia(false);
    const el = await renderApp();

    el.router('sentence-practice', { mediaId: 'm1' }, {}, {});
    await el.updateComplete;

    expect(el.selectedKeys).toEqual(['sentences']);
    expect(el.shadowRoot?.querySelector('sentence-practice-page')).not.toBeNull();
  });

  it('navigates from menu selection and tracks open keys', async () => {
    stubMatchMedia(false);
    const el = await renderApp();
    const navigate = vi.spyOn(el, 'navigate');
    const menu = el.shadowRoot?.querySelector('ui-menu');

    menu?.dispatchEvent(
      new CustomEvent<MenuSelectDetail>('select', {
        detail: {
          key: 'settings',
          keyPath: ['settings'],
          selectedKeys: ['settings'],
          item: { key: 'settings', label: 'Settings', link: '/settings' },
          domEvent: new Event('click'),
        },
        bubbles: true,
      }),
    );
    await el.updateComplete;

    expect(navigate).toHaveBeenCalledWith('/settings');
    expect(el.selectedKeys).toEqual(['settings']);

    menu?.dispatchEvent(
      new CustomEvent<MenuOpenChangeDetail>('open-change', {
        detail: { openKeys: ['library'] },
        bubbles: true,
      }),
    );
    await el.updateComplete;

    expect(el.openKeys).toEqual(['library']);
  });

  it('renders nothing for unknown routes', async () => {
    stubMatchMedia(false);
    const el = await renderApp();

    el.router('unknown-route', {}, {}, {});
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('main')?.children.length).toBe(0);
  });

  it('renders practice, stats, and not-found routes', async () => {
    stubMatchMedia(false);
    const el = await renderApp();

    el.router('practice', { mediaId: 'm1' }, {}, {});
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('practice-page')).not.toBeNull();

    el.router('stats', {}, {}, { title: 'Stats' });
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('practice-stats-page')).not.toBeNull();

    el.router('not-found', {}, {}, {});
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('not-found-page')).not.toBeNull();
  });

  it('renders library, playlists, and sentences routes', async () => {
    stubMatchMedia(false);
    const el = await renderApp();

    el.router('library', {}, {}, {});
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('library-page')).not.toBeNull();

    el.router('playlists', {}, {}, {});
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('playlists-page')).not.toBeNull();

    el.router('sentences', {}, {}, {});
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('sentences-page')).not.toBeNull();
  });

  it('passes routeContext into practice pages', async () => {
    stubMatchMedia(false);
    const el = await renderApp();
    const routeContext = {
      route: 'practice',
      params: { mediaId: 'media-1' },
      query: { mode: 'shadowing' },
      data: { title: 'Practice' },
    };

    el.router('practice', routeContext.params, routeContext.query, routeContext.data);
    await el.updateComplete;

    const page = el.shadowRoot?.querySelector('practice-page') as HTMLElement & {
      routeContext?: typeof routeContext;
    };
    expect(page?.routeContext).toEqual(routeContext);
  });

  it('switches menu layout when mobile media query changes', async () => {
    const media = stubMatchMedia(false);
    const el = await renderApp();
    const menu = el.shadowRoot?.querySelector('ui-menu');

    expect(menu?.getAttribute('mode')).toBe('vertical');
    expect(menu?.hasAttribute('bottom-nav')).toBe(false);

    media.emitChange(true);
    await el.updateComplete;

    expect(menu?.getAttribute('mode')).toBe('horizontal');
    expect(menu?.hasAttribute('bottom-nav')).toBe(true);
  });

  it('removes media query listener on disconnect', async () => {
    const media = stubMatchMedia(false);
    const el = await renderApp();
    const removeSpy = media.mql.removeEventListener as ReturnType<typeof vi.fn>;

    el.remove();

    expect(removeSpy).toHaveBeenCalled();
  });
});
