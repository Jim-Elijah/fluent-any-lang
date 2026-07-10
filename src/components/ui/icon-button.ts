import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import './icon.js';
import './tooltip.js';

@customElement('ui-icon-button')
export class UIIconButton extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      border: none;
      border-radius: var(--radius-md, 8px);
      background: transparent;
      color: inherit;
      line-height: 0;
      cursor: pointer;
      transition:
        background-color 0.15s ease,
        color 0.15s ease;
    }

    button:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.04);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    button:focus-visible {
      outline: 2px solid var(--color-primary, #1677ff);
      outline-offset: 2px;
    }
  `;

  @property({ type: String })
  name = '';

  @property({ type: String })
  title = '';

  @property({ type: String })
  size = '';

  @property({ type: Boolean })
  disabled = false;

  @property({ type: Boolean })
  arrow = true;

  render() {
    return html`
      <ui-tooltip title=${this.title} ?disabled=${this.disabled} .arrow=${this.arrow}>
        <button
          type="button"
          ?disabled=${this.disabled}
          aria-label=${this.title || nothing}
          @click=${this._handleClick}
        >
          <ui-icon name=${this.name} size=${this.size}></ui-icon>
        </button>
      </ui-tooltip>
    `;
  }

  private _handleClick(event: Event): void {
    if (this.disabled) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-icon-button': UIIconButton;
  }
}
