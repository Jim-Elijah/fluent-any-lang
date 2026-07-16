import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { buildOverwriteOptions, importContentFiles } from '../../lib/import-content.js';
import { reportError } from '../../lib/error-reporter.js';
import type {
  ImportConflict,
  ImportError,
  ImportOptions,
  ImportResult,
  MediaItem,
  SubtitleTrack,
} from '../../types/models.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/icon.js';
import '../ui/modal.js';
import { Message } from '../ui/message.js';

/** Default accept: audio + subtitles; include video when ready for video import. */
export const DEFAULT_IMPORT_ACCEPT = 'audio/*,video/*,.srt,.lrc';

@customElement('content-importer')
@localized()
export class ContentImporter extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .dropzone {
      position: relative;
      padding: var(--space-lg) var(--space-inline);
      text-align: center;
      background: var(--color-surface, #fff);
      border: 2px dashed var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      transition:
        border-color 0.15s ease,
        background-color 0.15s ease;
    }

    .dropzone.dragover {
      border-color: var(--color-primary, #1677ff);
      background: rgba(22, 119, 255, 0.04);
    }

    .dropzone.busy {
      opacity: 0.7;
      pointer-events: none;
    }

    .title {
      margin: 0 0 var(--space-sm);
      font-size: 1rem;
      font-weight: 600;
    }

    .hint {
      margin: 0 0 var(--space-inline);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.875rem;
    }

    .actions {
      display: flex;
      justify-content: center;
      gap: var(--space-block);
      flex-wrap: wrap;
    }

    input[type='file'] {
      display: none;
    }

    .messages {
      display: grid;
      gap: var(--space-block);
      margin-top: var(--space-inline);
    }

    .conflict-list {
      display: grid;
      gap: var(--space-block);
      max-height: min(50vh, 360px);
      overflow: auto;
    }

    .conflict-item {
      padding: var(--space-block);
      border: 1px solid var(--color-border, #f0f0f0);
      border-radius: var(--radius-md, 8px);
      text-align: left;
    }

    .conflict-name {
      margin: 0 0 var(--space-xs);
      font-weight: 600;
      font-size: 0.875rem;
    }

    .conflict-msg {
      margin: 0 0 var(--space-sm);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.8125rem;
      line-height: 1.5;
    }

    .conflict-choices {
      display: flex;
      gap: var(--space-inline);
      flex-wrap: wrap;
    }

    .conflict-choices label {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      font-size: 0.8125rem;
      cursor: pointer;
    }

    .bulk-actions {
      display: flex;
      gap: var(--space-sm);
      flex-wrap: wrap;
      margin-bottom: var(--space-block);
    }
  `;

  /** Native file input accept attribute (audio/video/subtitles). */
  @property({ type: String })
  accept = DEFAULT_IMPORT_ACCEPT;

  /** Whether the picker allows multiple files. */
  @property({ type: Boolean })
  multiple = true;

  @state()
  private _dragOver = false;

  @state()
  private _importing = false;

  @state()
  private _successMessage = '';

  @state()
  private _errors: ImportError[] = [];

  @state()
  private _conflictOpen = false;

  @state()
  private _pendingConflicts: ImportConflict[] = [];

  /** Parallel to _pendingConflicts: true = overwrite */
  @state()
  private _conflictOverwrite: boolean[] = [];

  private _pendingFiles: File[] = [];
  private _pendingOptions: ImportOptions = {};
  private _partialResult: ImportResult | null = null;

  render() {
    const errorMessages = this._errors.map((error) => `${error.filename}: ${error.message}`);
    return html`
      <div
        class="dropzone ${this._dragOver ? 'dragover' : ''} ${this._importing ? 'busy' : ''}"
        @dragenter="${this._handleDragEnter}"
        @dragover="${this._handleDragOver}"
        @dragleave="${this._handleDragLeave}"
        @drop="${this._handleDrop}"
      >
        <p class="title">${msg('导入练习内容')}</p>
        <p class="hint">${msg('拖拽或选择音视频（可同时放入同名 .srt/.lrc 字幕）')}</p>
        <div class="actions">
          <ui-button variant="primary" ?disabled="${this._importing}" @click="${this.openPicker}">
            <ui-icon name="upload" size="var(--icon-xl)"></ui-icon>
          </ui-button>
        </div>
        <input
          type="file"
          ?multiple="${this.multiple}"
          accept="${this.accept}"
          @change="${this._handleFileInput}"
        />
        ${this._successMessage || this._errors.length > 0
          ? html`
              <div class="messages">
                ${this._successMessage
                  ? html`<ui-alert type="success">${this._successMessage}</ui-alert>`
                  : null}
                ${this._errors.length > 0
                  ? html`
                      <ui-alert type="error">
                        <span slot="title">${msg('部分文件导入失败：')}</span>
                        ${errorMessages.map((error) => html`<p>${error}</p>`)}
                      </ui-alert>
                    `
                  : null}
              </div>
            `
          : null}
      </div>

      <ui-modal
        title="${msg('处理导入冲突')}"
        ?open=${this._conflictOpen}
        width="560px"
        centered
        ok-text="${msg('确认')}"
        cancel-text="${msg('全部跳过')}"
        ?mask-closable=${false}
        ?confirm-loading=${this._importing}
        @ok=${this._handleConflictConfirm}
        @cancel=${this._handleConflictSkipAll}
      >
        <p class="hint" style="margin-top:0;text-align:left">
          ${msg('以下文件与已有内容冲突，请选择跳过或覆盖。')}
        </p>
        <div class="bulk-actions">
          <ui-button variant="secondary" @click=${() => this._setAllOverwrite(false)}>
            ${msg('全部跳过')}
          </ui-button>
          <ui-button variant="secondary" @click=${() => this._setAllOverwrite(true)}>
            ${msg('全部覆盖')}
          </ui-button>
        </div>
        <div class="conflict-list">
          ${this._pendingConflicts.map(
            (conflict, index) => html`
              <div class="conflict-item">
                <p class="conflict-name">${conflict.filename}</p>
                <p class="conflict-msg">${conflict.message}</p>
                <div class="conflict-choices">
                  <label>
                    <input
                      type="radio"
                      name="conflict-${index}"
                      .checked=${!this._conflictOverwrite[index]}
                      @change=${() => this._setOverwrite(index, false)}
                    />
                    ${msg('跳过')}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="conflict-${index}"
                      .checked=${!!this._conflictOverwrite[index]}
                      @change=${() => this._setOverwrite(index, true)}
                    />
                    ${msg('覆盖')}
                  </label>
                </div>
              </div>
            `,
          )}
        </div>
      </ui-modal>
    `;
  }

  /** Open the native file picker (usable from toolbar icons / parent hosts). */
  openPicker(): void {
    const input = this.renderRoot.querySelector('input[type="file"]') as HTMLInputElement | null;
    input?.click();
  }

  private _handleDragEnter(event: DragEvent): void {
    event.preventDefault();
    this._dragOver = true;
  }

  private _handleDragOver(event: DragEvent): void {
    event.preventDefault();
    this._dragOver = true;
  }

  private _handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    this._dragOver = false;
  }

  private _handleDrop(event: DragEvent): void {
    event.preventDefault();
    this._dragOver = false;
    const files = [...(event.dataTransfer?.files ?? [])];
    void this._importFiles(files);
  }

  private _handleFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    void this._importFiles(files);
  }

  private async _importFiles(files: File[], options: ImportOptions = {}): Promise<void> {
    if (files.length === 0) {
      return;
    }

    this._importing = true;
    this._successMessage = '';
    this._errors = [];

    try {
      const result = await importContentFiles(files, options);

      if (result.conflicts.length > 0) {
        this._pendingFiles = files;
        this._pendingOptions = options;
        this._partialResult = result;
        this._pendingConflicts = result.conflicts;
        this._conflictOverwrite = result.conflicts.map(() => false);
        this._conflictOpen = true;
        return;
      }

      this._reportResult(result);
    } catch (error) {
      void reportError(error, { where: 'content-importer.import' });
      Message.error({ message: msg('导入过程中发生未知错误') });
    } finally {
      this._importing = false;
    }
  }

  private _setOverwrite(index: number, overwrite: boolean): void {
    const next = [...this._conflictOverwrite];
    next[index] = overwrite;
    this._conflictOverwrite = next;
  }

  private _setAllOverwrite(overwrite: boolean): void {
    this._conflictOverwrite = this._pendingConflicts.map(() => overwrite);
  }

  private _clearConflictState(): void {
    this._conflictOpen = false;
    this._pendingConflicts = [];
    this._conflictOverwrite = [];
    this._pendingFiles = [];
    this._pendingOptions = {};
    this._partialResult = null;
  }

  private _handleConflictSkipAll(): void {
    if (!this._conflictOpen) {
      return;
    }
    const partial = this._partialResult;
    this._clearConflictState();
    if (partial) {
      this._reportResult({
        ...partial,
        conflicts: [],
      });
    }
  }

  private async _handleConflictConfirm(): Promise<void> {
    // ui-modal 的 ok 可能连续触发两次；先占住状态避免重复提交
    if (!this._conflictOpen || this._importing || !this._partialResult) {
      return;
    }

    const decisions = this._pendingConflicts.map((conflict, index) => ({
      conflict,
      overwrite: this._conflictOverwrite[index] ?? false,
    }));
    const overwrite = buildOverwriteOptions(decisions);
    const files = this._pendingFiles;
    const options = this._pendingOptions;
    const partial = this._partialResult;

    this._conflictOpen = false;
    this._pendingConflicts = [];
    this._conflictOverwrite = [];
    this._pendingFiles = [];
    this._pendingOptions = {};
    this._partialResult = null;

    if (!overwrite) {
      this._reportResult({
        ...partial,
        conflicts: [],
      });
      return;
    }

    this._importing = true;
    try {
      const second = await importContentFiles(files, {
        ...options,
        ...overwrite,
      });
      this._reportResult({
        imported: [...partial.imported, ...second.imported],
        skipped: [...partial.skipped, ...second.skipped],
        errors: [...partial.errors, ...second.errors],
        conflicts: second.conflicts,
      });
    } catch (error) {
      void reportError(error, { where: 'content-importer.resolveConflicts' });
      Message.error({ message: msg('导入过程中发生未知错误') });
    } finally {
      this._importing = false;
    }
  }

  private _reportResult(result: ImportResult): void {
    this._errors = result.errors;

    if (result.skipped.length > 0) {
      Message.info({
        message: msg(str`已跳过 ${result.skipped.length} 个重复文件`),
      });
    }

    if (result.imported.length > 0) {
      Message.success({ message: msg(str`${result.imported.length} 个内容已导入`) });
      this._dispatchImported(result.imported);
    }

    if (result.conflicts.length > 0 && result.imported.length === 0 && result.errors.length === 0) {
      Message.info({ message: msg('已跳过冲突文件') });
    }

    this._errors.forEach((error) => {
      Message.error({ message: `${error.filename}: ${error.message}` });
    });
  }

  private _dispatchImported(items: Array<MediaItem | SubtitleTrack>): void {
    this.dispatchEvent(
      new CustomEvent('content-imported', {
        detail: { items },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'content-importer': ContentImporter;
  }
}
