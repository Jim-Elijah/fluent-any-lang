import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';

import { ensureIconRegistry, getIconSymbol } from './icon-registry.js';

@customElement('ui-icon')
export class UIIcon extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
      vertical-align: -0.125em;
    }

    svg {
      width: var(--ui-icon-size, 1em);
      height: var(--ui-icon-size, 1em);
      fill: currentColor;
      overflow: hidden;
    }

    svg :is(path, circle, rect, polygon, polyline) {
      fill: currentColor;
    }
  `;

  @property({ type: String })
  name = '';

  @property({ type: String })
  size = '';

  @state()
  private _loaded = false;

  connectedCallback(): void {
    super.connectedCallback();
    void this._loadRegistry();
  }

  render() {
    if (!this._loaded || !this.name) return nothing;

    const symbol = getIconSymbol(this.name);
    if (!symbol) return nothing;

    const sizeStyle = this.size ? `--ui-icon-size:${this.size};` : '';

    return html`
      <svg style="${sizeStyle}" viewBox="${symbol.viewBox}" aria-hidden="true" focusable="false">
        ${unsafeSVG(symbol.innerHTML)}
      </svg>
    `;
  }

  private async _loadRegistry(): Promise<void> {
    await ensureIconRegistry();
    this._loaded = true;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-icon': UIIcon;
  }
}
