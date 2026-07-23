import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { getHotkeyCatalog } from '../../lib/hotkeys/index.js';
import { practiceViewStyles } from './practice-view-styles.js';
import '../ui/button.js';
import '../ui/modal.js';

@customElement('practice-hotkeys-help')
@localized()
export class PracticeHotkeysHelp extends LitElement {
  static styles = [
    practiceViewStyles,
    css`
      :host {
        display: contents;
      }
    `,
  ];

  @property({ type: Boolean })
  open = false;

  private _close(): void {
    this.dispatchEvent(
      new CustomEvent('close', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    if (!this.open) {
      return nothing;
    }

    const catalog = getHotkeyCatalog(['practice', 'recording-preview']);

    return html`
      <ui-modal
        .open=${true}
        .title=${msg('快捷键')}
        .centered=${true}
        .footer=${false}
        ok-text="${msg('知道了')}"
        @update:open=${(e: CustomEvent<{ open: boolean }>) => {
          if (e.target !== e.currentTarget) {
            return;
          }
          if (!e.detail.open) {
            this._close();
          }
        }}
      >
        <div class="hotkeys-help-body">
          <ul class="hotkeys-help-list">
            ${catalog.map(
              (row) => html`
                <li class="hotkeys-help-row">
                  <span class="hotkeys-help-label">
                    <span>${row.actionLabel}</span>
                    ${row.scopeNote
                      ? html`<span class="hotkeys-help-scope">（${row.scopeNote}）</span>`
                      : nothing}
                  </span>
                  <kbd class="hotkeys-help-code">${row.codeLabel}</kbd>
                </li>
              `,
            )}
          </ul>
          <p class="hotkeys-help-note">${msg('暂不支持自定义快捷键。')}</p>
        </div>
        <div slot="footer" class="tips-modal-footer">
          <span></span>
          <ui-button variant="primary" @click=${() => this._close()}>${msg('知道了')}</ui-button>
        </div>
      </ui-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'practice-hotkeys-help': PracticeHotkeysHelp;
  }
}
