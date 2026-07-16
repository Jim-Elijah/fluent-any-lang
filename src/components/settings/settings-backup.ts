import { css, html, LitElement, nothing } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { msg, str, localized } from '@lit/localize';

import {
  DEFAULT_BACKUP_EXPORT_OPTIONS,
  exportBackup,
  importBackup,
  previewBackup,
  type BackupExportOptions,
  type BackupImportResult,
  type BackupPreview,
} from '../../lib/backup/index.js';
import { reportError } from '../../lib/error-reporter.js';
import { settingsCardStyles } from './settings-styles.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/message.js';
import { Message } from '../ui/message.js';
import '../ui/modal.js';

@customElement('settings-backup')
@localized()
export class SettingsBackup extends LitElement {
  static styles = [
    settingsCardStyles,
    css`
      .block {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
      }

      .block + .block {
        padding-top: var(--space-sm);
        border-top: 1px solid var(--color-border, #f0f0f0);
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

      label.check input {
        margin-top: 3px;
        accent-color: var(--color-primary, #1677ff);
      }

      .check-help {
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.45));
        font-size: 0.8125rem;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-sm);
        align-items: center;
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

      .result-lines {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .hidden-input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        overflow: hidden;
      }
    `,
  ];

  @state()
  private _exportOptions: BackupExportOptions = { ...DEFAULT_BACKUP_EXPORT_OPTIONS };

  @state()
  private _busy = false;

  @state()
  private _preview: BackupPreview | null = null;

  @state()
  private _pendingFile: File | null = null;

  @state()
  private _lastResult: BackupImportResult | null = null;

  @query('#backup-file-input')
  private _fileInput?: HTMLInputElement;

  private get _importModalOpen() {
    return this._preview != null && this._pendingFile != null;
  }

  private _setExportFlag(key: keyof BackupExportOptions, checked: boolean) {
    this._exportOptions = { ...this._exportOptions, [key]: checked };
  }

  private async _onExport() {
    if (this._busy) return;
    const { includeMedia, includeRecordings, includeSessions } = this._exportOptions;
    if (!includeMedia && !includeRecordings && !includeSessions) {
      Message.warning(msg('请至少选择一种数据导出'));
      return;
    }
    this._busy = true;
    try {
      const manifest = await exportBackup(this._exportOptions);
      Message.success(
        msg(
          str`已导出备份（录音 ${manifest.counts.recordings}，学习记录 ${manifest.counts.sessions}，媒体 ${manifest.counts.media}）`,
        ),
      );
    } catch (error) {
      void reportError(error, { where: 'settings-backup.export' });
      Message.error(error instanceof Error ? error.message : msg('导出失败'));
    } finally {
      this._busy = false;
    }
  }

  private _openFilePicker() {
    this._fileInput?.click();
  }

  private async _onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this._busy = true;
    this._lastResult = null;
    try {
      this._preview = await previewBackup(file);
      this._pendingFile = file;
    } catch (error) {
      this._preview = null;
      this._pendingFile = null;
      void reportError(error, { where: 'settings-backup.preview' });
      Message.error(error instanceof Error ? error.message : msg('无法读取备份'));
    } finally {
      this._busy = false;
    }
  }

  private _cancelImport() {
    this._preview = null;
    this._pendingFile = null;
  }

  private _onImportModalOpenChange(event: CustomEvent<{ open: boolean }>) {
    if (event.target !== event.currentTarget) return;
    if (!event.detail.open) {
      this._cancelImport();
    }
  }

  private async _onImportBeforeOk(event: CustomEvent) {
    event.preventDefault();
    if (!this._pendingFile || this._busy) return;
    this._busy = true;
    try {
      const result = await importBackup(this._pendingFile);
      this._lastResult = result;
      this._preview = null;
      this._pendingFile = null;
      if (result.errors.length > 0) {
        Message.warning(msg('导入完成，但有部分条目失败'));
      } else {
        Message.success(msg('导入完成'));
      }
    } catch (error) {
      void reportError(error, { where: 'settings-backup.import' });
      Message.error(error instanceof Error ? error.message : msg('导入失败'));
    } finally {
      this._busy = false;
    }
  }

  private _renderPreviewBody(preview: BackupPreview) {
    const { manifest, settings } = preview;
    return html`
      <ul class="preview-list">
        <li>${msg('应用设置')}：${settings ? msg('将覆盖本地设置') : msg('无')}</li>
        <li>
          ${msg('媒体')}：${manifest.counts.media}${manifest.flags.includeMedia
            ? ''
            : msg('（包内无媒体）')}
        </li>
        <li>${msg('字幕')}：${manifest.counts.subtitles}</li>
        <li>${msg('录音')}：${manifest.counts.recordings}</li>
        <li>${msg('学习记录')}：${manifest.counts.sessions}</li>
      </ul>
      <p class="hint" style="margin-top: var(--space-sm)">
        ${msg('当前库已有同名条目时将跳过，不会覆盖；设置将被覆盖。')}
      </p>
    `;
  }

  private _renderResult(result: BackupImportResult) {
    return html`
      <ui-alert type=${result.errors.length ? 'warning' : 'success'} closable>
        <div slot="title">${msg('导入结果')}</div>
        <div class="result-lines">
          <div>${msg('设置')}：${result.settingsApplied ? msg('已覆盖') : msg('未变更')}</div>
          <div>${msg(str`媒体：导入 ${result.mediaImported}，跳过 ${result.mediaSkipped}`)}</div>
          <div>
            ${msg(str`录音：导入 ${result.recordingsImported}，跳过 ${result.recordingsSkipped}`)}
          </div>
          <div>
            ${msg(str`学习记录：导入 ${result.sessionsImported}，跳过 ${result.sessionsSkipped}`)}
          </div>
          ${result.errors.length
            ? html`<div>${msg(str`错误 ${result.errors.length} 条：${result.errors[0]}`)}</div>`
            : nothing}
        </div>
      </ui-alert>
    `;
  }

  render() {
    const opts = this._exportOptions;
    return html`
      <section class="card" aria-labelledby="backup-heading">
        <h2 id="backup-heading">${msg('数据备份与迁移')}</h2>
        <p class="desc">${msg('导出备份可用于换设备迁移。设置始终包含在备份中。')}</p>
        <p class="hint">
          ${msg('媒体文件若未纳入备份，请在库页用相同文件名重新导入原音视频与字幕，录音即可对齐。')}
        </p>

        <div class="block">
          <h3>${msg('导出')}</h3>
          <div class="checks">
            <label class="check">
              <input
                type="checkbox"
                .checked=${opts.includeMedia}
                @change=${(e: Event) =>
                  this._setExportFlag('includeMedia', (e.target as HTMLInputElement).checked)}
              />
              <span>
                ${msg('媒体与字幕')}
                <span class="check-help">（${msg('默认关闭；体积可能很大')}）</span>
              </span>
            </label>
            <label class="check">
              <input
                type="checkbox"
                .checked=${opts.includeRecordings}
                @change=${(e: Event) =>
                  this._setExportFlag('includeRecordings', (e.target as HTMLInputElement).checked)}
              />
              <span>${msg('录音')}</span>
            </label>
            <label class="check">
              <input
                type="checkbox"
                .checked=${opts.includeSessions}
                @change=${(e: Event) =>
                  this._setExportFlag('includeSessions', (e.target as HTMLInputElement).checked)}
              />
              <span>${msg('学习记录')}</span>
            </label>
          </div>
          <div class="actions">
            <ui-button variant="primary" ?disabled=${this._busy} @click=${this._onExport}>
              ${msg('导出备份')}
            </ui-button>
            ${this._busy && !this._importModalOpen
              ? html`<span class="hint">${msg('处理中…')}</span>`
              : nothing}
          </div>
        </div>

        <div class="block">
          <h3>${msg('导入')}</h3>
          <div class="actions">
            <ui-button variant="secondary" ?disabled=${this._busy} @click=${this._openFilePicker}>
              ${msg('选择备份文件')}
            </ui-button>
          </div>
          <input
            id="backup-file-input"
            class="hidden-input"
            type="file"
            accept=".zip,application/zip"
            @change=${this._onFileSelected}
          />
          ${this._lastResult ? this._renderResult(this._lastResult) : nothing}
        </div>
      </section>

      <ui-modal
        .open=${this._importModalOpen}
        .title=${msg('即将导入')}
        .centered=${true}
        .confirmLoading=${this._busy}
        .maskClosable=${!this._busy}
        .keyboard=${!this._busy}
        ?cancel-disabled=${this._busy}
        ok-text=${msg('确认导入')}
        cancel-text=${msg('取消')}
        @beforeOk=${this._onImportBeforeOk}
        @update:open=${this._onImportModalOpenChange}
      >
        ${this._preview ? this._renderPreviewBody(this._preview) : nothing}
      </ui-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-backup': SettingsBackup;
  }
}
