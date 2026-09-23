import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { WordMarkerLayout } from '../../types/models.js';
import { Z_INDEX } from '../ui/internal/z-index.js';
import '../ui/button.js';
import '../ui/tooltip.js';

export type WordMarkerLayoutToggleDetail = { layout: WordMarkerLayout };

@customElement('word-marker-layout-toggle')
@localized()
export class WordMarkerLayoutToggle extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-sm, 8px);
    }

    .compact {
      display: inline-flex;
      gap: 2px;
    }

    .label {
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      white-space: nowrap;
    }
  `;

  @property({ type: String })
  layout: WordMarkerLayout = 'duration';

  /** When false, renders nothing (parent controls visibility). */
  @property({ type: Boolean })
  visible = true;

  @property({ type: Boolean })
  showLabel = true;

  /** `row` shows optional section label; `compact` is inline button pair only. */
  @property({ type: String })
  density: 'row' | 'compact' = 'row';

  @property({ type: Boolean })
  disabled = false;

  private _emitLayout(layout: WordMarkerLayout): void {
    if (layout === this.layout || this.disabled) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<WordMarkerLayoutToggleDetail>('layout-change', {
        detail: { layout },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    if (!this.visible) {
      return nothing;
    }

    const buttons = html`
      <ui-tooltip title=${msg('标签宽度跟随发音时长')} .zIndex=${Z_INDEX.MODAL + 1}>
        <ui-button
          size="small"
          variant=${this.layout === 'duration' ? 'primary' : 'secondary'}
          ?disabled=${this.disabled}
          @click=${() => this._emitLayout('duration')}
        >
          ${msg('时长')}
        </ui-button>
      </ui-tooltip>
      <ui-tooltip title=${msg('标签紧凑排列')} .zIndex=${Z_INDEX.MODAL + 1}>
        <ui-button
          size="small"
          variant=${this.layout === 'compact' ? 'primary' : 'secondary'}
          ?disabled=${this.disabled}
          @click=${() => this._emitLayout('compact')}
        >
          ${msg('紧凑')}
        </ui-button>
      </ui-tooltip>
    `;

    if (this.density === 'compact') {
      return html`<div class="compact" role="group" aria-label=${msg('波形词条')}>${buttons}</div>`;
    }

    return html`
      <div class="row" role="group" aria-label=${msg('波形词条')}>
        ${this.showLabel ? html`<span class="label">${msg('波形词条')}</span>` : nothing}
        ${buttons}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'word-marker-layout-toggle': WordMarkerLayoutToggle;
  }
}
