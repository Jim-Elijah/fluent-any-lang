import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { navigator } from 'lit-element-router';

// @customElement('app-link')
// @navigator
// export class AppLink extends LitElement {

const NavigatorElement = navigator(LitElement);
@customElement('app-link')
export class AppLink extends NavigatorElement {
  // static get properties() {
  //   return {
  //     href: { type: String },
  //   };
  // }

  @property({ type: String }) href = '';

  constructor() {
    super();
  }
  render() {
    return html`
      <a href="${this.href}" @click="${this.linkClick}">
        <slot></slot>
      </a>
    `;
  }
  linkClick(event: Event) {
    event.preventDefault();
    this.navigate(this.href);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-link': AppLink;
  }
}
