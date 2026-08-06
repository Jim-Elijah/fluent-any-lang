import { LitElement, css, html, nothing, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { RouteContext } from '../types/models.js';
import { router, navigator, Routes } from 'lit-element-router';

import '../components/ui/locale-switcher.js';
import '../components/ui/menu.js';
import { Loading, type LoadingInstance } from '../components/ui/loading.js';
import { MenuItem, MenuOpenChangeDetail, MenuSelectDetail } from '../components/ui/menu.js';
import { getLocale, isLocale, Locale, LOCALE_STORAGE_KEY } from '../i18n/localization.js';

type AppRoute =
  | 'home'
  | 'practice'
  | 'library'
  | 'playlists'
  | 'sentences'
  | 'sentence-practice'
  | 'stats'
  | 'settings'
  | 'not-found';
type RouteRenderContext = {
  routeContext: RouteContext;
};

const ROUTE_LOADERS: Record<AppRoute, () => Promise<unknown>> = {
  home: () => import('../pages/home/index.js'),
  practice: () => import('../pages/practice/index.js'),
  library: () => import('../pages/library/index.js'),
  playlists: () => import('../pages/playlists/index.js'),
  sentences: () => import('../pages/sentences/index.js'),
  'sentence-practice': () => import('../pages/sentence-practice/index.js'),
  stats: () => import('../pages/practice-stats/index.js'),
  settings: () => import('../pages/settings/index.js'),
  'not-found': () => import('../pages/not-found/index.js'),
};

/** Module-level cache so each page chunk is fetched once. */
const pageModuleLoads = new Map<AppRoute, Promise<void>>();

function loadPageModule(route: AppRoute): Promise<void> {
  let load = pageModuleLoads.get(route);
  if (!load) {
    load = ROUTE_LOADERS[route]().then(() => undefined);
    pageModuleLoads.set(route, load);
  }
  return load;
}

const ROUTE_PAGES: Record<AppRoute, (ctx: RouteRenderContext) => TemplateResult> = {
  home: () => html`<home-page></home-page>`,
  practice: ({ routeContext }) =>
    html`<practice-page .routeContext=${routeContext}></practice-page>`,
  library: () => html`<library-page></library-page>`,
  playlists: () => html`<playlists-page></playlists-page>`,
  sentences: () => html`<sentences-page></sentences-page>`,
  'sentence-practice': ({ routeContext }) =>
    html`<sentence-practice-page .routeContext=${routeContext}></sentence-practice-page>`,
  stats: () => html`<practice-stats-page></practice-stats-page>`,
  settings: () => html`<settings-page></settings-page>`,
  'not-found': () => html`<not-found-page></not-found-page>`,
};

const RouterNavigatorApp = navigator(router(LitElement));
@customElement('app-shell')
@localized()
export class MyApp extends RouterNavigatorApp {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
      --nav-width: 200px;
      --nav-height: 56px;
      /* Desktop: side nav. Mobile media query sets the fixed bottom-nav footprint. */
      --app-bottom-nav-inset: 0px;
    }

    .layout {
      display: flex;
      height: 100dvh;
      max-width: calc(960px + 48px);
      margin: 0 auto;
      padding: 0 var(--space-page-x);
      overflow: hidden;
    }
    .navigation {
      width: fit-content;
      height: fit-content;
      flex-shrink: 0;
      position: sticky;
      top: 50%;
      transform: translateY(-50%); /* 滚动时保持在视口垂直中央 */
      align-self: center;
      /* 去掉 height: 100vh、border-right 全高样式，按需改成卡片式 */
      padding: 0;
      background: transparent;
      border: none;
      overflow: visible;
    }
    .navigation ui-menu {
      height: auto; /* 不要 height: 100% */
    }
    .navigation ui-menu {
      display: block;
      height: 100%;
    }

    .main-content {
      flex: 1;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding: var(--space-page-y) 0 calc(var(--space-page-y) * 2) var(--space-page-y);
      overflow: auto;
    }

    /* Home / library fill the main pane; lists scroll internally. */
    .main-content:has(home-page:not([compact])),
    .main-content:has(library-page:not([compact])),
    .main-content:has(playlists-page:not([compact])),
    .main-content:has(sentences-page:not([compact])) {
      overflow: hidden;
    }

    .main-content:has(home-page:not([compact])) > main,
    .main-content:has(library-page:not([compact])) > main,
    .main-content:has(playlists-page:not([compact])) > main,
    .main-content:has(sentences-page:not([compact])) > main {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .main-content:has(home-page:not([compact])) > main > home-page,
    .main-content:has(library-page:not([compact])) > main > library-page,
    .main-content:has(playlists-page:not([compact])) > main > playlists-page,
    .main-content:has(sentences-page:not([compact])) > main > sentences-page {
      flex: 1;
      min-height: 0;
    }

    /* Compact: page scrolls in .main-content so lists stay reachable. */
    .main-content:has(home-page[compact]) > main,
    .main-content:has(library-page[compact]) > main,
    .main-content:has(playlists-page[compact]) > main,
    .main-content:has(sentences-page[compact]) > main {
      flex: none;
      min-height: 0;
    }

    .main-content:has(home-page[compact]) > main > home-page,
    .main-content:has(library-page[compact]) > main > library-page,
    .main-content:has(playlists-page[compact]) > main > playlists-page,
    .main-content:has(sentences-page[compact]) > main > sentences-page {
      flex: none;
      height: auto;
      min-height: 0;
    }

    header {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-inline);
      margin-bottom: var(--space-section);
      padding-bottom: var(--space-inline);
      border-bottom: 1px solid var(--color-border, #d9d9d9);
    }

    .brand {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-primary, #1677ff);
    }

    /* 移动：固定在底部 */
    @media (max-width: 767px) {
      :host {
        --app-bottom-nav-inset: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px));
      }

      .layout {
        flex-direction: column;
        max-width: none;
        padding: 0;
        height: 100dvh;
      }

      .navigation {
        position: fixed;
        top: auto;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: auto;
        padding: 0;
        transform: none;
        align-self: auto;
        padding-bottom: env(safe-area-inset-bottom, 0);
        border-right: none;
        border-top: 1px solid var(--color-border, #d9d9d9);
        box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
        z-index: 100;
      }

      .main-content {
        padding: var(--space-page-x) var(--space-page-x)
          calc(var(--app-bottom-nav-inset) + var(--space-page-x));
      }

      .brand {
        font-size: 1.25rem;
      }
    }
  `;

  @property({ type: String })
  activeRoute: string = 'home';

  @state()
  private _isMobile = false;
  private _mq?: MediaQueryList;
  private _mainEl: HTMLElement | null = null;
  private _pageLoading: LoadingInstance | null = null;

  @state()
  routeContext: RouteContext = {
    route: '',
    params: {},
    query: {},
    data: {},
  };

  @state()
  selectedKeys: string[] = ['home'];

  @state()
  openKeys: string[] = [];

  @state()
  locale: Locale;

  @state()
  private _loadedRoutes = new Set<AppRoute>();

  private _getMenuItems(): Array<MenuItem & { link: string }> {
    return [
      { key: 'home', label: msg('首页'), link: '/', icon: 'home' },
      { key: 'library', label: msg('库'), link: '/library', icon: 'media' },
      { key: 'playlists', label: msg('播放列表'), link: '/playlists', icon: 'playlist' },
      { key: 'sentences', label: msg('句库'), link: '/sentences', icon: 'dialog' },
      { key: 'stats', label: msg('统计'), link: '/stats', icon: 'stats' },
      { key: 'settings', label: msg('设置'), link: '/settings', icon: 'setting' },
    ];
  }

  private _menuLinks = new Map<string, string>();

  static get routes(): Routes {
    return [
      {
        name: 'home',
        pattern: '',
        data: { title: msg('首页') },
      },
      {
        name: 'library',
        pattern: 'library',
      },
      {
        name: 'playlists',
        pattern: 'playlists',
      },
      {
        name: 'sentences',
        pattern: 'sentences',
      },
      {
        name: 'sentence-practice',
        pattern: 'sentence-practice',
      },
      {
        name: 'practice',
        pattern: 'practice',
      },
      {
        name: 'stats',
        pattern: 'stats',
        data: { title: msg('统计') },
      },
      {
        name: 'settings',
        pattern: 'settings',
        data: { title: msg('设置') },
      },
      {
        name: 'not-found',
        pattern: '*',
      },
    ];
  }

  constructor() {
    super();
    const currentLocale = getLocale();
    const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (savedLocale && isLocale(savedLocale)) {
      this.locale = savedLocale;
    } else {
      this.locale = currentLocale as Locale;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this._mq = window.matchMedia('(max-width: 767px)');
    this._isMobile = this._mq.matches;
    this._mq.addEventListener('change', this._onMediaChange);
    // Defer so :host media-query vars are computed before mirroring to :root.
    requestAnimationFrame(() => this._syncAppBottomNavInsetToRoot());
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._mq?.removeEventListener('change', this._onMediaChange);
    this._pageLoading?.close();
    this._pageLoading = null;
    this._mainEl = null;
    document.documentElement.style.removeProperty('--app-bottom-nav-inset');
  }
  private _onMediaChange = (e: MediaQueryListEvent) => {
    this._isMobile = e.matches;
    requestAnimationFrame(() => this._syncAppBottomNavInsetToRoot());
  };

  /** Mirror host nav inset to :root so portals (session dock, etc.) can read it. */
  private _syncAppBottomNavInsetToRoot(): void {
    const value = getComputedStyle(this).getPropertyValue('--app-bottom-nav-inset').trim() || '0px';
    document.documentElement.style.setProperty('--app-bottom-nav-inset', value);
  }

  router(
    route: string,
    params: { [key: string]: string },
    query: { [key: string]: string },
    data: object,
  ) {
    this.activeRoute = route;
    this.routeContext = {
      route,
      params,
      query,
      data,
    };
    const menuKey = route === 'sentence-practice' ? 'sentences' : route || 'home';
    this.selectedKeys = [menuKey];
    if (route in ROUTE_LOADERS) {
      void this._ensurePageLoaded(route as AppRoute);
    }
  }

  private _handleMenuSelect(event: CustomEvent<MenuSelectDetail>) {
    this.selectedKeys = event.detail.selectedKeys;
    const link = this._menuLinks.get(event.detail.key);
    if (link) {
      this.navigate(link);
    }
  }

  private _handleOpenChange(event: CustomEvent<MenuOpenChangeDetail>) {
    this.openKeys = event.detail.openKeys;
  }

  private _getMainEl(): HTMLElement | null {
    if (this._mainEl?.isConnected) return this._mainEl;
    this._mainEl = this.renderRoot.querySelector('main');
    return this._mainEl;
  }

  private _ensurePageLoaded(route: AppRoute): Promise<void> {
    if (this._loadedRoutes.has(route)) {
      return Promise.resolve();
    }
    const main = this._getMainEl();
    if (main && !this._pageLoading) {
      this._pageLoading = Loading.service({
        fullscreen: false,
        target: main,
        text: msg('加载中'),
      });
    }
    return loadPageModule(route)
      .then(() => {
        if (!this.isConnected || this._loadedRoutes.has(route)) {
          return;
        }
        const next = new Set(this._loadedRoutes);
        next.add(route);
        this._loadedRoutes = next;
      })
      .finally(() => {
        this._pageLoading?.close();
        this._pageLoading = null;
      });
  }

  private _renderActivePage() {
    const route = (this.activeRoute || 'home') as AppRoute;
    const render = ROUTE_PAGES[route];
    if (!render) {
      return nothing;
    }
    if (!this._loadedRoutes.has(route)) {
      void this._ensurePageLoaded(route);
      return nothing; // 遮罩盖在 main 上，不再渲染文案占位
    }
    // 渲染当前 active 的路由页面，非 active 的路由页面会销毁
    return render({ routeContext: this.routeContext });
  }

  render() {
    const menuItems = this._getMenuItems();
    this._menuLinks = new Map(menuItems.map((item) => [item.key, item.link]));

    return html`
      <div class="layout">
        <nav class="navigation">
          <ui-menu
            .items=${menuItems}
            .selectedKeys=${this.selectedKeys}
            .openKeys=${this.openKeys}
            mode=${this._isMobile ? 'horizontal' : 'vertical'}
            ?bottom-nav=${this._isMobile}
            ?inline=${!this._isMobile}
            @select=${this._handleMenuSelect}
            @open-change=${this._handleOpenChange}
          ></ui-menu>
        </nav>
        <div class="main-content">
          <header>
            <h1 class="brand">${msg('FluentAnyLang')}</h1>
            <locale-switcher .value=${this.locale}></locale-switcher>
          </header>
          <main>${this._renderActivePage()}</main>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': MyApp;
  }
}
