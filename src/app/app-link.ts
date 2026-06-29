import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { navigator } from 'lit-element-router';

@customElement('app-link')
@navigator
export class AppLink extends LitElement {
  static get properties() {
    return {
      href: { type: String },
    };
  }
  constructor() {
    super();
    this.href = '';
  }
  render() {
    return html`
      <a href="${this.href}" @click="${this.linkClick}">
        <slot></slot>
      </a>
    `;
  }
  linkClick(event) {
    event.preventDefault();
    this.navigate(this.href);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-link': AppLink;
  }
}
