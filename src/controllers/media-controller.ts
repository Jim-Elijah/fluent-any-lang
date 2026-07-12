import {
  computeSegmentPauseMs,
  findCrossedSegmentEnd,
  findSegmentIndex,
  MAX_SLEEP_MINUTES,
  NATIVE_MEDIA_EVENTS,
  shuffleIndices,
  ExtendedMediaEventType,
} from '../lib/playback-utils.js';
import { throttle } from '../lib/util.js';
import type {
  LoopMode,
  MediaItem,
  PauseMode,
  SleepMode,
  SubtitleSegment,
} from '../types/models.js';
import { DEFAULT_SETTINGS } from '../types/models.js';

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
};

export type LoadedTrack = {
  item: MediaItem;
  blob: Blob;
  segments: SubtitleSegment[];
};

const LOOP_EPSILON = 0.05;
const TIMEUPDATE_THROTTLE_MS = 250;

const DEFAULT_PLAYER_SETTINGS = {
  playbackRate: 1,
  volume: 1,
  loopMode: 'none' as LoopMode,
  subtitlesVisible: true,
  sleepMode: 'off' as SleepMode,
  sleepMinutes: 30,
  pauseMode: 'off' as PauseMode,
  pauseSeconds: 1,
  pausePercent: DEFAULT_SETTINGS.repeatPausePercent,
};

export class MediaController extends EventTarget {
  private mediaElement: HTMLMediaElement | null = null;
  private objectUrl: string | null = null;
  private tracks: LoadedTrack[] = [];
  private shuffleOrder: number[] = [];
  private shuffleCursor = 0;
  private _previousPlaybackTime = 0;
  private _visibilityListenerAttached = false;

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

  private sleepTimerId: ReturnType<typeof setInterval> | null = null;
  private sleepEndsAt: number | null = null;
  private _segmentPauseResumeAt: number | null = null;
  private _segmentPausePollId: ReturnType<typeof setInterval> | null = null;

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
    element.addEventListener('timeupdate', this._handleTimeUpdate);
    this._ensureVisibilityListener();

    // 转发原生 media 事件
    for (const evtName of NATIVE_MEDIA_EVENTS) {
      element.addEventListener(evtName, this._handleNativeEvent);
    }

    element.playbackRate = this.playbackRate;
    element.volume = this.volume;

    // Tracks may load before the player mounts an <audio>/<video> (no currentItem yet).
    // Re-apply the object URL so play() works after late attach.
    if (this.objectUrl) {
      element.src = this.objectUrl;
      element.load();
      element.currentTime = this.currentTime;
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
    this.mediaElement.removeEventListener('timeupdate', this._handleTimeUpdate);

    // 移除原生事件转发
    for (const evtName of NATIVE_MEDIA_EVENTS) {
      this.mediaElement.removeEventListener(evtName, this._handleNativeEvent);
    }

    this.mediaElement = null;
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
    // console.log('loadTrack enter', index, autoPlay);
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

    if (this.mediaElement) {
      const shouldPlay = autoPlay || !this.mediaElement.paused;
      this.mediaElement.src = nextUrl;
      this.mediaElement.load();
      this.mediaElement.playbackRate = this.playbackRate;
      this.mediaElement.volume = this.volume;

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

      // console.log('this.currentSegmentIndex', this.currentSegmentIndex);
      // delete below to make sure new track always start from first segment
      // if (this.currentSegmentIndex >= 0) {
      //   this.seekToSegment(this.currentSegmentIndex, false);
      // }

      if (shouldPlay) {
        await this.play();
      }
    } else {
      this.duration = track.item.duration;
      this.currentTime = 0;
      this._previousPlaybackTime = 0;
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
      segmentPausePending: this._segmentPauseResumeAt !== null,
      canPreviousTrack: this.playlist.length > 1,
      canNextTrack: this.playlist.length > 1,
      canPreviousSegment: this.segments.length > 0 && this.currentSegmentIndex > 0,
      canNextSegment:
        this.segments.length > 0 &&
        this.currentSegmentIndex >= 0 &&
        this.currentSegmentIndex < this.segments.length - 1,
    };
  }

  async play(): Promise<void> {
    if (!this.mediaElement) {
      return;
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

  seek(time: number): void {
    if (!this.mediaElement) {
      return;
    }

    const clamped = Math.max(0, Math.min(time, this.duration || this.mediaElement.duration || 0));
    this._clearSegmentPauseTimer();
    this.mediaElement.currentTime = clamped;
    this.currentTime = clamped;
    this._previousPlaybackTime = clamped;
    this._updateCurrentSegment({ allowForward: true });
    this._emitChange();
  }

  seekToSegment(index: number, autoPlay = false): void {
    const segment = this.segments[index];
    if (!segment) {
      return;
    }

    this._setCurrentSegmentIndex(index);
    this.seek(segment.startTime);

    if (autoPlay) {
      void this.play();
    }
  }

  previousTrack(autoPlay = false): void {
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

  nextTrack(autoPlay = false): void {
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
    if (this.currentSegmentIndex <= 0) {
      return;
    }
    this.seekToSegment(this.currentSegmentIndex - 1);
  }

  nextSegment(): void {
    if (this.currentSegmentIndex < 0 || this.currentSegmentIndex >= this.segments.length - 1) {
      return;
    }
    this.seekToSegment(this.currentSegmentIndex + 1);
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
    if (this.mediaElement) {
      this.mediaElement.playbackRate = rate;
    }
    this._emitChange();
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(volume, 1));
    this.volume = clamped;
    if (this.mediaElement) {
      this.mediaElement.volume = clamped;
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
      this.mediaElement.volume = this.volume;
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
    this.tracks = [];
    this.playlist = [];
    this.segments = [];
  }

  private _handleTimeUpdate = (): void => {
    if (!this.mediaElement || this.mediaElement.paused) {
      return;
    }

    this._onPlaybackTick(false);
  };

  /** Shared playback tick: detect segment end, apply loop, update highlight index. */
  private _onPlaybackTick(emitImmediately: boolean): void {
    if (!this.mediaElement) {
      return;
    }

    this.currentTime = this.mediaElement.currentTime;
    this.duration = this.mediaElement.duration || this.duration;

    this._detectSegmentEnd();
    this._applySegmentLoop();
    this._updateCurrentSegment({ allowForward: this.loopMode !== 'segment' });

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

    this._checkSegmentPauseResume();
    this._updateSleepRemaining();

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
    this._emitChange();
  };

  private _handleLoadedMetadata = (): void => {
    if (this.mediaElement) {
      this.duration = this.mediaElement.duration || this.duration;
      this._emitChange();
    }
  };

  private _handleEnded = (): void => {
    if (this.sleepMode === 'until-end') {
      this.setSleepMode('off');
      this.pause();
      return;
    }

    switch (this.loopMode) {
      case 'single':
        this.seek(0);
        void this.play();
        break;
      case 'list':
        this.nextTrack(true);
        break;
      case 'shuffle':
        this.nextTrack(true);
        break;
      case 'segment': {
        const loopIndex = this._resolveLoopSegmentIndex();
        if (loopIndex >= 0) {
          this.seekToSegment(loopIndex, true);
        } else {
          this.seek(0);
          void this.play();
        }
        break;
      }
      default:
        this.isPlaying = false;
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
    if (this._segmentPauseResumeAt !== null) {
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

  private _updateCurrentSegment(options: { allowForward?: boolean } = {}): void {
    const allowForward = options.allowForward ?? true;
    const nextIndex = findSegmentIndex(this.segments, this.currentTime);

    if (nextIndex === this.currentSegmentIndex) {
      return;
    }

    if (!allowForward && this.currentSegmentIndex >= 0 && nextIndex > this.currentSegmentIndex) {
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

  private _clearTrackState(): void {
    this.playlist = [];
    this.segments = [];
    this.currentIndex = 0;
    this.currentSegmentIndex = -1;
    this.currentTime = 0;
    this.duration = 0;
    this.isPlaying = false;
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

    this.sleepEndsAt = Date.now() + this.sleepRemainingSeconds * 1000;
    this.sleepTimerId = setInterval(() => {
      this._updateSleepRemaining();
    }, 1000);
  }

  private _updateSleepRemaining(): void {
    if (this.sleepEndsAt === null) {
      return;
    }

    this.sleepRemainingSeconds = Math.max(0, Math.ceil((this.sleepEndsAt - Date.now()) / 1000));

    if (this.sleepRemainingSeconds <= 0) {
      this._clearSleepTimer();
      this.sleepMode = 'off';
      this._clearSegmentPauseTimer();
      this.pause();
    }

    this._emitChange();
  }

  private _clearSleepTimer(): void {
    if (this.sleepTimerId !== null) {
      clearInterval(this.sleepTimerId);
      this.sleepTimerId = null;
    }
    this.sleepEndsAt = null;
  }

  private _applySegmentPause(segment: SubtitleSegment): void {
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
    this._segmentPauseResumeAt = Date.now() + pauseDuration;
    this._startSegmentPausePoll();
    this._emitChange();
  }

  private _startSegmentPausePoll(): void {
    if (this._segmentPausePollId !== null) {
      return;
    }

    this._segmentPausePollId = setInterval(() => {
      this._checkSegmentPauseResume();
    }, 250);
  }

  private _checkSegmentPauseResume(): void {
    if (this._segmentPauseResumeAt === null) {
      return;
    }

    if (Date.now() < this._segmentPauseResumeAt) {
      return;
    }

    this._clearSegmentPauseTimer();

    if (this.loopMode === 'segment') {
      const loopIndex = this._resolveLoopSegmentIndex();
      if (loopIndex >= 0 && this._shouldLoopSegment(loopIndex)) {
        this.seekToSegment(loopIndex);
      }
    }
    void this.play();
    this._emitChange();
  }

  private _clearSegmentPauseTimer(): void {
    this._segmentPauseResumeAt = null;

    if (this._segmentPausePollId !== null) {
      clearInterval(this._segmentPausePollId);
      this._segmentPausePollId = null;
    }
  }

  private _emitChange(): void {
    this.dispatchEvent(
      new CustomEvent('state-change', {
        detail: this.getSnapshot(),
      }),
    );
  }
}
