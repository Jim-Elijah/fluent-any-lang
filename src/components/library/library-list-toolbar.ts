import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';

import '../ui/input.js';
import '../ui/icon.js';
import '../ui/select.js';
import type { InputChangeDetail } from '../ui/input.js';
import type { SelectChangeDetail, SelectOption } from '../ui/select.js';
import type { SortDirection } from '../../types/models.js';

export type LibraryListToolbarChangeDetail = {
  keyword: string;
  sortBy: string;
  sortDirection: SortDirection;
};

@customElement('library-list-toolbar')
@localized()
export class LibraryListToolbar extends LitElement {
  static styles = css`
    :host {
      display: block;
      flex-shrink: 0;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-block);
      flex-wrap: wrap;
    }

    .search {
      flex: 1 1 240px;
      min-width: 0;
    }

    .sort-group {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      flex: 0 0 auto;
    }

    .sort-label {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.875rem;
      white-space: nowrap;
    }

    .sort-group ui-select {
      width: 7.5rem;
    }
  `;

  @property({ type: String })
  keyword = '';

  @property({ type: String })
  sortBy = 'date';

  @property({ type: String })
  sortDirection: SortDirection = 'desc';

  @property({ type: String })
  searchPlaceholder = '';

  @property({ attribute: false })
  sortByOptions: SelectOption[] = [];

  render() {
    const placeholder = this.searchPlaceholder || msg('搜索');
    return html`
      <div class="toolbar">
        <ui-input
          class="search"
          .value=${this.keyword}
          allow-clear
          placeholder="${placeholder}"
          aria-label="${placeholder}"
          @change=${(e: CustomEvent<InputChangeDetail>) => {
            this._emit({ keyword: (e.detail.value || '').trim() });
          }}
        >
          <ui-icon slot="prefix" name="search" size="var(--icon-md)"></ui-icon>
        </ui-input>

        <div class="sort-group">
          <span class="sort-label">
            <ui-icon name="sort" size="var(--icon-md)"></ui-icon>
            ${msg('排序')}
          </span>
          <ui-select
            .value=${this.sortBy}
            .options=${this.sortByOptions}
            aria-label="${msg('排序字段')}"
            @change=${(e: CustomEvent<SelectChangeDetail>) => {
              this._emit({ sortBy: e.detail.value as string });
            }}
          ></ui-select>
          <ui-select
            .value=${this.sortDirection}
            .options=${this._getSortDirectionOptions()}
            aria-label="${msg('排序方向')}"
            @change=${(e: CustomEvent<SelectChangeDetail>) => {
              this._emit({ sortDirection: e.detail.value as SortDirection });
            }}
          ></ui-select>
        </div>
      </div>
    `;
  }

  private _getSortDirectionOptions(): SelectOption[] {
    return [
      { value: 'asc', label: msg('升序') },
      { value: 'desc', label: msg('降序') },
    ];
  }

  private _emit(partial: Partial<LibraryListToolbarChangeDetail>): void {
    const detail: LibraryListToolbarChangeDetail = {
      keyword: partial.keyword ?? this.keyword,
      sortBy: partial.sortBy ?? this.sortBy,
      sortDirection: partial.sortDirection ?? this.sortDirection,
    };
    this.dispatchEvent(
      new CustomEvent<LibraryListToolbarChangeDetail>('filters-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'library-list-toolbar': LibraryListToolbar;
  }
}
