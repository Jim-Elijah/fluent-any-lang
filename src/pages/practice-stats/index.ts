import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { classMap } from 'lit/directives/class-map.js';
import { navigator } from 'lit-element-router';

import {
  aggregatePracticeStats,
  formatActiveDuration,
  resolveRangeBounds,
  type ModeFilter,
  type PracticeStatsSummary,
  type StatsRangePreset,
} from '../../analytics/practice-stats-aggregate.js';
import { getAllPracticeSessions } from '../../db/practice-session.js';
import type { PracticeAnalyticsMode } from '../../types/models.js';
import '../../components/ui/input.js';
import type { InputChangeDetail } from '../../components/ui/input.js';

const NavigatorElement = navigator(LitElement);

@customElement('practice-stats-page')
@localized()
export class PracticeStatsPage extends NavigatorElement {
  static styles = css`
    :host {
      display: block;
    }

    .page {
      display: grid;
      gap: 20px;
    }

    .filters {
      display: grid;
      gap: 12px;
    }

    .seg {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .seg-btn {
      appearance: none;
      border: 1px solid var(--color-border, #d9d9d9);
      background: var(--color-surface, #fff);
      color: var(--color-text, rgba(0, 0, 0, 0.88));
      border-radius: 999px;
      padding: 6px 14px;
      font: inherit;
      font-size: 0.8125rem;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        color 0.15s ease,
        background-color 0.15s ease;
    }

    .seg-btn:hover {
      border-color: var(--color-primary, #1677ff);
      color: var(--color-primary, #1677ff);
    }

    .seg-btn.active {
      background: rgba(22, 119, 255, 0.08);
      border-color: var(--color-primary, #1677ff);
      color: var(--color-primary, #1677ff);
      font-weight: 600;
    }

    .custom-range {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    .custom-range label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .custom-range ui-input {
      width: 150px;
    }

    .card {
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.06));
      padding: 16px 18px;
    }

    .card h2 {
      margin: 0 0 14px;
      font-size: 0.9375rem;
      font-weight: 600;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .stat {
      min-width: 0;
    }

    .stat-value {
      font-size: 1.375rem;
      font-weight: 650;
      letter-spacing: -0.02em;
      line-height: 1.2;
      color: var(--color-text, rgba(0, 0, 0, 0.88));
    }

    .stat-label {
      margin-top: 4px;
      font-size: 0.75rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .bars {
      display: grid;
      gap: 8px;
    }

    .bar-row {
      display: grid;
      grid-template-columns: 44px 1fr 52px;
      gap: 8px;
      align-items: center;
      font-size: 0.75rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .bar-track {
      height: 18px;
      border-radius: 4px;
      background: #f0f0f0;
      min-width: 0;
      overflow: hidden;
    }

    .bar-fill {
      display: flex;
      height: 100%;
      min-width: 0;
      border-radius: 4px;
      overflow: hidden;
    }

    .bar-fill > span {
      display: block;
      height: 100%;
      min-width: 0;
    }

    .seg-listening {
      background: var(--color-primary, #1677ff);
    }
    .seg-shadowing {
      background: #13c2c2;
    }
    .seg-echo {
      background: #fa8c16;
    }

    .bar-value {
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: var(--color-text, rgba(0, 0, 0, 0.88));
    }

    .breakdown {
      display: grid;
      gap: 10px;
    }

    .stack-bar {
      display: flex;
      height: 12px;
      border-radius: 999px;
      overflow: hidden;
      background: #f0f0f0;
    }

    .stack-bar > span {
      display: block;
      height: 100%;
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 16px;
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .dot.listening {
      background: var(--color-primary, #1677ff);
    }
    .dot.shadowing {
      background: #13c2c2;
    }
    .dot.echo {
      background: #fa8c16;
    }

    .legend-value {
      color: var(--color-text, rgba(0, 0, 0, 0.88));
      font-weight: 500;
    }

    .ranking {
      display: grid;
      gap: 10px;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .rank-item {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px 12px;
      align-items: center;
    }

    .rank-title {
      appearance: none;
      border: none;
      background: transparent;
      padding: 0;
      text-align: left;
      cursor: pointer;
      font: inherit;
      font-size: 0.875rem;
      color: var(--color-primary, #1677ff);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .rank-title:hover {
      color: var(--color-primary-hover, #4096ff);
    }

    .rank-ms {
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-variant-numeric: tabular-nums;
    }

    .rank-track {
      grid-column: 1 / -1;
      height: 6px;
      border-radius: 999px;
      background: #f0f0f0;
      overflow: hidden;
    }

    .rank-fill {
      height: 100%;
      background: var(--color-primary, #1677ff);
      border-radius: 999px;
    }

    .empty {
      margin: 0;
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .loading-wrap {
      display: flex;
      justify-content: center;
      padding: 32px 0;
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .hint {
      margin: 0;
      font-size: 0.75rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    @media (max-width: 560px) {
      .summary {
        grid-template-columns: 1fr;
      }

      .bar-row {
        grid-template-columns: 36px 1fr 48px;
      }
    }
  `;

  @state()
  private _preset: StatsRangePreset = 'last7';

  @state()
  private _mode: ModeFilter = 'all';

  @state()
  private _customFrom = '';

  @state()
  private _customTo = '';

  @state()
  private _loading = true;

  @state()
  private _summary: PracticeStatsSummary | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    void this._reload();
  }

  private async _reload(): Promise<void> {
    this._loading = true;
    try {
      const sessions = await getAllPracticeSessions();
      this._summary = aggregatePracticeStats(sessions, {
        preset: this._preset,
        mode: this._mode,
        customFrom: this._customFrom || undefined,
        customTo: this._customTo || undefined,
      });
    } catch (err) {
      console.warn('[practice-stats-page] failed to load', err);
      this._summary = aggregatePracticeStats([]);
    } finally {
      this._loading = false;
    }
  }

  private _setPreset(preset: StatsRangePreset): void {
    this._preset = preset;
    if (preset === 'custom' && (!this._customFrom || !this._customTo)) {
      const bounds = resolveRangeBounds('last7');
      this._customFrom = bounds.fromDateKey;
      this._customTo = bounds.toDateKey;
    }
    void this._reload();
  }

  private _setMode(mode: ModeFilter): void {
    this._mode = mode;
    void this._reload();
  }

  private _onCustomFrom = (e: CustomEvent<InputChangeDetail>): void => {
    this._customFrom = e.detail.value;
    if (this._preset === 'custom') void this._reload();
  };

  private _onCustomTo = (e: CustomEvent<InputChangeDetail>): void => {
    this._customTo = e.detail.value;
    if (this._preset === 'custom') void this._reload();
  };

  private _modeLabel(mode: PracticeAnalyticsMode): string {
    switch (mode) {
      case 'listening':
        return msg('听力');
      case 'shadowing':
        return msg('跟读');
      case 'echo':
        return msg('回声');
    }
  }

  private _pct(part: number, total: number): string {
    if (total <= 0 || part <= 0) return '0%';
    return `${Math.round((part / total) * 100)}%`;
  }

  private _renderFilters() {
    const presets: Array<{ key: StatsRangePreset; label: string }> = [
      { key: 'today', label: msg('今天') },
      { key: 'last7', label: msg('近 7 天') },
      { key: 'month', label: msg('本月') },
      { key: 'custom', label: msg('自定义') },
    ];
    const modes: Array<{ key: ModeFilter; label: string }> = [
      { key: 'all', label: msg('全部') },
      { key: 'listening', label: msg('听力') },
      { key: 'shadowing', label: msg('跟读') },
      { key: 'echo', label: msg('回声') },
    ];

    return html`
      <div class="filters">
        <div class="seg" role="group" aria-label=${msg('日期区间')}>
          ${presets.map(
            (p) => html`
              <button
                type="button"
                class=${classMap({ 'seg-btn': true, active: this._preset === p.key })}
                @click=${() => this._setPreset(p.key)}
              >
                ${p.label}
              </button>
            `,
          )}
        </div>
        <div class="seg" role="group" aria-label=${msg('练习模式')}>
          ${modes.map(
            (m) => html`
              <button
                type="button"
                class=${classMap({ 'seg-btn': true, active: this._mode === m.key })}
                @click=${() => this._setMode(m.key)}
              >
                ${m.label}
              </button>
            `,
          )}
        </div>
        ${this._preset === 'custom'
          ? html`
              <div class="custom-range">
                <label>
                  ${msg('起')}
                  <ui-input
                    type="date"
                    .value=${this._customFrom}
                    @change=${this._onCustomFrom}
                  ></ui-input>
                </label>
                <label>
                  ${msg('止')}
                  <ui-input
                    type="date"
                    .value=${this._customTo}
                    @change=${this._onCustomTo}
                  ></ui-input>
                </label>
              </div>
            `
          : nothing}
        <p class="hint">${msg('统计为有效练习时长（播放/录音等实际练习时间），非墙钟时间。')}</p>
      </div>
    `;
  }

  private _renderSummary(summary: PracticeStatsSummary) {
    return html`
      <section class="card">
        <div class="summary">
          <div class="stat">
            <div class="stat-value">${formatActiveDuration(summary.totalMs)}</div>
            <div class="stat-label">${msg('总时长')}</div>
          </div>
          <div class="stat">
            <div class="stat-value">${summary.activeDayCount}</div>
            <div class="stat-label">${msg('有练习日')}</div>
          </div>
          <div class="stat">
            <div class="stat-value">${summary.sessionCount}</div>
            <div class="stat-label">${msg('会话数')}</div>
          </div>
        </div>
      </section>
    `;
  }

  private _renderTrend(summary: PracticeStatsSummary) {
    const max = Math.max(...summary.buckets.map((b) => b.totalMs), 1);
    const title =
      summary.granularity === 'day'
        ? msg('练习趋势（按日）')
        : summary.granularity === 'week'
          ? msg('练习趋势（按周）')
          : msg('练习趋势（按月）');

    return html`
      <section class="card">
        <h2>${title}</h2>
        ${summary.totalMs === 0
          ? html`<p class="empty">${msg('该区间暂无练习数据。')}</p>`
          : html`
              <div class="bars" role="img" aria-label=${title}>
                ${summary.buckets.map((b) => {
                  const widthPct = b.totalMs > 0 ? Math.max((b.totalMs / max) * 100, 4) : 0;
                  return html`
                    <div class="bar-row">
                      <span>${b.label}</span>
                      <div class="bar-track">
                        <div class="bar-fill" style="width:${widthPct}%">
                          ${b.byMode.listening > 0
                            ? html`<span
                                class="seg-listening"
                                style="flex:${b.byMode.listening}"
                                title=${this._modeLabel('listening')}
                              ></span>`
                            : nothing}
                          ${b.byMode.shadowing > 0
                            ? html`<span
                                class="seg-shadowing"
                                style="flex:${b.byMode.shadowing}"
                                title=${this._modeLabel('shadowing')}
                              ></span>`
                            : nothing}
                          ${b.byMode.echo > 0
                            ? html`<span
                                class="seg-echo"
                                style="flex:${b.byMode.echo}"
                                title=${this._modeLabel('echo')}
                              ></span>`
                            : nothing}
                        </div>
                      </div>
                      <span class="bar-value">${formatActiveDuration(b.totalMs)}</span>
                    </div>
                  `;
                })}
              </div>
            `}
      </section>
    `;
  }

  private _renderBreakdown(summary: PracticeStatsSummary) {
    const { listening, shadowing, echo } = summary.byMode;
    const total = summary.totalMs;

    return html`
      <section class="card">
        <h2>${msg('模式构成')}</h2>
        ${total === 0
          ? html`<p class="empty">${msg('该区间暂无练习数据。')}</p>`
          : html`
              <div class="breakdown">
                <div class="stack-bar" role="img" aria-label=${msg('模式构成')}>
                  ${listening > 0
                    ? html`<span class="seg-listening" style="flex:${listening}"></span>`
                    : nothing}
                  ${shadowing > 0
                    ? html`<span class="seg-shadowing" style="flex:${shadowing}"></span>`
                    : nothing}
                  ${echo > 0 ? html`<span class="seg-echo" style="flex:${echo}"></span>` : nothing}
                </div>
                <div class="legend">
                  <span class="legend-item">
                    <span class="dot listening"></span>${msg('听力')}
                    <span class="legend-value"
                      >${formatActiveDuration(listening)} · ${this._pct(listening, total)}</span
                    >
                  </span>
                  <span class="legend-item">
                    <span class="dot shadowing"></span>${msg('跟读')}
                    <span class="legend-value"
                      >${formatActiveDuration(shadowing)} · ${this._pct(shadowing, total)}</span
                    >
                  </span>
                  <span class="legend-item">
                    <span class="dot echo"></span>${msg('回声')}
                    <span class="legend-value"
                      >${formatActiveDuration(echo)} · ${this._pct(echo, total)}</span
                    >
                  </span>
                </div>
              </div>
            `}
      </section>
    `;
  }

  private _renderRanking(summary: PracticeStatsSummary) {
    const top = summary.mediaRanking[0]?.totalMs || 1;
    return html`
      <section class="card">
        <h2>${msg('练习最多的材料')}</h2>
        ${summary.mediaRanking.length === 0
          ? html`<p class="empty">${msg('该区间暂无练习数据。')}</p>`
          : html`
              <ol class="ranking">
                ${summary.mediaRanking.map(
                  (item) => html`
                    <li class="rank-item">
                      <button
                        type="button"
                        class="rank-title"
                        @click=${() => this.navigate(`/practice/${item.mediaId}`)}
                      >
                        ${item.mediaTitle}
                      </button>
                      <span class="rank-ms">${formatActiveDuration(item.totalMs)}</span>
                      <div class="rank-track">
                        <div
                          class="rank-fill"
                          style="width:${Math.max((item.totalMs / top) * 100, 2)}%"
                        ></div>
                      </div>
                    </li>
                  `,
                )}
              </ol>
            `}
      </section>
    `;
  }

  render() {
    if (this._loading && !this._summary) {
      return html`<div class="loading-wrap">${msg('加载中…')}</div>`;
    }

    const summary = this._summary!;
    return html`
      <div class="page">
        ${this._renderFilters()} ${this._renderSummary(summary)} ${this._renderTrend(summary)}
        ${this._renderBreakdown(summary)} ${this._renderRanking(summary)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'practice-stats-page': PracticeStatsPage;
  }
}
