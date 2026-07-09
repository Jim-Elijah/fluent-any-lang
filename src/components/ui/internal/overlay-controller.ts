import type { TemplateResult } from 'lit';
import { isControlledOpen } from './controlled-state.js';
import { emitOpenChange, type EmitOpenChangeOptions, type OpenChangeMeta } from './open-change.js';
import { PortalHost, type PortalHostOptions } from './portal-host.js';
import { OverlayTriggerController } from './overlay-triggers.js';

export type OverlayControllerOptions = {
  host: HTMLElement;
  portal: PortalHostOptions;
  isControlledOpen?: () => boolean;
  readOpen?: () => boolean;
  writeOpen?: (next: boolean) => void;
  emitOptions?: EmitOpenChangeOptions;
};

/** Facade combining portal mount, trigger bindings, open state, and event emission. */
export class OverlayController {
  private _portal: PortalHost | null = null;
  private _layoutCb: (() => void) | null = null;
  private readonly _triggers: OverlayTriggerController;
  private readonly _getControlled: () => boolean;
  private readonly _readOpen: () => boolean;
  private readonly _writeOpen: (next: boolean) => void;

  constructor(private readonly _options: OverlayControllerOptions) {
    this._triggers = new OverlayTriggerController(_options.host);
    this._getControlled =
      _options.isControlledOpen ??
      (() => isControlledOpen((_options.host as { open?: boolean }).open));
    this._readOpen = _options.readOpen ?? (() => false);
    this._writeOpen = _options.writeOpen ?? (() => undefined);
  }

  get isOpen(): boolean {
    return this._readOpen();
  }

  get triggers(): OverlayTriggerController {
    return this._triggers;
  }

  get portal(): PortalHost {
    return this._ensurePortal();
  }

  private _ensurePortal(): PortalHost {
    if (!this._portal) {
      this._portal = new PortalHost(this._options.portal);
      if (this._layoutCb) {
        this._portal.onLayoutChange(this._layoutCb);
      }
    }
    return this._portal;
  }

  setOpen(next: boolean, meta: OpenChangeMeta = {}): void {
    if (this._readOpen() === next) return;
    if (!this._getControlled()) {
      this._writeOpen(next);
    }
    emitOpenChange(this._options.host, next, meta, this._options.emitOptions);
  }

  syncContent(template: TemplateResult): void {
    if (!this._readOpen()) {
      this._portal?.hide();
      return;
    }
    this._ensurePortal().render(template);
  }

  hideContent(): void {
    this._portal?.hide();
  }

  destroyPortal(): void {
    if (this._layoutCb && this._portal) {
      this._portal.offLayoutChange(this._layoutCb);
    }
    this._portal?.destroy();
    this._portal = null;
  }

  onLayoutChange(cb: () => void): void {
    if (this._layoutCb && this._portal) {
      this._portal.offLayoutChange(this._layoutCb);
    }
    this._layoutCb = cb;
    if (this._portal) {
      this._portal.onLayoutChange(cb);
    }
  }

  updatePosition(): void {
    this._layoutCb?.();
  }

  updatePortalOptions(partial: Partial<PortalHostOptions>): void {
    Object.assign(this._options.portal, partial);
    this._portal?.updateOptions(partial);
  }

  getPopupEl(selector: string): HTMLElement | null {
    return this._portal?.getPopupEl(selector) ?? null;
  }

  isEventInside(e: Event): boolean {
    const path = e.composedPath();
    if (path.includes(this._options.host)) return true;
    const portalHost = this._portal?.getHostElement();
    if (portalHost && path.includes(portalHost)) return true;
    return false;
  }

  destroy(): void {
    this._triggers.destroy();
    this.destroyPortal();
    this._layoutCb = null;
  }
}
