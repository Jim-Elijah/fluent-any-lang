import { css, html, LitElement } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { msg, updateWhenLocaleChanges } from '@lit/localize';
import { navigator } from 'lit-element-router';

import '../../components/import/content-importer.js';
import '../../components/library/media-list.js';
import '../../components/library/record-list.js';
import '../../components/player/practice-view.js';
import '../../components/ui/locale-switcher.js';
import type { MediaList } from '../../components/library/media-list.js';
import type { RecordList } from '../../components/library/record-list.js';

@customElement('home-page')
@navigator
export class HomePage extends LitElement {
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
  private _selectedMediaId = '';
  @query('media-list')
  private _mediaList?: MediaList;

  @query('record-list')
  private _recordList?: RecordList;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  render() {
    return html`
      <div class="home">
        <p class="intro">
          ${msg('任意语言的听说练习平台。导入音视频与字幕，开始 Listening / Speaking 练习。')}
        </p>
        <div class="stack">
          <content-importer @content-imported="${this._handleContentImported}"></content-importer>
          <media-list @media-selected="${this._handleMediaSelected}"></media-list>
          <record-list></record-list>
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
