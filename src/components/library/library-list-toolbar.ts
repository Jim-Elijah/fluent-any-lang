import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { msg, localized } from '@lit/localize';

import '../ui/input.js';
import '../ui/icon.js';
import '../ui/select.js';
import type { InputChangeDetail } from '../ui/input.js';
import type { SelectChangeDetail, SelectOption } from '../ui/select.js';
import type { SortDirection, SpeakingMode } from '../../types/models.js';

/** Library records filter: every Speaking subtype, or one of Shadowing / Echo. */
export type LibraryRecordModeFilter = 'all' | SpeakingMode;

export type LibraryListToolbarChangeDetail = {
  keyword: string;
  sortBy: string;
  sortDirection: SortDirection;
  /** Present only when the mode filter control is shown. */
  mode?: LibraryRecordModeFilter;
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

    .filters {
      display: flex;
      align-items: center;
      gap: var(--space-block);
      flex: 0 0 auto;
      min-width: 0;
    }

    .control-group {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      flex: 0 0 auto;
      min-width: 0;
    }

    .sort-label {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.875rem;
      white-space: nowrap;
    }

    .control-group ui-select {
      width: 7.5rem;
    }

    /* Records page: search on the first row; mode and sort share the second. */
    @media (max-width: 767px) {
      :host([show-mode-filter]) .filters {
        flex: 1 1 100%;
        gap: var(--space-sm);
      }

      :host([show-mode-filter]) .control-group {
        flex: 1 1 0;
        gap: var(--space-xs);
      }

      :host([show-mode-filter]) .sort-group {
        flex: 1.7 1 0;
      }

      :host([show-mode-filter]) .sort-label {
        flex: 0 0 auto;
      }

      :host([show-mode-filter]) .control-group ui-select {
        flex: 1 1 4.5rem;
        width: auto;
        min-width: 4.5rem;
      }
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

  /** When true, show an all / Echo / Shadowing filter. Other library lists leave this off. */
  @property({ type: Boolean, attribute: 'show-mode-filter' })
  showModeFilter = false;

  @property({ type: String })
  mode: LibraryRecordModeFilter = 'all';

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
            // Do not trim: the controlled input would drop a trailing space.
            this._emit({ keyword: e.detail.value || '' });
          }}
        >
          <ui-icon slot="prefix" name="search" size="var(--icon-md)"></ui-icon>
        </ui-input>

        <div class="filters">
          ${this.showModeFilter
            ? html`<div class="control-group">
                <span class="sort-label">${msg('类型')}</span>
                <ui-select
                  class="mode-filter"
                  .value=${this.mode}
                  .options=${this._getModeOptions()}
                  aria-label="${msg('类型')}"
                  @change=${(e: CustomEvent<SelectChangeDetail>) => {
                    this._emit({ mode: e.detail.value as LibraryRecordModeFilter });
                  }}
                ></ui-select>
              </div>`
            : nothing}

          <div class="control-group sort-group">
            <span class="sort-label"> ${msg('排序')} </span>
            <ui-select
              .value=${this.sortBy}
              .options=${this.sortByOptions}
              aria-label="${msg('排序字段')}"
              @change=${(e: CustomEvent<SelectChangeDetail>) => {
                this._emit({ sortBy: e.detail.value as string });
              }}
            ></ui-select>
            <ui-select
              class="sort-direction"
              .value=${this.sortDirection}
              .options=${this._getSortDirectionOptions()}
              aria-label="${msg('排序方向')}"
              @change=${(e: CustomEvent<SelectChangeDetail>) => {
                this._emit({ sortDirection: e.detail.value as SortDirection });
              }}
            ></ui-select>
          </div>
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

  private _getModeOptions(): SelectOption[] {
    return [
      { value: 'all', label: msg('全部') },
      { value: 'shadowing', label: msg('影子') },
      { value: 'echo', label: msg('回声') },
    ];
  }

  private _emit(partial: Partial<LibraryListToolbarChangeDetail>): void {
    const detail: LibraryListToolbarChangeDetail = {
      keyword: partial.keyword ?? this.keyword,
      sortBy: partial.sortBy ?? this.sortBy,
      sortDirection: partial.sortDirection ?? this.sortDirection,
    };
    if (this.showModeFilter) {
      detail.mode = partial.mode ?? this.mode;
    }
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
