import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { arrowStyles } from './internal/arrow-styles.js';
import { isControlledOpen } from './internal/controlled-state.js';
import { OverlayController } from './internal/overlay-controller.js';
import { computePlacement4, arrowSideForPlacement } from './internal/placement.js';
import { Z_INDEX } from './internal/z-index.js';

export type TooltipTriggerType = 'click' | 'hover';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export type TooltipCloseReason = 'clickOutside' | 'esc' | 'trigger' | 'manual';

export type TooltipOpenChangeDetail = {
  open: boolean;
  trigger?: TooltipTriggerType | 'manual';
  reason?: TooltipCloseReason;
};

const DEFAULT_ENTER_DELAY_S = 0.1;
const DEFAULT_LEAVE_DELAY_S = 0.1;

const POPUP_PORTAL_STYLES = `
  .popup {
    position: fixed;
    z-index: var(--tooltip-z, 1070);
    max-width: var(--tooltip-max-width, 250px);
    min-height: 32px;
    padding: 6px 8px;
    background: var(--tooltip-bg, rgba(0, 0, 0, 0.85));
    color: var(--tooltip-color, #fff);
    font-size: 14px;
    line-height: 1.5714285714285714;
    border-radius: 6px;
    box-sizing: border-box;
    word-wrap: break-word;
    user-select: none;
    pointer-events: auto;
  }

  .popup.in-container {
    position: absolute;
  }

  ${arrowStyles({ backgroundVar: '--tooltip-bg', backgroundFallback: 'rgba(0, 0, 0, 0.85)' })}

  .content {
    position: relative;
    z-index: 1;
  }
`;

@customElement('ui-tooltip')
export class UiTooltip extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
    }

    .trigger {
      display: inline;
    }
  `;

  /** 受控显隐；未传时为非受控 */
  @property({ type: Boolean }) open?: boolean;
  @property({ type: Boolean, attribute: 'default-open' }) defaultOpen = false;

  @property() title = '';
  @property({ type: String }) placement: TooltipPlacement = 'top';
  @property({ type: String }) trigger: TooltipTriggerType = 'hover';

  @property({ type: Boolean }) arrow = true;
  @property({ type: Boolean }) disabled = false;
  @property() color = '';
  @property({ type: Boolean, attribute: 'destroy-on-close' }) destroyOnClose = false;
  @property({ type: Boolean, attribute: 'close-on-esc' }) closeOnEsc = true;
  @property({ type: Number, attribute: 'z-index' }) zIndex = Z_INDEX.TOOLTIP;

  /** 鼠标移入后延时显示，单位：秒（antd mouseEnterDelay） */
  @property({ type: Number, attribute: 'mouse-enter-delay' }) mouseEnterDelay =
    DEFAULT_ENTER_DELAY_S;
  /** 鼠标移出后延时隐藏，单位：秒（antd mouseLeaveDelay） */
  @property({ type: Number, attribute: 'mouse-leave-delay' }) mouseLeaveDelay =
    DEFAULT_LEAVE_DELAY_S;

  /** 类似 antd getPopupContainer：selector 或 HTMLElement，默认 body */
  @property() popupContainer: string | HTMLElement | null = 'body';

  @state() private _internalOpen = false;
  @state() private _pos = { top: 0, left: 0 };
  @state() private _arrowStyle: Record<string, string> = {};
  @state() private _positionInContainer = false;

  private readonly _tooltipId = `ui-tooltip-${Math.random().toString(36).slice(2, 9)}`;

  private _triggerEl: HTMLElement | null = null;
  private _overlay: OverlayController | null = null;
  private _globalBound = false;
  private _prevIsOpen = false;
  private _hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
  private _hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    if (!isControlledOpen(this.open)) {
      this._internalOpen = this.defaultOpen;
    }
  }

  private _getOverlay(): OverlayController {
    if (!this._overlay) {
      this._overlay = new OverlayController({
        host: this,
        portal: {
          dataAttr: 'data-ui-tooltip-portal',
          styleText: POPUP_PORTAL_STYLES,
          zIndex: this.zIndex,
          popupContainer: this.popupContainer,
        },
        isControlledOpen: () => isControlledOpen(this.open),
        readOpen: () => this._isOpen(),
        writeOpen: (next) => {
          this._internalOpen = next;
        },
        emitOptions: {
          detail: (next, meta) =>
            next
              ? { open: true, trigger: meta.trigger as TooltipTriggerType | 'manual' | undefined }
              : {
                  open: false,
                  trigger: meta.trigger as TooltipTriggerType | 'manual' | undefined,
                  reason: meta.reason as TooltipCloseReason | undefined,
                },
        },
      });
      this._overlay.onLayoutChange(() => this._updatePosition());
    }
    return this._overlay;
  }

  private _isOpen(): boolean {
    return isControlledOpen(this.open) ? this.open! : this._internalOpen;
  }

  private _isDisabled(): boolean {
    if (this.disabled) return true;
    return !this.title.trim();
  }

  private _dispatch(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _setOpen(
    next: boolean,
    meta: {
      trigger?: TooltipTriggerType | 'manual';
      reason?: TooltipCloseReason;
    } = {},
  ) {
    if (this._isOpen() === next) return;

    if (next && this._isDisabled()) return;

    if (!isControlledOpen(this.open)) {
      this._internalOpen = next;
    }

    const detail: TooltipOpenChangeDetail = next
      ? { open: true, trigger: meta.trigger }
      : { open: false, trigger: meta.trigger, reason: meta.reason };

    this._dispatch('open-change', detail);
    this._dispatch('update:open', detail);

    if (next) {
      this._dispatch('open', { trigger: meta.trigger });
    } else {
      this._dispatch('close', { reason: meta.reason });
    }
  }

  private _show(trigger?: TooltipTriggerType | 'manual') {
    this._setOpen(true, { trigger });
  }

  private _hide(reason: TooltipCloseReason) {
    this._setOpen(false, { reason });
  }

  private _enterDelayMs(): number {
    return Math.max(0, this.mouseEnterDelay) * 1000;
  }

  private _leaveDelayMs(): number {
    return Math.max(0, this.mouseLeaveDelay) * 1000;
  }

  private _popupStyleVars(): Record<string, string> {
    const vars: Record<string, string> = {
      top: `${this._pos.top}px`,
      left: `${this._pos.left}px`,
      zIndex: String(this.zIndex),
      '--tooltip-z': String(this.zIndex),
    };
    if (this.color) {
      vars['--tooltip-bg'] = this.color;
      vars['--tooltip-color'] = '#fff';
    }
    return vars;
  }

  private _computePopupPosition() {
    if (!this._triggerEl) return;

    const overlay = this._getOverlay();
    const popupEl = overlay.getPopupEl('.popup');
    const popupRect = popupEl?.getBoundingClientRect();
    const width = popupRect?.width ?? 120;
    const height = popupRect?.height ?? 32;

    const placed = computePlacement4({
      placement: this.placement,
      triggerRect: this._triggerEl.getBoundingClientRect(),
      popupWidth: width,
      popupHeight: height,
      container: overlay.portal.getContainer(),
    });

    this._positionInContainer = placed.inContainer;
    this._pos = { top: placed.top, left: placed.left };
    this._arrowStyle = this.arrow ? placed.arrow : {};
  }

  private _popupTemplate() {
    const arrowPlacement = arrowSideForPlacement(this.placement);
    return html`
      <div
        class=${classMap({ popup: true, 'in-container': this._positionInContainer })}
        style=${styleMap(this._popupStyleVars())}
        role="tooltip"
        id=${this._tooltipId}
        @mousedown=${(e: MouseEvent) => e.stopPropagation()}
        @click=${(e: MouseEvent) => e.stopPropagation()}
        @mouseenter=${this._onPopupMouseEnter}
        @mouseleave=${this._onPopupMouseLeave}
      >
        ${this.arrow
          ? html`
              <div
                class=${classMap({ arrow: true, [`placement-${arrowPlacement}`]: true })}
                style=${styleMap(this._arrowStyle)}
              ></div>
            `
          : nothing}
        <div class="content">${this.title}</div>
      </div>
    `;
  }

  private _syncPortal() {
    const overlay = this._getOverlay();
    if (!this._isOpen() || this._isDisabled()) {
      overlay.hideContent();
      return;
    }
    overlay.updatePortalOptions({ zIndex: this.zIndex, popupContainer: this.popupContainer });
    overlay.syncContent(this._popupTemplate());
  }

  protected render() {
    return html`
      <span
        class="trigger"
        aria-describedby=${this._isOpen() && !this._isDisabled() ? this._tooltipId : nothing}
        @click=${this._onTriggerClick}
        @mouseenter=${this._onTriggerMouseEnter}
        @mouseleave=${this._onTriggerMouseLeave}
      >
        <slot></slot>
      </span>
    `;
  }

  protected firstUpdated() {
    this._triggerEl = this.shadowRoot?.querySelector('.trigger') as HTMLElement | null;
    this.style.setProperty('--tooltip-z', String(this.zIndex));
    this._prevIsOpen = this._isOpen();
  }

  protected updated(changed: PropertyValues) {
    const isOpen = this._isOpen();
    const wasOpen = this._prevIsOpen;

    this._handleControlledOpenEdge(changed, isOpen, wasOpen);

    if (isOpen !== wasOpen) {
      this._onOpenStateChanged(isOpen);
    } else if (isOpen) {
      this._onPopupContentChanged(changed);
    }

    if (changed.has('zIndex')) {
      this.style.setProperty('--tooltip-z', String(this.zIndex));
    }

    this._prevIsOpen = isOpen;
  }

  disconnectedCallback() {
    this._clearHoverTimers();
    if (this._globalBound) {
      this._unbindGlobal();
      this._globalBound = false;
    }
    this._overlay?.destroy();
    this._overlay = null;
    super.disconnectedCallback();
  }

  private _handleControlledOpenEdge(changed: PropertyValues, isOpen: boolean, wasOpen: boolean) {
    if (!changed.has('open')) return;

    if (isOpen && !wasOpen) {
      this._dispatch('open', { trigger: 'manual' });
    } else if (!isOpen && wasOpen) {
      this._dispatch('close', { reason: 'manual' });
    }
  }

  private _onOpenStateChanged(isOpen: boolean) {
    if (isOpen && this._isDisabled()) {
      return;
    }

    if (isOpen) {
      if (!this._globalBound) {
        this._bindGlobal();
        this._globalBound = true;
      }
      this._syncPortal();
      queueMicrotask(() => {
        if (!this._isOpen() || this._isDisabled()) return;
        this._updatePosition();
        this._syncPortal();
      });
      return;
    }

    if (this._globalBound) {
      this._unbindGlobal();
      this._globalBound = false;
    }
    this._getOverlay().triggers.clearHoverTimers();
    this._clearHoverTimers();
    if (this.destroyOnClose) {
      this._overlay?.destroyPortal();
    } else {
      this._overlay?.hideContent();
    }
  }

  private _onPopupContentChanged(changed: PropertyValues) {
    const needsSync =
      changed.has('title') ||
      changed.has('color') ||
      changed.has('arrow') ||
      changed.has('zIndex') ||
      changed.has('popupContainer') ||
      changed.has('placement') ||
      changed.has('_pos') ||
      changed.has('_arrowStyle');

    if (!needsSync) return;

    this._syncPortal();

    if (changed.has('placement') || changed.has('popupContainer')) {
      queueMicrotask(() => {
        if (!this._isOpen()) return;
        this._updatePosition();
        this._syncPortal();
      });
    }
  }

  private _bindGlobal() {
    const overlay = this._getOverlay();
    overlay.triggers.bindGlobal({
      onOutside: (e) => this._onDocumentMouseDown(e),
      onEsc: (e) => this._onDocumentKeyDown(e),
      onScrollResize: () => overlay.updatePosition(),
    });
  }

  private _unbindGlobal() {
    this._overlay?.triggers.unbindGlobal();
  }

  private _updatePosition() {
    if (!this._triggerEl || !this._isOpen()) return;
    this._computePopupPosition();
  }

  private _clearHoverTimers() {
    if (this._hoverOpenTimer) {
      clearTimeout(this._hoverOpenTimer);
      this._hoverOpenTimer = null;
    }
    if (this._hoverCloseTimer) {
      clearTimeout(this._hoverCloseTimer);
      this._hoverCloseTimer = null;
    }
  }

  private _scheduleHoverOpen() {
    if (this.trigger !== 'hover') return;
    this._clearHoverTimers();
    this._hoverOpenTimer = setTimeout(() => {
      this._hoverOpenTimer = null;
      if (!this._isOpen()) this._show('hover');
    }, this._enterDelayMs());
  }

  private _scheduleHoverClose() {
    if (this.trigger !== 'hover') return;
    this._clearHoverTimers();
    this._hoverCloseTimer = setTimeout(() => {
      this._hoverCloseTimer = null;
      if (this._isOpen()) this._hide('trigger');
    }, this._leaveDelayMs());
  }

  private _cancelHoverClose() {
    if (this._hoverCloseTimer) {
      clearTimeout(this._hoverCloseTimer);
      this._hoverCloseTimer = null;
    }
  }

  private _onTriggerClick = () => {
    if (this.trigger !== 'click') return;
    if (this._isDisabled()) return;

    if (this._isOpen()) {
      this._hide('trigger');
    } else {
      this._show('click');
    }
  };

  private _onTriggerMouseEnter = () => {
    if (this.trigger !== 'hover') return;
    if (this._isDisabled()) return;
    this._cancelHoverClose();
    if (this._isOpen()) return;
    this._scheduleHoverOpen();
  };

  private _onTriggerMouseLeave = () => {
    if (this.trigger !== 'hover') return;
    if (!this._isOpen()) {
      this._clearHoverTimers();
      return;
    }
    this._scheduleHoverClose();
  };

  private _onPopupMouseEnter = () => {
    if (this.trigger !== 'hover') return;
    this._cancelHoverClose();
  };

  private _onPopupMouseLeave = () => {
    if (this.trigger !== 'hover') return;
    this._scheduleHoverClose();
  };

  private _onDocumentMouseDown(e: MouseEvent) {
    if (!this._isOpen()) return;
    if (this._getOverlay().isEventInside(e)) return;
    if (this.trigger === 'click') {
      this._hide('clickOutside');
    }
  }

  private _onDocumentKeyDown(e: KeyboardEvent) {
    if (!this._isOpen()) return;
    if (this.closeOnEsc && e.key === 'Escape') {
      e.preventDefault();
      this._hide('esc');
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ui-tooltip': UiTooltip;
  }
}

/** ui-tooltip 事件类型（监听时使用显式类型） */
export interface UiTooltipEventMap {
  'open-change': CustomEvent<TooltipOpenChangeDetail>;
  'update:open': CustomEvent<TooltipOpenChangeDetail>;
  open: CustomEvent<{ trigger?: TooltipTriggerType | 'manual' }>;
  close: CustomEvent<{ reason?: TooltipCloseReason }>;
}
