import type { PracticeSegment } from '../types/models.js';
import { findPracticeSegmentIndex, type PracticeTimeAxis } from './playback-utils.js';
import { throttle } from './util.js';

export type DualTrackMode = 'idle' | 'source' | 'recording' | 'sync' | 'continuous';

export type DualTrackPlaybackState = {
  mode: DualTrackMode;
  syncSegmentIndex: number;
  /** True when mode is selected but audio is not playing (Space pause, end-of-mode, or default arm). */
  paused: boolean;
};

/** True when dual-track compare is active (sentence-aligned or continuous). */
export function isComparePlayMode(mode: DualTrackMode): boolean {
  return mode === 'sync' || mode === 'continuous';
}

const SYNC_END_EPSILON = 0.05;
const SYNC_DRIFT_THRESHOLD = 0.12;
const SYNC_DRIFT_THROTTLE_MS = 100;

export class DualTrackPlayback {
  private mode: DualTrackMode = 'idle';
  private syncSegmentIndex = 0;
  private paused = false;
  /** True after natural end-of-mode; resume/Space restarts from the mode start. */
  private _finished = false;
  private _syncSegment: PracticeSegment | null = null;
  private _syncSegmentIndex = -1;
  private _sourceEndTime: number | null = null;
  private _recordingEndTime: number | null = null;
  /** Continuous-compare anchors (first practice segment). */
  private _continuousAnchorSource = 0;
  private _continuousAnchorRecording = 0;
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
    return { mode: this.mode, syncSegmentIndex: this.syncSegmentIndex, paused: this.paused };
  }

  setSegments(segments: PracticeSegment[]): void {
    this.segments = segments;
  }

  async playSource(): Promise<void> {
    const start = this.segments.length > 0 ? this.segments[0].sourceStartTime : 0;
    await this.playSourceAt(start);
  }

  /** Enter or continue source mode from an absolute source timeline time. */
  async playSourceAt(time: number): Promise<void> {
    this._enterSourceAt(time, true);
    await this.sourceAudio.play();
  }

  async playRecording(): Promise<void> {
    const start = this.segments.length > 0 ? this.segments[0].recordingStartTime : 0;
    await this.playRecordingAt(start);
  }

  /** Enter or continue recording mode from an absolute recording timeline time. */
  async playRecordingAt(time: number): Promise<void> {
    this._enterRecordingAt(time, true);
    await this.recordingAudio.play();
  }

  /**
   * Select a single-track mode paused at practice start without playing.
   * Used when opening the preview with a default mode (recording preferred).
   */
  selectPaused(mode: 'source' | 'recording'): void {
    if (mode === 'source') {
      const start = this.segments.length > 0 ? this.segments[0].sourceStartTime : 0;
      this._enterSourceAt(start, false);
      return;
    }
    const start = this.segments.length > 0 ? this.segments[0].recordingStartTime : 0;
    this._enterRecordingAt(start, false);
  }

  async playSync(): Promise<void> {
    await this.playSyncFromSegment(0);
  }

  /**
   * Continuous dual-track compare (preserve gap policy): both tracks advance on a
   * shared wall-clock mapping from the first practice segment anchors.
   */
  async playContinuous(): Promise<void> {
    if (this.segments.length === 0) {
      return;
    }
    const first = this.segments[0]!;
    await this.playContinuousAt(first.sourceStartTime, 'source');
  }

  async playContinuousAt(time: number, axis: PracticeTimeAxis = 'source'): Promise<boolean> {
    if (this.segments.length === 0) {
      return false;
    }

    const first = this.segments[0]!;
    const last = this.segments[this.segments.length - 1]!;
    this._continuousAnchorSource = first.sourceStartTime;
    this._continuousAnchorRecording = first.recordingStartTime;

    let sourceTime: number;
    let recordingTime: number;
    if (axis === 'source') {
      sourceTime = Math.max(first.sourceStartTime, Math.min(time, last.sourceEndTime));
      recordingTime = this._mapContinuousSourceToRecording(sourceTime);
    } else {
      recordingTime = Math.max(first.recordingStartTime, Math.min(time, last.recordingEndTime));
      sourceTime = this._mapContinuousRecordingToSource(recordingTime);
    }

    this._stopSyncMonitor();
    this.sourceAudio.pause();
    this.recordingAudio.pause();
    this.mode = 'continuous';
    this.paused = false;
    this._finished = false;
    this._sourceEndTime = last.sourceEndTime;
    this._recordingEndTime = last.recordingEndTime;
    this.sourceAudio.currentTime = this._clampAudioTime(this.sourceAudio, sourceTime);
    this.recordingAudio.currentTime = this._clampAudioTime(this.recordingAudio, recordingTime);
    this._updateContinuousSegmentIndex();
    this._emitState();

    await this.sourceAudio.play();
    await this.recordingAudio.play();
    return true;
  }

  async playSyncFromSegment(index: number): Promise<void> {
    if (index < 0 || index >= this.segments.length) {
      return;
    }

    const segment = this.segments[index];
    await this._playSyncAtTimes(index, segment.sourceStartTime, segment.recordingStartTime);
  }

  /**
   * Seek sync playback to a time on the given axis (maps the other track by
   * wall-clock elapsed within the segment, matching drift correction).
   * Returns false when the time cannot be mapped to a practice segment.
   */
  async playSyncAt(time: number, axis: PracticeTimeAxis): Promise<boolean> {
    const segmentIndex = findPracticeSegmentIndex(this.segments, time, axis);
    if (segmentIndex < 0) {
      return false;
    }

    const segment = this.segments[segmentIndex];
    let sourceTime: number;
    let recordingTime: number;

    if (axis === 'source') {
      sourceTime = Math.max(segment.sourceStartTime, Math.min(time, segment.sourceEndTime));
      const elapsed = sourceTime - segment.sourceStartTime;
      recordingTime = Math.min(segment.recordingStartTime + elapsed, segment.recordingEndTime);
    } else {
      recordingTime = Math.max(
        segment.recordingStartTime,
        Math.min(time, segment.recordingEndTime),
      );
      const elapsed = recordingTime - segment.recordingStartTime;
      sourceTime = Math.min(segment.sourceStartTime + elapsed, segment.sourceEndTime);
    }

    await this._playSyncAtTimes(segmentIndex, sourceTime, recordingTime);
    return true;
  }

  /** Jump to a practice segment while keeping the current play mode and pause state. */
  async goToSegment(index: number): Promise<void> {
    if (index < 0 || index >= this.segments.length || this.mode === 'idle') {
      return;
    }

    const wasPaused = this.paused;
    const segment = this.segments[index];
    this._finished = false;

    if (this.mode === 'sync') {
      this.sourceAudio.pause();
      this.recordingAudio.pause();
      this.syncSegmentIndex = index;
      this._syncSegment = segment;
      this._syncSegmentIndex = index;
      this.paused = wasPaused;
      this.sourceAudio.currentTime = segment.sourceStartTime;
      this.recordingAudio.currentTime = segment.recordingStartTime;
      this._emitState();
      if (!wasPaused) {
        await this.sourceAudio.play();
        await this.recordingAudio.play();
      }
      return;
    }

    if (this.mode === 'continuous') {
      this.sourceAudio.pause();
      this.recordingAudio.pause();
      this.paused = wasPaused;
      this.sourceAudio.currentTime = segment.sourceStartTime;
      this.recordingAudio.currentTime = this._mapContinuousSourceToRecording(
        segment.sourceStartTime,
      );
      this.syncSegmentIndex = index;
      this._emitState();
      if (!wasPaused) {
        await this.sourceAudio.play();
        await this.recordingAudio.play();
      }
      return;
    }

    if (this.mode === 'source') {
      this.syncSegmentIndex = index;
      this.sourceAudio.currentTime = segment.sourceStartTime;
      this.paused = wasPaused;
      this._emitState();
      if (!wasPaused) {
        await this.sourceAudio.play();
      }
      return;
    }

    if (this.mode === 'recording') {
      this.syncSegmentIndex = index;
      this.recordingAudio.currentTime = segment.recordingStartTime;
      this.paused = wasPaused;
      this._emitState();
      if (!wasPaused) {
        await this.recordingAudio.play();
      }
    }
  }

  /** Seek to the start of a practice segment and play (clears pause). */
  async replaySegment(index = this.syncSegmentIndex): Promise<void> {
    if (index < 0 || index >= this.segments.length || this.mode === 'idle') {
      return;
    }
    this.paused = false;
    this._finished = false;
    await this.goToSegment(index);
  }

  /** Pause audio without leaving the current play mode. */
  pause(): void {
    if (this.mode === 'idle' || this.paused) {
      return;
    }
    this.sourceAudio.pause();
    this.recordingAudio.pause();
    this.paused = true;
    this._emitState();
  }

  /** Resume audio after {@link pause}, keeping the current play mode. */
  async resume(): Promise<void> {
    if (this.mode === 'idle' || !this.paused) {
      return;
    }

    // Natural end-of-mode: Space / play restarts from the beginning of the mode.
    if (this._finished) {
      await this._restartFromStart();
      return;
    }

    this.paused = false;
    this._emitState();

    if (this.mode === 'source') {
      await this.sourceAudio.play();
      return;
    }
    if (this.mode === 'recording') {
      await this.recordingAudio.play();
      return;
    }

    if (this.mode === 'continuous') {
      if (
        this._sourceEndTime !== null &&
        this.sourceAudio.currentTime < this._sourceEndTime - SYNC_END_EPSILON
      ) {
        await this.sourceAudio.play();
      }
      if (
        this._recordingEndTime !== null &&
        this.recordingAudio.currentTime < this._recordingEndTime - SYNC_END_EPSILON
      ) {
        await this.recordingAudio.play();
      }
      return;
    }

    const segment = this._syncSegment;
    if (!segment) {
      return;
    }
    if (this.sourceAudio.currentTime < segment.sourceEndTime - SYNC_END_EPSILON) {
      await this.sourceAudio.play();
    }
    if (this.recordingAudio.currentTime < segment.recordingEndTime - SYNC_END_EPSILON) {
      await this.recordingAudio.play();
    }
  }

  async togglePause(): Promise<void> {
    if (this.mode === 'idle') {
      return;
    }
    if (this.paused) {
      await this.resume();
      return;
    }
    this.pause();
  }

  stop(): void {
    this._stopSyncMonitor();
    this.sourceAudio.pause();
    this.recordingAudio.pause();
    this.syncSegmentIndex = 0;
    this.mode = 'idle';
    this.paused = false;
    this._finished = false;
    this._emitState();
  }

  /**
   * End of natural playback: keep the selected mode, pause, and mark finished so
   * resume/Space restarts from the mode start (deselect still uses {@link stop}).
   */
  private _pauseAtEnd(): void {
    if (this.mode === 'idle') {
      return;
    }
    this.sourceAudio.pause();
    this.recordingAudio.pause();
    this.paused = true;
    this._finished = true;
    this._emitState();
  }

  private async _restartFromStart(): Promise<void> {
    switch (this.mode) {
      case 'source':
        await this.playSource();
        return;
      case 'recording':
        await this.playRecording();
        return;
      case 'sync':
        await this.playSync();
        return;
      case 'continuous':
        await this.playContinuous();
        return;
      default:
        return;
    }
  }

  private _enterSourceAt(time: number, play: boolean): void {
    this._stopSyncMonitor();
    this.recordingAudio.pause();

    if (this.segments.length > 0) {
      const last = this.segments[this.segments.length - 1];
      this._sourceEndTime = last.sourceEndTime;
      const index = findPracticeSegmentIndex(this.segments, time, 'source');
      this.syncSegmentIndex = index >= 0 ? index : 0;
    } else {
      this._sourceEndTime = null;
      this.syncSegmentIndex = 0;
    }

    this.sourceAudio.currentTime = this._clampAudioTime(this.sourceAudio, time);
    this.mode = 'source';
    this.paused = !play;
    this._finished = false;
    this._emitState();
  }

  private _enterRecordingAt(time: number, play: boolean): void {
    this._stopSyncMonitor();
    this.sourceAudio.pause();

    if (this.segments.length > 0) {
      const last = this.segments[this.segments.length - 1];
      this._recordingEndTime = last.recordingEndTime;
      const index = findPracticeSegmentIndex(this.segments, time, 'recording');
      this.syncSegmentIndex = index >= 0 ? index : 0;
    } else {
      this._recordingEndTime = null;
      this.syncSegmentIndex = 0;
    }

    this.recordingAudio.currentTime = this._clampAudioTime(this.recordingAudio, time);
    this.mode = 'recording';
    this.paused = !play;
    this._finished = false;
    this._emitState();
  }

  destroy(): void {
    this._throttledCorrectSyncDrift.cancel();
    this._throttledCorrectContinuousDrift.cancel();
    this.stop();
    this.sourceAudio.removeEventListener('ended', this._handleSourceEnded);
    this.recordingAudio.removeEventListener('ended', this._handleRecordingEnded);
    this.sourceAudio.removeEventListener('timeupdate', this._handleSourceTimeUpdate);
    this.recordingAudio.removeEventListener('timeupdate', this._handleRecordingTimeUpdate);
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);
  }

  private _handleSourceEnded = (): void => {
    if (this.mode === 'source' || this.mode === 'continuous') {
      this._pauseAtEnd();
    }
  };

  private _handleRecordingEnded = (): void => {
    if (this.mode === 'recording' || this.mode === 'continuous') {
      this._pauseAtEnd();
    }
  };

  private _handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      if (this.mode === 'continuous') {
        this._correctContinuousDrift();
        return;
      }
      this._tickSyncSegment();
    }
  };

  private _handleSourceTimeUpdate = (): void => {
    if (this.mode === 'source') {
      this._updateSegmentIndex('source');
      this._checkSourceBoundary();
      return;
    }

    if (this.mode === 'continuous') {
      this._updateContinuousSegmentIndex();
      this._checkContinuousBoundary();
      this._throttledCorrectContinuousDrift();
      return;
    }

    if (this.mode === 'sync') {
      this._checkSyncSegmentBoundary();
      this._throttledCorrectSyncDrift();
    }
  };

  private _handleRecordingTimeUpdate = (): void => {
    if (this.mode === 'sync') {
      this._checkSyncSegmentBoundary();
      return;
    }

    if (this.mode === 'continuous') {
      this._updateContinuousSegmentIndex();
      this._checkContinuousBoundary();
      return;
    }

    if (this.mode !== 'recording') {
      return;
    }

    this._updateSegmentIndex('recording');
    this._checkRecordingBoundary();
  };

  private _throttledCorrectSyncDrift = throttle(function (this: DualTrackPlayback) {
    this._correctSyncDrift();
  }, SYNC_DRIFT_THROTTLE_MS);

  private _throttledCorrectContinuousDrift = throttle(function (this: DualTrackPlayback) {
    this._correctContinuousDrift();
  }, SYNC_DRIFT_THROTTLE_MS);

  private async _playSyncAtTimes(
    index: number,
    sourceTime: number,
    recordingTime: number,
  ): Promise<void> {
    const segment = this.segments[index];
    if (!segment) {
      this.stop();
      return;
    }

    this._stopSingleTrackMonitor();
    this.sourceAudio.pause();
    this.recordingAudio.pause();
    this.mode = 'sync';
    this.paused = false;
    this._finished = false;
    this.syncSegmentIndex = index;
    this._syncSegment = segment;
    this._syncSegmentIndex = index;
    this.sourceAudio.currentTime = sourceTime;
    this.recordingAudio.currentTime = recordingTime;
    this._emitState();

    const sourceRemaining = segment.sourceEndTime - sourceTime > SYNC_END_EPSILON;
    const recordingRemaining = segment.recordingEndTime - recordingTime > SYNC_END_EPSILON;
    if (sourceRemaining) {
      await this.sourceAudio.play();
    }
    if (recordingRemaining) {
      await this.recordingAudio.play();
    }
    if (!sourceRemaining && !recordingRemaining) {
      const nextIndex = index + 1;
      if (nextIndex < this.segments.length) {
        await this.playSyncFromSegment(nextIndex);
      } else {
        this._pauseAtEnd();
      }
    }
  }

  private _clampAudioTime(audio: HTMLAudioElement, time: number): number {
    const max = Number.isFinite(audio.duration) ? audio.duration : time;
    return Math.max(0, Math.min(max, time));
  }

  private _startSyncSegment(index: number): void {
    const segment = this.segments[index];
    if (!segment) {
      this.stop();
      return;
    }

    void this._playSyncAtTimes(index, segment.sourceStartTime, segment.recordingStartTime);
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
      this._pauseAtEnd();
    }
  }

  private _checkRecordingBoundary(): void {
    if (this.mode !== 'recording' || this._recordingEndTime === null) {
      return;
    }

    if (this.recordingAudio.currentTime >= this._recordingEndTime - SYNC_END_EPSILON) {
      this._pauseAtEnd();
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
    const recordingTime = this.recordingAudio.currentTime;

    const sourceAtEnd = sourceTime >= segment.sourceEndTime - SYNC_END_EPSILON;
    const recordingAtEnd = recordingTime >= segment.recordingEndTime - SYNC_END_EPSILON;

    if (sourceAtEnd && !this.sourceAudio.paused) {
      this.sourceAudio.pause();
    }
    if (recordingAtEnd && !this.recordingAudio.paused) {
      this.recordingAudio.pause();
    }

    if (!sourceAtEnd || !recordingAtEnd) {
      return;
    }

    const nextIndex = index + 1;
    if (nextIndex < this.segments.length) {
      this._startSyncSegment(nextIndex);
    } else {
      this._pauseAtEnd();
    }
  }

  private _correctSyncDrift(): void {
    if (this.mode !== 'sync' || !this._syncSegment) {
      return;
    }

    const segment = this._syncSegment;
    const sourceTime = this.sourceAudio.currentTime;
    const recordingTime = this.recordingAudio.currentTime;

    if (sourceTime >= segment.sourceEndTime - SYNC_END_EPSILON) {
      return;
    }
    if (recordingTime >= segment.recordingEndTime - SYNC_END_EPSILON) {
      return;
    }

    const sourceElapsed = sourceTime - segment.sourceStartTime;
    const expectedRecordingTime = segment.recordingStartTime + sourceElapsed;
    const drift = Math.abs(recordingTime - expectedRecordingTime);
    if (drift > SYNC_DRIFT_THRESHOLD) {
      this.recordingAudio.currentTime = expectedRecordingTime;
    }
  }

  private _mapContinuousSourceToRecording(sourceTime: number): number {
    return sourceTime - this._continuousAnchorSource + this._continuousAnchorRecording;
  }

  private _mapContinuousRecordingToSource(recordingTime: number): number {
    return recordingTime - this._continuousAnchorRecording + this._continuousAnchorSource;
  }

  private _updateContinuousSegmentIndex(): void {
    if (this.segments.length === 0) {
      return;
    }
    const index = findPracticeSegmentIndex(this.segments, this.sourceAudio.currentTime, 'source');
    if (index >= 0 && index !== this.syncSegmentIndex) {
      this.syncSegmentIndex = index;
      this._emitState();
    }
  }

  private _checkContinuousBoundary(): void {
    if (this.mode !== 'continuous') {
      return;
    }
    if (
      this._sourceEndTime !== null &&
      this.sourceAudio.currentTime >= this._sourceEndTime - SYNC_END_EPSILON
    ) {
      this._pauseAtEnd();
      return;
    }
    if (
      this._recordingEndTime !== null &&
      this.recordingAudio.currentTime >= this._recordingEndTime - SYNC_END_EPSILON
    ) {
      this._pauseAtEnd();
    }
  }

  private _correctContinuousDrift(): void {
    if (this.mode !== 'continuous') {
      return;
    }
    if (
      this._sourceEndTime !== null &&
      this.sourceAudio.currentTime >= this._sourceEndTime - SYNC_END_EPSILON
    ) {
      return;
    }

    const expectedRecording = this._mapContinuousSourceToRecording(this.sourceAudio.currentTime);
    const drift = Math.abs(this.recordingAudio.currentTime - expectedRecording);
    if (drift > SYNC_DRIFT_THRESHOLD) {
      this.recordingAudio.currentTime = this._clampAudioTime(
        this.recordingAudio,
        expectedRecording,
      );
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
