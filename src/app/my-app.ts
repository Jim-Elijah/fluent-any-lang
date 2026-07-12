import { LitElement, css, html, nothing, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { RouteContext } from '../types/models.js';
import { router, navigator, Routes } from 'lit-element-router';

import '../pages/home/index.js';
import '../pages/library/index.js';
import '../pages/practice/index.js';
import '../pages/practice-stats/index.js';
import '../pages/not-found/index.js';
import '../components/ui/locale-switcher.js';
import '../components/ui/menu.js';
import { MenuItem, MenuOpenChangeDetail, MenuSelectDetail } from '../components/ui/menu.js';
import { getLocale, isLocale, Locale, LOCALE_STORAGE_KEY } from '../i18n/localization.js';

type AppRoute = 'home' | 'practice' | 'library' | 'stats' | 'not-found';
type RouteRenderContext = {
  routeContext: RouteContext;
};

const ROUTE_PAGES: Record<AppRoute, (ctx: RouteRenderContext) => TemplateResult> = {
  home: () => html`<home-page></home-page>`,
  practice: ({ routeContext }) =>
    html`<practice-page .routeContext=${routeContext}></practice-page>`,
  library: () => html`<library-page></library-page>`,
  stats: () => html`<practice-stats-page></practice-stats-page>`,
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
      --nav-width: 200px;
      --nav-height: 56px;
    }

    .layout {
      display: flex;
      min-height: 100vh;
      max-width: calc(960px + 48px);
      margin: 0 auto;
      padding: 0 16px;
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
    .main-content {
      flex: 1;
      min-width: 0;
      padding: 24px 0 48px 0; /* 间距交给 gap */
    }

    .navigation ui-menu {
      display: block;
      height: 100%;
    }

    .main-content {
      flex: 1;
      min-width: 0;
      padding: 24px 0 48px 24px;
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

    /* 移动：固定在底部 */
    @media (max-width: 767px) {
      .layout {
        flex-direction: column;
        max-width: none;
        padding: 0;
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
        padding: 16px 16px calc(var(--nav-height) + env(safe-area-inset-bottom, 0) + 16px);
      }

      header {
        margin-bottom: 24px;
        padding-bottom: 12px;
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
      { key: 'stats', label: msg('统计'), link: '/stats', icon: 'clock' },
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
        name: 'stats',
        pattern: 'stats',
        data: { title: 'Stats' },
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
