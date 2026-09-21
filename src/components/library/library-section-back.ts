import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { navigator } from 'lit-element-router';

import '../ui/icon.js';

const NavigatorElement = navigator(LitElement);

@customElement('library-section-back')
@localized()
export class LibrarySectionBack extends NavigatorElement {
  static styles = css`
    :host {
      display: block;
      flex-shrink: 0;
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      margin: 0 0 var(--space-sm);
      padding: 0;
      border: none;
      background: none;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font: inherit;
      font-size: 0.875rem;
      cursor: pointer;
    }

    button:hover {
      color: var(--color-primary, #1677ff);
    }
  `;

  render() {
    return html`
      <button type="button" @click=${() => this.navigate('/library')}>
        <ui-icon name="left-arrow" size="var(--icon-sm)"></ui-icon>
        ${msg('返回库')}
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'library-section-back': LibrarySectionBack;
  }
}
