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
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }

    .home {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    .intro {
      flex-shrink: 0;
      margin: 0 0 24px;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.9375rem;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: 24px;
      flex: 1;
      min-height: 0;
    }

    .stack > :not(media-list) {
      flex-shrink: 0;
    }

    media-list {
      flex: 1;
      min-height: 12rem;
    }
  `;

  @query('media-list')
  private _mediaList?: MediaList;

  render() {
    return html`
      <div class="home">
        <p class="intro">
          ${msg('任意语言的听说练习平台。导入音视频后即可开始练习，字幕可稍后补充。')}
        </p>
        <div class="stack">
          <practice-stats-dashboard></practice-stats-dashboard>
          <content-importer @content-imported="${this._handleContentImported}"></content-importer>
          <media-list
            fill-height
            .limit=${10}
            @media-selected="${this._handleMediaSelected}"
          ></media-list>
        </div>
      </div>
    `;
  }

  private _handleContentImported(): void {
    void this._mediaList?.refresh();
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
