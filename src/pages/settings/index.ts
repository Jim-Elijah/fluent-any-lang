import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
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

const GROUP_IDS = ['practice', 'data', 'app', 'lab'] as const;
type GroupId = (typeof GROUP_IDS)[number];

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
      transition: background 0.15s, color 0.15s;
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

  private _observer?: IntersectionObserver;

  override connectedCallback() {
    super.connectedCallback();
  }

  override firstUpdated() {
    const sections = GROUP_IDS.map((id) =>
      this.renderRoot.querySelector(`#group-${id}`),
    ).filter(Boolean) as Element[];

    this._observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this._activeGroup = entry.target.id.replace(
              'group-',
              '',
            ) as GroupId;
            break;
          }
        }
      },
      { root: null, rootMargin: '-40% 0px -50% 0px', threshold: 0 },
    );

    for (const el of sections) this._observer.observe(el);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._observer?.disconnect();
  }

  private _scrollTo(id: GroupId) {
    this.renderRoot
      .querySelector(`#group-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          ${nav('practice', msg('练习'))}
          ${nav('data', msg('数据'))}
          ${nav('app', msg('应用'))}
          ${nav(
            'lab',
            msg('实验室'),
            html`<span class="badge">Beta</span>`,
          )}
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
