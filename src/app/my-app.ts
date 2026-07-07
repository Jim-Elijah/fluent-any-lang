import { LitElement, css, html, nothing, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { RouteContext } from '../types/models.js';
import { router, navigator, Routes } from 'lit-element-router';

import '../pages/home/index.js';
import '../pages/library/index.js';
import '../pages/practice/index.js';
import '../pages/not-found/index.js';
import '../components/ui/locale-switcher.js';
import '../components/ui/menu.js';
import { MenuItem, MenuOpenChangeDetail, MenuSelectDetail } from '../components/ui/menu.js';
import { getLocale, isLocale, Locale, LOCALE_STORAGE_KEY } from '../i18n/localization.js';

type AppRoute = 'home' | 'practice' | 'library' | 'not-found';
type RouteRenderContext = {
  routeContext: RouteContext;
};

const ROUTE_PAGES: Record<AppRoute, (ctx: RouteRenderContext) => TemplateResult> = {
  home: () => html`<home-page></home-page>`,
  practice: ({ routeContext }) =>
    html`<practice-page .routeContext=${routeContext}></practice-page>`,
  library: () => html`<library-page></library-page>`,
  'not-found': () => html`<not-found-page></not-found-page>`,
};

const RouterNavigatorApp = navigator(router(LitElement));
@customElement('app-shell')
@localized()
export class MyApp extends RouterNavigatorApp {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
    }

    .layout {
      max-width: 960px;
      min-height: 100vh;
      margin: 0 auto;
      padding: 24px 16px 48px;
    }

    /* 桌面：左侧固定 */
    .navigation {
      position: fixed;
      top: 50%;
      transform: translate(-100%);
      /* top: 0;
      left: 0;
      bottom: 0;
      width: var(--nav-width, 220px); */
      z-index: 100;
      background: #fff;
      border-right: 1px solid var(--color-border, #d9d9d9);
      overflow-y: auto;
    }

    .main-content {
      /* margin-left: var(--nav-width, 220px); */
      padding: 24px 16px 48px;
      max-width: 960px;
    }

    /* 移动：底部固定 */
    @media (max-width: 767px) {
      .navigation {
        top: auto;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: auto;
        border-right: none;
        transform: none;
        border-top: 1px solid var(--color-border, #d9d9d9);
        padding-bottom: env(safe-area-inset-bottom, 0);
      }
      .main-content {
        margin-left: 0;
        margin-bottom: calc(var(--nav-height, 56px) + env(safe-area-inset-bottom, 0));
        padding: 16px 16px 24px;
        max-width: none;
      }
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--color-border, #d9d9d9);
    }

    .brand {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-primary, #1677ff);
    }
  `;

  @property({ type: String })
  activeRoute: string = 'home';

  @state()
  private _isMobile = false;
  private _mq?: MediaQueryList;

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

  private _getMenuItems(): Array<MenuItem & { link: string }> {
    return [
      { key: 'home', label: msg('首页'), link: '/', icon: 'home' },
      { key: 'practice', label: msg('练习'), link: '/practice', icon: 'practice' },
      { key: 'library', label: msg('库'), link: '/library', icon: 'media' },
    ];
  }

  private _menuLinks = new Map<string, string>();

  static get routes(): Routes {
    return [
      {
        name: 'home',
        pattern: '',
        data: { title: 'Home' },
      },
      {
        name: 'library',
        pattern: 'library',
      },
      {
        name: 'practice',
        pattern: 'practice',
      },
      {
        name: 'practice',
        pattern: 'practice/:id',
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
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._mq?.removeEventListener('change', this._onMediaChange);
  }
  private _onMediaChange = (e: MediaQueryListEvent) => {
    this._isMobile = e.matches;
  };

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
    this.selectedKeys = [route || 'home'];
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

  private _renderActivePage() {
    const route = (this.activeRoute || 'home') as AppRoute;
    // 渲染当前active的路由页面，非active的路由页面会销毁（原来的是display: none）
    const render = ROUTE_PAGES[route];
    return render ? render({ routeContext: this.routeContext }) : nothing;
  }

  render() {
    const menuItems = this._getMenuItems();
    this._menuLinks = new Map(menuItems.map((item) => [item.key, item.link]));

    return html`
      <div class="layout">
        <div class="navigation">
          <ui-menu
            .items=${menuItems}
            .selectedKeys=${this.selectedKeys}
            .openKeys=${this.openKeys}
            mode=${this._isMobile ? 'horizontal' : 'vertical'}
            ?bottom-nav=${this._isMobile}
            @select=${this._handleMenuSelect}
            @open-change=${this._handleOpenChange}
          ></ui-menu>
        </div>
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
