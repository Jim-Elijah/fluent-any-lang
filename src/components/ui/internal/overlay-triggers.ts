export type HoverTriggerOptions = {
  enterDelayMs?: number;
  leaveDelayMs?: number;
  onEnter: () => void;
  onLeave: () => void;
};

export type ClickTriggerOptions = {
  onClick: (e: MouseEvent) => void;
};

export type ContextMenuTriggerOptions = {
  onContextMenu: (e: MouseEvent) => void;
};

export type GlobalTriggerOptions = {
  onOutside?: (e: MouseEvent) => void;
  onEsc?: (e: KeyboardEvent) => void;
  onScrollResize?: () => void;
};

const CAPTURE = { capture: true };

/** Binds hover/click/contextMenu/outside/Esc/scroll listeners for overlay components. */
export class OverlayTriggerController {
  private _hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
  private _hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private _hoverTarget: HTMLElement | null = null;
  private _hoverOpts: HoverTriggerOptions | null = null;
  private _clickTarget: HTMLElement | null = null;
  private _clickOpts: ClickTriggerOptions | null = null;
  private _contextTarget: HTMLElement | null = null;
  private _contextOpts: ContextMenuTriggerOptions | null = null;
  private _globalOpts: GlobalTriggerOptions | null = null;
  private _globalBound = false;

  constructor(private readonly _host: HTMLElement) {}

  bindHover(el: HTMLElement, opts: HoverTriggerOptions): void {
    this._hoverTarget = el;
    this._hoverOpts = opts;
    el.addEventListener('mouseenter', this._onHoverEnter);
    el.addEventListener('mouseleave', this._onHoverLeave);
  }

  bindClick(el: HTMLElement, opts: ClickTriggerOptions): void {
    this._clickTarget = el;
    this._clickOpts = opts;
    el.addEventListener('click', this._onClick);
  }

  bindContextMenu(el: HTMLElement, opts: ContextMenuTriggerOptions): void {
    this._contextTarget = el;
    this._contextOpts = opts;
    el.addEventListener('contextmenu', this._onContextMenu);
  }

  bindGlobal(opts: GlobalTriggerOptions): void {
    this._globalOpts = opts;
    if (!this._globalBound) {
      window.addEventListener('mousedown', this._onDocMouseDown, CAPTURE);
      window.addEventListener('keydown', this._onDocKeyDown, CAPTURE);
      window.addEventListener('scroll', this._onScrollResize, CAPTURE);
      window.addEventListener('resize', this._onScrollResize);
      this._globalBound = true;
    }
  }

  unbindGlobal(): void {
    if (!this._globalBound) return;
    window.removeEventListener('mousedown', this._onDocMouseDown, CAPTURE);
    window.removeEventListener('keydown', this._onDocKeyDown, CAPTURE);
    window.removeEventListener('scroll', this._onScrollResize, CAPTURE);
    window.removeEventListener('resize', this._onScrollResize);
    this._globalBound = false;
  }

  clearHoverTimers(): void {
    if (this._hoverOpenTimer) {
      clearTimeout(this._hoverOpenTimer);
      this._hoverOpenTimer = null;
    }
    if (this._hoverCloseTimer) {
      clearTimeout(this._hoverCloseTimer);
      this._hoverCloseTimer = null;
    }
  }

  destroy(): void {
    this.clearHoverTimers();
    this.unbindGlobal();
    this._hoverTarget?.removeEventListener('mouseenter', this._onHoverEnter);
    this._hoverTarget?.removeEventListener('mouseleave', this._onHoverLeave);
    this._clickTarget?.removeEventListener('click', this._onClick);
    this._contextTarget?.removeEventListener('contextmenu', this._onContextMenu);
    this._hoverTarget = null;
    this._clickTarget = null;
    this._contextTarget = null;
    this._hoverOpts = null;
    this._clickOpts = null;
    this._contextOpts = null;
    this._globalOpts = null;
  }

  private _onHoverEnter = () => {
    const opts = this._hoverOpts;
    if (!opts) return;
    this.clearHoverTimers();
    const delay = opts.enterDelayMs ?? 0;
    if (delay <= 0) {
      opts.onEnter();
    } else {
      this._hoverOpenTimer = setTimeout(() => opts.onEnter(), delay);
    }
  };

  private _onHoverLeave = () => {
    const opts = this._hoverOpts;
    if (!opts) return;
    this.clearHoverTimers();
    const delay = opts.leaveDelayMs ?? 0;
    if (delay <= 0) {
      opts.onLeave();
    } else {
      this._hoverCloseTimer = setTimeout(() => opts.onLeave(), delay);
    }
  };

  private _onClick = (e: MouseEvent) => {
    this._clickOpts?.onClick(e);
  };

  private _onContextMenu = (e: MouseEvent) => {
    this._contextOpts?.onContextMenu(e);
  };

  private _onDocMouseDown = (e: MouseEvent) => {
    this._globalOpts?.onOutside?.(e);
  };

  private _onDocKeyDown = (e: KeyboardEvent) => {
    this._globalOpts?.onEsc?.(e);
  };

  private _onScrollResize = () => {
    this._globalOpts?.onScrollResize?.();
  };
}
