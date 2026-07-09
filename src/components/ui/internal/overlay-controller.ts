import type { TemplateResult } from 'lit';
import { isControlledOpen } from './controlled-state.js';
import { emitOpenChange, type OpenChangeMeta } from './open-change.js';
import { PortalHost, type PortalHostOptions } from './portal-host.js';

export type OverlayControllerOptions = {
  host: HTMLElement;
  portal: PortalHostOptions;
  isControlledOpen?: () => boolean;
  readOpen?: () => boolean;
  writeOpen?: (next: boolean) => void;
};

/** Facade combining portal mount, open state, and event emission. */
export class OverlayController {
  private readonly _portal: PortalHost;
  private readonly _getControlled: () => boolean;
  private readonly _readOpen: () => boolean;
  private readonly _writeOpen: (next: boolean) => void;

  constructor(private readonly _options: OverlayControllerOptions) {
    this._portal = new PortalHost(_options.portal);
    this._getControlled =
      _options.isControlledOpen ??
      (() => isControlledOpen((_options.host as { open?: boolean }).open));
    this._readOpen = _options.readOpen ?? (() => false);
    this._writeOpen = _options.writeOpen ?? (() => undefined);
  }

  get isOpen(): boolean {
    return this._readOpen();
  }

  get portal(): PortalHost {
    return this._portal;
  }

  setOpen(next: boolean, meta: OpenChangeMeta = {}): void {
    if (this._readOpen() === next) return;
    if (!this._getControlled()) {
      this._writeOpen(next);
    }
    emitOpenChange(this._options.host, next, meta);
  }

  syncContent(template: TemplateResult): void {
    if (!this._readOpen()) {
      this._portal.hide();
      return;
    }
    this._portal.render(template);
  }

  updatePosition(): void {
    this._portal.onLayoutChange(() => undefined);
  }

  destroy(): void {
    this._portal.destroy();
  }
}
