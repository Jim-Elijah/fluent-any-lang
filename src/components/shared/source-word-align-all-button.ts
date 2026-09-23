import { msg, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { Z_INDEX } from '../ui/internal/z-index.js';
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

  private _defaultTooltip(): string {
    return this.hasWholeMediaCache
      ? msg('重新为全部句子生成原音词条（整段原音重新对齐）')
      : msg('为全部句子生成原音词条（整段原音一次对齐，已有则跳过）');
  }

  render() {
    const busy = this.disabled;
    const buttonDisabled = busy || this.blocked;

    if (this.hasWholeMediaCache) {
      return html`
        <ui-tooltip
          title=${this.blockedTip ?? this._defaultTooltip()}
          placement=${this.tooltipPlacement}
          .zIndex=${Z_INDEX.MODAL + 1}
        >
          <ui-popconfirm
            .title=${msg('已有整段原音词条，是否重新生成？')}
            .zIndex=${Z_INDEX.MODAL + 2}
            ?disabled=${buttonDisabled}
            placement=${this.tooltipPlacement}
            @confirm=${() => this._emit(true)}
          >
            <ui-button size="small" variant="secondary" ?disabled=${buttonDisabled}>
              ${msg('重新生成')}
            </ui-button>
          </ui-popconfirm>
        </ui-tooltip>
      `;
    }

    return html`
      <ui-tooltip
        title=${this.blockedTip ?? this._defaultTooltip()}
        placement=${this.tooltipPlacement}
        .zIndex=${Z_INDEX.MODAL + 1}
      >
        <ui-button
          size="small"
          variant="secondary"
          ?disabled=${buttonDisabled}
          @click=${() => this._emit(false)}
        >
          ${msg('全部原音')}
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
