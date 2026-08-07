import { msg, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { MediaController } from '../../controllers/media-controller.js';
import { WaveformController } from '../../controllers/waveform-controller.js';
import { AudioRecorderController } from '../../lib/audio-recorder.js';
import {
  getMicrophoneBlockedMessage,
  getMicrophoneErrorMessage,
  isRecordingSupported,
} from '../../lib/microphone-access.js';
import { buildLiveDisplayPeaks } from '../../lib/live-waveform-peaks.js';
import { ExtendedMediaEventType } from '../../lib/playback-utils.js';
import { throttle } from '../../lib/util.js';
import { CountdownCancelledError, runRecordingCountdown } from '../ui/countdown-overlay.js';
import { Message } from '../ui/message.js';
import { shouldSkipRecordingCountdown } from '../../lib/user-settings.js';
import type { PracticeSegment, SubtitleSegment } from '../../types/models.js';
import '../ui/icon.js';
import '../ui/button.js';
import '../ui/tooltip.js';
import './waveform-player.js';

export const AudioRecorderEventType = {
  STATE_CHANGE: 'recording-state-change',
  COMPLETE: 'recording-complete',
  ERROR: 'recording-error',
  COUNTDOWN_START: 'recording-countdown-start',
  COUNTDOWN_END: 'recording-countdown-end',
} as const;

export type RecordingCountdownEndDetail = {
  skipped: boolean;
  cancelled?: boolean;
};

export type RecordingCompleteDetail = {
  blob: Blob;
  segments: PracticeSegment[];
  reason: 'manual' | 'media-ended' | 'segment-end' | 'cancelled';
};

export type RecordingStateChangeDetail = {
  recording: boolean;
};

export type RecordingErrorDetail = {
  message: string;
};

/** Warm-up silence before media play so MediaRecorder captures the first words. */
export const RECORDING_HEAD_PAD_MS = 300;
/** Keep recording briefly after stop so MediaRecorder captures the last words. */
export const RECORDING_TAIL_PAD_MS = 250;
/**
 * After latency offset, drop practice segments shorter than this (seconds).
 * Filters open-cue-and-stop noise / inverted windows without discarding real partial takes.
 */
export const MIN_PRACTICE_SEGMENT_RECORDING_S = 0.05;

/**
 * Shift recording windows by shadowing latency and clamp into [0, totalElapsed].
 * Drops near-zero windows (e.g. offset pushed a mid-stop cue past the blob end).
 */
export function applyRecordingLatencyOffset(
  segments: PracticeSegment[],
  offset: number,
  totalElapsed: number,
): PracticeSegment[] {
  const elapsed = Math.max(0, totalElapsed);
  return segments
    .map((seg) => {
      const start = Math.max(0, Math.min(seg.recordingStartTime + offset, elapsed));
      const end = Math.max(start, Math.min(seg.recordingEndTime + offset, elapsed));
      return {
        ...seg,
        recordingStartTime: start,
        recordingEndTime: end,
      };
    })
    .filter(
      (seg) => seg.recordingEndTime - seg.recordingStartTime >= MIN_PRACTICE_SEGMENT_RECORDING_S,
    );
}

@customElement('audio-recorder')
@localized()
export class AudioRecorder extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .recording-controls {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-block);
      align-items: center;
      justify-content: center;
    }

    .recording-waveform {
      margin-top: var(--space-sm);
    }
  `;

  @property({ attribute: false })
  controller?: MediaController;

  @property({ type: Boolean })
  collectSegments = false;

  @property({ type: Boolean })
  autoPlayOnStart = true;

  @property({ type: Boolean })
  autoPauseOnStop = true;

  @property({ type: Boolean })
  stopOnMediaEnded = true;

  @property({ type: Boolean })
  stopOnSegmentEnd = false;

  @property({ type: Boolean })
  pauseMediaOnSegmentEnd = false;

  @property({ type: Boolean })
  hideControls = false;

  @property({ type: Boolean })
  disabled = false;

  /** Shown on the record button tooltip while `disabled` (e.g. recording limit reached). */
  @property({ type: String })
  disabledTitle = '';

  @property({ type: Number })
  canvasHeight = 120;

  @property({ attribute: false })
  beforeRecordingStart?: () => void;

  @property({ type: Boolean })
  countdownBeforeStart = true;

  @property({ type: Number })
  countdownSeconds = 3;

  @property({ type: Number })
  shadowingLatencyOffset = 0;

  /** When true, waveform is driven for external hosts (e.g. echo session dock). */
  @property({ type: Boolean })
  hideWaveform = false;

  @state()
  private _recording = false;

  @state()
  private _hasWaveform = false;

  private readonly _waveformController = new WaveformController();
  private _liveTrackId: string | null = null;
  private _livePeaks: number[] = [];
  private _liveAnalysisDetach: (() => void) | null = null;
  private _practiceSegments: PracticeSegment[] = [];
  private _recordingStartedAt = 0;
  /** Open sentence window: set on segment enter, closed on SEGMENT_END. */
  private _openSegment: {
    id: string;
    sourceStartTime: number;
    sourceEndTime: number;
    recordingStartTime: number;
  } | null = null;
  /**
   * Floor for the next open-window start (after head pad). Ensures the first
   * cue starts after the pad even when performance.now does not advance under
   * fake timers.
   */
  private _nextOpenStartFloor = 0;
  private _isCollectingSegments = false;
  private _stopReason: RecordingCompleteDetail['reason'] = 'manual';
  /** Bumped to cancel in-flight head/tail pad waits when start/stop races. */
  private _recordingEpoch = 0;
  /**
   * True while a saving stop is running. The recorder still owns the buffered
   * chunks until `onStop` returns, so it must not be released in that window.
   */
  private _stopInFlight = false;
  private readonly _recordingSupported = isRecordingSupported();

  private readonly _audioRecorder = new AudioRecorderController({
    onStart: () => {
      this._practiceSegments = [];
      this._recordingStartedAt = performance.now();
      this._openSegment = null;
      this._nextOpenStartFloor = 0;
      this._isCollectingSegments = this.collectSegments;

      if (this.stopOnMediaEnded) {
        this._attachEndedListener();
      }
      if (this.collectSegments || this.pauseMediaOnSegmentEnd) {
        this._attachSegmentEndListener();
      }
      if (this.collectSegments) {
        this._attachSegmentChangeListener();
      }

      this._waveformController.clearTracks();
      this._liveTrackId = this._waveformController.prepareLiveTrack(msg('录音'));
      this._hasWaveform = true;
      this._startLiveAnalysis();
    },
    onStop: (blob) => {
      this._stopLiveAnalysis();
      const trackId = this._liveTrackId;
      this._liveTrackId = null;
      if (trackId) {
        void this._waveformController.finalizeLiveTrack(trackId, blob);
      }

      if (this.autoPauseOnStop && this.controller) {
        void this.controller.pause();
      }

      const totalElapsed = this._getRecordingElapsedSeconds();
      const segments = applyRecordingLatencyOffset(
        this._practiceSegments,
        this.shadowingLatencyOffset,
        totalElapsed,
      );
      this._isCollectingSegments = false;
      this._recordingStartedAt = 0;
      this._openSegment = null;
      this._detachEndedListener();
      this._detachSegmentEndListener();
      this._detachSegmentChangeListener();
      this._setRecording(false);
      this._audioRecorder.destroy();

      this._dispatchComplete(blob, segments, this._stopReason);
    },
    onError: (error) => {
      this._recordingEpoch += 1;
      this._detachEndedListener();
      this._detachSegmentEndListener();
      this._isCollectingSegments = false;
      this._setRecording(false);
      this._stopLiveAnalysis();
      this._waveformController.clearTracks();
      this._hasWaveform = false;
      this._liveTrackId = null;

      this._dispatchError(getMicrophoneErrorMessage(error));
    },
    onStateChange: (state) => {
      this._setRecording(state === 'recording' || state === 'paused');
    },
  });

  connectedCallback(): void {
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    this._recordingEpoch += 1;
    this._detachEndedListener();
    this._detachSegmentEndListener();
    this._stopLiveAnalysis();
    if (this._audioRecorder.getState() !== 'inactive') {
      void this._audioRecorder.stop().catch(() => this._audioRecorder.destroy());
    } else {
      this._audioRecorder.destroy();
    }
    this._waveformController.destroy();
    super.disconnectedCallback();
  }

  render() {
    const controlsDisabled = this.disabled || !this._recordingSupported;
    const tip = this._recording
      ? msg('停止')
      : controlsDisabled && this.disabledTitle
        ? this.disabledTitle
        : msg('录音');
    const tipDisabled = controlsDisabled && !this.disabledTitle;

    return html`
      ${!this.hideControls
        ? html`
            <div class="recording-controls">
              <ui-tooltip title="${tip}" ?disabled="${tipDisabled}">
                <ui-button
                  variant="primary"
                  ?disabled="${controlsDisabled}"
                  @click="${this.toggleRecording}"
                >
                  <ui-icon name="${this._recording ? 'stop-recording' : 'micro'}"></ui-icon>
                </ui-button>
              </ui-tooltip>
            </div>
          `
        : null}
      ${this._hasWaveform && !this.hideWaveform
        ? html`
            <div class="recording-waveform">
              <waveform-player
                .controller=${this._waveformController}
                .canvasHeight=${this.canvasHeight}
                .interactive=${!this._recording}
              ></waveform-player>
            </div>
          `
        : null}
    `;
  }

  async toggleRecording(): Promise<void> {
    if (this._recording) {
      await this.stopRecording();
      return;
    }
    await this.startRecording();
  }

  /**
   * Open the mic ahead of `startRecording` so the device/route switch it causes
   * happens in silence instead of cutting the tail of whatever is still playing.
   * Best effort: permission/device failures are surfaced later by `startRecording`.
   */
  async warmUpMicrophone(): Promise<void> {
    if (this.disabled || !this._recordingSupported || this._recording) {
      return;
    }

    try {
      await this._audioRecorder.prepare();
    } catch {
      // Ignored on purpose — startRecording reports the error to the user.
    }
  }

  /** Release a warmed-up mic that never went on to record. No-op while recording. */
  releaseMicrophone(): void {
    if (this._stopInFlight) {
      return;
    }
    if (this._recording || this._audioRecorder.getState() !== 'inactive') {
      return;
    }
    if (!this._audioRecorder.isReady()) {
      return;
    }
    this._audioRecorder.destroy();
  }

  async startRecording(): Promise<void> {
    if (this.disabled) {
      return;
    }

    if (!this._recordingSupported) {
      this._dispatchError(getMicrophoneBlockedMessage('unsupported'));
      return;
    }

    this._stopReason = 'manual';

    let countdownSkipped = false;
    if (this.countdownBeforeStart) {
      const skipped = shouldSkipRecordingCountdown();
      countdownSkipped = skipped;
      if (!skipped) {
        this._dispatchCountdownStart();
        try {
          await runRecordingCountdown({ seconds: this.countdownSeconds });
        } catch (error) {
          if (error instanceof CountdownCancelledError) {
            this._dispatchCountdownEnd({ skipped: false, cancelled: true });
          }
          return;
        }
      }
      this._dispatchCountdownEnd({ skipped });
    }

    // Seek / profile setup before MediaRecorder starts so the recording clock
    // does not include pre-roll seek latency in the first practice segment.
    this.beforeRecordingStart?.();

    const epoch = ++this._recordingEpoch;

    try {
      await this._audioRecorder.start();
    } catch {
      // onError already dispatched recording-error for init/start failures.
      return;
    }

    if (epoch !== this._recordingEpoch || this._audioRecorder.getState() !== 'recording') {
      return;
    }

    if (this.autoPlayOnStart && this.controller) {
      // Head pad: warm up MediaRecorder before media (and shadowing) begins.
      await this._delay(RECORDING_HEAD_PAD_MS);
      if (epoch !== this._recordingEpoch || this._audioRecorder.getState() !== 'recording') {
        return;
      }
      // Practice-segment timeline starts after the pad; pad stays in the blob.
      // Open the current subtitle window if playback is already on a cue.
      this._nextOpenStartFloor = Math.max(
        this._getRecordingElapsedSeconds(),
        RECORDING_HEAD_PAD_MS / 1000,
      );
      this._ensureOpenSegmentFromController();
      this._nextOpenStartFloor = 0;
      if (!countdownSkipped) {
        Message.primary(msg('请跟上原音'));
      }
      void this.controller.play();
    }
  }

  async stopRecording(options: { save?: boolean } = {}): Promise<void> {
    if (this._audioRecorder.getState() === 'inactive') {
      return;
    }

    // Invalidate in-flight start head-pad so it will not call play() after stop.
    this._recordingEpoch += 1;

    this._detachEndedListener();
    this._detachSegmentEndListener();
    this._detachSegmentChangeListener();

    if (options.save === false) {
      this._isCollectingSegments = false;
      this._openSegment = null;
      this._stopLiveAnalysis();
      this._waveformController.clearTracks();
      this._hasWaveform = false;
      this._liveTrackId = null;
      this._audioRecorder.destroy();
      this._setRecording(false);
      return;
    }

    // Tail pad: keep capturing so the last words are not clipped by MediaRecorder.stop.
    if (this._audioRecorder.getState() === 'recording') {
      await this._delay(RECORDING_TAIL_PAD_MS);
    }

    if (this._audioRecorder.getState() === 'inactive') {
      return;
    }

    this._finalizeOpenSegment();

    this._stopInFlight = true;
    try {
      await this._audioRecorder.stop();
    } catch {
      this._audioRecorder.destroy();
      this._setRecording(false);
    } finally {
      this._stopInFlight = false;
    }
  }

  destroy(): void {
    void this.stopRecording({ save: false });
    this.releaseMicrophone();
  }

  clearWaveform(): void {
    this._waveformController.clearTracks();
    this._hasWaveform = false;
    this._liveTrackId = null;
  }

  get recording(): boolean {
    return this._recording;
  }

  get waveformController(): WaveformController {
    return this._waveformController;
  }

  get hasWaveform(): boolean {
    return this._hasWaveform;
  }

  private _dispatchCountdownStart(): void {
    this.dispatchEvent(
      new CustomEvent(AudioRecorderEventType.COUNTDOWN_START, {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _dispatchCountdownEnd(detail: RecordingCountdownEndDetail): void {
    this.dispatchEvent(
      new CustomEvent<RecordingCountdownEndDetail>(AudioRecorderEventType.COUNTDOWN_END, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _onSegmentEnded = (event: Event): void => {
    const customEvent = event as CustomEvent<{ segmentIndex: number; segment: SubtitleSegment }>;
    const segment = customEvent.detail?.segment;
    if (!segment) {
      return;
    }

    if (this._isCollectingSegments && this._audioRecorder.getState() === 'recording') {
      this._closeSegmentWindow(segment);

      if (this.stopOnSegmentEnd) {
        this._stopReason = 'segment-end';
        void this.stopRecording();
      }
    }

    if (this.pauseMediaOnSegmentEnd && this.controller) {
      this.controller.setPauseMode('off');
      void this.controller.pause();
    }
  };

  private _onSegmentChanged = (event: Event): void => {
    if (!this._isCollectingSegments || this._audioRecorder.getState() !== 'recording') {
      return;
    }

    const customEvent = event as CustomEvent<{
      currentIndex: number;
      currentSegment: SubtitleSegment | null;
    }>;
    const segment = customEvent.detail?.currentSegment;
    const index = customEvent.detail?.currentIndex ?? -1;
    if (index < 0 || !segment) {
      return;
    }

    this._openSegmentWindow(segment);
  };

  private _openSegmentWindow(segment: SubtitleSegment): void {
    if (this._openSegment?.id === segment.id) {
      return;
    }

    // Already finalized this cue — ignore regressing SEGMENT_CHANGE
    // (compress seek can briefly land in the prior cue's gap and snap back).
    if (this._practiceSegments.some((s) => s.id === segment.id)) {
      return;
    }

    // Missed SEGMENT_END for the previous cue — close it so gap stays hollow.
    if (this._openSegment && this._openSegment.id !== segment.id) {
      this._pushClosedSegment(this._openSegment, this._getRecordingElapsedSeconds());
      this._openSegment = null;
    }

    this._openSegment = {
      id: segment.id,
      sourceStartTime: segment.startTime,
      sourceEndTime: segment.endTime,
      recordingStartTime: Math.max(this._getRecordingElapsedSeconds(), this._nextOpenStartFloor),
    };
  }

  private _closeSegmentWindow(segment: SubtitleSegment): void {
    const recordingEndTime = this._getRecordingElapsedSeconds();
    if (this._openSegment?.id === segment.id) {
      this._pushClosedSegment(this._openSegment, recordingEndTime);
      this._openSegment = null;
      return;
    }

    // SEGMENT_END without a matching open window (e.g. tests) — open at end would
    // be zero-width; use a short lookback only when nothing is open yet.
    if (!this._openSegment) {
      const already = this._practiceSegments.some((s) => s.id === segment.id);
      if (already) {
        return;
      }
      this._practiceSegments.push({
        id: segment.id,
        sourceStartTime: segment.startTime,
        sourceEndTime: segment.endTime,
        recordingStartTime: Math.max(0, recordingEndTime - 0.01),
        recordingEndTime,
      });
    }
  }

  private _pushClosedSegment(
    open: {
      id: string;
      sourceStartTime: number;
      sourceEndTime: number;
      recordingStartTime: number;
    },
    recordingEndTime: number,
  ): void {
    const end = Math.max(open.recordingStartTime, recordingEndTime);
    this._practiceSegments.push({
      id: open.id,
      sourceStartTime: open.sourceStartTime,
      sourceEndTime: open.sourceEndTime,
      recordingStartTime: open.recordingStartTime,
      recordingEndTime: end,
    });
  }

  private _ensureOpenSegmentFromController(): void {
    if (!this.controller || !this._isCollectingSegments) {
      return;
    }
    const snapshot = this.controller.getSnapshot();
    const segment =
      snapshot.currentSegmentIndex >= 0
        ? (snapshot.segments[snapshot.currentSegmentIndex] ?? null)
        : null;
    if (segment) {
      this._openSegmentWindow(segment);
    }
  }

  private _getRecordingElapsedSeconds(): number {
    if (this._recordingStartedAt === 0) {
      return 0;
    }
    return (performance.now() - this._recordingStartedAt) / 1000;
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  /** Resolve the in-progress subtitle when stopping mid-sentence or after the last cue. */
  private _resolveOpenSegment(): SubtitleSegment | null {
    if (!this.controller) {
      return null;
    }

    const snapshot = this.controller.getSnapshot();
    const { segments, currentSegmentIndex, currentTime } = snapshot;
    if (segments.length === 0) {
      return null;
    }

    if (currentSegmentIndex >= 0) {
      return segments[currentSegmentIndex] ?? null;
    }

    // Past all subtitles (outro / snapped to duration): still finalize the last cue
    // when SEGMENT_END raced with media ended.
    const last = segments[segments.length - 1];
    if (last && currentTime >= last.startTime) {
      return last;
    }

    return null;
  }

  private _extendLastSegmentToNow(): void {
    const last = this._practiceSegments[this._practiceSegments.length - 1];
    if (!last) {
      return;
    }

    const now = this._getRecordingElapsedSeconds();
    // Cover MediaRecorder stop clipping / early SEGMENT_END, without swallowing a long outro.
    const maxExtend = last.recordingEndTime + RECORDING_TAIL_PAD_MS / 1000 + 0.05;
    const recordingEndTime = Math.min(now, maxExtend);
    if (recordingEndTime > last.recordingEndTime) {
      last.recordingEndTime = recordingEndTime;
    }
  }

  /** Clip source end to playback position so a mid-stop cue is a partial window. */
  private _clipSourceEndToPlayback(sourceStartTime: number, sourceEndTime: number): number {
    if (!this.controller) {
      return sourceEndTime;
    }
    const { currentTime } = this.controller.getSnapshot();
    return Math.min(sourceEndTime, Math.max(sourceStartTime, currentTime));
  }

  /** 提前停止录音时，补录当前未触发 SEGMENT_END 的句子；已收尾的末句则延长到尾 pad。 */
  private _finalizeOpenSegment(): void {
    if (!this._isCollectingSegments || !this.controller) {
      return;
    }

    const resolved = this._resolveOpenSegment();

    if (this._openSegment) {
      // Controller moved on (or past cues) while this window is still open — close it
      // first so a mid-stop / missed SEGMENT_END take is not discarded.
      if (resolved && resolved.id !== this._openSegment.id) {
        const sourceEndTime = this._clipSourceEndToPlayback(
          this._openSegment.sourceStartTime,
          this._openSegment.sourceEndTime,
        );
        this._pushClosedSegment(
          { ...this._openSegment, sourceEndTime },
          this._getRecordingElapsedSeconds(),
        );
        this._openSegment = null;
        // Fall through to attach `resolved` if it is not already finalized.
      } else {
        const sourceEndTime = this._clipSourceEndToPlayback(
          this._openSegment.sourceStartTime,
          this._openSegment.sourceEndTime,
        );
        this._pushClosedSegment(
          { ...this._openSegment, sourceEndTime },
          this._getRecordingElapsedSeconds(),
        );
        this._openSegment = null;
        return;
      }
    }

    if (!resolved) {
      this._extendLastSegmentToNow();
      return;
    }

    const last = this._practiceSegments[this._practiceSegments.length - 1];
    if (last?.id === resolved.id) {
      this._extendLastSegmentToNow();
      return;
    }

    // Controller still highlights an earlier cue while we already closed it
    // (manual SEGMENT_* tests / seek races) — do not duplicate.
    if (this._practiceSegments.some((s) => s.id === resolved.id)) {
      this._extendLastSegmentToNow();
      return;
    }

    // No open window but controller still on a cue — treat as started at end (degenerate).
    const recordingEndTime = this._getRecordingElapsedSeconds();
    this._practiceSegments.push({
      id: resolved.id,
      sourceStartTime: resolved.startTime,
      sourceEndTime: this._clipSourceEndToPlayback(resolved.startTime, resolved.endTime),
      recordingStartTime: Math.max(0, recordingEndTime - 0.01),
      recordingEndTime,
    });
  }

  private _onEnded = (): void => {
    this._stopReason = 'media-ended';
    void this.stopRecording();
  };

  private _attachEndedListener(): void {
    this.controller?.addEventListener('ended', this._onEnded);
  }

  private _detachEndedListener(): void {
    this.controller?.removeEventListener('ended', this._onEnded);
  }

  private _attachSegmentEndListener(): void {
    this.controller?.addEventListener(ExtendedMediaEventType.SEGMENT_END, this._onSegmentEnded);
  }

  private _detachSegmentEndListener(): void {
    this.controller?.removeEventListener(ExtendedMediaEventType.SEGMENT_END, this._onSegmentEnded);
  }

  private _attachSegmentChangeListener(): void {
    this.controller?.addEventListener(
      ExtendedMediaEventType.SEGMENT_CHANGE,
      this._onSegmentChanged,
    );
  }

  private _detachSegmentChangeListener(): void {
    this.controller?.removeEventListener(
      ExtendedMediaEventType.SEGMENT_CHANGE,
      this._onSegmentChanged,
    );
  }

  private _publishLivePeaks = (): void => {
    if (!this._liveTrackId) {
      return;
    }
    const peaks = buildLiveDisplayPeaks(this._livePeaks);
    const windowDuration = Math.max(peaks.length, 1) * 0.05;
    this._waveformController.updateLivePeaks(this._liveTrackId, peaks, windowDuration);
  };

  private readonly _throttledPublishLivePeaks = throttle(this._publishLivePeaks, 100);

  private _startLiveAnalysis(): void {
    this._livePeaks = [];
    this._throttledPublishLivePeaks.cancel();
    try {
      this._liveAnalysisDetach = this._audioRecorder.attachWaveformAnalysis((peak) => {
        this._livePeaks.push(peak);
        this._throttledPublishLivePeaks();
      });
    } catch {
      // stream may not be ready; ignore waveform errors
    }
  }

  private _stopLiveAnalysis(): void {
    this._throttledPublishLivePeaks.cancel();
    this._liveAnalysisDetach?.();
    this._liveAnalysisDetach = null;
    this._audioRecorder.detachWaveformAnalysis();
  }

  private _setRecording(recording: boolean): void {
    if (this._recording === recording) {
      return;
    }
    this._recording = recording;
    this.dispatchEvent(
      new CustomEvent<RecordingStateChangeDetail>(AudioRecorderEventType.STATE_CHANGE, {
        detail: { recording },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _dispatchComplete(
    blob: Blob,
    segments: PracticeSegment[],
    reason: RecordingCompleteDetail['reason'],
  ): void {
    this.dispatchEvent(
      new CustomEvent<RecordingCompleteDetail>(AudioRecorderEventType.COMPLETE, {
        detail: { blob, segments, reason },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _dispatchError(message: string): void {
    this.dispatchEvent(
      new CustomEvent<RecordingErrorDetail>(AudioRecorderEventType.ERROR, {
        detail: { message },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'audio-recorder': AudioRecorder;
  }
}
