import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { RouteContext } from '../../types';
import '../../components/library/record-list.js';

@customElement('recording-page')
export class RecordingPage extends LitElement {
  @property({ type: Object })
  routeContext: RouteContext = {
    route: '',
    params: {},
    query: {},
    data: {},
  };

  @state()
  private _mediaId = '';

  /** @fixme this._mediaId = undefined */
  protected updated(changed: Map<PropertyKey, unknown>): void {
    const previous = changed.get('routeContext') as RouteContext | undefined;
    if (
      changed.has('routeContext') &&
      previous?.params &&
      this.routeContext.params.id !== previous.params.id
    ) {
      if (this._mediaId !== this.routeContext.params.id) {
        this._mediaId = this.routeContext.params.id;
      }
    }
  }

  render() {
    console.log('recording-page render', this._mediaId);
    console.log('routeContext', this.routeContext);

    return html` <record-list .mediaId="${this._mediaId}" .showHeader="${false}"></record-list> `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'recording-page': RecordingPage;
  }
}
