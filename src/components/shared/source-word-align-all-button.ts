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

export type SourceWordAlignAllDetail = { force: boolean };

@customElement('source-word-align-all-button')
@localized()
export class SourceWordAlignAllButton extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
    }
  `;

  @property({ type: Boolean })
  hasWholeMediaCache = false;

  @property({ type: Boolean })
  disabled = false;

  @property({ type: Boolean })
  blocked = false;

  @property({ attribute: false })
  blockedTip: string | null = null;

  @property({ type: String })
  tooltipPlacement = 'top';

  private _emit(force: boolean): void {
    if (this.disabled || this.blocked) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<SourceWordAlignAllDetail>('align-all', {
        detail: { force },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    const busy = this.disabled;
    const buttonDisabled = busy || this.blocked;
    const hasCache = this.hasWholeMediaCache;
    const label = sourceWordAlignButtonLabel('whole', hasCache);
    const tooltip = this.blockedTip ?? sourceWordAlignTooltip('whole', hasCache);

    if (this.blocked) {
      return html`
        <ui-tooltip
          title=${tooltip}
          placement=${this.tooltipPlacement}
          .zIndex=${Z_INDEX.MODAL + 1}
        >
          <ui-button
            size="small"
            variant="secondary"
            aria-label=${label}
            ?disabled=${buttonDisabled}
          >
            ${label}
          </ui-button>
        </ui-tooltip>
      `;
    }

    if (hasCache) {
      return html`
        <ui-popconfirm
          .title=${sourceWordAlignPopconfirmTitle('whole')}
          .zIndex=${Z_INDEX.MODAL + 2}
          ?disabled=${busy}
          placement=${this.tooltipPlacement}
          @confirm=${() => this._emit(true)}
        >
          <ui-button size="small" variant="secondary" aria-label=${label} ?disabled=${busy}>
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
          ?disabled=${buttonDisabled}
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
    'source-word-align-all-button': SourceWordAlignAllButton;
  }
}
