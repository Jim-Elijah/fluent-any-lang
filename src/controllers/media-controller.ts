import { findSegmentIndex, shuffleIndices } from '../lib/playback-utils.js';
import type { LoopMode, MediaItem, SleepMode, SubtitleSegment } from '../types/models.js';

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

export class MediaController extends EventTarget {
  private mediaElement: HTMLMediaElement | null = null;
  private objectUrl: string | null = null;
  private tracks: LoadedTrack[] = [];
  private shuffleOrder: number[] = [];
  private shuffleCursor = 0;
  private timeUpdateFrame: number | null = null;
  private _segmentEndDispatched: boolean | null = null;

  playlist: MediaItem[] = [];
  segments: SubtitleSegment[] = [];
  currentIndex = 0;
  currentSegmentIndex = -1;
  currentTime = 0;
  duration = 0;
  isPlaying = false;
  playbackRate = 1;
  volume = 1;
  loopMode: LoopMode = 'none';
  subtitlesVisible = true;
  sleepMode: SleepMode = 'off';
  sleepMinutes = 30;
  sleepRemainingSeconds = 0;

  private sleepTimerId: ReturnType<typeof setInterval> | null = null;

  attachMediaElement(element: HTMLMediaElement): void {
    if (this.mediaElement === element) {
      return;
    }

    this.detachMediaElement();
    this.mediaElement = element;
    element.addEventListener('timeupdate', this._handleTimeUpdate);
    element.addEventListener('play', this._handlePlay);
    element.addEventListener('pause', this._handlePause);
    element.addEventListener('ended', this._handleEnded);
    element.addEventListener('loadedmetadata', this._handleLoadedMetadata);
    element.playbackRate = this.playbackRate;
    element.volume = this.volume;
  }

  detachMediaElement(): void {
    if (!this.mediaElement) {
      return;
    }

    this.mediaElement.removeEventListener('timeupdate', this._handleTimeUpdate);
    this.mediaElement.removeEventListener('play', this._handlePlay);
    this.mediaElement.removeEventListener('pause', this._handlePause);
    this.mediaElement.removeEventListener('ended', this._handleEnded);
    this.mediaElement.removeEventListener('loadedmetadata', this._handleLoadedMetadata);
    this.mediaElement = null;
  }

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

    this.currentIndex = trackIndex;
    this.segments = track.segments;
    this.currentSegmentIndex = this.segments.length > 0 ? 0 : -1;
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

      // console.log('this.currentSegmentIndex', this.currentSegmentIndex);
      // delete below to make sure new track always start from
      // if (this.currentSegmentIndex >= 0) {
      //   this.seekToSegment(this.currentSegmentIndex, false);
      // }

      if (shouldPlay) {
        await this.play();
      }
    } else {
      this.duration = track.item.duration;
      this.currentTime = 0;
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

  pause(): void {
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
    // console.log('seek', time);
    if (!this.mediaElement) {
      return;
    }

    const clamped = Math.max(0, Math.min(time, this.duration || this.mediaElement.duration || 0));
    this.mediaElement.currentTime = clamped;
    this.currentTime = clamped;
    this._updateCurrentSegment();
    this._emitChange();
  }

  seekToSegment(index: number, autoPlay = true): void {
    // console.log('seekToSegment', index, autoPlay);
    const segment = this.segments[index];
    if (!segment) {
      return;
    }

    this.currentSegmentIndex = index;
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
    if (mode === 'shuffle') {
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
    /** @fixme why max is 90? */
    const clamped = Math.max(0, Math.min(minutes, 90));
    this.sleepMinutes = clamped;

    if (this.sleepMode === 'minutes') {
      this._startSleepTimer();
    }

    this._emitChange();
  }

  cancelSleep(): void {
    this.setSleepMode('off');
  }

  setSubtitlesVisible(visible: boolean): void {
    this.subtitlesVisible = visible;
    this._emitChange();
  }

  destroy(): void {
    this._clearSleepTimer();
    this.detachMediaElement();
    this._revokeObjectUrl();
    this.tracks = [];
    this.playlist = [];
    this.segments = [];
  }

  private _handleTimeUpdate = (): void => {
    if (this.timeUpdateFrame !== null) {
      return;
    }

    this.timeUpdateFrame = requestAnimationFrame(() => {
      this.timeUpdateFrame = null;
      this._syncFromMedia();
    });
  };

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
      case 'segment':
        if (this.currentSegmentIndex >= 0) {
          this.seekToSegment(this.currentSegmentIndex);
        } else {
          this.seek(0);
          void this.play();
        }
        break;
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

    this.currentTime = this.mediaElement.currentTime;
    this.duration = this.mediaElement.duration || this.duration;
    this._detectSegmentEnd();
    this._applySegmentLoop();
    this._updateCurrentSegment();
    this._emitChange();
  }

  private _detectSegmentEnd(): void {
    if (this.currentSegmentIndex < 0 || !this.mediaElement) {
      return;
    }
    const segment = this.segments[this.currentSegmentIndex];
    if (!segment) {
      return;
    }

    if (
      !this._segmentEndDispatched &&
      this.mediaElement.currentTime >= segment.endTime - LOOP_EPSILON
    ) {
      console.log('dispatch segment-ended');
      this.dispatchEvent(
        new CustomEvent('segment-ended', {
          detail: { segmentIndex: this.currentSegmentIndex, segment },
        }),
      );
      this._segmentEndDispatched = true;
    } else if (this.mediaElement.currentTime < segment.endTime - LOOP_EPSILON) {
      this._segmentEndDispatched = false;
    }
  }

  private _applySegmentLoop(): void {
    if (this.loopMode !== 'segment' || this.currentSegmentIndex < 0 || !this.mediaElement) {
      return;
    }

    const segment = this.segments[this.currentSegmentIndex];
    if (!segment) {
      return;
    }

    if (this.mediaElement.currentTime >= segment.endTime - LOOP_EPSILON) {
      this.mediaElement.currentTime = segment.startTime;
      this.currentTime = segment.startTime;
    }
  }

  private _updateCurrentSegment(): void {
    const nextIndex = findSegmentIndex(this.segments, this.currentTime);
    if (nextIndex !== this.currentSegmentIndex) {
      this.currentSegmentIndex = nextIndex;
    }
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
      this.pause();
      this._emitChange();
      return;
    }

    this.sleepTimerId = setInterval(() => {
      this.sleepRemainingSeconds = Math.max(0, this.sleepRemainingSeconds - 1);

      if (this.sleepRemainingSeconds <= 0) {
        this._clearSleepTimer();
        this.sleepMode = 'off';
        this.pause();
      }

      this._emitChange();
    }, 1000);
  }

  private _clearSleepTimer(): void {
    if (this.sleepTimerId !== null) {
      clearInterval(this.sleepTimerId);
      this.sleepTimerId = null;
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
