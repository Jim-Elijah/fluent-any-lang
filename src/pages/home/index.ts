import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { navigator } from 'lit-element-router';

import '../../components/import/content-importer.js';
import '../../components/library/media-list.js';
import '../../components/stats/practice-stats-dashboard.js';
import type { MediaList } from '../../components/library/media-list.js';
import {
  COMPACT_VIEWPORT_MQ,
  EXIT_FILL_LIST_PX,
  MIN_FILL_LIST_PX,
  gapPx,
  measurePageViewportHeight,
  sumOffsetHeights,
} from '../../lib/layout-compact.js';

const NavigatorElement = navigator(LitElement);
@customElement('home-page')
@localized()
export class HomePage extends NavigatorElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }

    :host([compact]) {
      height: auto;
      overflow: visible;
    }

    .home {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    .intro {
      flex-shrink: 0;
      margin: 0 0 var(--space-inline);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.9375rem;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-stack);
      flex: 1;
      min-height: 0;
    }

    .stack > :not(media-list) {
      flex-shrink: 0;
    }

    media-list {
      flex: 1;
      min-height: 12rem;
    }

    :host([compact]) media-list {
      flex: none;
      min-height: 0;
    }
  `;

  @property({ type: Boolean, reflect: true })
  compact = false;

  @state()
  private _compactMq?: MediaQueryList;

  @query('media-list')
  private _mediaList?: MediaList;

  private _resizeObserver: ResizeObserver | null = null;

  private _observed = new Set<Element>();

  connectedCallback() {
    super.connectedCallback();
    this._compactMq = window.matchMedia(COMPACT_VIEWPORT_MQ);
    this.compact = this._compactMq.matches;
    this._compactMq.addEventListener('change', this._onCompactMqChange);
  }

  disconnectedCallback() {
    this._compactMq?.removeEventListener('change', this._onCompactMqChange);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._observed.clear();
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    this._resizeObserver = new ResizeObserver(() => this._syncCompactFromSpace());
    this._observe(this);
    const mainContent = this.parentElement?.parentElement;
    if (mainContent) this._observe(mainContent);
    this._observeShadowTargets();
    this._syncCompactFromSpace();
  }

  protected updated(): void {
    this._observeShadowTargets();
  }

  private _onCompactMqChange = (e: MediaQueryListEvent) => {
    if (e.matches) {
      this.compact = true;
      return;
    }
    this._syncCompactFromSpace();
  };

  private _observe(el: Element | null | undefined): void {
    if (!el || !this._resizeObserver || this._observed.has(el)) return;
    this._resizeObserver.observe(el);
    this._observed.add(el);
  }

  private _observeShadowTargets(): void {
    const root = this.renderRoot;
    this._observe(root.querySelector('.intro'));
    this._observe(root.querySelector('.stack'));
    this._observe(root.querySelector('practice-stats-dashboard'));
    this._observe(root.querySelector('content-importer'));
    this._observe(root.querySelector('media-list'));
  }

  /** Prefer fill-height when the list has room; otherwise page-scroll (compact). */
  private _syncCompactFromSpace(): void {
    if (this._compactMq?.matches) {
      if (!this.compact) this.compact = true;
      return;
    }

    if (!this.compact) {
      const list = this.renderRoot.querySelector('media-list') as HTMLElement | null;
      const listHeight = list?.clientHeight ?? 0;
      // Ignore 0 (unmounted / no flex height yet) to avoid false compact in tests.
      if (listHeight > 0 && listHeight < MIN_FILL_LIST_PX) {
        this.compact = true;
      }
      return;
    }

    const pageViewport = measurePageViewportHeight(this);
    if (pageViewport <= 0) return;

    const intro = this.renderRoot.querySelector('.intro') as HTMLElement | null;
    const stack = this.renderRoot.querySelector('.stack');
    if (!stack) return;

    const siblings = [...stack.children].filter(
      (child) => child.tagName.toLowerCase() !== 'media-list',
    );
    const introMb = intro ? Number.parseFloat(getComputedStyle(intro).marginBottom) || 0 : 0;
    const gaps = gapPx(stack) * Math.max(0, stack.children.length - 1);
    const upper = (intro?.offsetHeight ?? 0) + introMb + sumOffsetHeights(siblings) + gaps;
    const remaining = pageViewport - upper;

    if (remaining >= EXIT_FILL_LIST_PX) {
      this.compact = false;
    }
  }

  render() {
    return html`
      <div class="home">
        <p class="intro">
          ${msg('任意语言的听说练习平台。导入音视频后即可开始练习，字幕可稍后补充。')}
        </p>
        <div class="stack">
          <practice-stats-dashboard></practice-stats-dashboard>
          <content-importer @content-imported="${this._handleContentImported}"></content-importer>
          <media-list
            ?fill-height=${!this.compact}
            .limit=${10}
            @media-selected="${this._handleMediaSelected}"
          ></media-list>
        </div>
      </div>
    `;
  }

  private _handleContentImported(): void {
    void this._mediaList?.refresh();
  }

  private _handleMediaSelected(event: CustomEvent<{ id: string }>): void {
    const params = new URLSearchParams({ mediaId: event.detail.id });
    this.navigate(`/practice?${params.toString()}`);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'home-page': HomePage;
  }
}
