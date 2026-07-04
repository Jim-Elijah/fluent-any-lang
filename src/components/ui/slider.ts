import { css, html, LitElement, type TemplateResult } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import './tooltip.js';
import type { TooltipPlacement } from './tooltip.js';

export type SliderOrientation = 'horizontal' | 'vertical';

export type SliderMarkLabel = string | TemplateResult;

export type SliderMarkItem = {
  style?: Record<string, string>;
  label: SliderMarkLabel;
};

/** antd marks：key 为 [min, max] 内的数值 */
export type SliderMarks = Record<number, SliderMarkLabel | SliderMarkItem>;

export type SliderTooltipFormatter = ((value: number) => string | null) | null;

export type SliderTooltipConfig = {
  /** 值为 true 时始终显示；false 时始终隐藏；未设置时 hover / 拖拽 / 聚焦时显示 */
  open?: boolean;
  placement?: TooltipPlacement;
  /** antd getPopupContainer：函数、选择器或 HTMLElement */
  getPopupContainer?: ((triggerNode: HTMLElement) => HTMLElement) | string | HTMLElement | null;
  /** 为 null 时隐藏 Tooltip */
  formatter?: SliderTooltipFormatter;
  autoAdjustOverflow?: boolean;
};

export type SliderChangeDetail = { value: number };
export type SliderChangeCompleteDetail = { value: number };
export type SliderUpdateValueDetail = { value: number };

const HANDLE_SIZE = 10;
const HANDLE_SIZE_ACTIVE = 12;
const RAIL_SIZE = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function snapToStep(value: number, min: number, max: number, step: number): number {
  if (step <= 0) return clamp(value, min, max);
  const stepped = min + Math.round((value - min) / step) * step;
  return clamp(stepped, min, max);
}

function hasMarks(marks: SliderMarks | null | undefined): marks is SliderMarks {
  return marks != null && Object.keys(marks).length > 0;
}

function collectMarkValues(marks: SliderMarks, min: number, max: number): number[] {
  const values = new Set<number>([min, max]);
  for (const key of Object.keys(marks)) {
    const n = Number(key);
    if (!Number.isNaN(n) && n >= min && n <= max) {
      values.add(n);
    }
  }
  return [...values].sort((a, b) => a - b);
}

function snapToNearest(values: number[], value: number): number {
  let nearest = values[0];
  let minDist = Math.abs(value - nearest);
  for (const v of values) {
    const dist = Math.abs(value - v);
    if (dist < minDist) {
      minDist = dist;
      nearest = v;
    }
  }
  return nearest;
}

const stepPropertyConverter = {
  fromAttribute(value: string | null): number | null {
    if (value === null || value === 'null') return null;
    const n = Number(value);
    return Number.isNaN(n) ? 1 : n;
  },
  toAttribute(value: number | null): string | null {
    return value === null ? 'null' : String(value);
  },
};

@customElement('ui-slider')
export class UiSlider extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: relative;
      touch-action: none;
      box-sizing: border-box;
      --slider-rail-size: ${RAIL_SIZE}px;
      --slider-handle-size: ${HANDLE_SIZE}px;
      --slider-handle-size-active: ${HANDLE_SIZE_ACTIVE}px;
      --slider-rail-bg: rgba(0, 0, 0, 0.04);
      --slider-rail-hover-bg: rgba(0, 0, 0, 0.06);
      --slider-track-bg: #91caff;
      --slider-track-hover-bg: #69b1ff;
      --slider-track-bg-disabled: rgba(0, 0, 0, 0.04);
      --slider-handle-color: #91caff;
      --slider-handle-color-disabled: #bfbfbf;
      --slider-handle-outline: rgba(22, 119, 255, 0.2);
      --slider-dot-size: 8px;
      --slider-dot-border-color: #f0f0f0;
      --slider-dot-active-border-color: #91caff;
      --slider-mark-text-color: rgba(0, 0, 0, 0.45);
      --slider-mark-text-active-color: rgba(0, 0, 0, 0.88);
    }

    :host([with-marks]) {
      --slider-horizontal-height: 32px;
    }

    :host([with-marks][orientation='horizontal']) {
      height: auto;
      min-height: var(--slider-horizontal-height);
      padding-bottom: 22px;
    }

    :host([with-marks][orientation='vertical']) {
      width: auto;
      min-width: var(--slider-vertical-width, 32px);
      padding-right: 48px;
    }

    :host([orientation='horizontal']) {
      width: 100%;
      height: var(--slider-horizontal-height, 32px);
      padding: calc((var(--slider-handle-size-active) - var(--slider-rail-size)) / 2) 0;
    }

    :host([orientation='vertical']) {
      width: var(--slider-vertical-width, 32px);
      height: var(--slider-vertical-height, 300px);
      padding: 0 calc((var(--slider-handle-size-active) - var(--slider-rail-size)) / 2);
    }

    :host([disabled]) {
      cursor: not-allowed;
    }

    .root {
      position: relative;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }

    :host([disabled]) .root {
      cursor: not-allowed;
    }

    .rail {
      position: absolute;
      background: var(--slider-rail-bg);
      border-radius: 2px;
      transition: background 0.2s;
    }

    :host([orientation='horizontal']) .rail {
      top: 50%;
      left: 0;
      right: 0;
      height: var(--slider-rail-size);
      transform: translateY(-50%);
    }

    :host([orientation='vertical']) .rail {
      left: 50%;
      top: 0;
      bottom: 0;
      width: var(--slider-rail-size);
      transform: translateX(-50%);
    }

    .root:not(.disabled):hover .rail {
      background: var(--slider-rail-hover-bg);
    }

    .track {
      position: absolute;
      background: var(--slider-track-bg);
      border-radius: 2px;
      transition:
        background 0.2s,
        width 0.1s,
        height 0.1s;
    }

    :host([orientation='horizontal']) .track {
      top: 50%;
      left: 0;
      height: var(--slider-rail-size);
      transform: translateY(-50%);
    }

    :host([orientation='vertical']) .track {
      left: 50%;
      bottom: 0;
      width: var(--slider-rail-size);
      transform: translateX(-50%);
    }

    .root:not(.disabled):hover .track {
      background: var(--slider-track-hover-bg);
    }

    :host([disabled]) .track {
      background: var(--slider-track-bg-disabled);
    }

    .handle-wrap {
      position: absolute;
      z-index: 1;
    }

    :host([orientation='horizontal']) .handle-wrap {
      top: 50%;
      transform: translate(-50%, -50%);
    }

    :host([orientation='vertical']) .handle-wrap {
      left: 50%;
      transform: translate(-50%, 50%);
    }

    .handle {
      width: var(--slider-handle-size);
      height: var(--slider-handle-size);
      border: 2px solid var(--slider-handle-color);
      border-radius: 50%;
      background: #fff;
      box-sizing: border-box;
      cursor: grab;
      outline: none;
      transition:
        width 0.2s,
        height 0.2s,
        border-color 0.2s,
        box-shadow 0.2s;
    }

    .handle.active,
    .handle:focus-visible {
      width: var(--slider-handle-size-active);
      height: var(--slider-handle-size-active);
      border-color: var(--color-primary, #1677ff);
      box-shadow: 0 0 0 5px var(--slider-handle-outline);
    }

    .handle.dragging {
      cursor: grabbing;
    }

    :host([disabled]) .handle {
      border-color: var(--slider-handle-color-disabled);
      cursor: not-allowed;
      box-shadow: none;
    }

    :host([disabled]) .handle.active,
    :host([disabled]) .handle:focus-visible {
      width: var(--slider-handle-size);
      height: var(--slider-handle-size);
      box-shadow: none;
    }

    .dots {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .dot {
      position: absolute;
      width: var(--slider-dot-size);
      height: var(--slider-dot-size);
      border: 2px solid var(--slider-dot-border-color);
      border-radius: 50%;
      background: #fff;
      box-sizing: border-box;
      cursor: pointer;
      pointer-events: auto;
      transition: border-color 0.3s;
    }

    .dot.active {
      border-color: var(--slider-dot-active-border-color);
    }

    :host([orientation='horizontal']) .dot {
      top: 50%;
      transform: translate(-50%, -50%);
    }

    :host([orientation='vertical']) .dot {
      left: 50%;
      transform: translate(-50%, 50%);
    }

    .root:not(.disabled):hover .dot {
      border-color: rgba(0, 0, 0, 0.15);
    }

    .root:not(.disabled):hover .dot.active {
      border-color: var(--slider-dot-active-border-color);
    }

    :host([disabled]) .dot {
      border-color: rgba(0, 0, 0, 0.04);
      background: #fff;
      cursor: not-allowed;
      box-shadow: none;
    }

    :host([disabled]) .dot.active {
      border-color: rgba(0, 0, 0, 0.04);
    }

    .marks {
      position: absolute;
      font-size: 14px;
      line-height: 1.5714285714285714;
      pointer-events: none;
    }

    :host([orientation='horizontal']) .marks {
      top: calc(50% + var(--slider-rail-size) / 2 + 4px);
      left: 0;
      right: 0;
      height: 22px;
    }

    :host([orientation='vertical']) .marks {
      top: 0;
      bottom: 0;
      left: calc(50% + var(--slider-rail-size) / 2 + 8px);
      width: 40px;
    }

    .mark-text {
      position: absolute;
      display: inline-block;
      color: var(--slider-mark-text-color);
      text-align: center;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      pointer-events: auto;
    }

    .mark-text.active {
      color: var(--slider-mark-text-active-color);
    }

    :host([orientation='horizontal']) .mark-text {
      transform: translateX(-50%);
    }

    :host([orientation='vertical']) .mark-text {
      transform: translateY(50%);
    }

    :host([disabled]) .mark-text,
    :host([disabled]) .dot {
      cursor: not-allowed;
    }
  `;

  /** 受控当前值 */
  @property({ type: Number }) value = 0;

  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property({ converter: stepPropertyConverter }) step: number | null = 1;

  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ type: Boolean }) keyboard = true;
  @property({ type: String, reflect: true }) orientation: SliderOrientation = 'horizontal';

  /** 刻度标记，key 须在 [min, max] 闭区间内 */
  @property({ attribute: false }) marks: SliderMarks | null = null;
  /** marks 不为空时有效：true 为包含关系（轨道连续），false 为并列关系（无轨道填充） */
  @property({ type: Boolean }) included = true;
  /** 为 true 时只能拖到刻度上 */
  @property({ type: Boolean }) dots = false;

  @property({ attribute: false }) tooltip: SliderTooltipConfig = {};

  @state() private _dragging = false;
  @state() private _handleHovered = false;
  @state() private _focused = false;

  @query('.rail') private _railEl!: HTMLElement;
  @query('.handle') private _handleEl!: HTMLElement;

  private _dragPointerId: number | null = null;
  private _keyboardChanging = false;

  private readonly _onDocumentPointerMove = (e: PointerEvent) => this._handleDocumentPointerMove(e);
  private readonly _onDocumentPointerUp = (e: PointerEvent) => this._handleDocumentPointerUp(e);

  private _dispatch(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _hasMarks(): boolean {
    return hasMarks(this.marks);
  }

  private _markEntries(): Array<{
    value: number;
    label: SliderMarkLabel;
    style?: Record<string, string>;
  }> {
    if (!this.marks) return [];

    return Object.entries(this.marks)
      .map(([key, val]) => {
        const value = Number(key);
        if (Number.isNaN(value) || value < this.min || value > this.max) return null;

        if (val && typeof val === 'object' && 'label' in val) {
          return { value, label: val.label, style: val.style };
        }
        return { value, label: val as SliderMarkLabel };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null)
      .sort((a, b) => a.value - b.value);
  }

  private _validValues(): number[] {
    if (this._hasMarks()) {
      return collectMarkValues(this.marks!, this.min, this.max);
    }

    if (this.step == null || this.step <= 0) {
      return [this.min, this.max];
    }

    const values: number[] = [];
    for (let v = this.min; v <= this.max; v += this.step) {
      values.push(v);
    }
    return values;
  }

  private _snapValue(value: number): number {
    const clamped = clamp(value, this.min, this.max);

    if (this._hasMarks()) {
      const markValues = collectMarkValues(this.marks!, this.min, this.max);

      if (this.dots || this.step === null) {
        return snapToNearest(markValues, clamped);
      }
    }

    if (this.step === null) {
      return clamped;
    }

    if (this.step <= 0) {
      return clamped;
    }

    return snapToStep(clamped, this.min, this.max, this.step);
  }

  private _currentValue(): number {
    return this._snapValue(this.value);
  }

  private _valueToPercent(value: number): number {
    if (this.max === this.min) return 0;
    return ((value - this.min) / (this.max - this.min)) * 100;
  }

  private _percent(): number {
    return this._valueToPercent(this._currentValue());
  }

  private _emitChange(next: number) {
    const value = this._snapValue(next);
    if (value === this._currentValue()) return;

    const detail = { value } satisfies SliderChangeDetail;
    this._dispatch('change', detail);
    this._dispatch('update:value', detail satisfies SliderUpdateValueDetail);
  }

  private _emitChangeComplete() {
    this._dispatch('change-complete', {
      value: this._currentValue(),
    } satisfies SliderChangeCompleteDetail);
  }

  private _pointerToValue(clientX: number, clientY: number): number {
    const rail = this._railEl;
    if (!rail) return this._currentValue();

    const rect = rail.getBoundingClientRect();
    let percent: number;

    if (this.orientation === 'vertical') {
      const y = rect.bottom - clientY;
      percent = rect.height > 0 ? (y / rect.height) * 100 : 0;
    } else {
      percent = rect.width > 0 ? ((clientX - rect.left) / rect.width) * 100 : 0;
    }

    const raw = this.min + (clamp(percent, 0, 100) / 100) * (this.max - this.min);
    return this._snapValue(raw);
  }

  private _bindDocumentDrag() {
    document.addEventListener('pointermove', this._onDocumentPointerMove);
    document.addEventListener('pointerup', this._onDocumentPointerUp);
    document.addEventListener('pointercancel', this._onDocumentPointerUp);
  }

  private _unbindDocumentDrag() {
    document.removeEventListener('pointermove', this._onDocumentPointerMove);
    document.removeEventListener('pointerup', this._onDocumentPointerUp);
    document.removeEventListener('pointercancel', this._onDocumentPointerUp);
  }

  private _startDrag(e: PointerEvent) {
    if (this.disabled) return;

    e.preventDefault();
    this._dragging = true;
    this._dragPointerId = e.pointerId;

    const target = e.currentTarget as HTMLElement;
    if (target.setPointerCapture) {
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    this._bindDocumentDrag();
    this._emitChange(this._pointerToValue(e.clientX, e.clientY));
  }

  private _handleDocumentPointerMove(e: PointerEvent) {
    if (!this._dragging || this._dragPointerId !== e.pointerId) return;
    this._emitChange(this._pointerToValue(e.clientX, e.clientY));
  }

  private _handleDocumentPointerUp(e: PointerEvent) {
    if (!this._dragging || this._dragPointerId !== e.pointerId) return;

    this._dragging = false;
    this._dragPointerId = null;
    this._unbindDocumentDrag();
    this._emitChangeComplete();
  }

  private _onRailPointerDown = (e: PointerEvent) => {
    if (this.disabled || e.button !== 0) return;
    this._startDrag(e);
  };

  private _onHandlePointerDown = (e: PointerEvent) => {
    if (this.disabled || e.button !== 0) return;
    e.stopPropagation();
    this._startDrag(e);
  };

  private _onHandleKeyDown = (e: KeyboardEvent) => {
    if (this.disabled || !this.keyboard) return;

    const { min, max } = this;
    let next: number | undefined;

    const useMarkSteps = this._hasMarks() && (this.step === null || this.dots);
    const validValues = useMarkSteps ? this._validValues() : null;
    const current = this._currentValue();

    const stepMarkValue = (delta: 1 | -1): number => {
      const values = validValues!;
      let idx = values.indexOf(current);
      if (idx === -1) {
        const nextIdx = values.findIndex((v) => v > current);
        idx = nextIdx === -1 ? values.length - 1 : delta > 0 ? nextIdx : Math.max(0, nextIdx - 1);
      } else {
        idx = clamp(idx + delta, 0, values.length - 1);
      }
      return values[idx];
    };

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = validValues ? stepMarkValue(1) : current + (this.step ?? 1);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = validValues ? stepMarkValue(-1) : current - (this.step ?? 1);
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }

    e.preventDefault();
    this._keyboardChanging = true;
    this._emitChange(next);
  };

  private _onHandleKeyUp = (e: KeyboardEvent) => {
    if (!this._keyboardChanging) return;
    if (
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowDown' ||
      e.key === 'Home' ||
      e.key === 'End'
    ) {
      this._keyboardChanging = false;
      this._emitChangeComplete();
    }
  };

  private _onHandleFocus = () => {
    this._focused = true;
  };

  private _onHandleBlur = () => {
    this._focused = false;
  };

  private _onHandleMouseEnter = () => {
    this._handleHovered = true;
  };

  private _onHandleMouseLeave = () => {
    this._handleHovered = false;
  };

  private _isTooltipHidden(): boolean {
    if (this.tooltip?.formatter === null) return true;
    return false;
  }

  private _tooltipVisible(): boolean {
    if (this._isTooltipHidden()) return false;
    if (this.tooltip?.open === false) return false;
    if (this.tooltip?.open === true) return true;
    return this._dragging || this._handleHovered || this._focused;
  }

  private _tooltipTitle(): string {
    const value = this._currentValue();
    const formatter = this.tooltip?.formatter;

    if (formatter === null) return '';
    if (typeof formatter === 'function') {
      const formatted = formatter(value);
      return formatted == null ? '' : String(formatted);
    }
    return String(value);
  }

  private _tooltipPlacement(): TooltipPlacement {
    if (this.tooltip?.placement) return this.tooltip.placement;
    return this.orientation === 'vertical' ? 'right' : 'top';
  }

  private _tooltipContainer(): string | HTMLElement | null {
    const container = this.tooltip?.getPopupContainer;
    if (!container) return 'body';
    if (typeof container === 'function') {
      return container(this._handleEl ?? this);
    }
    return container;
  }

  private _handleStyle(): Record<string, string> {
    const percent = `${this._percent()}%`;

    if (this.orientation === 'vertical') {
      return { bottom: percent, left: '50%' };
    }
    return { left: percent, top: '50%' };
  }

  private _trackStyle(): Record<string, string> {
    if (this._hasMarks() && !this.included) {
      return this.orientation === 'vertical' ? { height: '0%' } : { width: '0%' };
    }

    const percent = `${this._percent()}%`;

    if (this.orientation === 'vertical') {
      return { height: percent };
    }
    return { width: percent };
  }

  private _positionStyle(value: number): Record<string, string> {
    const percent = `${this._valueToPercent(value)}%`;

    if (this.orientation === 'vertical') {
      return { bottom: percent, left: '50%' };
    }
    return { left: percent, top: '50%' };
  }

  private _isMarkActive(markValue: number): boolean {
    const current = this._currentValue();
    if (this.included) return current >= markValue;
    return current === markValue;
  }

  private _markLabelStyle(
    value: number,
    customStyle?: Record<string, string>,
  ): Record<string, string> {
    const percent = `${this._valueToPercent(value)}%`;

    if (this.orientation === 'vertical') {
      return { bottom: percent, left: '0', ...customStyle };
    }
    return { left: percent, top: '0', ...customStyle };
  }

  private _setValueFromMark(value: number) {
    if (this.disabled) return;
    this._emitChange(value);
    this._emitChangeComplete();
  }

  private _onMarkPointerDown = (value: number) => (e: PointerEvent) => {
    if (this.disabled || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    this._setValueFromMark(value);
  };

  private _renderDots() {
    if (!this._hasMarks()) return html``;

    return html`
      <div class="dots" part="dots">
        ${this._markEntries().map(
          (entry) => html`
            <span
              class=${classMap({ dot: true, active: this._isMarkActive(entry.value) })}
              part="dot"
              style=${styleMap(this._positionStyle(entry.value))}
              @pointerdown=${this._onMarkPointerDown(entry.value)}
            ></span>
          `,
        )}
      </div>
    `;
  }

  private _renderMarks() {
    if (!this._hasMarks()) return html``;

    return html`
      <div class="marks" part="marks">
        ${this._markEntries().map((entry) => {
          const markStyle = this._markLabelStyle(entry.value, entry.style);

          return html`
            <span
              class=${classMap({ 'mark-text': true, active: this._isMarkActive(entry.value) })}
              part="mark"
              style=${styleMap(markStyle)}
              @pointerdown=${this._onMarkPointerDown(entry.value)}
            >
              ${entry.label}
            </span>
          `;
        })}
      </div>
    `;
  }

  protected willUpdate(changed: Map<string, unknown>) {
    if (changed.has('marks')) {
      if (this._hasMarks()) {
        this.setAttribute('with-marks', '');
      } else {
        this.removeAttribute('with-marks');
      }
    }
  }

  focus() {
    this._handleEl?.focus();
  }

  blur() {
    this._handleEl?.blur();
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._hasMarks()) {
      this.setAttribute('with-marks', '');
    }
  }

  disconnectedCallback() {
    this._unbindDocumentDrag();
    super.disconnectedCallback();
  }

  protected render() {
    const current = this._currentValue();
    const handleActive = this._dragging || this._focused || this._handleHovered;

    return html`
      <div
        class=${classMap({ root: true, disabled: this.disabled })}
        @pointerdown=${this._onRailPointerDown}
      >
        <div class="rail" part="rail"></div>
        ${this._renderDots()}
        <div class="track" part="track" style=${styleMap(this._trackStyle())}></div>
        <div class="handle-wrap" style=${styleMap(this._handleStyle())}>
          <ui-tooltip
            .open=${this._tooltipVisible()}
            .title=${this._tooltipTitle()}
            .placement=${this._tooltipPlacement()}
            .popupContainer=${this._tooltipContainer()}
            trigger="click"
            .disabled=${this._isTooltipHidden()}
            .arrow=${true}
            .mouseEnterDelay=${0}
            .mouseLeaveDelay=${0}
          >
            <div
              class=${classMap({
                handle: true,
                active: handleActive,
                dragging: this._dragging,
              })}
              part="handle"
              role="slider"
              tabindex=${this.disabled ? -1 : 0}
              aria-valuemin=${this.min}
              aria-valuemax=${this.max}
              aria-valuenow=${current}
              aria-orientation=${this.orientation}
              aria-disabled=${this.disabled ? 'true' : 'false'}
              @pointerdown=${this._onHandlePointerDown}
              @keydown=${this._onHandleKeyDown}
              @keyup=${this._onHandleKeyUp}
              @focus=${this._onHandleFocus}
              @blur=${this._onHandleBlur}
              @mouseenter=${this._onHandleMouseEnter}
              @mouseleave=${this._onHandleMouseLeave}
            ></div>
          </ui-tooltip>
        </div>
        ${this._renderMarks()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-slider': UiSlider;
  }
}

/** ui-slider 事件类型（监听时使用显式类型） */
export interface UiSliderEventMap {
  change: CustomEvent<SliderChangeDetail>;
  'change-complete': CustomEvent<SliderChangeCompleteDetail>;
  'update:value': CustomEvent<SliderUpdateValueDetail>;
}
