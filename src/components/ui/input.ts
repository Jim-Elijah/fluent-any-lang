import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

export type InputSize = 'small' | 'middle' | 'large';
export type InputStatus = '' | 'error' | 'warning';

export type InputChangeDetail = {
  value: string;
  domEvent: Event;
};

export type InputPressEnterDetail = {
  value: string;
  domEvent: KeyboardEvent;
};

export type InputClearDetail = {
  domEvent?: Event;
};

export type InputSearchDetail = {
  value: string;
  domEvent?: Event;
  source: 'input' | 'clear';
};

export type InputPasswordVisibleChangeDetail = {
  passwordVisible: boolean;
};

export type InputAutoSize = boolean | { minRows?: number; maxRows?: number };

const INPUT_BASE_STYLES = css`
  :host {
    display: inline-block;
    width: 100%;
    --input-height: 32px;
    --input-font-size: 14px;
    --input-padding-x: 11px;
    --input-padding-y: 4px;
  }

  :host([size='small']) {
    --input-height: 24px;
    --input-font-size: 13px;
    --input-padding-x: 7px;
    --input-padding-y: 0px;
  }

  :host([size='large']) {
    --input-height: 40px;
    --input-font-size: 16px;
    --input-padding-x: 11px;
    --input-padding-y: 7px;
  }

  :host([disabled]) {
    cursor: not-allowed;
  }

  .wrapper {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: var(--input-height);
    border: 1px solid var(--color-border, #d9d9d9);
    border-radius: var(--radius-md, 8px);
    background: var(--color-surface, #fff);
    box-sizing: border-box;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
    position: relative;
    font-size: var(--input-font-size);
    line-height: 1.5;
  }

  .wrapper:hover:not(.disabled) {
    border-color: var(--color-primary-hover, #4096ff);
  }

  .wrapper.focused:not(.disabled) {
    border-color: var(--color-primary, #1677ff);
    box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
  }

  .wrapper.disabled {
    background: rgba(0, 0, 0, 0.04);
    color: rgba(0, 0, 0, 0.25);
    cursor: not-allowed;
  }

  .wrapper.status-error {
    border-color: #ff4d4f;
  }

  .wrapper.status-error.focused {
    box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.1);
  }

  .wrapper.status-warning {
    border-color: #faad14;
  }

  .wrapper.status-warning.focused {
    box-shadow: 0 0 0 2px rgba(250, 173, 20, 0.1);
  }

  .prefix,
  .suffix {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: rgba(0, 0, 0, 0.45);
  }

  .prefix {
    padding-left: var(--input-padding-x);
  }

  .suffix {
    padding-right: var(--input-padding-x);
    gap: 4px;
  }

  .control {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: inherit;
    box-sizing: border-box;
    padding: var(--input-padding-y) var(--input-padding-x);
    width: 100%;
  }

  .control::placeholder {
    color: rgba(0, 0, 0, 0.25);
  }

  .control:disabled {
    cursor: not-allowed;
  }

  .wrapper.has-prefix .control {
    padding-left: 8px;
  }

  .wrapper.has-suffix .control {
    padding-right: 8px;
  }

  .clear,
  .icon-btn {
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
    flex-shrink: 0;
  }

  .clear:hover,
  .icon-btn:hover:not(:disabled) {
    color: rgba(0, 0, 0, 0.45);
    background: rgba(0, 0, 0, 0.06);
  }

  .clear:disabled,
  .icon-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .count {
    color: rgba(0, 0, 0, 0.45);
    font-size: 12px;
    white-space: nowrap;
    user-select: none;
  }

  .search-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: calc(var(--input-height) - 2px);
    margin: -1px -1px -1px 0;
    padding: 0 15px;
    border: 0;
    border-radius: 0 var(--radius-md, 8px) var(--radius-md, 8px) 0;
    background: var(--color-surface, #fff);
    border-left: 1px solid var(--color-border, #d9d9d9);
    color: rgba(0, 0, 0, 0.88);
    cursor: pointer;
    font: inherit;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .search-btn.primary {
    background: var(--color-primary, #1677ff);
    border-left-color: var(--color-primary, #1677ff);
    color: #fff;
  }

  .search-btn.primary:hover:not(:disabled) {
    background: var(--color-primary-hover, #4096ff);
    border-left-color: var(--color-primary-hover, #4096ff);
  }

  .search-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .search-btn .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(22, 119, 255, 0.2);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: ui-input-spin 0.8s linear infinite;
  }

  .wrapper.with-enter-button {
    padding-right: 0;
  }

  .wrapper.with-enter-button .control {
    padding-right: var(--input-padding-x);
  }

  .wrapper.with-enter-button .suffix {
    padding-right: 0;
  }

  @keyframes ui-input-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

abstract class InputBase extends LitElement {
  static styles = INPUT_BASE_STYLES;

  @property({ type: String }) value?: string;
  @property({ type: String, attribute: 'default-value' }) defaultValue?: string;
  @property({ type: String }) placeholder = '';
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ type: Boolean, attribute: 'allow-clear' }) allowClear = false;
  @property({ type: String, reflect: true }) size: InputSize = 'middle';
  @property({ type: String, reflect: true }) status: InputStatus = '';
  @property({ type: Number, attribute: 'max-length' }) maxLength?: number;
  @property({ type: String }) name = '';
  @property({ type: String }) autocomplete = '';
  @property({ type: String }) id = '';
  @property({ type: Boolean }) readonly = false;

  @state() protected _focused = false;
  @state() protected _internalValue = '';

  connectedCallback(): void {
    super.connectedCallback();
    if (this.value === undefined && this.defaultValue !== undefined) {
      this._internalValue = this.defaultValue;
    }
  }

  protected _displayValue(): string {
    return this.value ?? this._internalValue;
  }

  protected _isControlledValue(): boolean {
    return this.value !== undefined;
  }

  protected _dispatch(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  protected _showClear(): boolean {
    return this.allowClear && !this.disabled && this._displayValue().length > 0;
  }

  protected _emitChange(domEvent: Event, value = this._readControlValue()): void {
    this._dispatch('change', { value, domEvent } satisfies InputChangeDetail);
    this._dispatch('update:value', { value });
  }

  protected _emitClear(domEvent?: Event): void {
    this._dispatch('clear', { domEvent } satisfies InputClearDetail);
  }

  protected _handleInput(domEvent: Event): void {
    const next = this._readControlValue();
    if (!this._isControlledValue()) {
      this._internalValue = next;
    }
    this._emitChange(domEvent, next);
  }

  protected _handleFocus(): void {
    this._focused = true;
  }

  protected _handleBlur(): void {
    this._focused = false;
  }

  protected _handleKeyDown(domEvent: KeyboardEvent): void {
    if (domEvent.key === 'Enter') {
      this._dispatch('press-enter', {
        value: this._readControlValue(),
        domEvent,
      } satisfies InputPressEnterDetail);
    }
  }

  protected _handleClearClick(domEvent: MouseEvent): void {
    domEvent.preventDefault();
    domEvent.stopPropagation();
    if (this.disabled) {
      return;
    }
    if (!this._isControlledValue()) {
      this._internalValue = '';
    }
    this._emitChange(domEvent, '');
    this._emitClear(domEvent);
    this._afterClear(domEvent);
    this._focusControl();
  }

  protected _afterClear(domEvent?: Event): void {
    void domEvent;
  }

  protected abstract _readControlValue(): string;
  protected abstract _focusControl(): void;
  protected abstract _renderControl(): TemplateResult;
  protected abstract _controlSelector(): string;

  focus(options?: { preventScroll?: boolean }): void {
    const el = this.renderRoot.querySelector(this._controlSelector()) as HTMLElement | null;
    el?.focus(options);
  }

  blur(): void {
    const el = this.renderRoot.querySelector(this._controlSelector()) as HTMLElement | null;
    el?.blur();
  }

  protected _renderClearButton(): TemplateResult | typeof nothing {
    if (!this._showClear()) {
      return nothing;
    }
    return html`
      <button
        type="button"
        class="clear"
        aria-label="${msg('清空')}"
        ?disabled="${this.disabled}"
        @click="${this._handleClearClick}"
      >
        ×
      </button>
    `;
  }

  protected _renderAffixWrapper(
    control: TemplateResult,
    extraSuffix: TemplateResult | typeof nothing = nothing,
    options: { withEnterButton?: boolean } = {},
  ): TemplateResult {
    const hasPrefix = this.querySelector('[slot="prefix"]') !== null;
    const hasSuffix =
      this.querySelector('[slot="suffix"]') !== null ||
      this._showClear() ||
      extraSuffix !== nothing;

    return html`
      <div
        class=${classMap({
          wrapper: true,
          disabled: this.disabled,
          focused: this._focused,
          'has-prefix': hasPrefix,
          'has-suffix': hasSuffix,
          'with-enter-button': !!options.withEnterButton,
          'status-error': this.status === 'error',
          'status-warning': this.status === 'warning',
        })}
      >
        <span class="prefix"><slot name="prefix"></slot></span>
        ${control}
        <span class="suffix">
          ${this._renderClearButton()} ${extraSuffix}
          <slot name="suffix"></slot>
        </span>
      </div>
    `;
  }
}

@localized()
@customElement('ui-input')
export class UiInput extends InputBase {
  @property({ type: String }) type = 'text';

  private get _inputEl(): HTMLInputElement | null {
    return this.renderRoot.querySelector('.control') as HTMLInputElement | null;
  }

  protected _readControlValue(): string {
    return this._inputEl?.value ?? this._displayValue();
  }

  protected _focusControl(): void {
    this._inputEl?.focus();
  }

  protected _controlSelector(): string {
    return 'input.control';
  }

  protected _renderControl(): TemplateResult {
    return html`
      <input
        class="control"
        .type="${this.type}"
        .value="${this._displayValue()}"
        placeholder="${this.placeholder}"
        ?disabled="${this.disabled}"
        ?readonly="${this.readonly}"
        name="${this.name || nothing}"
        id="${this.id || nothing}"
        autocomplete="${this.autocomplete || nothing}"
        maxlength="${this.maxLength ?? nothing}"
        @input="${this._handleInput}"
        @focus="${this._handleFocus}"
        @blur="${this._handleBlur}"
        @keydown="${this._handleKeyDown}"
      />
    `;
  }

  render() {
    return this._renderAffixWrapper(this._renderControl());
  }
}

@localized()
@customElement('ui-input-textarea')
export class UiInputTextArea extends InputBase {
  @property({ type: Number }) rows = 4;
  @property({ attribute: false }) autoSize: InputAutoSize = false;
  @property({ type: Boolean, attribute: 'show-count' }) showCount = false;

  private get _textareaEl(): HTMLTextAreaElement | null {
    return this.renderRoot.querySelector('.control') as HTMLTextAreaElement | null;
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has('value') || changed.has('autoSize')) {
      this._resizeTextArea();
    }
  }

  protected firstUpdated(): void {
    this._resizeTextArea();
  }

  protected _readControlValue(): string {
    return this._textareaEl?.value ?? this._displayValue();
  }

  protected _focusControl(): void {
    this._textareaEl?.focus();
  }

  protected _controlSelector(): string {
    return 'textarea.control';
  }

  protected _handleInput(domEvent: Event): void {
    super._handleInput(domEvent);
    this._resizeTextArea();
  }

  private _resizeTextArea(): void {
    const el = this._textareaEl;
    if (!el || !this.autoSize) {
      return;
    }

    el.style.height = 'auto';
    const style = getComputedStyle(el);
    const lineHeight = Number.parseFloat(style.lineHeight) || 20;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;

    const config = typeof this.autoSize === 'object' ? this.autoSize : {};
    const minRows = config.minRows ?? this.rows;
    const maxRows = config.maxRows;

    let height = el.scrollHeight;
    const minHeight = lineHeight * minRows + paddingTop + paddingBottom + borderTop + borderBottom;
    height = Math.max(height, minHeight);

    if (maxRows) {
      const maxHeight =
        lineHeight * maxRows + paddingTop + paddingBottom + borderTop + borderBottom;
      height = Math.min(height, maxHeight);
      el.style.overflowY = height >= maxHeight ? 'auto' : 'hidden';
    } else {
      el.style.overflowY = 'hidden';
    }

    el.style.height = `${height}px`;
  }

  private _renderCount(): TemplateResult | typeof nothing {
    if (!this.showCount) {
      return nothing;
    }
    const count = this._displayValue().length;
    const text = this.maxLength !== undefined ? `${count} / ${this.maxLength}` : `${count}`;
    return html`<span class="count">${text}</span>`;
  }

  protected _renderControl(): TemplateResult {
    const autoSizeStyle = this.autoSize ? 'overflow-y: hidden; resize: none;' : '';
    return html`
      <textarea
        class="control"
        .value="${this._displayValue()}"
        placeholder="${this.placeholder}"
        ?disabled="${this.disabled}"
        ?readonly="${this.readonly}"
        name="${this.name || nothing}"
        id="${this.id || nothing}"
        autocomplete="${this.autocomplete || nothing}"
        maxlength="${this.maxLength ?? nothing}"
        rows="${this.rows}"
        style="${autoSizeStyle}"
        @input="${this._handleInput}"
        @focus="${this._handleFocus}"
        @blur="${this._handleBlur}"
        @keydown="${this._handleKeyDown}"
      ></textarea>
    `;
  }

  render() {
    return this._renderAffixWrapper(this._renderControl(), this._renderCount());
  }
}

@localized()
@customElement('ui-input-search')
export class UiInputSearch extends InputBase {
  @property({ attribute: false }) enterButton: boolean | string = false;
  @property({ type: Boolean }) loading = false;

  private get _inputEl(): HTMLInputElement | null {
    return this.renderRoot.querySelector('.control') as HTMLInputElement | null;
  }

  protected _readControlValue(): string {
    return this._inputEl?.value ?? this._displayValue();
  }

  protected _focusControl(): void {
    this._inputEl?.focus();
  }

  protected _controlSelector(): string {
    return 'input.control';
  }

  protected override _afterClear(domEvent?: Event): void {
    this._triggerSearch('', domEvent, 'clear');
  }

  protected _handleKeyDown(domEvent: KeyboardEvent): void {
    super._handleKeyDown(domEvent);
    if (domEvent.key === 'Enter') {
      this._triggerSearch(this._readControlValue(), domEvent, 'input');
    }
  }

  private _triggerSearch(
    value: string,
    domEvent: Event | undefined,
    source: 'input' | 'clear',
  ): void {
    this._dispatch('search', { value, domEvent, source } satisfies InputSearchDetail);
  }

  private _handleSearchClick(domEvent: MouseEvent): void {
    domEvent.preventDefault();
    if (this.disabled || this.loading) {
      return;
    }
    this._triggerSearch(this._readControlValue(), domEvent, 'input');
  }

  private _renderSearchIcon(): TemplateResult {
    return html`
      <button
        type="button"
        class="icon-btn"
        aria-label="${msg('搜索')}"
        ?disabled="${this.disabled || this.loading}"
        @click="${this._handleSearchClick}"
      >
        ⌕
      </button>
    `;
  }

  private _renderEnterButton(): TemplateResult | typeof nothing {
    if (!this.enterButton) {
      return nothing;
    }
    const label = typeof this.enterButton === 'string' ? this.enterButton : msg('搜索');
    return html`
      <button
        type="button"
        class=${classMap({ 'search-btn': true, primary: this.enterButton === true })}
        ?disabled="${this.disabled || this.loading}"
        @click="${this._handleSearchClick}"
      >
        ${this.loading ? html`<span class="spinner"></span>` : label}
      </button>
    `;
  }

  protected _renderControl(): TemplateResult {
    return html`
      <input
        class="control"
        type="search"
        .value="${this._displayValue()}"
        placeholder="${this.placeholder}"
        ?disabled="${this.disabled}"
        ?readonly="${this.readonly}"
        name="${this.name || nothing}"
        id="${this.id || nothing}"
        autocomplete="${this.autocomplete || nothing}"
        maxlength="${this.maxLength ?? nothing}"
        @input="${this._handleInput}"
        @focus="${this._handleFocus}"
        @blur="${this._handleBlur}"
        @keydown="${this._handleKeyDown}"
      />
    `;
  }

  render() {
    const suffix = this.enterButton ? this._renderEnterButton() : this._renderSearchIcon();
    return this._renderAffixWrapper(this._renderControl(), suffix, {
      withEnterButton: !!this.enterButton,
    });
  }
}

@localized()
@customElement('ui-input-password')
export class UiInputPassword extends InputBase {
  @property({ type: Boolean, attribute: 'visibility-toggle' }) visibilityToggle = true;
  @property({ type: Boolean, attribute: 'password-visible' }) passwordVisible?: boolean;

  @state() private _internalPasswordVisible = false;

  private get _inputEl(): HTMLInputElement | null {
    return this.renderRoot.querySelector('.control') as HTMLInputElement | null;
  }

  private get _isPasswordVisible(): boolean {
    return typeof this.passwordVisible === 'boolean'
      ? this.passwordVisible
      : this._internalPasswordVisible;
  }

  protected _readControlValue(): string {
    return this._inputEl?.value ?? this._displayValue();
  }

  protected _focusControl(): void {
    this._inputEl?.focus();
  }

  protected _controlSelector(): string {
    return 'input.control';
  }

  private _handleVisibilityToggle(domEvent: MouseEvent): void {
    domEvent.preventDefault();
    if (this.disabled || !this.visibilityToggle) {
      return;
    }
    const next = !this._isPasswordVisible;
    if (typeof this.passwordVisible !== 'boolean') {
      this._internalPasswordVisible = next;
    }
    this._dispatch('password-visible-change', {
      passwordVisible: next,
    } satisfies InputPasswordVisibleChangeDetail);
  }

  private _renderVisibilityToggle(): TemplateResult | typeof nothing {
    if (!this.visibilityToggle) {
      return nothing;
    }
    const label = this._isPasswordVisible ? 'Hide password' : 'Show password';
    const icon = this._isPasswordVisible ? '🙈' : '👁';
    return html`
      <button
        type="button"
        class="icon-btn"
        aria-label="${label}"
        ?disabled="${this.disabled}"
        @click="${this._handleVisibilityToggle}"
      >
        ${icon}
      </button>
    `;
  }

  protected _renderControl(): TemplateResult {
    return html`
      <input
        class="control"
        .type="${this._isPasswordVisible ? 'text' : 'password'}"
        .value="${this._displayValue()}"
        placeholder="${this.placeholder}"
        ?disabled="${this.disabled}"
        ?readonly="${this.readonly}"
        name="${this.name || nothing}"
        id="${this.id || nothing}"
        autocomplete="${this.autocomplete || nothing}"
        maxlength="${this.maxLength ?? nothing}"
        @input="${this._handleInput}"
        @focus="${this._handleFocus}"
        @blur="${this._handleBlur}"
        @keydown="${this._handleKeyDown}"
      />
    `;
  }

  render() {
    return this._renderAffixWrapper(this._renderControl(), this._renderVisibilityToggle());
  }
}

/** antd 风格的复合组件入口 */
export const Input = Object.assign(UiInput, {
  TextArea: UiInputTextArea,
  Search: UiInputSearch,
  Password: UiInputPassword,
});

declare global {
  interface HTMLElementTagNameMap {
    'ui-input': UiInput;
    'ui-input-textarea': UiInputTextArea;
    'ui-input-search': UiInputSearch;
    'ui-input-password': UiInputPassword;
  }
}

/** ui-input 事件类型（监听时使用显式类型） */
export interface UiInputEventMap {
  change: CustomEvent<InputChangeDetail>;
  'press-enter': CustomEvent<InputPressEnterDetail>;
  clear: CustomEvent<InputClearDetail>;
  'update:value': CustomEvent<{ value: string }>;
}

export interface UiInputSearchEventMap extends UiInputEventMap {
  search: CustomEvent<InputSearchDetail>;
}

export interface UiInputPasswordEventMap extends UiInputEventMap {
  'password-visible-change': CustomEvent<InputPasswordVisibleChangeDetail>;
}
