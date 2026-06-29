import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { outlet } from 'lit-element-router';

@customElement('app-main')
@outlet
export class AppMain extends LitElement {
  render() {
    return html` <slot></slot> `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-main': AppMain;
  }
}
