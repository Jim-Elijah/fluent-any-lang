import { msg, updateWhenLocaleChanges } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '../components/import/content-importer.js';
import '../components/library/media-list.js';
import '../components/library/record-list.js';
import '../components/player/practice-view.js';
import '../components/ui/locale-switcher.js';
import type { MediaList } from '../components/library/media-list.js';

type AppView = 'library' | 'practice';

@customElement('app-shell')
export class AppShell extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
    }

    .layout {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 16px 48px;
    }

    .layout.practice {
      max-width: 1100px;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--color-border, #d9d9d9);
    }

    .brand {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-primary, #1677ff);
    }

    .intro {
      margin: 0 0 24px;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.9375rem;
    }

    .stack {
      display: grid;
      gap: 24px;
    }
  `;

  @state()
  private _view: AppView = 'library';

  @state()
  private _selectedMediaId = '';

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  render() {
    return html`
      <div class="layout ${this._view === 'practice' ? 'practice' : ''}">
        <header>
          <h1 class="brand">${msg('FluentAnyLang')}</h1>
          <locale-switcher></locale-switcher>
        </header>

        ${this._view === 'library'
          ? html`
              <p class="intro">
                ${msg('任意语言的听说练习平台。导入音视频与字幕，开始 Listening / Speaking 练习。')}
              </p>
              <div class="stack">
                <content-importer
                  @content-imported="${this._handleContentImported}"
                ></content-importer>
                <media-list @media-selected="${this._handleMediaSelected}"></media-list>
                <record-list></record-list>
              </div>
            `
          : html`
              <practice-view
                .mediaId="${this._selectedMediaId}"
                @practice-close="${this._handlePracticeClose}"
              ></practice-view>
            `}
      </div>
    `;
  }

  private _handleContentImported(): void {
    const mediaList = this.renderRoot.querySelector('media-list') as MediaList | null;
    void mediaList?.refresh();
  }

  private _handleMediaSelected(event: CustomEvent<{ id: string }>): void {
    this._selectedMediaId = event.detail.id;
    this._view = 'practice';
  }

  private _handlePracticeClose(): void {
    this._view = 'library';
    this._selectedMediaId = '';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell;
  }
}
