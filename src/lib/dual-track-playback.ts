import type { PracticeSegment } from '../types/models.js';
import { findPracticeSegmentIndex } from './playback-utils.js';
import { throttle } from './util.js';

export type DualTrackMode = 'idle' | 'source' | 'recording' | 'sync';

export type DualTrackPlaybackState = {
  mode: DualTrackMode;
  syncSegmentIndex: number;
};

const SYNC_END_EPSILON = 0.05;
const SYNC_DRIFT_THRESHOLD = 0.12;
const SYNC_DRIFT_THROTTLE_MS = 100;

export class DualTrackPlayback {
  private mode: DualTrackMode = 'idle';
  private syncSegmentIndex = 0;
  private _syncSegment: PracticeSegment | null = null;
  private _syncSegmentIndex = -1;
  private _sourceEndTime: number | null = null;
  private _recordingEndTime: number | null = null;
  private readonly onStateChange: (state: DualTrackPlaybackState) => void;

  constructor(
    private readonly sourceAudio: HTMLAudioElement,
    private readonly recordingAudio: HTMLAudioElement,
    private segments: PracticeSegment[],
    onStateChange: (state: DualTrackPlaybackState) => void,
  ) {
    this.onStateChange = onStateChange;
    sourceAudio.addEventListener('ended', this._handleSourceEnded);
    recordingAudio.addEventListener('ended', this._handleRecordingEnded);
    sourceAudio.addEventListener('timeupdate', this._handleSourceTimeUpdate);
    recordingAudio.addEventListener('timeupdate', this._handleRecordingTimeUpdate);
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
  }

  getState(): DualTrackPlaybackState {
    return { mode: this.mode, syncSegmentIndex: this.syncSegmentIndex };
  }

  setSegments(segments: PracticeSegment[]): void {
    this.segments = segments;
  }

  async playSource(): Promise<void> {
    this._stopSyncMonitor();
    this.recordingAudio.pause();

    if (this.segments.length > 0) {
      const first = this.segments[0];
      const last = this.segments[this.segments.length - 1];
      this._sourceEndTime = last.sourceEndTime;
      this.syncSegmentIndex = 0;
      this.sourceAudio.currentTime = first.sourceStartTime;
    } else {
      this._sourceEndTime = null;
      this.syncSegmentIndex = 0;
      this.sourceAudio.currentTime = 0;
    }

    this.mode = 'source';
    this._emitState();
    await this.sourceAudio.play();
  }

  async playRecording(): Promise<void> {
    this._stopSyncMonitor();
    this.sourceAudio.pause();

    if (this.segments.length > 0) {
      const first = this.segments[0];
      const last = this.segments[this.segments.length - 1];
      this._recordingEndTime = last.recordingEndTime;
      this.syncSegmentIndex = 0;
      this.recordingAudio.currentTime = first.recordingStartTime;
    } else {
      this._recordingEndTime = null;
      this.syncSegmentIndex = 0;
      this.recordingAudio.currentTime = 0;
    }

    this.mode = 'recording';
    this._emitState();
    await this.recordingAudio.play();
  }

  async playSync(): Promise<void> {
    await this.playSyncFromSegment(0);
  }

  async playSyncFromSegment(index: number): Promise<void> {
    if (index < 0 || index >= this.segments.length) {
      return;
    }

    this._stopSingleTrackMonitor();
    this.sourceAudio.pause();
    this.recordingAudio.pause();
    this.mode = 'sync';
    this._emitState();
    this._startSyncSegment(index);
  }

  stop(): void {
    this._stopSyncMonitor();
    this.sourceAudio.pause();
    this.recordingAudio.pause();
    this.syncSegmentIndex = 0;
    this.mode = 'idle';
    this._emitState();
  }

  destroy(): void {
    this._throttledCorrectSyncDrift.cancel();
    this.stop();
    this.sourceAudio.removeEventListener('ended', this._handleSourceEnded);
    this.recordingAudio.removeEventListener('ended', this._handleRecordingEnded);
    this.sourceAudio.removeEventListener('timeupdate', this._handleSourceTimeUpdate);
    this.recordingAudio.removeEventListener('timeupdate', this._handleRecordingTimeUpdate);
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);
  }

  private _handleSourceEnded = (): void => {
    if (this.mode === 'source') {
      this.stop();
    }
  };

  private _handleRecordingEnded = (): void => {
    if (this.mode === 'recording') {
      this.stop();
    }
  };

  private _handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this._tickSyncSegment();
    }
  };

  private _handleSourceTimeUpdate = (): void => {
    if (this.mode === 'source') {
      this._updateSegmentIndex('source');
      this._checkSourceBoundary();
      return;
    }

    if (this.mode === 'sync') {
      this._checkSyncSegmentBoundary();
      this._throttledCorrectSyncDrift();
    }
  };

  private _handleRecordingTimeUpdate = (): void => {
    if (this.mode !== 'recording') {
      return;
    }

    this._updateSegmentIndex('recording');
    this._checkRecordingBoundary();
  };

  private _throttledCorrectSyncDrift = throttle(function (this: DualTrackPlayback) {
    this._correctSyncDrift();
  }, SYNC_DRIFT_THROTTLE_MS);

  private _startSyncSegment(index: number): void {
    const segment = this.segments[index];
    if (!segment) {
      this.stop();
      return;
    }

    this.syncSegmentIndex = index;
    this._syncSegment = segment;
    this._syncSegmentIndex = index;
    this._emitState();
    this.sourceAudio.currentTime = segment.sourceStartTime;
    this.recordingAudio.currentTime = segment.recordingStartTime;

    void this.sourceAudio.play();
    void this.recordingAudio.play();
  }

  private _tickSyncSegment(): void {
    this._checkSyncSegmentBoundary();
    this._correctSyncDrift();
  }

  private _checkSourceBoundary(): void {
    if (this.mode !== 'source' || this._sourceEndTime === null) {
      return;
    }

    if (this.sourceAudio.currentTime >= this._sourceEndTime - SYNC_END_EPSILON) {
      this.stop();
    }
  }

  private _checkRecordingBoundary(): void {
    if (this.mode !== 'recording' || this._recordingEndTime === null) {
      return;
    }

    if (this.recordingAudio.currentTime >= this._recordingEndTime - SYNC_END_EPSILON) {
      this.stop();
    }
  }

  private _updateSegmentIndex(axis: 'source' | 'recording'): void {
    if (this.segments.length === 0) {
      return;
    }

    const audio = axis === 'source' ? this.sourceAudio : this.recordingAudio;
    const index = findPracticeSegmentIndex(this.segments, audio.currentTime, axis);
    if (index >= 0 && index !== this.syncSegmentIndex) {
      this.syncSegmentIndex = index;
      this._emitState();
    }
  }

  private _checkSyncSegmentBoundary(): void {
    if (this.mode !== 'sync' || !this._syncSegment) {
      return;
    }

    const segment = this._syncSegment;
    const index = this._syncSegmentIndex;
    const sourceTime = this.sourceAudio.currentTime;

    if (sourceTime >= segment.sourceEndTime - SYNC_END_EPSILON) {
      this.sourceAudio.pause();
      this.recordingAudio.pause();

      const nextIndex = index + 1;
      if (nextIndex < this.segments.length) {
        this._startSyncSegment(nextIndex);
      } else {
        this.stop();
      }
    }
  }

  private _correctSyncDrift(): void {
    if (this.mode !== 'sync' || !this._syncSegment) {
      return;
    }

    const segment = this._syncSegment;
    const sourceTime = this.sourceAudio.currentTime;

    if (sourceTime >= segment.sourceEndTime - SYNC_END_EPSILON) {
      return;
    }

    const sourceElapsed = sourceTime - segment.sourceStartTime;
    const expectedRecordingTime = segment.recordingStartTime + sourceElapsed;
    const drift = Math.abs(this.recordingAudio.currentTime - expectedRecordingTime);
    if (drift > SYNC_DRIFT_THRESHOLD) {
      this.recordingAudio.currentTime = expectedRecordingTime;
    }
  }

  private _stopSyncMonitor(): void {
    this._stopSingleTrackMonitor();
    this._syncSegment = null;
    this._syncSegmentIndex = -1;
  }

  private _stopSingleTrackMonitor(): void {
    this._sourceEndTime = null;
    this._recordingEndTime = null;
  }

  private _emitState(): void {
    this.onStateChange(this.getState());
  }
}
