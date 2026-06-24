import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

@customElement('ui-button')
export class UiButton extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 14px;
      border: 1px solid transparent;
      border-radius: var(--radius-md, 8px);
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.5;
      cursor: pointer;
      transition:
        background-color 0.15s ease,
        border-color 0.15s ease,
        color 0.15s ease;
    }

    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    button.primary {
      background: var(--color-primary, #1677ff);
      color: #fff;
    }

    button.primary:hover:not(:disabled) {
      background: var(--color-primary-hover, #4096ff);
    }

    button.secondary {
      background: var(--color-surface, #fff);
      border-color: var(--color-border, #d9d9d9);
      color: var(--color-text, rgba(0, 0, 0, 0.88));
    }

    button.secondary:hover:not(:disabled) {
      border-color: var(--color-primary, #1677ff);
      color: var(--color-primary, #1677ff);
    }

    button.danger {
      background: #fff1f0;
      border-color: #ffa39e;
      color: #cf1322;
    }

    button.danger:hover:not(:disabled) {
      background: #ffccc7;
    }

    button.ghost {
      background: transparent;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    button.ghost:hover:not(:disabled) {
      color: var(--color-primary, #1677ff);
      background: rgba(22, 119, 255, 0.06);
    }

    button:focus-visible {
      outline: 2px solid var(--color-primary, #1677ff);
      outline-offset: 2px;
    }
  `;

  @property({ type: String })
  variant: ButtonVariant = 'primary';

  @property({ type: Boolean })
  disabled = false;

  @property({ type: String })
  type: 'button' | 'submit' = 'button';

  render() {
    return html`
      <button
        class="${this.variant}"
        type="${this.type}"
        ?disabled="${this.disabled}"
        @click="${this._handleClick}"
      >
        <slot></slot>
      </button>
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
    'ui-button': UiButton;
  }
}
