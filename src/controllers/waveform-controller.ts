import { getAudioContext } from '../lib/audio-context.js';
import { throttle } from '../lib/util.js';

export const DEFAULT_WAVEFORM_COLORS = [
  '#4f8cff',
  '#22c55e',
  '#f97316',
  '#e879f9',
  '#eab308',
  '#06b6d4',
] as const;

export type WaveformLayout = 'stack' | 'overlay';

export type ViewRange = { start: number; end: number };

export type WaveformTrack = {
  id: string;
  name: string;
  duration: number;
  peaks: Float32Array;
  color: string;
  blob: Blob;
  objectUrl: string;
  isLive?: boolean;
};

export type WaveformControllerSnapshot = {
  tracks: WaveformTrack[];
  activeId: string | null;
  activeTrack: WaveformTrack | null;
  layout: WaveformLayout;
  viewRange: ViewRange | null;
  loopSelection: boolean;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  canResetView: boolean;
  canLoopSelection: boolean;
};

export type PeakIndexRange = { iStart: number; iEnd: number };

export type TrackRect = { id: string; y0: number; y1: number };

/** Reserved for future real-time recording waveform feeds (AnalyserNode / onDataAvailable). */
export interface LiveWaveformExtension {
  updateLivePeaks(trackId: string, peaks: Float32Array): void;
}

export const WaveformEventType = {
  TRACK_CHANGE: 'track-change',
  VIEW_RANGE_CHANGE: 'view-range-change',
} as const;

type InternalTrack = WaveformTrack & {
  audioEl: HTMLAudioElement;
};

export function audioBufferToPeaks(audioBuffer: AudioBuffer, bucketCount: number): Float32Array {
  const peaks = new Float32Array(bucketCount);
  const length = audioBuffer.length;
  const numChannels = audioBuffer.numberOfChannels;
  const bucketSize = length / bucketCount;

  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(length, Math.floor((b + 1) * bucketSize));
    let peak = 0;

    for (let ch = 0; ch < numChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      let localPeak = 0;
      for (let i = start; i < end; i++) {
        const v = Math.abs(data[i]);
        if (v > localPeak) localPeak = v;
      }
      if (localPeak > peak) peak = localPeak;
    }

    peaks[b] = peak;
  }

  let maxV = 0;
  for (let i = 0; i < peaks.length; i++) maxV = Math.max(maxV, peaks[i]);
  const denom = maxV > 0 ? maxV : 1;

  const out = new Float32Array(peaks.length);
  for (let i = 0; i < peaks.length; i++) out[i] = peaks[i] / denom;
  return out;
}

export function computeBucketCount(duration: number): number {
  return Math.max(300, Math.min(2400, Math.floor(duration * 80)));
}

export function getPeakIndexRange(
  waveform: Pick<WaveformTrack, 'peaks' | 'duration'>,
  viewRange: ViewRange | null,
): PeakIndexRange {
  const { peaks, duration } = waveform;
  const bucketCount = peaks.length;
  if (bucketCount === 0) {
    return { iStart: 0, iEnd: 0 };
  }
  if (duration <= 0) {
    return { iStart: 0, iEnd: bucketCount - 1 };
  }

  const start = viewRange ? viewRange.start : 0;
  const end = viewRange ? viewRange.end : duration;

  const sRatio = Math.min(1, Math.max(0, start / duration));
  const eRatio = Math.min(1, Math.max(0, end / duration));

  const iStart = Math.max(0, Math.floor(Math.min(sRatio, eRatio) * (bucketCount - 1)));
  const iEnd = Math.min(bucketCount - 1, Math.ceil(Math.max(sRatio, eRatio) * (bucketCount - 1)));
  return { iStart, iEnd };
}

export function xToTime(
  x: number,
  canvasWidth: number,
  duration: number,
  viewRange: ViewRange | null,
): number {
  const ratio = Math.min(1, Math.max(0, x / canvasWidth));
  if (viewRange) {
    return viewRange.start + ratio * (viewRange.end - viewRange.start);
  }
  return ratio * duration;
}

const TIMEUPDATE_THROTTLE_MS = 200;
const PLAYBACK_POLL_MS = 200;

export class WaveformController extends EventTarget {
  private tracks: InternalTrack[] = [];
  private liveExtension: LiveWaveformExtension | null = null;
  private playbackPollId: ReturnType<typeof setInterval> | null = null;

  activeId: string | null = null;
  layout: WaveformLayout = 'stack';
  viewRange: ViewRange | null = null;
  loopSelection = false;
  currentTime = 0;
  duration = 0;
  isPlaying = false;

  setLiveExtension(extension: LiveWaveformExtension | null): void {
    this.liveExtension = extension;
  }

  getSnapshot(): WaveformControllerSnapshot {
    const activeTrack = this._getActiveTrack();
    const publicTracks = this.tracks.map((track) => this._toPublicTrack(track));

    return {
      tracks: publicTracks,
      activeId: this.activeId,
      activeTrack: activeTrack ? this._toPublicTrack(activeTrack) : null,
      layout: this.layout,
      viewRange: this.viewRange,
      loopSelection: this.loopSelection,
      currentTime: this.currentTime,
      duration: this.duration,
      isPlaying: this.isPlaying,
      canResetView: this.viewRange !== null,
      canLoopSelection: !!activeTrack && !!this.viewRange && this.tracks.length > 0,
    };
  }

  async addFromFile(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    return this._addFromArrayBuffer(arrayBuffer, file, file.name);
  }

  async addFromBlob(blob: Blob, name?: string): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer();
    const label = name ?? `audio-${new Date().toLocaleTimeString()}`;
    return this._addFromArrayBuffer(arrayBuffer, blob, label);
  }

  prepareLiveTrack(name: string): string {
    const id = crypto.randomUUID();
    const color = DEFAULT_WAVEFORM_COLORS[this.tracks.length % DEFAULT_WAVEFORM_COLORS.length];
    const objectUrl = '';
    const audioEl = new Audio();

    const track: InternalTrack = {
      id,
      name,
      duration: 0,
      peaks: new Float32Array(0),
      color,
      blob: new Blob(),
      objectUrl,
      isLive: true,
      audioEl,
    };

    this._bindAudioEvents(track);
    this.tracks.push(track);

    if (!this.activeId) {
      this.activeId = id;
    }

    this._syncPlaybackState();
    this._emitChange();
    return id;
  }

  updateLivePeaks(trackId: string, peaks: Float32Array, duration?: number): void {
    const track = this.tracks.find((item) => item.id === trackId);
    if (!track || !track.isLive) {
      return;
    }

    track.peaks = peaks;
    if (duration !== undefined) {
      track.duration = duration;
      if (this.activeId === trackId) {
        this.duration = duration;
        this.currentTime = duration;
      }
    }
    this.liveExtension?.updateLivePeaks(trackId, peaks);
    this._emitChange();
  }

  async finalizeLiveTrack(trackId: string, blob: Blob): Promise<void> {
    const track = this.tracks.find((item) => item.id === trackId);
    if (!track) {
      return;
    }

    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = getAudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const bucketCount = computeBucketCount(audioBuffer.duration);
    const peaks = audioBufferToPeaks(audioBuffer, bucketCount);
    const objectUrl = URL.createObjectURL(blob);

    if (track.objectUrl) {
      URL.revokeObjectURL(track.objectUrl);
    }

    track.blob = blob;
    track.objectUrl = objectUrl;
    track.duration = audioBuffer.duration;
    track.peaks = peaks;
    track.isLive = false;
    track.audioEl.src = objectUrl;
    track.audioEl.load();

    this._syncPlaybackState();
    this._emitChange();
  }

  removeTrack(id: string): void {
    const index = this.tracks.findIndex((track) => track.id === id);
    if (index < 0) {
      return;
    }

    const [removed] = this.tracks.splice(index, 1);
    this._disposeTrack(removed);

    if (this.activeId === id) {
      const previousId = id;
      this.activeId = this.tracks[0]?.id ?? null;
      this._dispatchTrackChange(previousId);
    }

    this._syncLoopingForActive();
    this._syncPlaybackState();
    this._emitChange();
  }

  clearTracks(): void {
    for (const track of this.tracks) {
      this._disposeTrack(track);
    }
    this.tracks = [];
    this.activeId = null;
    this._syncLoopingForActive();
    this._syncPlaybackState();
    this._emitChange();
  }

  setActiveId(id: string): void {
    if (!this.tracks.some((track) => track.id === id)) {
      return;
    }

    if (this.activeId === id) {
      return;
    }

    const previousId = this.activeId;

    // 暂停之前正在 active 的 track
    if (previousId) {
      const previous = this.tracks.find((track) => track.id === previousId);
      previous?.audioEl.pause();
    }

    this.activeId = id;
    this._dispatchTrackChange(previousId);
    this._syncLoopingForActive();
    this._syncPlaybackState();
    this._emitChange();
  }

  setLayout(layout: WaveformLayout): void {
    if (this.layout === layout) {
      return;
    }
    this.layout = layout;
    this._emitChange();
  }

  setViewRange(range: ViewRange | null): void {
    const previous = this.viewRange;
    this.viewRange = range;
    this._syncLoopingForActive();

    if (
      previous?.start !== range?.start ||
      previous?.end !== range?.end ||
      (previous === null) !== (range === null)
    ) {
      this.dispatchEvent(
        new CustomEvent(WaveformEventType.VIEW_RANGE_CHANGE, {
          detail: { viewRange: range, previousViewRange: previous },
          bubbles: true,
          composed: true,
        }),
      );
    }

    this._emitChange();
  }

  resetView(): void {
    this.setViewRange(null);
  }

  setLoopSelection(enabled: boolean): void {
    if (!this.getSnapshot().canLoopSelection && enabled) {
      return;
    }
    this.loopSelection = enabled;
    this._emitChange();
  }

  toggleLoopSelection(): void {
    if (!this.getSnapshot().canLoopSelection) {
      return;
    }
    this.setLoopSelection(!this.loopSelection);
  }

  async play(): Promise<void> {
    const active = this._getActiveTrack();
    if (!active) {
      return;
    }
    await active.audioEl.play();
  }

  pause(): void {
    const active = this._getActiveTrack();
    active?.audioEl.pause();
  }

  async togglePlay(): Promise<void> {
    if (this.isPlaying) {
      this.pause();
      return;
    }
    await this.play();
  }

  stop(): void {
    const active = this._getActiveTrack();
    if (!active) {
      return;
    }
    active.audioEl.pause();
    active.audioEl.currentTime = 0;
    this.currentTime = 0;
    this.isPlaying = false;
    this._emitChange();
  }

  seek(time: number): void {
    const active = this._getActiveTrack();
    if (!active) {
      return;
    }

    const clamped = Math.max(0, Math.min(time, active.duration || 0));
    active.audioEl.currentTime = clamped;
    this.currentTime = clamped;
    this._emitChange();
  }

  getAudioElement(trackId: string): HTMLAudioElement | null {
    return this.tracks.find((track) => track.id === trackId)?.audioEl ?? null;
  }

  destroy(): void {
    this._throttledEmitChange.cancel();
    this._clearPlaybackPoll();
    this.clearTracks();
    this.liveExtension = null;
  }

  private async _addFromArrayBuffer(
    arrayBuffer: ArrayBuffer,
    blob: Blob,
    name: string,
  ): Promise<string> {
    const audioCtx = getAudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const bucketCount = computeBucketCount(audioBuffer.duration);
    const peaks = audioBufferToPeaks(audioBuffer, bucketCount);
    const objectUrl = URL.createObjectURL(blob);
    const id = crypto.randomUUID();
    const color = DEFAULT_WAVEFORM_COLORS[this.tracks.length % DEFAULT_WAVEFORM_COLORS.length];

    const track: InternalTrack = {
      id,
      name,
      duration: audioBuffer.duration,
      peaks,
      color,
      blob,
      objectUrl,
      audioEl: new Audio(objectUrl),
    };

    this._bindAudioEvents(track);
    this.tracks.push(track);

    if (!this.activeId) {
      this.activeId = id;
    }

    this._syncPlaybackState();
    this._emitChange();
    return id;
  }

  private _bindAudioEvents(track: InternalTrack): void {
    track.audioEl.preload = 'auto';

    track.audioEl.addEventListener('play', () => {
      if (this.activeId === track.id) {
        this.isPlaying = true;
        this._ensurePlaybackPoll();
        this._emitChange();
      }
    });

    track.audioEl.addEventListener('pause', () => {
      if (this.activeId === track.id) {
        this.isPlaying = false;
        this._emitChange();
      }
    });

    track.audioEl.addEventListener('timeupdate', () => {
      this._maybeLoopSelection(track);
      if (this.activeId === track.id) {
        this.currentTime = track.audioEl.currentTime || 0;
        this._throttledEmitChange();
      }
    });

    track.audioEl.addEventListener('ended', () => {
      if (this.activeId === track.id) {
        this.isPlaying = false;
        this._emitChange();
      }
    });
  }

  private _maybeLoopSelection(track: InternalTrack): void {
    if (!this.loopSelection || !this.viewRange || track.audioEl.paused) {
      return;
    }

    const { start, end } = this.viewRange;
    if (end <= start) {
      return;
    }

    if (track.audioEl.currentTime >= end) {
      track.audioEl.currentTime = start;
      if (this.activeId === track.id) {
        this.currentTime = start;
      }
    }
  }

  private _syncLoopingForActive(): void {
    if (!this.viewRange) {
      this.loopSelection = false;
    }
  }

  private _getActiveTrack(): InternalTrack | null {
    return this.tracks.find((track) => track.id === this.activeId) ?? null;
  }

  private _toPublicTrack(track: InternalTrack): WaveformTrack {
    return {
      id: track.id,
      name: track.name,
      duration: track.duration,
      peaks: track.peaks,
      color: track.color,
      blob: track.blob,
      objectUrl: track.objectUrl,
      isLive: track.isLive,
    };
  }

  private _disposeTrack(track: InternalTrack): void {
    track.audioEl.pause();
    track.audioEl.removeAttribute('src');
    track.audioEl.load();
    if (track.objectUrl) {
      URL.revokeObjectURL(track.objectUrl);
    }
  }

  private _syncPlaybackState(): void {
    const active = this._getActiveTrack();
    if (!active) {
      this.currentTime = 0;
      this.duration = 0;
      this.isPlaying = false;
      this._clearPlaybackPoll();
      return;
    }

    this.duration = active.duration;
    this.currentTime = active.audioEl.currentTime || 0;
    this.isPlaying = !active.audioEl.paused;

    if (this.isPlaying) {
      this._ensurePlaybackPoll();
    } else {
      this._clearPlaybackPoll();
    }
  }

  private _ensurePlaybackPoll(): void {
    if (this.playbackPollId !== null) {
      return;
    }

    this.playbackPollId = setInterval(() => {
      const active = this._getActiveTrack();
      if (!active || active.audioEl.paused) {
        return;
      }

      this._maybeLoopSelection(active);
      this.currentTime = active.audioEl.currentTime || 0;
      this._throttledEmitChange();
    }, PLAYBACK_POLL_MS);
  }

  private _clearPlaybackPoll(): void {
    if (this.playbackPollId !== null) {
      clearInterval(this.playbackPollId);
      this.playbackPollId = null;
    }
  }

  private _dispatchTrackChange(previousId: string | null): void {
    this.dispatchEvent(
      new CustomEvent(WaveformEventType.TRACK_CHANGE, {
        detail: {
          activeId: this.activeId,
          previousId,
          activeTrack: this.getSnapshot().activeTrack,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _throttledEmitChange = throttle(function (this: WaveformController) {
    this._emitChange();
  }, TIMEUPDATE_THROTTLE_MS);

  private _emitChange(): void {
    this.dispatchEvent(
      new CustomEvent('state-change', {
        detail: this.getSnapshot(),
      }),
    );
  }
}
