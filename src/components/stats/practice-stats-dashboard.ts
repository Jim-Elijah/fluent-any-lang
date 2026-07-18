import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { navigator } from 'lit-element-router';

import {
  buildHomeDashboard,
  formatActiveDuration,
  type HomeDashboardData,
} from '../../analytics/practice-stats-aggregate.js';
import { getAllPracticeSessions } from '../../db/practice-session.js';
import { reportError } from '../../lib/error-reporter.js';
import '../ui/button.js';

export type ContinuePracticeDetail = {
  mediaId: string;
  mediaTitle: string;
};

const NavigatorElement = navigator(LitElement);

/**
 * 首页轻量练习仪表：今日时长、模式拆分、连续天数、继续上次。
 * 也可嵌入其他页面；数据可注入（测试）或自动从 IndexedDB 加载。
 */
@customElement('practice-stats-dashboard')
@localized()
export class PracticeStatsDashboard extends NavigatorElement {
  static styles = css`
    :host {
      display: block;
    }

    .card {
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.06));
      padding: var(--space-inline);
    }

    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-block);
      margin-bottom: var(--space-inline);
    }

    .title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-text, rgba(0, 0, 0, 0.88));
    }

    .subtitle {
      margin: 2px 0 0;
      font-size: 0.75rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .link-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: var(--color-primary, #1677ff);
      font: inherit;
      font-size: 0.8125rem;
      cursor: pointer;
      padding: 0;
      white-space: nowrap;
    }

    .link-btn:hover {
      color: var(--color-primary-hover, #4096ff);
    }

    .hero {
      display: flex;
      align-items: baseline;
      gap: var(--space-sm);
      flex-wrap: wrap;
      margin-bottom: var(--space-inline);
    }

    .hero-value {
      font-size: 1.75rem;
      font-weight: 650;
      letter-spacing: -0.02em;
      color: var(--color-text, rgba(0, 0, 0, 0.88));
      line-height: 1.2;
    }

    .hero-label {
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .streak {
      margin-left: auto;
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      background: rgba(22, 119, 255, 0.06);
      border-radius: 999px;
      padding: var(--space-xs) var(--space-sm);
    }

    .streak strong {
      color: var(--color-primary, #1677ff);
      font-weight: 600;
    }

    .modes {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-block);
      margin-bottom: var(--space-inline);
    }

    .mode {
      border-radius: 8px;
      padding: var(--space-sm);
      background: var(--color-bg, #f5f5f5);
      min-width: 0;
    }

    .mode-name {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      font-size: 0.75rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      margin-bottom: var(--space-xs);
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .dot.listening {
      background: var(--color-primary, #1677ff);
    }
    .dot.discrimination {
      background: #722ed1;
    }
    .dot.shadowing {
      background: #13c2c2;
    }
    .dot.echo {
      background: #fa8c16;
    }

    .mode-value {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-text, rgba(0, 0, 0, 0.88));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .stack-bar {
      display: flex;
      height: 8px;
      border-radius: 999px;
      overflow: hidden;
      background: #f0f0f0;
      margin-bottom: var(--space-inline);
    }

    .stack-bar > span {
      display: block;
      height: 100%;
      min-width: 0;
    }

    .stack-bar .listening {
      background: var(--color-primary, #1677ff);
    }
    .stack-bar .discrimination {
      background: #722ed1;
    }
    .stack-bar .shadowing {
      background: #13c2c2;
    }
    .stack-bar .echo {
      background: #fa8c16;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-block);
      flex-wrap: wrap;
    }

    .continue-meta {
      min-width: 0;
      flex: 1;
    }

    .continue-label {
      margin: 0;
      font-size: 0.75rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .continue-title {
      margin: 2px 0 0;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text, rgba(0, 0, 0, 0.88));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .empty {
      margin: 0;
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .loading-wrap {
      display: flex;
      justify-content: center;
      padding: var(--space-block) 0;
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }
  `;

  /** 注入数据时跳过自动加载（便于测试） */
  @property({ attribute: false })
  data: HomeDashboardData | null = null;

  @property({ type: Boolean, attribute: 'show-view-all' })
  showViewAll = true;

  @state()
  private _loading = true;

  @state()
  private _internal: HomeDashboardData | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    if (!this.data) {
      void this.refresh();
    } else {
      this._loading = false;
    }
  }

  async refresh(): Promise<void> {
    if (this.data) {
      this._loading = false;
      return;
    }
    this._loading = true;
    try {
      const sessions = await getAllPracticeSessions();
      this._internal = buildHomeDashboard(sessions);
    } catch (err) {
      void reportError(err, { where: 'practice-stats-dashboard.load' });
      this._internal = buildHomeDashboard([]);
    } finally {
      this._loading = false;
    }
  }

  private get _dash(): HomeDashboardData {
    return (
      this.data ??
      this._internal ?? {
        todayMs: 0,
        byMode: { listening: 0, discrimination: 0, shadowing: 0, echo: 0 },
        lastSession: null,
        streakDays: 0,
      }
    );
  }

  private _handleViewAll = (): void => {
    this.dispatchEvent(new CustomEvent('view-stats', { bubbles: true, composed: true }));
    this.navigate('/stats');
  };

  private _handleContinue = (): void => {
    const session = this._dash.lastSession;
    if (!session?.mediaId) return;
    const detail: ContinuePracticeDetail = {
      mediaId: session.mediaId,
      mediaTitle: session.mediaTitle,
    };
    this.dispatchEvent(
      new CustomEvent<ContinuePracticeDetail>('continue-practice', {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
    const params = new URLSearchParams({ mediaId: session.mediaId });
    this.navigate(`/practice?${params.toString()}`);
  };

  render() {
    if (this._loading && !this.data) {
      return html`
        <section class="card" aria-busy="true">
          <div class="loading-wrap">${msg('加载中…')}</div>
        </section>
      `;
    }

    const dash = this._dash;
    const total = dash.todayMs;
    const hasAny = total > 0 || dash.lastSession !== null || dash.streakDays > 0;
    const { listening, discrimination, shadowing, echo } = dash.byMode;

    return html`
      <section class="card" aria-label=${msg('今日练习')}>
        <div class="header">
          <div>
            <h2 class="title">${msg('今日练习')}</h2>
            <p class="subtitle">${msg('有效练习时长')}</p>
          </div>
          ${this.showViewAll
            ? html`<button type="button" class="link-btn" @click=${this._handleViewAll}>
                ${msg('查看统计')}
              </button>`
            : nothing}
        </div>

        ${!hasAny
          ? html`<p class="empty">${msg('今天还没有练习记录，去导入材料开始练习吧。')}</p>`
          : html`
              <div class="hero">
                <span class="hero-value">${formatActiveDuration(total)}</span>
                <span class="hero-label">${msg('合计')}</span>
                ${dash.streakDays > 0
                  ? html`<span class="streak"
                      >${msg('连续')} <strong>${dash.streakDays}</strong> ${msg('天')}</span
                    >`
                  : nothing}
              </div>

              <div class="modes" role="list">
                <div class="mode" role="listitem">
                  <div class="mode-name">
                    <span class="dot listening" aria-hidden="true"></span>${msg('听力')}
                  </div>
                  <div class="mode-value">${formatActiveDuration(listening)}</div>
                </div>
                <div class="mode" role="listitem">
                  <div class="mode-name">
                    <span class="dot discrimination" aria-hidden="true"></span>${msg('辨音')}
                  </div>
                  <div class="mode-value">${formatActiveDuration(discrimination)}</div>
                </div>
                <div class="mode" role="listitem">
                  <div class="mode-name">
                    <span class="dot shadowing" aria-hidden="true"></span>${msg('跟读')}
                  </div>
                  <div class="mode-value">${formatActiveDuration(shadowing)}</div>
                </div>
                <div class="mode" role="listitem">
                  <div class="mode-name">
                    <span class="dot echo" aria-hidden="true"></span>${msg('回声')}
                  </div>
                  <div class="mode-value">${formatActiveDuration(echo)}</div>
                </div>
              </div>

              ${total > 0
                ? html`
                    <div class="stack-bar" role="img" aria-label=${msg('今日模式占比')}>
                      ${listening > 0
                        ? html`<span
                            class="listening"
                            style="flex:${listening}"
                            title=${msg('听力')}
                          ></span>`
                        : nothing}
                      ${discrimination > 0
                        ? html`<span
                            class="discrimination"
                            style="flex:${discrimination}"
                            title=${msg('辨音')}
                          ></span>`
                        : nothing}
                      ${shadowing > 0
                        ? html`<span
                            class="shadowing"
                            style="flex:${shadowing}"
                            title=${msg('跟读')}
                          ></span>`
                        : nothing}
                      ${echo > 0
                        ? html`<span class="echo" style="flex:${echo}" title=${msg('回声')}></span>`
                        : nothing}
                    </div>
                  `
                : nothing}
              ${dash.lastSession
                ? html`
                    <div class="actions">
                      <div class="continue-meta">
                        <p class="continue-label">${msg('继续上次')}</p>
                        <p class="continue-title">${dash.lastSession.mediaTitle}</p>
                      </div>
                      <ui-button variant="primary" @click=${this._handleContinue}>
                        ${msg('继续练习')}
                      </ui-button>
                    </div>
                  `
                : nothing}
            `}
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'practice-stats-dashboard': PracticeStatsDashboard;
  }
}
