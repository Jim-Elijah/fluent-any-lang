import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { updateWhenLocaleChanges } from '@lit/localize';
import { navigator } from 'lit-element-router';

import '../../components/import/content-importer.js';
import '../../components/library/media-list.js';
import '../../components/library/record-list.js';
import '../../components/player/practice-view.js';
import '../../components/ui/locale-switcher.js';
import '../../components/ui/select.js';
import '../../components/ui/input.js';
import type { SelectChangeDetail } from '../../components/ui/select.js';
import { InputChangeDetail } from '../../components/ui/input.js';
import { SortDirection } from '../../types/models.js';

// @customElement('library-page')
// @navigator
// export class LibraryPage extends LitElement {
const NavigatorElement = navigator(LitElement);
@customElement('library-page')
export class LibraryPage extends NavigatorElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
    }

    .layout {
      /* max-width: 960px;
      margin: 0 auto;
      padding: 24px 16px 48px; */
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
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .stack {
      display: grid;
      gap: 24px;
    }
  `;

  @state()
  private _keyword = '';

  @state()
  private _sortBy: string = 'date';

  @state()
  private _sortDirection: SortDirection = 'desc';

  private _sortByOptions = [
    { value: 'title', label: '名称' },
    { value: 'date', label: '日期' },
  ];

  private _sortDirectionOptions = [
    { value: 'asc', label: '升序' },
    { value: 'desc', label: '降序' },
  ];

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  render() {
    return html`
      <div class="layout">
        <p class="intro">
          <!-- @TODO sort, search -->
          <!-- 基础输入 + 清空 -->
          <ui-input
            .value=${this._keyword}
            style="flex: 1;"
            allow-clear
            placeholder="请输入"
            @change=${(e: CustomEvent<InputChangeDetail>) => {
              console.log('change', e.detail);
              this._keyword = (e.detail.value || '').trim();
            }}
          ></ui-input>

          <ui-select
            style="flex: 1;"
            .value=${this._sortBy}
            .options=${this._sortByOptions}
            placeholder="排序方式"
            @change=${(e: CustomEvent<SelectChangeDetail>) => {
              console.log('change', e.detail);
              this._sortBy = e.detail.value as string;
            }}
          ></ui-select>

          <ui-select
            style="flex: 1;"
            .value=${this._sortDirection}
            .options=${this._sortDirectionOptions}
            placeholder="排序方向"
            @change=${(e: CustomEvent<SelectChangeDetail>) => {
              console.log('change', e.detail);
              this._sortDirection = e.detail.value as SortDirection;
            }}
          ></ui-select>
        </p>
        <div class="stack">
          <media-list
            .keyword=${this._keyword}
            .sortBy=${this._sortBy}
            .sortDirection=${this._sortDirection}
            @media-selected="${this._handleMediaSelected}"
          ></media-list>
          <record-list
            .keyword=${this._keyword}
            .sortBy=${this._sortBy}
            .sortDirection=${this._sortDirection}
          ></record-list>
        </div>
      </div>
    `;
  }

  private _handleMediaSelected(event: CustomEvent<{ id: string }>): void {
    console.log('_handleMediaSelected', event.detail.id);
    this.navigate(`/practice/${event.detail.id}`);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'library-page': LibraryPage;
  }
}
