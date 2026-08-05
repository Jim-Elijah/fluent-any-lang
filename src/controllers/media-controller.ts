import {
  computeSegmentPauseMs,
  findCrossedSegmentEnd,
  findSegmentIndex,
  MAX_SLEEP_MINUTES,
  NATIVE_MEDIA_EVENTS,
  shuffleIndices,
  ExtendedMediaEventType,
} from '../lib/playback-utils.js';
import { DeadlineScheduler } from '../lib/deadline-scheduler.js';
import { throttle } from '../lib/util.js';
import {
  PLAYBACK_RATE_LIMITS,
  SHADOWING_COMPRESS_GAP_MS,
  type LoopMode,
  type MediaItem,
  type PauseMode,
  type SleepMode,
  type SubtitleSegment,
} from '../types/models.js';
import { getAppSettings, getMaxPlaybackRate, getMaxVolumeBoost } from '../lib/app-settings.js';
import {
  attachMediaElementGain,
  detachMediaElementGain,
  setLogicalVolume,
} from '../lib/media-element-gain.js';

export type MediaControllerSnapshot = {
  playlist: MediaItem[];
  currentIndex: number;
  currentItem: MediaItem | null;
  segments: SubtitleSegment[];
  currentSegmentIndex: number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  loopMode: LoopMode;
  subtitlesVisible: boolean;
  hasSubtitles: boolean;
  sleepMode: SleepMode;
  sleepMinutes: number;
  sleepRemainingSeconds: number;
  sleepActive: boolean;
  pauseMode: PauseMode;
  pauseSeconds: number;
  pausePercent: number;
  segmentPausePending: boolean;
  canPreviousTrack: boolean;
  canNextTrack: boolean;
  canPreviousSegment: boolean;
  canNextSegment: boolean;
  canReplaySegment: boolean;
  navigationLocked: boolean;
};

export type SeekOptions = {
  force?: boolean;
};

export type LoadedTrack = {
  item: MediaItem;
  blob: Blob;
  segments: SubtitleSegment[];
};

const LOOP_EPSILON = 0.015;
const TIMEUPDATE_THROTTLE_MS = 250;

const DEFAULT_PLAYER_SETTINGS = {
  playbackRate: 1,
  volume: 1,
  subtitlesVisible: true,
  sleepMode: 'off' as SleepMode,
  pauseMode: 'off' as PauseMode,
  pauseSeconds: 1,
  get loopMode(): LoopMode {
    return getAppSettings().defaultLoopMode;
  },
  get sleepMinutes(): number {
    return getAppSettings().defaultSleepMinutes;
  },
  get pausePercent(): number {
    return getAppSettings().repeatPausePercent;
  },
};

export class MediaController extends EventTarget {
  private mediaElement: HTMLMediaElement | null = null;
  private objectUrl: string | null = null;
  private tracks: LoadedTrack[] = [];
  private shuffleOrder: number[] = [];
  private shuffleCursor = 0;
  private _previousPlaybackTime = 0;
  private _visibilityListenerAttached = false;
  /** True after seek() until seeked (or sync seek that never sets seeking). */
  private _seekInFlight = false;
  /** Generation of the seek currently awaiting settle. */
  private _pendingSeekGeneration = 0;
  /** Count of seek() calls still awaiting a matching seeked (or sync completion). */
  private _outstandingSeekOps = 0;
  private _seekSettlePromise: Promise<void> | null = null;
  private _resolveSeekSettle: (() => void) | null = null;

  playlist: MediaItem[] = [];
  segments: SubtitleSegment[] = [];
  currentIndex = 0;
  currentSegmentIndex = -1;
  currentTime = 0;
  duration = 0;
  isPlaying = false;
  playbackRate = DEFAULT_PLAYER_SETTINGS.playbackRate;
  volume = DEFAULT_PLAYER_SETTINGS.volume;
  loopMode: LoopMode = DEFAULT_PLAYER_SETTINGS.loopMode;
  subtitlesVisible = DEFAULT_PLAYER_SETTINGS.subtitlesVisible;
  sleepMode: SleepMode = DEFAULT_PLAYER_SETTINGS.sleepMode;
  sleepMinutes = DEFAULT_PLAYER_SETTINGS.sleepMinutes;
  sleepRemainingSeconds = 0;
  pauseMode: PauseMode = DEFAULT_PLAYER_SETTINGS.pauseMode;
  pauseSeconds = DEFAULT_PLAYER_SETTINGS.pauseSeconds;
  pausePercent = DEFAULT_PLAYER_SETTINGS.pausePercent;
  /**
   * When true (shadowing + compress gap policy), SEGMENT_END waits
   * {@link SHADOWING_COMPRESS_GAP_MS} on the ended sentence, then seeks to the
   * next cue and resumes — instead of normal pauseMode.
   */
  shadowingGapCompress = false;

  private readonly _sleepScheduler = new DeadlineScheduler();
  private readonly _segmentPauseScheduler = new DeadlineScheduler();
  private _navigationLocked = false;
  private _pendingAutoPlay = false;

  attachMediaElement(element: HTMLMediaElement): void {
    if (this.mediaElement === element) {
      return;
    }

    this.detachMediaElement();
    this.mediaElement = element;
    element.addEventListener('play', this._handlePlay);
    element.addEventListener('pause', this._handlePause);
    element.addEventListener('ended', this._handleEnded);
    element.addEventListener('loadedmetadata', this._handleLoadedMetadata);
    element.addEventListener('seeked', this._handleSeeked);
    element.addEventListener('timeupdate', this._handleTimeUpdate);
    this._ensureVisibilityListener();

    // 转发原生 media 事件
    for (const evtName of NATIVE_MEDIA_EVENTS) {
      element.addEventListener(evtName, this._handleNativeEvent);
    }

    element.playbackRate = this.playbackRate;
    attachMediaElementGain(element);
    setLogicalVolume(element, this.volume);

    // Tracks may load before the player mounts an <audio>/<video> (no currentItem yet).
    // Re-apply the object URL so play() works after late attach.
    if (this.objectUrl) {
      element.src = this.objectUrl;
      element.load();
      element.currentTime = this.currentTime;
      if (this._pendingAutoPlay) {
        this._pendingAutoPlay = false;
        void element.play();
      }
    }
  }

  detachMediaElement(): void {
    if (!this.mediaElement) {
      return;
    }

    this.mediaElement.removeEventListener('play', this._handlePlay);
    this.mediaElement.removeEventListener('pause', this._handlePause);
    this.mediaElement.removeEventListener('ended', this._handleEnded);
    this.mediaElement.removeEventListener('loadedmetadata', this._handleLoadedMetadata);
    this.mediaElement.removeEventListener('seeked', this._handleSeeked);
    this.mediaElement.removeEventListener('timeupdate', this._handleTimeUpdate);

    // 移除原生事件转发
    for (const evtName of NATIVE_MEDIA_EVENTS) {
      this.mediaElement.removeEventListener(evtName, this._handleNativeEvent);
    }

    const element = this.mediaElement;
    this.mediaElement = null;
    detachMediaElementGain(element);
  }

  private _handleNativeEvent = (event: Event): void => {
    // 转发原生事件，携带原始 event 作为 detail
    this.dispatchEvent(
      new CustomEvent(event.type, {
        detail: { originalEvent: event },
      }),
    );
  };

  async loadTracks(tracks: LoadedTrack[], startIndex = 0): Promise<void> {
    this.tracks = tracks;
    this.playlist = tracks.map((track) => track.item);

    if (this.loopMode === 'shuffle') {
      this._resetShuffleOrder(startIndex);
    }

    const safeIndex = this._normalizeIndex(startIndex);
    await this.loadTrack(safeIndex);
  }

  async loadTrack(index: number, autoPlay = false): Promise<void> {
    if (this.tracks.length === 0) {
      this._clearTrackState();
      this._emitChange();
      return;
    }

    const trackIndex = this._normalizeIndex(index);
    const track = this.tracks[trackIndex];
    if (!track) {
      return;
    }

    const previousIndex = this.currentIndex;
    const previousItem = this.playlist[previousIndex] ?? null;

    this.currentIndex = trackIndex;
    this.segments = track.segments;
    this.currentSegmentIndex = this.segments.length > 0 ? 0 : -1;
    if (this.segments.length === 0) {
      this.pauseMode = 'off';
      this._clearSegmentPauseTimer();
    }
    this._revokeObjectUrl();

    const nextUrl = URL.createObjectURL(track.blob);
    this.objectUrl = nextUrl;
    const shouldPlay = autoPlay || (this.mediaElement ? !this.mediaElement.paused : false);

    if (this.mediaElement && this._isMediaElementCompatible(this.mediaElement, track.item.type)) {
      this.mediaElement.src = nextUrl;
      this.mediaElement.load();
      this.mediaElement.playbackRate = this.playbackRate;
      setLogicalVolume(this.mediaElement, this.volume);

      await new Promise<void>((resolve) => {
        const element = this.mediaElement;
        if (!element) {
          resolve();
          return;
        }

        const onReady = (): void => {
          element.removeEventListener('loadedmetadata', onReady);
          resolve();
        };

        if (element.readyState >= HTMLMediaElement.HAVE_METADATA) {
          resolve();
          return;
        }

        element.addEventListener('loadedmetadata', onReady);
      });

      this.duration = this.mediaElement.duration || track.item.duration;
      this.currentTime = 0;
      this._previousPlaybackTime = 0;

      if (shouldPlay) {
        await this.play();
      }
    } else {
      this.duration = track.item.duration;
      this.currentTime = 0;
      this._previousPlaybackTime = 0;
      this._pendingAutoPlay = shouldPlay;
    }

    if (trackIndex !== previousIndex) {
      this.dispatchEvent(
        new CustomEvent(ExtendedMediaEventType.TRACK_CHANGE, {
          detail: {
            currentIndex: trackIndex,
            currentItem: track.item,
            previousIndex,
            previousItem,
          },
          bubbles: true,
          composed: true,
        }),
      );
    }

    this._emitChange();
  }

  /** Current track media blob, if a track is loaded. */
  getCurrentBlob(): Blob | null {
    return this.tracks[this.currentIndex]?.blob ?? null;
  }

  getSnapshot(): MediaControllerSnapshot {
    const currentItem = this.playlist[this.currentIndex] ?? null;

    return {
      playlist: this.playlist,
      currentIndex: this.currentIndex,
      currentItem,
      segments: this.segments,
      currentSegmentIndex: this.currentSegmentIndex,
      currentTime: this.currentTime,
      duration: this.duration,
      isPlaying: this.isPlaying,
      playbackRate: this.playbackRate,
      volume: this.volume,
      loopMode: this.loopMode,
      subtitlesVisible: this.subtitlesVisible,
      hasSubtitles: this.segments.length > 0,
      sleepMode: this.sleepMode,
      sleepMinutes: this.sleepMinutes,
      sleepRemainingSeconds: this.sleepRemainingSeconds,
      sleepActive: this.sleepMode !== 'off',
      pauseMode: this.pauseMode,
      pauseSeconds: this.pauseSeconds,
      pausePercent: this.pausePercent,
      segmentPausePending: this._segmentPauseScheduler.isActive,
      canPreviousTrack: this.playlist.length > 1,
      canNextTrack: this.playlist.length > 1,
      canPreviousSegment: this.segments.length > 0 && this.currentSegmentIndex > 0,
      canNextSegment:
        this.segments.length > 0 &&
        this.currentSegmentIndex >= 0 &&
        this.currentSegmentIndex < this.segments.length - 1,
      canReplaySegment: this.segments.length > 0 && this.currentSegmentIndex >= 0,
      navigationLocked: this._navigationLocked,
    };
  }

  setNavigationLocked(locked: boolean): void {
    if (this._navigationLocked === locked) {
      return;
    }
    this._navigationLocked = locked;
    this._emitChange();
  }

  async play(): Promise<void> {
    if (!this.mediaElement) {
      return;
    }
    // Only await when a seek is actually outstanding. Awaiting an already-resolved
    // Promise.resolve() would defer mediaElement.play() to a microtask and break
    // callers that expect play() to kick off synchronously after a sync seek.
    if (this._seekInFlight) {
      await this._waitForSeekSettle();
    }
    await this.mediaElement.play();
  }

  pause(options?: { reason?: 'user' | 'segment' }): void {
    if (options?.reason !== 'segment') {
      this._clearSegmentPauseTimer();
    }
    this.mediaElement?.pause();
  }

  async togglePlay(): Promise<void> {
    if (this.isPlaying) {
      this.pause();
      return;
    }
    await this.play();
  }

  seek(time: number, options?: SeekOptions): void {
    if (!this.mediaElement) {
      return;
    }
    if (this._navigationLocked && !options?.force) {
      return;
    }

    const clamped = Math.max(0, Math.min(time, this.duration || this.mediaElement.duration || 0));
    const resumeAfterSegmentPause = this._segmentPauseScheduler.isActive;
    this._clearSegmentPauseTimer();
    const generation = ++this._pendingSeekGeneration;
    // Always block SEGMENT_END until settle — do not trust mediaElement.seeking,
    // which is not always true synchronously after assigning currentTime.
    if (this._resolveSeekSettle) {
      this._resolveSeekSettle();
      this._resolveSeekSettle = null;
      this._seekSettlePromise = null;
    }
    this._seekInFlight = true;
    this._seekSettlePromise = new Promise<void>((resolve) => {
      this._resolveSeekSettle = resolve;
    });
    this._outstandingSeekOps++;
    this.mediaElement.currentTime = clamped;
    this.currentTime = clamped;
    this._previousPlaybackTime = clamped;
    if (!this.mediaElement.seeking) {
      // Sync seek: currentTime already applied and seeked may never fire.
      this._completeSeekOp(generation);
    }
    this._updateCurrentSegment({ allowForward: true });
    if (resumeAfterSegmentPause) {
      // Segment pause is a temporary study gap, not a user stop — keep the session going.
      void this.play();
    }
    this._emitChange();
  }

  /** Seek and resolve only after the media element has settled on the new time. */
  async seekAsync(time: number, options?: SeekOptions): Promise<void> {
    if (!this.mediaElement) {
      return;
    }
    if (this._navigationLocked && !options?.force) {
      return;
    }

    this.seek(time, options);
    await this._waitForSeekSettle();
  }

  seekToSegment(index: number, autoPlay = false, options?: SeekOptions): void {
    if (this._navigationLocked && !options?.force) {
      return;
    }

    const segment = this.segments[index];
    if (!segment) {
      return;
    }

    const resumeAfterSegmentPause = this._segmentPauseScheduler.isActive;
    this._setCurrentSegmentIndex(index);
    this.seek(segment.startTime, { force: true });

    if (autoPlay && !resumeAfterSegmentPause) {
      void this.play();
    }
  }

  async seekToSegmentAsync(index: number, autoPlay = false, options?: SeekOptions): Promise<void> {
    if (this._navigationLocked && !options?.force) {
      return;
    }

    const segment = this.segments[index];
    if (!segment) {
      return;
    }

    const resumeAfterSegmentPause = this._segmentPauseScheduler.isActive;
    this._setCurrentSegmentIndex(index);
    await this.seekAsync(segment.startTime, { force: true });

    if (autoPlay && !resumeAfterSegmentPause) {
      await this.play();
    }
  }

  previousTrack(autoPlay = false, options?: SeekOptions): void {
    if (this._navigationLocked && !options?.force) {
      return;
    }
    if (this.playlist.length <= 1) {
      return;
    }

    if (this.loopMode === 'shuffle') {
      this.shuffleCursor =
        (this.shuffleCursor - 1 + this.shuffleOrder.length) % this.shuffleOrder.length;
      void this.loadTrack(this.shuffleOrder[this.shuffleCursor] ?? 0, autoPlay);
      return;
    }

    const nextIndex = this.currentIndex - 1 < 0 ? this.playlist.length - 1 : this.currentIndex - 1;
    void this.loadTrack(nextIndex, autoPlay);
  }

  nextTrack(autoPlay = false, options?: SeekOptions): void {
    if (this._navigationLocked && !options?.force) {
      return;
    }
    if (this.playlist.length <= 1) {
      return;
    }

    if (this.loopMode === 'shuffle') {
      const nextCursor = (this.shuffleCursor + 1) % this.shuffleOrder.length;
      if (nextCursor === 0 && this.shuffleOrder.length > 1) {
        this._resetShuffleOrder(this.shuffleOrder[0] ?? 0);
      }
      this.shuffleCursor = nextCursor;
      void this.loadTrack(this.shuffleOrder[this.shuffleCursor] ?? 0, autoPlay);
      return;
    }

    const nextIndex = this.currentIndex + 1 >= this.playlist.length ? 0 : this.currentIndex + 1;
    void this.loadTrack(nextIndex, autoPlay);
  }

  previousSegment(): void {
    if (this._navigationLocked) {
      return;
    }
    if (this.currentSegmentIndex <= 0) {
      return;
    }
    this.seekToSegment(this.currentSegmentIndex - 1);
  }

  nextSegment(): void {
    if (this._navigationLocked) {
      return;
    }
    if (this.currentSegmentIndex < 0 || this.currentSegmentIndex >= this.segments.length - 1) {
      return;
    }
    this.seekToSegment(this.currentSegmentIndex + 1);
  }

  /** Seek to the start of the current subtitle segment and play. */
  replaySegment(): void {
    if (this._navigationLocked) {
      return;
    }
    if (this.currentSegmentIndex < 0) {
      return;
    }
    this.seekToSegment(this.currentSegmentIndex, true);
  }

  setPlaybackRate(rate: number): void {
    const max = getMaxPlaybackRate();
    const clamped = Math.max(PLAYBACK_RATE_LIMITS.min, Math.min(rate, max));
    const stepped = Math.round(clamped / PLAYBACK_RATE_LIMITS.step) * PLAYBACK_RATE_LIMITS.step;
    const next = Math.max(PLAYBACK_RATE_LIMITS.min, Math.min(Number(stepped.toFixed(10)), max));
    this.playbackRate = next;
    if (this.mediaElement) {
      this.mediaElement.playbackRate = next;
    }
    this._emitChange();
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(volume, getMaxVolumeBoost()));
    this.volume = clamped;
    if (this.mediaElement) {
      setLogicalVolume(this.mediaElement, clamped);
    }
    this._emitChange();
  }

  setLoopMode(mode: LoopMode): void {
    if (mode === 'segment' && this.segments.length === 0) {
      return;
    }

    this.loopMode = mode;
    if (mode === 'segment') {
      const idx = findSegmentIndex(this.segments, this.currentTime);
      if (idx >= 0) {
        this._setCurrentSegmentIndex(idx);
      }
    } else if (mode === 'shuffle') {
      this._resetShuffleOrder(this.currentIndex);
    }
    this._emitChange();
  }

  setSleepMode(mode: SleepMode): void {
    this.sleepMode = mode;

    if (mode === 'minutes') {
      this._startSleepTimer();
    } else {
      this._clearSleepTimer();
      this.sleepRemainingSeconds = 0;
    }

    this._emitChange();
  }

  setSleepMinutes(minutes: number): void {
    const clamped = Math.max(0, Math.min(minutes, MAX_SLEEP_MINUTES));
    this.sleepMinutes = clamped;

    if (this.sleepMode === 'minutes') {
      this._startSleepTimer();
    }

    this._emitChange();
  }

  cancelSleep(): void {
    this.setSleepMode('off');
  }

  setPauseMode(mode: PauseMode): void {
    if (mode !== 'off' && this.segments.length === 0) {
      return;
    }

    this.pauseMode = mode;

    if (mode === 'off') {
      this._clearSegmentPauseTimer();
    }

    this._emitChange();
  }

  setShadowingGapCompress(enabled: boolean): void {
    this.shadowingGapCompress = enabled;
    if (!enabled) {
      this._clearSegmentPauseTimer();
    }
    this._emitChange();
  }

  setPauseSeconds(seconds: number): void {
    const clamped = Math.max(1, Math.min(seconds, 30));
    this.pauseSeconds = clamped;
    this._emitChange();
  }

  setPausePercent(percent: number): void {
    const clamped = Math.max(100, Math.min(percent, 500));
    this.pausePercent = clamped;
    this._emitChange();
  }

  cancelSegmentPause(): void {
    this._clearSegmentPauseTimer();
    this._emitChange();
  }

  /** Reset all player settings (loop, pause, sleep, rate, volume, etc.) to defaults. */
  resetSettings(): void {
    this._clearSegmentPauseTimer();
    this._clearSleepTimer();

    this.playbackRate = DEFAULT_PLAYER_SETTINGS.playbackRate;
    this.volume = DEFAULT_PLAYER_SETTINGS.volume;
    this.loopMode = DEFAULT_PLAYER_SETTINGS.loopMode;
    this.subtitlesVisible = DEFAULT_PLAYER_SETTINGS.subtitlesVisible;
    this.sleepMode = DEFAULT_PLAYER_SETTINGS.sleepMode;
    this.sleepMinutes = DEFAULT_PLAYER_SETTINGS.sleepMinutes;
    this.sleepRemainingSeconds = 0;
    this.pauseMode = DEFAULT_PLAYER_SETTINGS.pauseMode;
    this.pauseSeconds = DEFAULT_PLAYER_SETTINGS.pauseSeconds;
    this.pausePercent = DEFAULT_PLAYER_SETTINGS.pausePercent;

    if (this.mediaElement) {
      this.mediaElement.playbackRate = this.playbackRate;
      setLogicalVolume(this.mediaElement, this.volume);
    }

    this._emitChange();
  }

  /**
   * 更新当前曲目字幕（例如练习页补导入字幕后），不重新加载媒体 blob。
   */
  updateCurrentTrackSubtitles(segments: SubtitleSegment[], mediaUpdate?: Partial<MediaItem>): void {
    const track = this.tracks[this.currentIndex];
    if (!track) {
      return;
    }

    track.segments = segments;
    track.item = {
      ...track.item,
      ...mediaUpdate,
      hasSubtitles: segments.length > 0,
    };
    this.playlist[this.currentIndex] = track.item;
    this.segments = segments;
    this.currentSegmentIndex = segments.length > 0 ? 0 : -1;

    if (segments.length === 0) {
      this.pauseMode = 'off';
      this._clearSegmentPauseTimer();
    } else {
      this.subtitlesVisible = true;
    }

    this._emitChange();
  }

  setSubtitlesVisible(visible: boolean): void {
    this.subtitlesVisible = visible;
    this._emitChange();
  }

  destroy(): void {
    this._throttledEmitChange.cancel();
    this._clearSleepTimer();
    this._clearSegmentPauseTimer();
    this._removeVisibilityListener();
    this.detachMediaElement();
    this._revokeObjectUrl();
    this._navigationLocked = false;
    this.tracks = [];
    this.playlist = [];
    this.segments = [];
  }

  private _handleTimeUpdate = (): void => {
    if (
      !this.mediaElement ||
      this.mediaElement.paused ||
      this.mediaElement.seeking ||
      this._seekInFlight
    ) {
      return;
    }

    this._onPlaybackTick(false);
  };

  /** Resync clocks after seek so a stale timeupdate cannot invent SEGMENT_END. */
  private _handleSeeked = (): void => {
    if (!this.mediaElement || this.mediaElement.seeking) {
      return;
    }
    this._completeSeekOp(this._pendingSeekGeneration);
  };

  private _completeSeekOp(generation: number): void {
    if (!this.mediaElement || !this._seekInFlight) {
      return;
    }
    this._outstandingSeekOps = Math.max(0, this._outstandingSeekOps - 1);
    if (this._outstandingSeekOps > 0 || generation !== this._pendingSeekGeneration) {
      return;
    }
    this._settleSeek(generation);
  }

  private _settleSeek(generation: number): void {
    if (!this.mediaElement || generation !== this._pendingSeekGeneration || !this._seekInFlight) {
      return;
    }
    this._seekInFlight = false;
    this.currentTime = this.mediaElement.currentTime;
    this._previousPlaybackTime = this.currentTime;
    const resolve = this._resolveSeekSettle;
    this._resolveSeekSettle = null;
    this._seekSettlePromise = null;
    resolve?.();
  }

  private _waitForSeekSettle(): Promise<void> {
    return this._seekSettlePromise ?? Promise.resolve();
  }

  /** Shared playback tick: detect segment end, apply loop, update highlight index. */
  private _onPlaybackTick(emitImmediately: boolean): void {
    if (!this.mediaElement) {
      return;
    }

    this.currentTime = this.mediaElement.currentTime;
    this.duration = this.mediaElement.duration || this.duration;

    this._detectSegmentEnd();
    this._applySegmentLoop();
    // Segment loop pins the active sentence: time-based index updates (including
    // findSegmentIndex's "keep previous in gap" rule) can jump backward when a
    // rewind undershoots into the pre-segment gap.
    // Compress jumps also land briefly in inter-cue hollows — never regress there.
    if (this.loopMode !== 'segment') {
      this._updateCurrentSegment({
        allowForward: true,
        allowBackward: !this.shadowingGapCompress,
      });
    }

    this._previousPlaybackTime = this.currentTime;

    if (emitImmediately) {
      this._emitChange();
    } else {
      this._throttledEmitChange();
    }
  }

  private _throttledEmitChange = throttle(function (this: MediaController) {
    this._emitChange();
  }, TIMEUPDATE_THROTTLE_MS);

  private _handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') {
      return;
    }

    // Sleep / segment-pause DeadlineSchedulers resync themselves on visibility.
    if (this.mediaElement && !this.mediaElement.paused) {
      this._syncFromMedia();
    }
  };

  private _ensureVisibilityListener(): void {
    if (this._visibilityListenerAttached) {
      return;
    }
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
    this._visibilityListenerAttached = true;
  }

  private _removeVisibilityListener(): void {
    if (!this._visibilityListenerAttached) {
      return;
    }
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    this._visibilityListenerAttached = false;
  }

  private _handlePlay = (): void => {
    this.isPlaying = true;
    this._emitChange();
  };

  private _handlePause = (): void => {
    this.isPlaying = false;
    // Browsers often fire `pause` before `ended` when a clip finishes.
    if (this.mediaElement?.ended) {
      this._snapPlaybackToEnd();
    }
    this._emitChange();
  };

  private _handleLoadedMetadata = (): void => {
    if (this.mediaElement) {
      this.duration = this.mediaElement.duration || this.duration;
      this._emitChange();
    }
  };

  /** Align UI time with the true end when natural playback finishes. */
  private _snapPlaybackToEnd(): void {
    const endTime = this.mediaElement?.duration || this.duration;
    if (!Number.isFinite(endTime) || endTime <= 0) {
      return;
    }
    this.duration = endTime;
    this.currentTime = endTime;
  }

  private _handleEnded = (): void => {
    if (this.sleepMode === 'until-end') {
      this.setSleepMode('off');
      this.pause();
      return;
    }

    switch (this.loopMode) {
      case 'single':
        this.seek(0, { force: true });
        void this.play();
        break;
      case 'list':
        this.nextTrack(true, { force: true });
        break;
      case 'shuffle':
        this.nextTrack(true, { force: true });
        break;
      case 'segment': {
        const loopIndex = this._resolveLoopSegmentIndex();
        if (loopIndex >= 0) {
          this.seekToSegment(loopIndex, true, { force: true });
        } else {
          this.seek(0, { force: true });
          void this.play();
        }
        break;
      }
      default:
        console.log('default');
        this.isPlaying = false;
        this._throttledEmitChange.cancel();
        this._snapPlaybackToEnd();
        this._emitChange();
        break;
    }
  };

  private _syncFromMedia(): void {
    if (!this.mediaElement) {
      return;
    }

    this._onPlaybackTick(true);
  }

  /** Segment index used for loop/end detection; falls back to last segment when past its end. */
  private _resolveLoopSegmentIndex(): number {
    if (this.currentSegmentIndex >= 0) {
      return this.currentSegmentIndex;
    }

    if (this.loopMode !== 'segment' || this.segments.length === 0) {
      return -1;
    }

    const lastIdx = this.segments.length - 1;
    const last = this.segments[lastIdx];
    if (last && this.currentTime >= last.endTime - LOOP_EPSILON) {
      return lastIdx;
    }

    return -1;
  }

  /** Segment loop rewinds unless until-end is active on the last subtitle. */
  private _shouldLoopSegment(segmentIndex: number): boolean {
    const isLastSegment = segmentIndex === this.segments.length - 1;
    return !(this.sleepMode === 'until-end' && isLastSegment);
  }

  private _detectSegmentEnd(): void {
    if (!this.mediaElement || this.segments.length === 0) {
      return;
    }

    const segmentIndex = findCrossedSegmentEnd(
      this.segments,
      this._previousPlaybackTime,
      this.currentTime,
      LOOP_EPSILON,
    );
    if (segmentIndex < 0) {
      return;
    }

    const segment = this.segments[segmentIndex];
    if (!segment) {
      return;
    }

    this._setCurrentSegmentIndex(segmentIndex);
    this.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_END, {
        detail: { segmentIndex, segment },
        bubbles: true,
        composed: true,
      }),
    );
    this._applySegmentPause(segment);
  }

  private _applySegmentLoop(): void {
    if (this._segmentPauseScheduler.isActive) {
      return;
    }

    if (this.loopMode !== 'segment' || !this.mediaElement) {
      return;
    }

    const segmentIndex = this._resolveLoopSegmentIndex();
    if (segmentIndex < 0) {
      return;
    }

    const segment = this.segments[segmentIndex];
    if (!segment) {
      return;
    }

    if (!this._shouldLoopSegment(segmentIndex)) {
      return;
    }

    if (this.mediaElement.currentTime >= segment.endTime - LOOP_EPSILON) {
      this.mediaElement.currentTime = segment.startTime;
      this.currentTime = segment.startTime;
    }
  }

  private _setCurrentSegmentIndex(index: number): void {
    if (index === this.currentSegmentIndex) {
      return;
    }

    const previousIndex = this.currentSegmentIndex;
    this.currentSegmentIndex = index;
    this.dispatchEvent(
      new CustomEvent(ExtendedMediaEventType.SEGMENT_CHANGE, {
        detail: {
          currentIndex: index,
          currentSegment: this.segments[index] ?? null,
          previousIndex,
          previousSegment: this.segments[previousIndex] ?? null,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _updateCurrentSegment(
    options: { allowForward?: boolean; allowBackward?: boolean } = {},
  ): void {
    const allowForward = options.allowForward ?? true;
    const allowBackward = options.allowBackward ?? true;
    const nextIndex = findSegmentIndex(this.segments, this.currentTime);

    if (nextIndex === this.currentSegmentIndex) {
      return;
    }

    if (!allowForward && this.currentSegmentIndex >= 0 && nextIndex > this.currentSegmentIndex) {
      return;
    }

    if (
      !allowBackward &&
      this.currentSegmentIndex >= 0 &&
      nextIndex >= 0 &&
      nextIndex < this.currentSegmentIndex
    ) {
      return;
    }

    this._setCurrentSegmentIndex(nextIndex);
  }

  private _resetShuffleOrder(currentIndex: number): void {
    this.shuffleOrder = shuffleIndices(this.tracks.length);
    this.shuffleCursor = this.shuffleOrder.indexOf(currentIndex);
    if (this.shuffleCursor < 0) {
      this.shuffleCursor = 0;
    }
  }

  private _normalizeIndex(index: number): number {
    if (this.tracks.length === 0) {
      return 0;
    }
    if (index < 0) {
      return 0;
    }
    if (index >= this.tracks.length) {
      return this.tracks.length - 1;
    }
    return index;
  }

  private _isMediaElementCompatible(element: HTMLMediaElement, type: MediaItem['type']): boolean {
    if (type === 'video') {
      return element instanceof HTMLVideoElement;
    }
    return element instanceof HTMLAudioElement;
  }

  private _clearTrackState(): void {
    this.playlist = [];
    this.segments = [];
    this.currentIndex = 0;
    this.currentSegmentIndex = -1;
    this.currentTime = 0;
    this.duration = 0;
    this.isPlaying = false;
    this._pendingAutoPlay = false;
    this._previousPlaybackTime = 0;
    this.pauseMode = 'off';
    this._clearSegmentPauseTimer();
  }

  private _revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private _startSleepTimer(): void {
    this._clearSleepTimer();
    this.sleepRemainingSeconds = this.sleepMinutes * 60;

    if (this.sleepRemainingSeconds <= 0) {
      this.sleepMode = 'off';
      this._clearSegmentPauseTimer();
      this.pause();
      this._emitChange();
      return;
    }

    this._sleepScheduler.start({
      endsAt: Date.now() + this.sleepRemainingSeconds * 1000,
      tickIntervalMs: 1000,
      onTick: (remainingMs) => {
        this.sleepRemainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
        this._emitChange();
      },
      onFire: () => {
        this.sleepRemainingSeconds = 0;
        this.sleepMode = 'off';
        this._clearSegmentPauseTimer();
        this.pause();
        this._emitChange();
      },
    });
  }

  private _clearSleepTimer(): void {
    this._sleepScheduler.clear();
  }

  private _applySegmentPause(segment: SubtitleSegment): void {
    if (this.shadowingGapCompress) {
      this._applyShadowingGapCompress(segment);
      return;
    }

    const pauseDuration = computeSegmentPauseMs(
      segment,
      this.pauseMode,
      this.pauseSeconds,
      this.pausePercent,
    );
    if (pauseDuration === null) {
      return;
    }

    this._clearSegmentPauseTimer();
    this.pause({ reason: 'segment' });
    this._segmentPauseScheduler.start({
      endsAt: Date.now() + pauseDuration,
      onFire: () => {
        this._resumeAfterSegmentPause();
      },
    });
    this._emitChange();
  }

  /** Skip natural subtitle gaps: wait a fixed beat on the ended cue, then jump and play. */
  private _applyShadowingGapCompress(endedSegment: SubtitleSegment): void {
    const endedIndex = this.segments.findIndex((s) => s.id === endedSegment.id);
    const nextIndex = endedIndex + 1;
    if (endedIndex < 0 || nextIndex >= this.segments.length) {
      return;
    }

    if (!this.segments[nextIndex] || !this.mediaElement) {
      return;
    }

    this._clearSegmentPauseTimer();
    this.pause({ reason: 'segment' });
    this._segmentPauseScheduler.start({
      endsAt: Date.now() + SHADOWING_COMPRESS_GAP_MS,
      onFire: () => {
        this.seekToSegment(nextIndex, true, { force: true });
      },
    });
    this._emitChange();
  }

  private _resumeAfterSegmentPause(): void {
    if (this.loopMode === 'segment') {
      const loopIndex = this._resolveLoopSegmentIndex();
      if (loopIndex >= 0 && this._shouldLoopSegment(loopIndex)) {
        this.seekToSegment(loopIndex, false, { force: true });
      }
    }
    void this.play();
    this._emitChange();
  }

  private _clearSegmentPauseTimer(): void {
    this._segmentPauseScheduler.clear();
  }

  private _emitChange(): void {
    this.dispatchEvent(
      new CustomEvent('state-change', {
        detail: this.getSnapshot(),
      }),
    );
  }
}
