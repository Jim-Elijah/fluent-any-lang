import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

@customElement('ui-alert')
export class UiAlert extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .alert {
      padding: 10px 14px;
      border: 1px solid transparent;
      border-radius: var(--radius-md, 8px);
      font-size: 0.875rem;
      line-height: 1.5;
    }

    .info {
      background: #e6f4ff;
      border-color: #91caff;
      color: #0958d9;
    }

    .success {
      background: #f6ffed;
      border-color: #b7eb8f;
      color: #389e0d;
    }

    .warning {
      background: #fffbe6;
      border-color: #ffe58f;
      color: #d48806;
    }

    .error {
      background: #fff2f0;
      border-color: #ffccc7;
      color: #cf1322;
    }

    ul {
      margin: 8px 0 0;
      padding-left: 18px;
    }

    li + li {
      margin-top: 4px;
    }
  `;

  @property({ type: String })
  variant: AlertVariant = 'info';

  @property({ type: Array })
  items: string[] = [];

  render() {
    return html`
      <div class="alert ${this.variant}" role="alert">
        <slot></slot>
        ${this.items.length > 0
          ? html`
              <ul>
                ${this.items.map((item) => html`<li>${item}</li>`)}
              </ul>
            `
          : null}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-alert': UiAlert;
  }
}
