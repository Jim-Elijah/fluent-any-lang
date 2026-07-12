import { css, html, LitElement } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { navigator } from 'lit-element-router';

import '../../components/import/content-importer.js';
import '../../components/library/media-list.js';
import '../../components/stats/practice-stats-dashboard.js';
import type { MediaList } from '../../components/library/media-list.js';

const NavigatorElement = navigator(LitElement);
@customElement('home-page')
@localized()
export class HomePage extends NavigatorElement {
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

  @query('media-list')
  private _mediaList?: MediaList;

  render() {
    return html`
      <div class="home">
        <p class="intro">${msg('任意语言的听说练习平台。导入音频与字幕，即可开始练习。')}</p>
        <div class="stack">
          <practice-stats-dashboard></practice-stats-dashboard>
          <content-importer @content-imported="${this._handleContentImported}"></content-importer>
          <media-list @media-selected="${this._handleMediaSelected}"></media-list>
        </div>
      </div>
    `;
  }

  private _handleContentImported(): void {
    void this._mediaList?.refresh();
    // void this._recordList?.refresh();
  }

  private _handleMediaSelected(event: CustomEvent<{ id: string }>): void {
    console.log('_handleMediaSelected', event.detail.id);
    this.navigate(`/practice/${event.detail.id}`);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'home-page': HomePage;
  }
}
