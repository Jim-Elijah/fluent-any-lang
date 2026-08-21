import { css, html, LitElement } from 'lit';
import { customElement, query, queryAll, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { msg, localized } from '@lit/localize';

import '../../components/settings/settings-preferences.js';
import '../../components/settings/settings-player-defaults.js';
import '../../components/settings/settings-limits.js';
import '../../components/settings/settings-speech-score.js';
import '../../components/settings/settings-backup.js';
import '../../components/settings/settings-pwa.js';
import '../../components/settings/settings-diagnostics.js';
import '../../components/settings/settings-clear-data.js';
import { throttle } from '../../lib/util.js';

const GROUP_IDS = ['practice', 'data', 'app', 'lab'] as const;
type GroupId = (typeof GROUP_IDS)[number];

/** Extra px below sticky nav when scrolling a group title into view. */
const SCROLL_TITLE_SLACK_PX = 8;

@customElement('settings-page')
@localized()
export class SettingsPage extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .page {
      display: flex;
      flex-direction: column;
      gap: var(--space-stack);
      max-width: 40rem;
      width: 100%;
    }

    /* --- sticky nav --- */
    .nav {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      gap: 0.5rem;
      padding: 0.5rem 0;
      background: var(--color-bg, #f5f5f5);
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .nav-item {
      all: unset;
      cursor: pointer;
      padding: 0.375rem 0.75rem;
      border-radius: var(--radius-md, 8px);
      font-size: 0.8125rem;
      white-space: nowrap;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      background: var(--color-surface, #fff);
      transition:
        background 0.15s,
        color 0.15s;
    }

    .nav-item:hover {
      background: var(--color-primary-bg, #e6f4ff);
    }

    .nav-item.active {
      color: var(--color-primary, #1677ff);
      background: var(--color-primary-bg, #e6f4ff);
      font-weight: 500;
    }

    .badge {
      font-size: 0.625rem;
      padding: 0.0625rem 0.3125rem;
      border-radius: 0.5rem;
      background: var(--color-primary, #1677ff);
      color: #fff;
      vertical-align: super;
      margin-left: 0.25rem;
    }

    /* --- groups --- */
    .group {
      display: flex;
      flex-direction: column;
      gap: var(--space-stack);
      scroll-margin-top: var(--settings-nav-height, 2.5rem);
    }

    .group-title {
      margin: 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      padding-top: 0.5rem;
    }
  `;

  @state() private _activeGroup: GroupId = 'practice';

  @query('.nav')
  private _navEl?: HTMLElement;

  @queryAll('.group')
  private _groupEls?: NodeListOf<HTMLElement>;

  private _scroller?: HTMLElement;
  /** Click intent: while set, position sync must not override active. */
  private _pinnedId?: GroupId;
  private _programmaticScrolling = false;
  /** True when click target could not scroll to the sticky line (clamped). */
  private _keepPinAfterScroll = false;
  private _pinFallbackTimer?: ReturnType<typeof setTimeout>;

  /**
   * Active = section that currently contains the sticky-nav marker line.
   * Tall sections stay active while browsing their body; short trailing
   * sections only activate once the marker enters them.
   */
  private _applyActiveFromPosition = () => {
    if (this._pinnedId) return;

    const scroller = this._scroller;
    const groups = this._groupEls;
    if (!scroller || !groups?.length) return;

    const markerY = scroller.getBoundingClientRect().top + (this._navEl?.offsetHeight ?? 0);

    let fallback: GroupId = GROUP_IDS[0];
    for (let i = 0; i < GROUP_IDS.length; i++) {
      const id = GROUP_IDS[i];
      const el = groups[i];
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      if (rect.top <= markerY) fallback = id;
      if (rect.top <= markerY && rect.bottom > markerY) {
        this._activeGroup = id;
        return;
      }
    }

    this._activeGroup = fallback;
  };

  private readonly _throttledApplyActiveFromPosition = throttle(this._applyActiveFromPosition, 100);

  override firstUpdated() {
    this._scroller = this._getScrollContainer() ?? undefined;
    this._scroller?.addEventListener('scroll', this._onScrollerScroll, { passive: true });
    this._syncNavHeight();
    this._applyActiveFromPosition();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._scroller?.removeEventListener('scroll', this._onScrollerScroll);
    this._scroller?.removeEventListener('scrollend', this._onProgrammaticScrollEnd);
    this._throttledApplyActiveFromPosition.cancel();
    if (this._pinFallbackTimer !== undefined) clearTimeout(this._pinFallbackTimer);
  }

  private _onScrollerScroll = () => {
    if (this._pinnedId) {
      // User scrolled after a click pin → release intent (must stay synchronous).
      if (this._programmaticScrolling) return;
      this._clearPinListeners();
      this._pinnedId = undefined;
    }
    this._throttledApplyActiveFromPosition();
  };

  private _syncNavHeight() {
    if (this._navEl) {
      this.style.setProperty('--settings-nav-height', `${this._navEl.offsetHeight}px`);
    }
  }

  private _clearPinListeners() {
    this._scroller?.removeEventListener('scrollend', this._onProgrammaticScrollEnd);
    if (this._pinFallbackTimer !== undefined) {
      clearTimeout(this._pinFallbackTimer);
      this._pinFallbackTimer = undefined;
    }
  }

  private _onProgrammaticScrollEnd = () => {
    if (!this._programmaticScrolling) return;
    this._programmaticScrolling = false;
    this._clearPinListeners();

    // Keep pin when the click target could not reach the sticky line (clamped).
    if (this._keepPinAfterScroll) {
      this._keepPinAfterScroll = false;
      return;
    }

    this._pinnedId = undefined;
    this._throttledApplyActiveFromPosition.cancel();
    this._applyActiveFromPosition();
  };

  private _getScrollContainer(): HTMLElement | null {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let el: Element | null = this;
    while (el) {
      if (el instanceof HTMLElement) {
        const { overflowY } = getComputedStyle(el);
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
          return el;
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  private _scrollTo(id: GroupId) {
    this._pinnedId = id;
    this._activeGroup = id;

    const index = GROUP_IDS.indexOf(id);
    const title = this._groupEls?.[index]?.querySelector('.group-title');
    const scroller = this._scroller ?? this._getScrollContainer();
    if (!title || !scroller) {
      this._pinnedId = undefined;
      return;
    }

    const scrollerTop = scroller.getBoundingClientRect().top;
    const titleTop = title.getBoundingClientRect().top;
    const offset = (this._navEl?.offsetHeight ?? 0) + SCROLL_TITLE_SLACK_PX;

    const rawTop = scroller.scrollTop + (titleTop - scrollerTop) - offset;
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const top = Math.min(Math.max(0, rawTop), maxTop);
    this._keepPinAfterScroll = Math.abs(top - rawTop) > 1;

    this._clearPinListeners();
    this._programmaticScrolling = true;
    scroller.addEventListener('scrollend', this._onProgrammaticScrollEnd);
    this._pinFallbackTimer = setTimeout(this._onProgrammaticScrollEnd, 600);

    scroller.scrollTo({ top, behavior: 'smooth' });
  }

  render() {
    const nav = (id: GroupId, label: unknown, badge?: unknown) => html`
      <button
        class=${classMap({ 'nav-item': true, active: this._activeGroup === id })}
        @click=${() => this._scrollTo(id)}
      >
        ${label}${badge ?? ''}
      </button>
    `;

    return html`
      <div class="page">
        <nav class="nav">
          ${nav('practice', msg('练习'))} ${nav('data', msg('数据'))} ${nav('app', msg('应用'))}
          ${nav('lab', msg('实验室'), html`<span class="badge">Beta</span>`)}
        </nav>

        <section id="group-practice" class="group">
          <h3 class="group-title">${msg('练习')}</h3>
          <settings-preferences></settings-preferences>
          <settings-player-defaults></settings-player-defaults>
          <settings-limits></settings-limits>
        </section>

        <section id="group-data" class="group">
          <h3 class="group-title">${msg('数据')}</h3>
          <settings-backup></settings-backup>
          <settings-clear-data></settings-clear-data>
        </section>

        <section id="group-app" class="group">
          <h3 class="group-title">${msg('应用')}</h3>
          <settings-pwa></settings-pwa>
          <settings-diagnostics></settings-diagnostics>
        </section>

        <section id="group-lab" class="group">
          <h3 class="group-title">
            ${msg('实验室')}
            <span class="badge">Beta</span>
          </h3>
          <settings-speech-score></settings-speech-score>
        </section>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-page': SettingsPage;
  }
}
