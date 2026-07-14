import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

export type SwitchChangeDetail = {
  checked: boolean;
  domEvent: Event;
};

@customElement('ui-switch')
export class UiSwitch extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      vertical-align: middle;
      line-height: 1;
    }

    :host([disabled]) {
      cursor: not-allowed;
    }

    button {
      position: relative;
      box-sizing: border-box;
      width: 44px;
      height: 22px;
      padding: 0;
      border: none;
      border-radius: 100px;
      background: rgba(0, 0, 0, 0.25);
      cursor: pointer;
      transition: background-color 0.2s ease;
      flex-shrink: 0;
    }

    button:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.35);
    }

    button.checked {
      background: var(--color-primary, #1677ff);
    }

    button.checked:hover:not(:disabled) {
      background: var(--color-primary-hover, #4096ff);
    }

    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    button:focus-visible {
      outline: 2px solid var(--color-primary, #1677ff);
      outline-offset: 2px;
    }

    .thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      transition: transform 0.2s ease;
    }

    button.checked .thumb {
      transform: translateX(22px);
    }
  `;

  @property({ type: Boolean, reflect: true })
  checked = false;

  @property({ type: Boolean, reflect: true })
  disabled = false;

  @property({ type: String })
  label = '';

  private _onClick(event: MouseEvent) {
    if (this.disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.checked = !this.checked;
    this.dispatchEvent(
      new CustomEvent<SwitchChangeDetail>('change', {
        detail: { checked: this.checked, domEvent: event },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return html`
      <button
        type="button"
        role="switch"
        class=${classMap({ checked: this.checked })}
        aria-checked=${this.checked ? 'true' : 'false'}
        aria-label=${this.label || nothing}
        ?disabled=${this.disabled}
        @click=${this._onClick}
      >
        <span class="thumb" aria-hidden="true"></span>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-switch': UiSwitch;
  }
}
