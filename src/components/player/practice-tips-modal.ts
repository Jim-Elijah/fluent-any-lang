import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { shouldSkipDiscriminationTips } from '../../lib/app-settings.js';
import { shouldSkipEchoTips, shouldSkipShadowingTips } from '../../lib/user-settings.js';
import { practiceViewStyles } from './practice-view-styles.js';
import { getTipsForKind, getTipsTitle, type PracticeTipsKind } from './practice-tips.js';
import '../ui/button.js';
import '../ui/modal.js';

export type PracticeTipsConfirmDetail = {
  kind: PracticeTipsKind;
  skipFuture: boolean;
};

@customElement('practice-tips-modal')
@localized()
export class PracticeTipsModal extends LitElement {
  static styles = [
    practiceViewStyles,
    css`
      :host {
        display: contents;
      }
    `,
  ];

  /** When set, the tips modal is open for this practice mode. */
  @property({ attribute: false })
  kind: PracticeTipsKind | null = null;

  @state()
  private _skipChecked = false;

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('kind') && this.kind) {
      this._skipChecked = false;
    }
  }

  private _shouldSkipTips(kind: PracticeTipsKind): boolean {
    if (kind === 'shadowing') return shouldSkipShadowingTips();
    if (kind === 'echo') return shouldSkipEchoTips();
    return shouldSkipDiscriminationTips();
  }

  private _close(): void {
    this.dispatchEvent(
      new CustomEvent('close', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _confirm = (): void => {
    if (!this.kind) return;
    this.dispatchEvent(
      new CustomEvent<PracticeTipsConfirmDetail>('confirm', {
        detail: { kind: this.kind, skipFuture: this._skipChecked },
        bubbles: true,
        composed: true,
      }),
    );
  };

  render() {
    if (!this.kind) {
      return nothing;
    }

    const kind = this.kind;
    const tips = getTipsForKind(kind);
    const title = getTipsTitle(kind);
    const shouldSkipTips = this._shouldSkipTips(kind);

    return html`
      <ui-modal
        .open=${true}
        .title=${title}
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
        <div class="tips-modal-body">${tips.map((tip) => html`<div>${tip}</div>`)}</div>
        <div slot="footer" class="tips-modal-footer">
          ${!shouldSkipTips
            ? html` <label class="tips-skip">
                <input
                  type="checkbox"
                  .checked=${this._skipChecked}
                  @change=${(event: Event) => {
                    this._skipChecked = (event.target as HTMLInputElement).checked;
                  }}
                />
                ${msg('以后不再提醒')}
              </label>`
            : nothing}
          <ui-button style="margin-left: auto;" variant="primary" @click=${this._confirm}
            >${msg('知道了')}</ui-button
          >
        </div>
      </ui-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'practice-tips-modal': PracticeTipsModal;
  }
}
