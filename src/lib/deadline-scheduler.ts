export type DeadlineSchedulerOptions = {
  now?: () => number;
  /** Listen to visibilitychange and sync when the page becomes visible. Default true. */
  autoVisibility?: boolean;
};

export type DeadlineStartOptions = {
  /** Absolute deadline in the same epoch as `now()` (default Date.now). */
  endsAt: number;
  onFire: () => void;
  /** Called after start/sync and on each tick while still pending. */
  onTick?: (remainingMs: number) => void;
  /** Interval for `onTick`. Ignored when `onTick` is omitted. Default 1000. */
  tickIntervalMs?: number;
};

/**
 * Wall-clock deadline timer that compensates for background-tab throttling:
 * schedules `setTimeout` to an absolute `endsAt`, optionally ticks for UI,
 * and resyncs when the document becomes visible again.
 */
export class DeadlineScheduler {
  private readonly now: () => number;
  private readonly autoVisibility: boolean;

  private endsAt: number | null = null;
  private onFire: (() => void) | null = null;
  private onTick: ((remainingMs: number) => void) | null = null;
  private tickIntervalMs = 1000;
  private fireTimerId: ReturnType<typeof setTimeout> | null = null;
  private tickTimerId: ReturnType<typeof setInterval> | null = null;
  private visibilityAttached = false;
  private fired = false;

  constructor(options: DeadlineSchedulerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.autoVisibility = options.autoVisibility ?? true;
  }

  get isActive(): boolean {
    return this.endsAt !== null;
  }

  get deadline(): number | null {
    return this.endsAt;
  }

  get remainingMs(): number {
    if (this.endsAt === null) {
      return 0;
    }
    return Math.max(0, this.endsAt - this.now());
  }

  start(options: DeadlineStartOptions): void {
    this.clear();
    this.endsAt = options.endsAt;
    this.onFire = options.onFire;
    this.onTick = options.onTick ?? null;
    this.tickIntervalMs = options.tickIntervalMs ?? 1000;
    this.fired = false;
    this._ensureVisibility();
    this._schedule();
    this._emitTick();
  }

  /** Recompute from `endsAt`: fire if past, otherwise reschedule. */
  sync(): void {
    if (this.endsAt === null || this.fired) {
      return;
    }
    this._clearTimersOnly();
    this._schedule();
    this._emitTick();
  }

  clear(): void {
    this._clearTimersOnly();
    this._removeVisibility();
    this.endsAt = null;
    this.onFire = null;
    this.onTick = null;
    this.fired = false;
  }

  private _schedule(): void {
    if (this.endsAt === null) {
      return;
    }

    const remaining = this.endsAt - this.now();
    if (remaining <= 0) {
      this._fire();
      return;
    }

    this.fireTimerId = setTimeout(() => {
      this._fire();
    }, remaining);

    if (this.onTick) {
      this.tickTimerId = setInterval(() => {
        this._emitTick();
      }, this.tickIntervalMs);
    }
  }

  private _fire(): void {
    if (this.fired || this.endsAt === null) {
      return;
    }

    this.fired = true;
    const onFire = this.onFire;
    this._clearTimersOnly();
    this._removeVisibility();
    this.endsAt = null;
    this.onFire = null;
    this.onTick = null;
    onFire?.();
  }

  private _emitTick(): void {
    if (!this.onTick || this.endsAt === null) {
      return;
    }
    this.onTick(this.remainingMs);
  }

  private readonly _handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.sync();
    }
  };

  private _ensureVisibility(): void {
    if (!this.autoVisibility || this.visibilityAttached) {
      return;
    }
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
    this.visibilityAttached = true;
  }

  private _removeVisibility(): void {
    if (!this.visibilityAttached) {
      return;
    }
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    this.visibilityAttached = false;
  }

  private _clearTimersOnly(): void {
    if (this.fireTimerId !== null) {
      clearTimeout(this.fireTimerId);
      this.fireTimerId = null;
    }
    if (this.tickTimerId !== null) {
      clearInterval(this.tickTimerId);
      this.tickTimerId = null;
    }
  }
}
