import type { MediaController, MediaControllerSnapshot } from '../controllers/media-controller.js';
import { addPracticeSession, toLocalDateKey } from '../db/practice-session.js';
import type { MediaType, PracticeAnalyticsMode, PracticeSession } from '../types/models.js';

/** 短于该阈值的会话不落库，避免点击抖动 */
export const MIN_ACTIVE_MS = 1000;

export type PracticeTimeFlags = {
  recording?: boolean;
  echoListening?: boolean;
};

export type PracticeTimeTrackerDeps = {
  saveSession?: (session: PracticeSession) => Promise<void>;
  now?: () => number;
  wallNow?: () => number;
  createId?: () => string;
};

/**
 * 练习时长埋点：订阅 MediaController，由 practice-view 注入 mode/flags。
 * 不修改播放/录音业务逻辑。
 */
export class PracticeTimeTracker {
  private controller: MediaController | null = null;
  private mediaId = '';
  private mediaTitle = '';
  private mediaType: MediaType = 'audio';
  private mediaFilename = '';
  private mode: PracticeAnalyticsMode = 'listening';
  private playing = false;
  private recording = false;
  private echoListening = false;
  private visible = true;

  private sessionId: string | null = null;
  private startedAt = 0;
  private accumulatedMs = 0;
  private segmentStart: number | null = null;
  private disposed = false;

  private readonly saveSession: (session: PracticeSession) => Promise<void>;
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private readonly createId: () => string;

  constructor(deps: PracticeTimeTrackerDeps = {}) {
    this.saveSession = deps.saveSession ?? addPracticeSession;
    this.now = deps.now ?? (() => performance.now());
    this.wallNow = deps.wallNow ?? (() => Date.now());
    this.createId = deps.createId ?? (() => crypto.randomUUID());
  }

  attach(controller: MediaController): void {
    this.disposed = false;
    if (this.controller === controller) {
      this.playing = controller.getSnapshot().isPlaying;
      this.visible = document.visibilityState !== 'hidden';
      this._reconcile();
      return;
    }
    this.detachControllerListeners();
    this.controller = controller;
    this.controller.addEventListener('state-change', this._onStateChange);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.addEventListener('pagehide', this._onPageHide);
    this.visible = document.visibilityState !== 'hidden';
    this.playing = controller.getSnapshot().isPlaying;
    this._reconcile();
  }

  setMedia(
    mediaId: string,
    mediaTitle: string,
    mediaType: MediaType = 'audio',
    mediaFilename = '',
  ): void {
    if (this.disposed) {
      return;
    }
    if (
      this.mediaId === mediaId &&
      this.mediaTitle === mediaTitle &&
      this.mediaType === mediaType &&
      this.mediaFilename === mediaFilename
    ) {
      return;
    }
    this._flush();
    this.mediaId = mediaId;
    this.mediaTitle = mediaTitle;
    this.mediaType = mediaType;
    this.mediaFilename = mediaFilename;
    this._reconcile();
  }

  setMode(mode: PracticeAnalyticsMode): void {
    if (this.disposed) {
      return;
    }
    if (this.mode === mode) {
      return;
    }
    this._flush();
    this.mode = mode;
    this._reconcile();
  }

  setFlags(flags: PracticeTimeFlags): void {
    if (this.disposed) {
      return;
    }
    let changed = false;
    if (flags.recording !== undefined && flags.recording !== this.recording) {
      this.recording = flags.recording;
      changed = true;
    }
    if (flags.echoListening !== undefined && flags.echoListening !== this.echoListening) {
      this.echoListening = flags.echoListening;
      changed = true;
    }
    if (changed) {
      this._reconcile();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this._flush();
    this.detachControllerListeners();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('pagehide', this._onPageHide);
    this.controller = null;
    this.disposed = true;
  }

  /** @internal 测试用 */
  getDebugState() {
    return {
      mode: this.mode,
      mediaId: this.mediaId,
      playing: this.playing,
      recording: this.recording,
      echoListening: this.echoListening,
      visible: this.visible,
      sessionId: this.sessionId,
      accumulatedMs: this.accumulatedMs,
      segmentStart: this.segmentStart,
      shouldAccumulate: this._shouldAccumulate(),
    };
  }

  private detachControllerListeners(): void {
    if (!this.controller) {
      return;
    }
    this.controller.removeEventListener('state-change', this._onStateChange);
  }

  private readonly _onStateChange = (event: Event): void => {
    const snapshot = (event as CustomEvent<MediaControllerSnapshot>).detail;
    const nextPlaying = snapshot?.isPlaying ?? false;
    if (nextPlaying === this.playing) {
      return;
    }
    this.playing = nextPlaying;
    this._reconcile();
  };

  private readonly _onVisibilityChange = (): void => {
    const nextVisible = document.visibilityState !== 'hidden';
    if (nextVisible === this.visible) {
      return;
    }
    this.visible = nextVisible;
    this._reconcile();
  };

  private readonly _onPageHide = (): void => {
    this._flush();
  };

  private _shouldAccumulate(): boolean {
    if (!this.mediaId || !this.visible) {
      return false;
    }
    switch (this.mode) {
      case 'listening':
        return this.playing;
      case 'shadowing':
        return this.playing || this.recording;
      case 'echo':
        return this.playing || this.recording || this.echoListening;
      default:
        return false;
    }
  }

  private _reconcile(): void {
    const should = this._shouldAccumulate();
    if (should) {
      this._ensureSession();
      this._startSegment();
    } else {
      this._stopSegment();
    }
  }

  private _ensureSession(): void {
    if (this.sessionId) {
      return;
    }
    this.sessionId = this.createId();
    this.startedAt = this.wallNow();
    this.accumulatedMs = 0;
    this.segmentStart = null;
  }

  private _startSegment(): void {
    if (this.segmentStart !== null) {
      return;
    }
    this.segmentStart = this.now();
  }

  private _stopSegment(): void {
    if (this.segmentStart === null) {
      return;
    }
    this.accumulatedMs += this.now() - this.segmentStart;
    this.segmentStart = null;
  }

  private _flush(): void {
    this._stopSegment();
    if (!this.sessionId || !this.mediaId) {
      this._resetSession();
      return;
    }
    const activeMs = Math.round(this.accumulatedMs);
    if (activeMs < MIN_ACTIVE_MS) {
      this._resetSession();
      return;
    }
    const endedAt = this.wallNow();
    const session: PracticeSession = {
      id: this.sessionId,
      mediaId: this.mediaId,
      mediaTitle: this.mediaTitle,
      mediaType: this.mediaType,
      mediaFilename: this.mediaFilename,
      mode: this.mode,
      startedAt: this.startedAt,
      endedAt,
      activeMs,
      dateKey: toLocalDateKey(this.startedAt),
    };
    this._resetSession();
    void this.saveSession(session).catch((err) => {
      console.warn('[PracticeTimeTracker] failed to save session', err);
    });
  }

  private _resetSession(): void {
    this.sessionId = null;
    this.startedAt = 0;
    this.accumulatedMs = 0;
    this.segmentStart = null;
  }
}
