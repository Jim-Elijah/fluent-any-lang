import type { PracticeSegment } from '../types/models.js';

export type DualTrackMode = 'idle' | 'source' | 'recording' | 'sync';

export type DualTrackPlaybackState = {
  mode: DualTrackMode;
  syncSegmentIndex: number;
};

const SYNC_END_EPSILON = 0.05;
const SYNC_DRIFT_THRESHOLD = 0.12;

export class DualTrackPlayback {
  private mode: DualTrackMode = 'idle';
  private syncSegmentIndex = 0;
  private syncFrameId: number | null = null;
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
    this.mode = 'source';
    this._emitState();
    this.sourceAudio.currentTime = 0;
    await this.sourceAudio.play();
  }

  async playRecording(): Promise<void> {
    this._stopSyncMonitor();
    this.sourceAudio.pause();
    this.mode = 'recording';
    this._emitState();
    this.recordingAudio.currentTime = 0;
    await this.recordingAudio.play();
  }

  async playSync(): Promise<void> {
    if (this.segments.length === 0) {
      return;
    }

    this.sourceAudio.pause();
    this.recordingAudio.pause();
    this.mode = 'sync';
    this.syncSegmentIndex = 0;
    this._emitState();
    this._startSyncSegment(0);
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
    this.stop();
    this.sourceAudio.removeEventListener('ended', this._handleSourceEnded);
    this.recordingAudio.removeEventListener('ended', this._handleRecordingEnded);
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

  private _startSyncSegment(index: number): void {
    const segment = this.segments[index];
    if (!segment) {
      this.stop();
      return;
    }

    this.syncSegmentIndex = index;
    this._emitState();
    this.sourceAudio.currentTime = segment.sourceStartTime;
    this.recordingAudio.currentTime = segment.recordingStartTime;

    void this.sourceAudio.play();
    void this.recordingAudio.play();
    this._monitorSyncSegment(segment, index);
  }

  private _monitorSyncSegment(segment: PracticeSegment, index: number): void {
    this._stopSyncMonitor();

    const tick = (): void => {
      if (this.mode !== 'sync') {
        return;
      }

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
        return;
      }

      const sourceElapsed = sourceTime - segment.sourceStartTime;
      const expectedRecordingTime = segment.recordingStartTime + sourceElapsed;
      const drift = Math.abs(this.recordingAudio.currentTime - expectedRecordingTime);
      if (drift > SYNC_DRIFT_THRESHOLD) {
        this.recordingAudio.currentTime = expectedRecordingTime;
      }

      this.syncFrameId = requestAnimationFrame(tick);
    };

    this.syncFrameId = requestAnimationFrame(tick);
  }

  private _stopSyncMonitor(): void {
    if (this.syncFrameId !== null) {
      cancelAnimationFrame(this.syncFrameId);
      this.syncFrameId = null;
    }
  }

  private _emitState(): void {
    this.onStateChange(this.getState());
  }
}
