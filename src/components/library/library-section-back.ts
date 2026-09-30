import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { navigator } from 'lit-element-router';

import '../ui/icon.js';

const NavigatorElement = navigator(LitElement);

/** Any fragment other than a bare "#" counts. Hub clicks append an opaque one. */
function hasSectionHash(): boolean {
  return window.location.hash.length > 1;
}

@customElement('library-section-back')
@localized()
export class LibrarySectionBack extends NavigatorElement {
  static styles = css`
    :host {
      display: block;
      flex-shrink: 0;
    }

    :host([hidden]) {
      display: none !important;
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      margin: 0 0 var(--space-sm);
      padding: 0;
      border: none;
      background: none;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font: inherit;
      font-size: 0.875rem;
      cursor: pointer;
    }

    button:hover {
      color: var(--color-primary, #1677ff);
    }
  `;

  @state()
  private _visible = false;

  override connectedCallback(): void {
    super.connectedCallback();
    this._syncFromLocation();
    window.addEventListener('route', this._onRoute);
  }

  override disconnectedCallback(): void {
    window.removeEventListener('route', this._onRoute);
    super.disconnectedCallback();
  }

  render() {
    if (!this._visible) return nothing;
    return html`
      <button type="button" @click=${() => this.navigate('/library')}>
        <ui-icon name="left-arrow" size="var(--icon-sm)"></ui-icon>
        ${msg('返回库')}
      </button>
    `;
  }

  private _onRoute = (): void => {
    this._syncFromLocation();
  };

  private _syncFromLocation(): void {
    const visible = hasSectionHash();
    this.hidden = !visible;
    if (this._visible !== visible) this._visible = visible;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'library-section-back': LibrarySectionBack;
  }
}
