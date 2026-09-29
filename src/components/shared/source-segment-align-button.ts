import { localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { Z_INDEX } from '../ui/internal/z-index.js';
import {
  sourceWordAlignButtonLabel,
  sourceWordAlignPopconfirmTitle,
  sourceWordAlignTooltip,
} from './source-word-align-labels.js';
import '../ui/button.js';
import '../ui/popconfirm.js';
import '../ui/tooltip.js';

export type SourceSegmentAlignDetail = { force: boolean };

@customElement('source-segment-align-button')
@localized()
export class SourceSegmentAlignButton extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
    }
  `;

  @property({ type: Boolean })
  hasCache = false;

  @property({ type: Boolean })
  disabled = false;

  @property({ type: String })
  tooltipPlacement = 'right';

  private _emit(force: boolean): void {
    if (this.disabled) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<SourceSegmentAlignDetail>('align-segment', {
        detail: { force },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    const label = sourceWordAlignButtonLabel('segment', this.hasCache);
    const tooltip = sourceWordAlignTooltip('segment', this.hasCache);

    if (this.hasCache) {
      return html`
        <ui-popconfirm
          .title=${sourceWordAlignPopconfirmTitle('segment')}
          .zIndex=${Z_INDEX.MODAL + 2}
          ?disabled=${this.disabled}
          placement=${this.tooltipPlacement}
          @confirm=${() => this._emit(true)}
        >
          <ui-button
            size="small"
            variant="secondary"
            aria-label=${label}
            ?disabled=${this.disabled}
          >
            ${label}
          </ui-button>
        </ui-popconfirm>
      `;
    }

    return html`
      <ui-tooltip title=${tooltip} placement=${this.tooltipPlacement} .zIndex=${Z_INDEX.MODAL + 1}>
        <ui-button
          size="small"
          variant="secondary"
          aria-label=${label}
          ?disabled=${this.disabled}
          @click=${() => this._emit(false)}
        >
          ${label}
        </ui-button>
      </ui-tooltip>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'source-segment-align-button': SourceSegmentAlignButton;
  }
}
