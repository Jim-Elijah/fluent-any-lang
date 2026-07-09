import { nothing, render, type TemplateResult } from 'lit';

export type PortalHostOptions = {
  dataAttr: string;
  styleText: string;
  zIndex: number;
  popupContainer: string | HTMLElement | null;
};

function resolveContainer(popupContainer: string | HTMLElement | null): HTMLElement {
  if (!popupContainer) return document.body;
  if (typeof popupContainer === 'string') {
    if (popupContainer === 'body') return document.body;
    return (document.querySelector(popupContainer) as HTMLElement | null) ?? document.body;
  }
  return popupContainer;
}

/** Manages a shadow-DOM portal mount under a popup container. */
export class PortalHost {
  private _host: HTMLDivElement | null = null;
  private _shadow: ShadowRoot | null = null;
  private _mount: HTMLDivElement | null = null;
  private _styleEl: HTMLStyleElement | null = null;
  private _positionPatchedContainer: HTMLElement | null = null;
  private _layoutListeners: Array<() => void> = [];
  private _scrollHandler: (() => void) | null = null;
  private _resizeHandler: (() => void) | null = null;

  constructor(private readonly _options: PortalHostOptions) {}

  getContainer(): HTMLElement {
    return resolveContainer(this._options.popupContainer);
  }

  ensureMount(): HTMLDivElement {
    const container = this.getContainer();

    if (!this._host) {
      this._host = document.createElement('div');
      this._host.setAttribute(this._options.dataAttr, '');
      this._host.style.pointerEvents = 'none';

      this._shadow = this._host.attachShadow({ mode: 'open' });
      this._styleEl = document.createElement('style');
      this._styleEl.textContent = this._options.styleText;
      this._shadow.appendChild(this._styleEl);

      this._mount = document.createElement('div');
      this._shadow.appendChild(this._mount);
    }

    this._syncHostLayout(container);

    if (!this._host.isConnected || this._host.parentElement !== container) {
      container.appendChild(this._host);
    }

    return this._mount!;
  }

  render(template: TemplateResult): void {
    const mount = this.ensureMount();
    render(template, mount);
  }

  hide(): void {
    if (this._mount) {
      render(nothing, this._mount);
    }
  }

  destroy(): void {
    this.hide();
    this._host?.remove();
    this._host = null;
    this._shadow = null;
    this._mount = null;
    this._styleEl = null;
    if (this._positionPatchedContainer) {
      this._positionPatchedContainer.style.position = '';
      this._positionPatchedContainer = null;
    }
    this._unbindLayoutListeners();
  }

  getShadowRoot(): ShadowRoot | null {
    return this._shadow;
  }

  getPopupEl(selector: string): HTMLElement | null {
    return this._shadow?.querySelector(selector) as HTMLElement | null;
  }

  onLayoutChange(cb: () => void): void {
    this._layoutListeners.push(cb);
    if (this._layoutListeners.length === 1) {
      this._bindLayoutListeners();
    }
  }

  offLayoutChange(cb: () => void): void {
    this._layoutListeners = this._layoutListeners.filter((fn) => fn !== cb);
    if (this._layoutListeners.length === 0) {
      this._unbindLayoutListeners();
    }
  }

  updateOptions(partial: Partial<PortalHostOptions>): void {
    Object.assign(this._options, partial);
    if (partial.styleText && this._styleEl) {
      this._styleEl.textContent = partial.styleText;
    }
    if (this._host) {
      this._syncHostLayout(this.getContainer());
    }
  }

  private _syncHostLayout(container: HTMLElement): void {
    if (!this._host) return;

    const inContainer = container !== document.body;
    this._host.style.zIndex = String(this._options.zIndex);

    if (inContainer) {
      this._host.style.position = 'absolute';
      this._host.style.inset = '0';
      this._host.style.width = '100%';
      this._host.style.height = '100%';

      if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
        this._positionPatchedContainer = container;
      }
    } else {
      this._host.style.position = 'fixed';
      this._host.style.inset = '0';
      this._host.style.width = 'auto';
      this._host.style.height = 'auto';
    }
  }

  private _bindLayoutListeners(): void {
    this._scrollHandler = () => this._layoutListeners.forEach((cb) => cb());
    this._resizeHandler = this._scrollHandler;
    window.addEventListener('scroll', this._scrollHandler, { capture: true });
    window.addEventListener('resize', this._resizeHandler);

    const container = this.getContainer();
    if (container !== document.body) {
      container.addEventListener('scroll', this._scrollHandler, { capture: true });
    }
  }

  private _unbindLayoutListeners(): void {
    if (!this._scrollHandler) return;

    window.removeEventListener('scroll', this._scrollHandler, { capture: true });
    window.removeEventListener('resize', this._resizeHandler!);

    const container = this.getContainer();
    if (container !== document.body) {
      container.removeEventListener('scroll', this._scrollHandler, { capture: true });
    }

    this._scrollHandler = null;
    this._resizeHandler = null;
  }
}

export { resolveContainer as resolvePopupContainer };
