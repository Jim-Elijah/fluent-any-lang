import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { PortalHost } from './internal/portal-host.js';
import { computePlacement4 } from './internal/placement.js';
import { Z_INDEX } from './internal/z-index.js';

export type SelectSize = 'small' | 'middle' | 'large';
export type SelectMode = 'default' | 'multiple' | 'tags';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectOptionGroup = {
  label: string;
  options: SelectOption[];
};

export type SelectOptions = SelectOption | SelectOptionGroup;

export type SelectChangeDetail = {
  value: string | string[] | undefined;
  option: SelectOption | SelectOption[] | undefined;
  domEvent?: Event;
};

export type SelectOpenChangeDetail = { open: boolean };
export type SelectSearchDetail = { value: string };
export type SelectClearDetail = { domEvent?: Event };
export type SelectSelectDetail = {
  value: string;
  option: SelectOption;
  domEvent?: Event;
};

export type SelectUpdateOpenDetail = { open: boolean };

const DROPDOWN_GAP = 4;

const DROPDOWN_PORTAL_STYLES = css`
  .dropdown {
    position: fixed;
    z-index: var(--select-z, 1050);
    background: #fff;
    border: 1px solid var(--color-border, #d9d9d9);
    border-radius: var(--radius-md, 8px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
    box-sizing: border-box;
    pointer-events: auto;
    overflow: hidden;
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-text, rgba(0, 0, 0, 0.88));
  }

  .dropdown.in-container {
    position: absolute;
  }

  .search-wrap {
    padding: var(--space-sm);
    border-bottom: 1px solid #f0f0f0;
  }

  .search-input {
    width: 100%;
    height: 32px;
    padding: 0 11px;
    border: 1px solid var(--color-border, #d9d9d9);
    border-radius: 6px;
    box-sizing: border-box;
    outline: none;
    font: inherit;
  }

  .search-input:focus {
    border-color: var(--color-primary, #1677ff);
    box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
  }

  .option-list {
    max-height: 256px;
    overflow: auto;
    padding: var(--space-xs);
    margin: 0;
    list-style: none;
  }

  .option {
    min-height: 32px;
    padding: var(--space-xs) var(--space-md);
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
  }

  .option:hover:not(.disabled) {
    background: rgba(22, 119, 255, 0.08);
  }

  .option.active:not(.disabled) {
    background: rgba(22, 119, 255, 0.12);
  }

  .option.selected {
    font-weight: 500;
    color: var(--color-primary, #1677ff);
    background: rgba(22, 119, 255, 0.06);
  }

  .option.disabled {
    color: rgba(0, 0, 0, 0.25);
    cursor: not-allowed;
  }

  .empty,
  .loading {
    padding: var(--space-inline) var(--space-md);
    text-align: center;
    color: rgba(0, 0, 0, 0.45);
  }

  .loading::after {
    content: '';
    display: inline-block;
    width: 14px;
    height: 14px;
    margin-left: var(--space-sm);
    border: 2px solid rgba(22, 119, 255, 0.2);
    border-top-color: var(--color-primary, #1677ff);
    border-radius: 50%;
    animation: ui-select-spin 0.8s linear infinite;
    vertical-align: -2px;
  }

  @keyframes ui-select-spin {
    to {
      transform: rotate(360deg);
    }
  }
`.cssText;

export function isSelectOptionGroup(item: SelectOptions): item is SelectOptionGroup {
  return 'options' in item && Array.isArray(item.options);
}

export function flattenOptions(options: SelectOptions[]): SelectOption[] {
  const result: SelectOption[] = [];
  for (const item of options) {
    if (isSelectOptionGroup(item)) {
      result.push(...item.options);
    } else {
      result.push(item);
    }
  }
  return result;
}

export function findOption(value: string, options: SelectOptions[]): SelectOption | undefined {
  return flattenOptions(options).find((opt) => opt.value === value);
}

export function defaultFilterOption(input: string, option: SelectOption): boolean {
  return option.label.toLowerCase().includes(input.trim().toLowerCase());
}

@customElement('ui-select')
@localized()
export class UiSelect extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
      min-width: 120px;
      --select-height: 32px;
      --select-font-size: 14px;
      --select-padding-x: 11px;
    }

    :host([size='small']) {
      --select-height: 24px;
      --select-font-size: 13px;
      --select-padding-x: 7px;
    }

    :host([size='large']) {
      --select-height: 40px;
      --select-font-size: 16px;
      --select-padding-x: 11px;
    }

    :host([disabled]) {
      cursor: not-allowed;
    }

    .selector {
      display: flex;
      align-items: center;
      width: 100%;
      min-height: var(--select-height);
      padding: 0 calc(var(--select-padding-x) + 20px) 0 var(--select-padding-x);
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface, #fff);
      box-sizing: border-box;
      cursor: pointer;
      position: relative;
      font-size: var(--select-font-size);
      line-height: calc(var(--select-height) - 2px);
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }

    .selector:hover:not(.disabled) {
      border-color: var(--color-primary, #1677ff);
    }

    .selector.open:not(.disabled) {
      border-color: var(--color-primary, #1677ff);
      box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
    }

    .selector.disabled {
      background: rgba(0, 0, 0, 0.04);
      color: rgba(0, 0, 0, 0.25);
      cursor: not-allowed;
    }

    .selection {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .selection.placeholder {
      color: rgba(0, 0, 0, 0.25);
    }

    .suffix {
      position: absolute;
      right: var(--select-padding-x);
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      color: rgba(0, 0, 0, 0.25);
    }

    .arrow {
      display: inline-flex;
      transition: transform 0.2s ease;
      font-size: 10px;
      line-height: 1;
    }

    .arrow.open {
      transform: rotate(180deg);
    }

    .clear {
      border: 0;
      background: transparent;
      padding: 0;
      width: 14px;
      height: 14px;
      cursor: pointer;
      color: rgba(0, 0, 0, 0.25);
      display: grid;
      place-items: center;
      border-radius: 50%;
      font-size: 12px;
      line-height: 1;
    }

    .clear:hover {
      color: rgba(0, 0, 0, 0.45);
      background: rgba(0, 0, 0, 0.06);
    }

    .selector.disabled .clear {
      pointer-events: none;
    }
  `;

  @property({ attribute: false }) value?: string | string[];
  @property({ attribute: false }) defaultValue?: string | string[];

  @property({ type: Array, attribute: false }) options: SelectOptions[] = [];

  @property({ type: String }) placeholder = '';
  @property({ type: Boolean, attribute: 'allow-clear' }) allowClear = false;
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ type: String, reflect: true }) size: SelectSize = 'middle';
  @property({ type: Boolean, attribute: 'show-search' }) showSearch = false;
  @property({ attribute: false }) filterOption?: (input: string, option: SelectOption) => boolean;

  @property({ type: Boolean }) open?: boolean;
  @property({ type: Boolean, attribute: 'default-open' }) defaultOpen = false;

  @property({ type: String, reflect: true }) mode: SelectMode = 'default';
  @property({ type: String, attribute: 'not-found-content' }) notFoundContent = '';
  @property({ type: Boolean }) loading = false;

  @property({ attribute: false }) popupContainer: string | HTMLElement | null = 'body';
  @property({ type: Number, attribute: 'z-index' }) zIndex = Z_INDEX.DROPDOWN;

  @state() private _internalValue: string[] = [];
  @state() private _internalOpen = false;
  @state() private _searchValue = '';
  @state() private _activeIndex = -1;
  @state() private _pos = { top: 0, left: 0 };
  @state() private _dropdownWidth = 0;
  @state() private _positionInContainer = false;

  private get _selectorEl(): HTMLElement | null {
    return this.shadowRoot?.querySelector('.selector') as HTMLElement | null;
  }

  private _dropdownEl: HTMLDivElement | null = null;
  private _portal: PortalHost | null = null;
  private _layoutListener = () => this._updatePosition();

  private _globalBound = false;
  private _prevIsOpen = false;
  private _defaultValueInitialized = false;

  private readonly _captureOptions = { capture: true };
  private _docMouseDown = (e: MouseEvent) => this._onDocumentMouseDown(e);
  private _docKeyDown = (e: KeyboardEvent) => this._onDocumentKeyDown(e);
  private _onScrollOrResize = () => this._updatePosition();

  connectedCallback(): void {
    super.connectedCallback();
    if (typeof this.open !== 'boolean') {
      this._internalOpen = this.defaultOpen;
    }
  }

  disconnectedCallback(): void {
    if (this._globalBound) {
      this._unbindGlobal();
      this._globalBound = false;
    }
    this._destroyPortal();
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    this.style.setProperty('--select-z', String(this.zIndex));
    this._prevIsOpen = this._isOpen();
  }

  protected updated(changed: PropertyValues): void {
    if (
      !this._defaultValueInitialized &&
      this.defaultValue !== undefined &&
      this.value === undefined
    ) {
      this._internalValue = this._normalizeToArray(this.defaultValue);
      this._defaultValueInitialized = true;
    }

    const isOpen = this._isOpen();
    const wasOpen = this._prevIsOpen;

    if (isOpen !== wasOpen) {
      this._onOpenStateChanged(isOpen);
    } else if (isOpen) {
      this._onDropdownContentChanged(changed);
    }

    if (changed.has('zIndex')) {
      this.style.setProperty('--select-z', String(this.zIndex));
    }

    this._prevIsOpen = isOpen;
  }

  private _dispatch(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _isControlledValue(): boolean {
    return this.value !== undefined;
  }

  private _isControlledOpen(): boolean {
    return typeof this.open === 'boolean';
  }

  private _isOpen(): boolean {
    return this._isControlledOpen() ? this.open! : this._internalOpen;
  }

  private _normalizeToArray(raw: string | string[] | undefined): string[] {
    if (raw === undefined || raw === null || raw === '') {
      return [];
    }
    return Array.isArray(raw) ? raw : [raw];
  }

  private _getSelectedValues(): string[] {
    const raw = this._isControlledValue() ? this.value : this._internalValue;
    return this._normalizeToArray(raw);
  }

  private _getExternalValue(values: string[]): string | string[] | undefined {
    if (this.mode === 'default') {
      return values[0];
    }
    return values;
  }

  private _getExternalOption(values: string[]): SelectOption | SelectOption[] | undefined {
    const matched = values
      .map((v) => findOption(v, this.options))
      .filter((opt): opt is SelectOption => opt !== undefined);

    if (this.mode === 'default') {
      return matched[0];
    }
    return matched;
  }

  private _getDisplayLabel(): string {
    const values = this._getSelectedValues();
    if (!values.length) {
      return '';
    }

    if (this.mode === 'default') {
      return findOption(values[0], this.options)?.label ?? values[0];
    }

    return values.map((v) => findOption(v, this.options)?.label ?? v).join(', ');
  }

  private _getFilterFn(): (input: string, option: SelectOption) => boolean {
    return this.filterOption ?? defaultFilterOption;
  }

  private _getFilteredOptions(): SelectOption[] {
    const flat = flattenOptions(this.options);
    const input = this._searchValue;
    if (!this.showSearch || !input.trim()) {
      return flat;
    }
    const filterFn = this._getFilterFn();
    return flat.filter((opt) => filterFn(input, opt));
  }

  private _getEnabledFilteredOptions(): SelectOption[] {
    return this._getFilteredOptions().filter((opt) => !opt.disabled);
  }

  private _assignOpen(next: boolean): void {
    if (!this._isControlledOpen()) {
      this._internalOpen = next;
    }
  }

  private _setOpen(next: boolean): void {
    if (this.disabled && next) {
      return;
    }

    const prev = this._isOpen();
    if (prev === next) {
      return;
    }

    this._assignOpen(next);
    this._dispatch('open-change', { open: next } satisfies SelectOpenChangeDetail);
    this._dispatch('update:open', { open: next } satisfies SelectUpdateOpenDetail);

    if (!next) {
      this._searchValue = '';
      this._activeIndex = -1;
    }
  }

  private _toggleOpen(): void {
    this._setOpen(!this._isOpen());
  }

  private _commitSelect(values: string[], domEvent?: Event): void {
    if (!this._isControlledValue()) {
      this._internalValue = values;
    }

    const externalValue = this._getExternalValue(values);
    const externalOption = this._getExternalOption(values);

    if (this.mode === 'default' && values.length === 1) {
      const option = findOption(values[0], this.options);
      if (option) {
        this._dispatch('select', {
          value: values[0],
          option,
          domEvent,
        } satisfies SelectSelectDetail);
      }
    }

    this._dispatch('change', {
      value: externalValue,
      option: externalOption,
      domEvent,
    } satisfies SelectChangeDetail);

    if (this.mode === 'default') {
      this._setOpen(false);
    }
  }

  private _handleOptionClick(option: SelectOption, domEvent: Event): void {
    if (option.disabled) {
      return;
    }

    switch (this.mode) {
      case 'multiple':
      case 'tags':
        // 预留多选：toggle 选中项，不关闭下拉
        break;
      case 'default':
      default:
        this._commitSelect([option.value], domEvent);
        break;
    }
  }

  private _handleClear(domEvent: MouseEvent): void {
    domEvent.stopPropagation();
    if (this.disabled) {
      return;
    }
    if (!this._getSelectedValues().length) {
      return;
    }

    if (!this._isControlledValue()) {
      this._internalValue = [];
    }

    this._dispatch('clear', { domEvent } satisfies SelectClearDetail);
    this._dispatch('change', {
      value: undefined,
      option: undefined,
      domEvent,
    } satisfies SelectChangeDetail);
  }

  private _handleSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this._searchValue = input.value;
    this._activeIndex = -1;
    this._dispatch('search', { value: this._searchValue } satisfies SelectSearchDetail);
    requestAnimationFrame(() => {
      this._computeDropdownPosition();
      this._syncPortal();
    });
  }

  private _handleSelectorClick(): void {
    if (this.disabled) {
      return;
    }
    this._toggleOpen();
  }

  private _handleSelectorKeyDown(event: KeyboardEvent): void {
    if (this.disabled) {
      return;
    }

    if (!this._isOpen()) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this._setOpen(true);
      }
      return;
    }

    this._handleDropdownKeyDown(event);
  }

  private _handleDropdownKeyDown(event: KeyboardEvent): void {
    const enabled = this._getEnabledFilteredOptions();

    if (event.key === 'Escape') {
      event.preventDefault();
      this._setOpen(false);
      this._selectorEl?.focus();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!enabled.length) {
        return;
      }
      this._activeIndex = (this._activeIndex + 1) % enabled.length;
      this._syncPortal();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!enabled.length) {
        return;
      }
      this._activeIndex = this._activeIndex <= 0 ? enabled.length - 1 : this._activeIndex - 1;
      this._syncPortal();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const option = enabled[this._activeIndex];
      if (option) {
        this._handleOptionClick(option, event);
      }
    }
  }

  private _getContainer(): HTMLElement {
    return this._portal?.getContainer() ?? this._resolveContainer();
  }

  private _resolveContainer(): HTMLElement {
    const c = this.popupContainer;
    if (!c) {
      return document.body;
    }
    if (typeof c === 'string') {
      if (c === 'body') {
        return document.body;
      }
      return (document.querySelector(c) as HTMLElement | null) ?? document.body;
    }
    return c;
  }

  private _computeDropdownPosition(): void {
    if (!this._selectorEl) {
      return;
    }

    const triggerRect = this._selectorEl.getBoundingClientRect();
    const container = this._getContainer();
    const popupRect = this._dropdownEl?.getBoundingClientRect();
    const height = popupRect?.height ?? 200;

    const placed = computePlacement4({
      placement: 'bottom',
      triggerRect,
      popupWidth: triggerRect.width,
      popupHeight: height,
      gap: DROPDOWN_GAP,
      container,
      alignTo: 'trigger-width',
      flip: true,
    });

    this._dropdownWidth = placed.popupWidth;
    this._positionInContainer = placed.inContainer;
    this._pos = { top: placed.top, left: placed.left };
  }

  private _ensurePortal(): PortalHost {
    if (!this._portal) {
      this._portal = new PortalHost({
        dataAttr: 'data-ui-select-portal',
        styleText: DROPDOWN_PORTAL_STYLES,
        zIndex: this.zIndex,
        popupContainer: this.popupContainer,
      });
      this._portal.onLayoutChange(this._layoutListener);
    } else {
      this._portal.updateOptions({ zIndex: this.zIndex, popupContainer: this.popupContainer });
    }
    this._portal.ensureMount();
    return this._portal;
  }

  private _syncPortal(): void {
    if (!this._isOpen()) {
      this._portal?.hide();
      this._dropdownEl = null;
      return;
    }

    const portal = this._ensurePortal();
    portal.render(this._dropdownTemplate());
    this._dropdownEl = portal.getPopupEl('.dropdown') as HTMLDivElement | null;
  }

  private _destroyPortal(): void {
    this._portal?.destroy();
    this._portal = null;
    this._dropdownEl = null;
  }

  private _dropdownTemplate() {
    const filtered = this._getFilteredOptions();
    const selectedValues = this._getSelectedValues();
    const enabled = this._getEnabledFilteredOptions();
    const activeOption = this._activeIndex >= 0 ? enabled[this._activeIndex] : undefined;

    return html`
      <div
        class=${classMap({ dropdown: true, 'in-container': this._positionInContainer })}
        style=${styleMap({
          top: `${this._pos.top}px`,
          left: `${this._pos.left}px`,
          width: `${this._dropdownWidth}px`,
          zIndex: String(this.zIndex),
          '--select-z': String(this.zIndex),
        })}
        role="listbox"
        aria-label="${msg('选项')}"
        @mousedown=${(e: MouseEvent) => e.stopPropagation()}
        @keydown=${this._handleDropdownKeyDown}
      >
        ${this.showSearch
          ? html`
              <div class="search-wrap">
                <input
                  class="search-input"
                  type="text"
                  .value=${this._searchValue}
                  placeholder="${msg('搜索')}"
                  @input=${this._handleSearchInput}
                  @keydown=${this._handleDropdownKeyDown}
                />
              </div>
            `
          : nothing}
        ${this.loading
          ? html`<div class="loading">${msg('加载中')}</div>`
          : filtered.length
            ? html`
                <ul class="option-list">
                  ${filtered.map((option) => {
                    const isSelected = selectedValues.includes(option.value);
                    const isActive = activeOption?.value === option.value;
                    return html`
                      <li
                        class=${classMap({
                          option: true,
                          selected: isSelected,
                          active: isActive,
                          disabled: !!option.disabled,
                        })}
                        role="option"
                        aria-selected=${isSelected}
                        @click=${(e: Event) => this._handleOptionClick(option, e)}
                      >
                        ${option.label}
                      </li>
                    `;
                  })}
                </ul>
              `
            : html`<div class="empty">${this.notFoundContent || msg('无匹配项')}</div>`}
      </div>
    `;
  }

  private _updatePosition(): void {
    if (!this._selectorEl || !this._isOpen()) {
      return;
    }
    this._computeDropdownPosition();
    if (this._dropdownEl) {
      Object.assign(this._dropdownEl.style, {
        top: `${this._pos.top}px`,
        left: `${this._pos.left}px`,
        width: `${this._dropdownWidth}px`,
      });
    }
  }

  private _focusSearchInput(): void {
    if (!this.showSearch) {
      return;
    }
    requestAnimationFrame(() => {
      const input = this._portal?.getPopupEl('.search-input') as HTMLInputElement | null;
      input?.focus();
    });
  }

  private _onOpenStateChanged(isOpen: boolean): void {
    if (isOpen) {
      if (!this._globalBound) {
        this._bindGlobal();
        this._globalBound = true;
      }
      requestAnimationFrame(() => {
        this._computeDropdownPosition();
        this._syncPortal();
        requestAnimationFrame(() => {
          this._computeDropdownPosition();
          this._updatePosition();
          this._focusSearchInput();
        });
      });
      return;
    }

    if (this._globalBound) {
      this._unbindGlobal();
      this._globalBound = false;
    }
    this._portal?.hide();
  }

  private _onDropdownContentChanged(changed: PropertyValues): void {
    const needsSync =
      changed.has('options') ||
      changed.has('loading') ||
      changed.has('notFoundContent') ||
      changed.has('showSearch') ||
      changed.has('_searchValue') ||
      changed.has('_activeIndex') ||
      changed.has('zIndex');

    if (needsSync || changed.has('_pos') || changed.has('_dropdownWidth')) {
      requestAnimationFrame(() => {
        this._computeDropdownPosition();
        this._syncPortal();
      });
    }
  }

  private _bindGlobal(): void {
    window.addEventListener('mousedown', this._docMouseDown, this._captureOptions);
    window.addEventListener('keydown', this._docKeyDown, this._captureOptions);
    window.addEventListener('scroll', this._onScrollOrResize, { capture: true });
    window.addEventListener('resize', this._onScrollOrResize);

    const container = this._getContainer();
    if (container !== document.body) {
      container.addEventListener('scroll', this._onScrollOrResize, { capture: true });
    }
  }

  private _unbindGlobal(): void {
    window.removeEventListener('mousedown', this._docMouseDown, this._captureOptions);
    window.removeEventListener('keydown', this._docKeyDown, this._captureOptions);
    window.removeEventListener('scroll', this._onScrollOrResize, { capture: true });
    window.removeEventListener('resize', this._onScrollOrResize);

    const container = this._getContainer();
    if (container !== document.body) {
      container.removeEventListener('scroll', this._onScrollOrResize, { capture: true });
    }
  }

  private _isEventInside(e: Event): boolean {
    const path = e.composedPath();
    if (path.includes(this)) {
      return true;
    }
    const portalHost = this._portal?.getHostElement();
    if (portalHost && path.includes(portalHost)) {
      return true;
    }
    return false;
  }

  private _onDocumentMouseDown(e: MouseEvent): void {
    if (!this._isOpen()) {
      return;
    }
    if (this._isEventInside(e)) {
      return;
    }
    this._setOpen(false);
  }

  private _onDocumentKeyDown(e: KeyboardEvent): void {
    if (!this._isOpen()) {
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this._setOpen(false);
      this._selectorEl?.focus();
    }
  }

  protected render() {
    const displayLabel = this._getDisplayLabel();
    const hasValue = this._getSelectedValues().length > 0;
    const isOpen = this._isOpen();
    const showClear = this.allowClear && hasValue && !this.disabled;

    return html`
      <div
        class=${classMap({
          selector: true,
          open: isOpen,
          disabled: this.disabled,
        })}
        role="combobox"
        tabindex=${this.disabled ? -1 : 0}
        aria-expanded=${isOpen ? 'true' : 'false'}
        aria-haspopup="listbox"
        aria-disabled=${this.disabled ? 'true' : 'false'}
        @click=${this._handleSelectorClick}
        @keydown=${this._handleSelectorKeyDown}
      >
        <span class=${classMap({ selection: true, placeholder: !hasValue })}>
          ${hasValue ? displayLabel : this.placeholder || msg('请选择')}
        </span>
        <span class="suffix">
          ${showClear
            ? html`
                <button
                  class="clear"
                  type="button"
                  aria-label="${msg('清空')}"
                  @click=${this._handleClear}
                >
                  ×
                </button>
              `
            : nothing}
          <span class=${classMap({ arrow: true, open: isOpen })} aria-hidden="true">▼</span>
        </span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-select': UiSelect;
  }
}

/** ui-select 事件类型（监听时使用显式类型，避免与 ui-menu 等同名事件冲突） */
export interface UiSelectEventMap {
  change: CustomEvent<SelectChangeDetail>;
  select: CustomEvent<SelectSelectDetail>;
  clear: CustomEvent<SelectClearDetail>;
  'open-change': CustomEvent<SelectOpenChangeDetail>;
  search: CustomEvent<SelectSearchDetail>;
  'update:open': CustomEvent<SelectUpdateOpenDetail>;
}
