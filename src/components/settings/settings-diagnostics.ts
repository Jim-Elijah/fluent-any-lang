import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, str, localized } from '@lit/localize';

import { clearErrorLogs, getErrorLogCount } from '../../db/error-log.js';
import { getAppBuildInfo } from '../../lib/app-build-info.js';
import { exportErrorLogs } from '../../lib/export-error-logs.js';
import { reportError } from '../../lib/error-reporter.js';
import { settingsCardStyles } from './settings-styles.js';
import '../ui/button.js';
import '../ui/message.js';
import { Message } from '../ui/message.js';

@customElement('settings-diagnostics')
@localized()
export class SettingsDiagnostics extends LitElement {
  static styles = [
    settingsCardStyles,
    css`
      .meta {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 0.875rem;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      }

      .meta code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.8125rem;
        color: var(--color-text, rgba(0, 0, 0, 0.88));
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-sm);
        align-items: center;
      }
    `,
  ];

  @state()
  private _logCount = 0;

  @state()
  private _busy = false;

  private readonly _build = getAppBuildInfo();

  connectedCallback(): void {
    super.connectedCallback();
    void this._refreshCount();
  }

  private async _refreshCount(): Promise<void> {
    try {
      this._logCount = await getErrorLogCount();
    } catch (error) {
      void reportError(error, { where: 'settings-diagnostics.count' });
      this._logCount = 0;
    }
  }

  private async _onExport(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      const payload = await exportErrorLogs();
      Message.success(msg(str`已导出 ${payload.entries.length} 条异常日志`));
      this._logCount = payload.entries.length;
    } catch (error) {
      void reportError(error, { where: 'settings-diagnostics.export' });
      Message.error(error instanceof Error ? error.message : msg('导出失败'));
    } finally {
      this._busy = false;
    }
  }

  private async _onClear(): Promise<void> {
    if (this._busy || this._logCount === 0) return;
    const confirmed = window.confirm(msg('确定清空全部异常日志？此操作不可恢复。'));
    if (!confirmed) return;

    this._busy = true;
    try {
      await clearErrorLogs();
      this._logCount = 0;
      Message.success(msg('异常日志已清空'));
    } catch (error) {
      void reportError(error, { where: 'settings-diagnostics.clear' });
      Message.error(error instanceof Error ? error.message : msg('清空失败'));
    } finally {
      this._busy = false;
    }
  }

  render() {
    return html`
      <section class="card" aria-labelledby="diagnostics-heading">
        <h2 id="diagnostics-heading">${msg('诊断与异常日志')}</h2>
        <p class="desc">
          ${msg('异常会保存在本机，可导出后发送给开发者以便排查问题。不会上传到服务器。')}
        </p>

        <ul class="meta">
          <li>${msg('应用版本')}：<code>${this._build.appVersion}</code></li>
          <li>${msg('Commit')}：<code>${this._build.commitHash}</code></li>
          ${this._build.buildTime
            ? html`<li>${msg('构建时间')}：<code>${this._build.buildTime}</code></li>`
            : nothing}
          <li>${msg('已记录异常')}：${this._logCount}</li>
        </ul>

        <div class="actions">
          <ui-button variant="primary" ?disabled=${this._busy} @click=${this._onExport}>
            ${msg('导出异常日志')}
          </ui-button>
          <ui-button
            variant="danger"
            ?disabled=${this._busy || this._logCount === 0}
            @click=${this._onClear}
          >
            ${msg('清空日志')}
          </ui-button>
          ${this._busy ? html`<span class="hint">${msg('处理中…')}</span>` : nothing}
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-diagnostics': SettingsDiagnostics;
  }
}
