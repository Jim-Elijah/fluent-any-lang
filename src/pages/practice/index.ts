import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { RouteContext } from '../../types';
import '../../components/player/practice-view.js';

@customElement('practice-page')
export class PracticePage extends LitElement {
  @property({ type: Object })
  routeContext: RouteContext = {
    route: '',
    params: {},
    query: {},
    data: {},
  };

  render() {
    return html` <practice-view .routeContext="${this.routeContext}"></practice-view> `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'practice-page': PracticePage;
  }
}
