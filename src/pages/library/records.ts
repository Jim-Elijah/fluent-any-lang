import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';
import { navigator } from 'lit-element-router';

import '../../components/library/library-list-toolbar.js';
import '../../components/library/library-section-back.js';
import '../../components/library/record-list.js';
import type { LibraryListToolbarChangeDetail } from '../../components/library/library-list-toolbar.js';
import type { SelectOption } from '../../components/ui/select.js';
import { SingleListCompactController } from '../../lib/single-list-compact.js';
import type { SortDirection } from '../../types/models.js';

const NavigatorElement = navigator(LitElement);

@customElement('library-records-page')
@localized()
export class LibraryRecordsPage extends NavigatorElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }

    :host([compact]) {
      height: auto;
      overflow: visible;
    }

    .layout {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      gap: var(--space-sm);
    }

    .hint {
      flex-shrink: 0;
      margin: 0;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.45));
      font-size: 0.8125rem;
    }

    record-list {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    :host([compact]) record-list {
      flex: none;
      overflow: visible;
    }
  `;

  @property({ type: Boolean, reflect: true })
  compact = false;

  @state()
  private _keyword = '';

  @state()
  private _sortBy = 'date';

  @state()
  private _sortDirection: SortDirection = 'desc';

  private readonly _compactCtrl = new SingleListCompactController(this, {
    listSelector: 'record-list',
    chromeSelectors: ['library-section-back', 'library-list-toolbar', '.hint'],
    stackSelector: '.layout',
  });

  render() {
    return html`
      <div class="layout">
        <library-section-back></library-section-back>
        <library-list-toolbar
          .keyword=${this._keyword}
          .sortBy=${this._sortBy}
          .sortDirection=${this._sortDirection}
          .sortByOptions=${this._getSortByOptions()}
          searchPlaceholder="${msg('搜索录音标题 / 字幕')}"
          @filters-change=${this._onFiltersChange}
        ></library-list-toolbar>
        <p class="hint">${msg('口语练习产生的录音')}</p>
        <record-list
          ?fill-height=${!this.compact}
          .keyword=${this._keyword}
          .sortBy=${this._sortBy}
          .sortDirection=${this._sortDirection}
        ></record-list>
      </div>
    `;
  }

  private _getSortByOptions(): SelectOption[] {
    return [
      { value: 'title', label: msg('名称') },
      { value: 'date', label: msg('日期') },
    ];
  }

  private _onFiltersChange = (e: CustomEvent<LibraryListToolbarChangeDetail>): void => {
    this._keyword = e.detail.keyword;
    this._sortBy = e.detail.sortBy;
    this._sortDirection = e.detail.sortDirection;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'library-records-page': LibraryRecordsPage;
  }
}
