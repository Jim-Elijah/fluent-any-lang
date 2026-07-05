import { LitElement, PropertyValues, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { navigator } from 'lit-element-router';
import { msg, str } from '@lit/localize';
import '../../components/player/audio-recorder.js';

const COUNTDOWN_TIME = 3;

// @customElement('not-found-page')
// @navigator
// export class NotFoundPage extends LitElement {
const NavigatorElement = navigator(LitElement);
@customElement('not-found-page')
export class NotFoundPage extends NavigatorElement {
  @property({ type: Boolean }) active = false;
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
  protected updated(changed: PropertyValues) {
    console.log('not-found-page updated', changed);
    if (changed.has('active')) {
      if (this.active) {
        this._startCountdown();
      } else {
        this._stopCountdown();
      }
    }
  }
  disconnectedCallback() {
    this._stopCountdown();
    super.disconnectedCallback();
  }

  render() {
    return html`
      <h1>Not Found</h1>
      <p>${msg(str`Returning to home in ${this._countdown} seconds...`)}</p>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'not-found-page': NotFoundPage;
  }
}
