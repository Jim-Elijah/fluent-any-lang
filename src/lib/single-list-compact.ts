import type { ReactiveController, ReactiveControllerHost } from 'lit';

import {
  COMPACT_VIEWPORT_MQ,
  EXIT_FILL_LIST_PX,
  MIN_FILL_LIST_PX,
  gapPx,
  isLayoutBox,
  layoutBoxCount,
  measurePageViewportHeight,
  sumOffsetHeights,
} from './layout-compact.js';

export type SingleListCompactHost = ReactiveControllerHost &
  HTMLElement & {
    compact: boolean;
    readonly renderRoot: HTMLElement | DocumentFragment;
  };

/**
 * Prefer fill-height when the list has room; otherwise page-scroll (compact).
 * Host must reflect `compact` as a boolean property.
 */
export class SingleListCompactController implements ReactiveController {
  private _resizeObserver: ResizeObserver | null = null;
  private _observed = new Set<Element>();
  private _compactMq?: MediaQueryList;
  private _started = false;

  constructor(
    private readonly host: SingleListCompactHost,
    private readonly options: {
      listSelector: string;
      chromeSelectors: string[];
      /** Optional stack wrapper that contains chrome + list (gap counted). */
      stackSelector?: string;
    },
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this._compactMq = window.matchMedia(COMPACT_VIEWPORT_MQ);
    this.host.compact = this._compactMq.matches;
    this._compactMq.addEventListener('change', this._onCompactMqChange);
  }

  hostDisconnected(): void {
    this._compactMq?.removeEventListener('change', this._onCompactMqChange);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._observed.clear();
    this._started = false;
  }

  hostUpdated(): void {
    if (!this._started) {
      this._started = true;
      this._resizeObserver = new ResizeObserver(() => this.sync());
      this._observe(this.host);
      const mainContent = this.host.parentElement?.parentElement;
      if (mainContent) this._observe(mainContent);
      this.sync();
    }
    this._observeChromeAndList();
  }

  sync(): void {
    if (this._compactMq?.matches) {
      if (!this.host.compact) this.host.compact = true;
      return;
    }

    const root = this.host.renderRoot;
    const list = root.querySelector(this.options.listSelector) as HTMLElement | null;

    if (!this.host.compact) {
      const listHeight = list?.clientHeight ?? 0;
      // Ignore 0 until flex layout has assigned a height.
      if (listHeight > 0 && listHeight < MIN_FILL_LIST_PX) {
        this.host.compact = true;
      }
      return;
    }

    const pageViewport = measurePageViewportHeight(this.host);
    if (pageViewport <= 0) return;

    const chrome = this.options.chromeSelectors
      .map((sel) => root.querySelector(sel))
      .filter((el): el is Element => Boolean(el) && isLayoutBox(el));
    const stack = this.options.stackSelector
      ? (root.querySelector(this.options.stackSelector) as HTMLElement | null)
      : null;
    const gaps = stack
      ? gapPx(stack) * Math.max(0, layoutBoxCount(stack) - 1)
      : gapPx(root.querySelector('.layout') as Element | null) *
        Math.max(0, chrome.length + (list ? 0 : -1));

    let chromeMargins = 0;
    for (const el of chrome) {
      if (!(el instanceof HTMLElement)) continue;
      chromeMargins += Number.parseFloat(getComputedStyle(el).marginBottom) || 0;
    }

    const remaining = pageViewport - sumOffsetHeights(chrome) - chromeMargins - gaps;
    if (remaining >= EXIT_FILL_LIST_PX) {
      this.host.compact = false;
    }
  }

  private _onCompactMqChange = (e: MediaQueryListEvent) => {
    if (e.matches) {
      this.host.compact = true;
      return;
    }
    this.sync();
  };

  private _observe(el: Element | null | undefined): void {
    if (!el || !this._resizeObserver || this._observed.has(el)) return;
    this._resizeObserver.observe(el);
    this._observed.add(el);
  }

  private _observeChromeAndList(): void {
    const root = this.host.renderRoot;
    for (const sel of this.options.chromeSelectors) {
      this._observe(root.querySelector(sel));
    }
    this._observe(root.querySelector(this.options.listSelector));
    if (this.options.stackSelector) {
      this._observe(root.querySelector(this.options.stackSelector));
    }
  }
}
