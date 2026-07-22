import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, str, localized } from '@lit/localize';

import {
  clearAllLearningData,
  getLocalDataCounts,
  isLocalDataEmpty,
  type LocalDataCounts,
} from '../../lib/clear-local-data.js';
import { reportError } from '../../lib/error-reporter.js';
import { settingsCardStyles } from './settings-styles.js';
import '../ui/button.js';
import '../ui/message.js';
import { Message } from '../ui/message.js';
import '../ui/modal.js';

@customElement('settings-clear-data')
@localized()
export class SettingsClearData extends LitElement {
  static styles = [
    settingsCardStyles,
    css`
      .card.danger {
        border-color: rgba(255, 77, 79, 0.6);
      }

      .checks {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
      }

      label.check {
        display: flex;
        align-items: flex-start;
        gap: var(--space-sm);
        font-size: 0.9375rem;
        cursor: pointer;
        color: var(--color-text, rgba(0, 0, 0, 0.88));
      }

      .preview-list {
        margin: 0;
        padding-left: 1.25rem;
        font-size: 0.875rem;
        color: var(--color-text, rgba(0, 0, 0, 0.88));
      }

      .preview-list li + li {
        margin-top: 0.25rem;
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
  private _counts: LocalDataCounts | null = null;

  @state()
  private _busy = false;

  @state()
  private _modalOpen = false;

  @state()
  private _acknowledged = false;

  connectedCallback(): void {
    super.connectedCallback();
    void this._refreshCounts();
  }

  private async _refreshCounts(): Promise<void> {
    try {
      this._counts = await getLocalDataCounts();
    } catch (error) {
      void reportError(error, { where: 'settings-clear-data.counts' });
      this._counts = null;
    }
  }

  private get _isEmpty(): boolean {
    return this._counts != null && isLocalDataEmpty(this._counts);
  }

  private _openModal(): void {
    if (this._busy || this._isEmpty) return;
    this._acknowledged = false;
    this._modalOpen = true;
  }

  private _closeModal(): void {
    if (this._busy) return;
    this._modalOpen = false;
    this._acknowledged = false;
  }

  private _onModalOpenChange(event: CustomEvent<{ open: boolean }>): void {
    if (event.target !== event.currentTarget) return;
    if (!event.detail.open) {
      this._closeModal();
    }
  }

  private async _onClearBeforeOk(event: CustomEvent): Promise<void> {
    event.preventDefault();
    if (this._busy || !this._acknowledged) return;

    this._busy = true;
    try {
      await clearAllLearningData();
      this._modalOpen = false;
      this._acknowledged = false;
      Message.success(msg('学习数据已清除'));
      window.location.assign('/');
    } catch (error) {
      void reportError(error, { where: 'settings-clear-data.clear' });
      Message.error(error instanceof Error ? error.message : msg('清除失败'));
    } finally {
      this._busy = false;
    }
  }

  private _renderPreview(counts: LocalDataCounts) {
    return html`
      <ul class="preview-list">
        <li>${msg(str`媒体：${counts.media}`)}</li>
        <li>${msg(str`字幕：${counts.subtitles}`)}</li>
        <li>${msg(str`录音：${counts.recordings}`)}</li>
        <li>${msg(str`学习记录：${counts.sessions}`)}</li>
        <li>${msg(str`播放列表：${counts.playlists}`)}</li>
        <li>${msg(str`句库：${counts.sentenceBank}`)}</li>
        <li>${msg(str`噪音素材：${counts.noise}`)}</li>
      </ul>
      <p class="hint" style="margin-top: var(--space-sm)">
        ${msg('应用设置、语言偏好与异常日志将保留。清除前建议先在上方导出备份。')}
      </p>
      <div class="checks" style="margin-top: var(--space-sm)">
        <label class="check">
          <input
            type="checkbox"
            .checked=${this._acknowledged}
            ?disabled=${this._busy}
            @change=${(e: Event) => {
              this._acknowledged = (e.target as HTMLInputElement).checked;
            }}
          />
          <span>${msg('我理解此操作不可恢复')}</span>
        </label>
      </div>
    `;
  }

  render() {
    return html`
      <section class="card danger" aria-labelledby="clear-data-heading">
        <h2 id="clear-data-heading">${msg('清除本地数据')}</h2>
        <p class="desc">${msg('永久删除本机学习库内容。此操作不可恢复，请先导出备份。')}</p>

        <div class="actions">
          <ui-button
            variant="danger"
            ?disabled=${this._busy || this._isEmpty || this._counts == null}
            @click=${this._openModal}
          >
            ${msg('清除全部学习数据')}
          </ui-button>
          ${this._busy ? html`<span class="hint">${msg('处理中…')}</span>` : nothing}
          ${this._isEmpty
            ? html`<span class="hint">${msg('当前没有可清除的学习数据')}</span>`
            : nothing}
        </div>
      </section>

      <ui-modal
        .open=${this._modalOpen}
        .title=${msg('即将清除学习数据')}
        .centered=${true}
        .confirmLoading=${this._busy}
        .maskClosable=${!this._busy}
        .keyboard=${!this._busy}
        ?ok-disabled=${!this._acknowledged}
        ?cancel-disabled=${this._busy}
        ok-text=${msg('确认清除')}
        cancel-text=${msg('取消')}
        @beforeOk=${this._onClearBeforeOk}
        @update:open=${this._onModalOpenChange}
      >
        ${this._counts ? this._renderPreview(this._counts) : nothing}
      </ui-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-clear-data': SettingsClearData;
  }
}
