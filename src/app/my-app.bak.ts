import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { router, Routes } from 'lit-element-router';

import './app-link.js';
import './app-main.js';

@customElement('app-shell')
@router
export class MyApp extends LitElement {
  @property({ type: String })
  route: string = '';

  @state()
  params: object = {};

  @state()
  query: object = {};

  static get routes(): Routes {
    return [
      {
        name: 'home',
        pattern: '',
        data: { title: 'Home' },
      },
      {
        name: 'info',
        pattern: 'info',
      },
      {
        name: 'user',
        pattern: 'user/:id',
      },
      {
        name: 'not-found',
        pattern: '*',
      },
    ];
  }

  constructor() {
    super();
  }

  router(route: string, params: object, query: object, data: object) {
    this.route = route;
    this.params = params;
    this.query = query;
    console.log(route, params, query, data);
  }

  render() {
    return html`
      <app-link href="/">Home</app-link>
      <app-link href="/info">Info</app-link>
      <app-link href="/info?data=12345">Info?data=12345</app-link>
      <app-link href="/user/14">user/14</app-link>

      <app-main active-route=${this.route}>
        <h1 route="home">Home</h1>
        <h1 route="info">Info ${this.query?.data}</h1>
        <h1 route="user">User ${this.params?.id}</h1>
        <h1 route="not-found">Not Found</h1>
      </app-main>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': MyApp;
  }
}
