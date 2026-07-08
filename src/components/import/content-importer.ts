import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { importContentFiles } from '../../lib/import-content.js';
import type { ImportError, MediaItem, SubtitleTrack } from '../../types/models.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/icon.js';
import { Message } from '../ui/message.js';

@customElement('content-importer')
@localized()
export class ContentImporter extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .dropzone {
      position: relative;
      padding: 32px 24px;
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
      margin: 0 0 8px;
      font-size: 1rem;
      font-weight: 600;
    }

    .hint {
      margin: 0 0 16px;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.875rem;
    }

    .actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    input[type='file'] {
      display: none;
    }

    .messages {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }
  `;

  @state()
  private _dragOver = false;

  @state()
  private _importing = false;

  @state()
  private _successMessage = '';

  @state()
  private _errors: ImportError[] = [];

  render() {
    const errorMessages = this._errors.map((error) => `${error.filename}: ${error.message}`);
    console.log('errorMessages', errorMessages);
    return html`
      <div
        class="dropzone ${this._dragOver ? 'dragover' : ''} ${this._importing ? 'busy' : ''}"
        @dragenter="${this._handleDragEnter}"
        @dragover="${this._handleDragOver}"
        @dragleave="${this._handleDragLeave}"
        @drop="${this._handleDrop}"
      >
        <p class="title">${msg('导入练习内容')}</p>
        <p class="hint">${msg('拖拽或选择音频与字幕（字幕支持.srt与.lrc）')}</p>
        <div class="actions">
          <ui-button variant="primary" ?disabled="${this._importing}" @click="${this._openPicker}">
            <ui-icon name="upload" size="20px" title="${msg('选择文件')}"></ui-icon>
          </ui-button>
        </div>
        <!-- @TODO 支持 video/* -->
        <input type="file" multiple accept="audio/*,.srt,.lrc" @change="${this._handleFileInput}" />
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
    `;
  }

  private _openPicker(): void {
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

  private async _importFiles(files: File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    this._importing = true;
    this._successMessage = '';
    this._errors = [];

    try {
      const result = await importContentFiles(files);
      console.log('importContentFiles', result);
      this._errors = result.errors;

      if (result.imported.length > 0) {
        // this._successMessage = msg(str`${result.imported.length} 个内容已导入`);
        Message.success({ message: msg(str`${result.imported.length} 个内容已导入`) });
        this._dispatchImported(result.imported);
      }
      if (this._errors.length > 0) {
        this._errors.forEach((error) => {
          Message.error({ message: `${error.filename}: ${error.message}` });
        });
      }
    } catch {
      // this._errors = [{ filename: msg('导入'), message: msg('导入过程中发生未知错误') }];
      Message.error({ message: '导入过程中发生未知错误' });
    } finally {
      this._importing = false;
    }
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
