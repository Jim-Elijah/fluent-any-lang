import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';

import { ensureIconRegistry, getIconSymbol } from './icon-registry.js';
import './tooltip.js';

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
      cursor: pointer;
      cursor: var(--ui-icon-cursor, pointer);
    }

    svg :is(path, circle, rect, polygon, polyline) {
      fill: currentColor;
    }

    .disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  `;

  @property({ type: String })
  name = '';

  @property({ type: String })
  title = '';

  @property({ type: String })
  size = '';

  @property({ type: Boolean })
  disabled = false;

  @property({ type: Boolean })
  arrow = true;

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
      <ui-tooltip title=${this.title || this.name} .arrow=${this.arrow}>
        <svg
          class=${this.disabled ? 'disabled' : ''}
          style="${sizeStyle}"
          viewBox="${symbol.viewBox}"
          aria-hidden="true"
          focusable="false"
          @click=${this._handleClick.bind(this)}
        >
          ${unsafeSVG(symbol.innerHTML)}
        </svg>
      </ui-tooltip>
    `;
  }

  /** @fixme 是否要阻断事件冒泡 */
  private _handleClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.disabled) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent('click', { detail: this.name, bubbles: true, composed: true }),
    );
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
