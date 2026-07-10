import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '../../components/player/audio-recorder.js';
import { RouteContext } from '../../types/index.js';

@customElement('speaking-page')
export class SpeakingPage extends LitElement {
  @property({ type: Object })
  routeContext: RouteContext = {
    route: '',
    params: {},
    query: {},
    data: {},
  };

  render() {
    return html`
      <h1>speaking</h1>
      <audio-recorder></audio-recorder>
    `;
  }

  /**
   * 当路由上下文发生变化时，如果路由不是speaking，则销毁录音器
   * @param changed 变化的属性
   */
  updated(changed: Map<string, unknown>) {
    const previous = changed.get('routeContext') as RouteContext | undefined;
    if (changed.has('routeContext') && previous && this.routeContext.route !== previous.route) {
      this.shadowRoot?.querySelector('audio-recorder')?.handleDestroy();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'speaking-page': SpeakingPage;
  }
}
