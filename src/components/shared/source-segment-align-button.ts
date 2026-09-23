import { msg, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { Z_INDEX } from '../ui/internal/z-index.js';
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
    if (this.hasCache) {
      return html`
        <ui-tooltip
          title=${msg('重新生成当前句的原音词条')}
          placement=${this.tooltipPlacement}
          .zIndex=${Z_INDEX.MODAL + 1}
        >
          <ui-popconfirm
            .title=${msg('已有词条，是否重新生成？')}
            .zIndex=${Z_INDEX.MODAL + 2}
            ?disabled=${this.disabled}
            placement=${this.tooltipPlacement}
            @confirm=${() => this._emit(true)}
          >
            <ui-button size="small" variant="secondary" ?disabled=${this.disabled}>
              ${msg('重新生成')}
            </ui-button>
          </ui-popconfirm>
        </ui-tooltip>
      `;
    }

    return html`
      <ui-tooltip
        title=${msg('为当前句生成原音词条')}
        placement=${this.tooltipPlacement}
        .zIndex=${Z_INDEX.MODAL + 1}
      >
        <ui-button
          size="small"
          variant="secondary"
          ?disabled=${this.disabled}
          @click=${() => this._emit(false)}
        >
          ${msg('生成本句')}
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
