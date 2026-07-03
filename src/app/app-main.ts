import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { outlet } from 'lit-element-router';

// if outlet is after customElement, will cause "Cannot read properties of null (reading 'querySelectorAll')" error
// if outlet is before customElement, all route will be matched
/** @fixme */

@customElement('app-main')
@outlet
export class AppMain extends LitElement {
  render() {
    // console.log('app-main render', this.querySelectorAll(`[route]`));
    return html`<slot></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-main': AppMain;
  }
}
