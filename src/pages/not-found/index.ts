import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { navigator } from 'lit-element-router';
import { msg, str, localized } from '@lit/localize';

const COUNTDOWN_TIME = 3;

const NavigatorElement = navigator(LitElement);
@customElement('not-found-page')
@localized()
export class NotFoundPage extends NavigatorElement {
  @state()
  private _countdown = COUNTDOWN_TIME;

  private timer: ReturnType<typeof setInterval> | null = null;

  private _startCountdown() {
    this._stopCountdown();
    this._countdown = COUNTDOWN_TIME;
    this.timer = setInterval(() => {
      this._countdown--;
      if (this._countdown <= 0) {
        this._stopCountdown();
        this.navigate('/');
      }
    }, 1000);
  }
  private _stopCountdown() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this._startCountdown();
  }

  disconnectedCallback() {
    this._stopCountdown();
    super.disconnectedCallback();
  }

  render() {
    return html`
      <h1>${msg('页面未找到')}</h1>
      <p>${msg(str`${this._countdown} 秒后返回首页…`)}</p>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'not-found-page': NotFoundPage;
  }
}
