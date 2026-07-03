import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg } from '@lit/localize';
import { RouteContext } from '../types/models.js';
import { router, navigator, Routes } from 'lit-element-router';

import './app-link.js';
import './app-main.js';
import '../pages/home/index.js';
import '../pages/library/index.js';
import '../pages/practice/index.js';
import '../pages/not-found/index.js';
import '../pages/recording/index.js';
import '../components/ui/locale-switcher.js';
import '../components/ui/menu.js';
import { MenuItem, MenuOpenChangeDetail, MenuSelectDetail } from '../components/ui/menu.js';
// import { Loading } from '../components/ui/loading';
// import { Message } from '../components/ui/message.js';

@customElement('app-shell')
@router
@navigator
export class MyApp extends LitElement {
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
  route: string = '';

  // @state()
  // params: object = {};

  // @state()
  // query: object = {};

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

  private readonly _menuItems: Array<MenuItem & { link: string }> = [
    { key: 'home', label: 'Home', link: '/' },
    { key: 'practice', label: 'Practice', link: '/practice' },
    { key: 'library', label: 'Library', link: '/library' },
    { key: 'not-found', label: 'Not Found', link: '/not-found' },
  ];

  private readonly _menuLinks = new Map(this._menuItems.map((item) => [item.key, item.link]));

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

  firstUpdated() {
    // console.log('firstUpdated', Message);
    // Message.config({ max: 5, duration: 2000, grouping: true, showClose: true });
    // Message('Saved');
    // Message({ message: 'Done0', type: 'success', duration: 0 });
    // Message({ message: 'Done1', type: 'success' });
    // Message({ message: 'Done', type: 'success', duration: 5000 });
    // Message({ message: 'Done', type: 'success', duration: 5000 });
    // Message({ message: 'Done', type: 'success', duration: 5000 });
    // Message.error({ message: 'Failed', showClose: true });
    // const inst = Message.info('Loading...');
    // inst.close();
    // Message.closeAll();
    // const loadingInstance = Loading.service({
    //   text: 'Loading',
    //   background: 'rgba(0, 0, 0, 0.8)',
    //   // lock: true,
    // });
    // setTimeout(() => loadingInstance.close(), 2000);
  }

  router(
    route: string,
    params: { [key: string]: string },
    query: { [key: string]: string },
    data: object,
  ) {
    this.route = route;
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

  render() {
    return html`
      <div class="layout">
        <div class="navigation">
          <ui-menu
            .items=${this._menuItems}
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
            <locale-switcher></locale-switcher>
          </header>
          <app-main active-route=${this.route}>
            <div route="home"><home-page></home-page></div>
            <div route="practice">
              <practice-page .routeContext=${this.routeContext}></practice-page>
            </div>
            <div route="library"><library-page></library-page></div>
            <div route="not-found">
              <not-found-page .active=${this.route === 'not-found'}></not-found-page>
            </div>
          </app-main>
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
