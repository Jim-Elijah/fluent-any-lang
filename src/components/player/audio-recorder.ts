import { msg, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { MediaController } from '../../controllers/media-controller.js';
import { WaveformController } from '../../controllers/waveform-controller.js';
import { AudioRecorderController } from '../../lib/audio-recorder.js';
import { ExtendedMediaEventType } from '../../lib/playback-utils.js';
import type { PracticeSegment, SubtitleSegment } from '../../types/models.js';
import '../ui/alert.js';
import '../ui/icon.js';
import '../ui/button.js';
import '../ui/tooltip.js';
import './waveform-player.js';

export const AudioRecorderEventType = {
  STATE_CHANGE: 'recording-state-change',
  COMPLETE: 'recording-complete',
  ERROR: 'recording-error',
} as const;

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
      gap: 12px;
      align-items: center;
      justify-content: center;
    }

    .recording-waveform {
      margin-top: 8px;
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

  @property({ type: Number })
  canvasHeight = 120;

  @property({ attribute: false })
  beforeRecordingStart?: () => void;

  @state()
  private _recording = false;

  @state()
  private _recordingError = '';

  @state()
  private _hasWaveform = false;

  private readonly _waveformController = new WaveformController();
  private _liveTrackId: string | null = null;
  private _livePeaks: number[] = [];
  private _liveAnalysisDetach: (() => void) | null = null;
  private _liveStartedAt = 0;
  private _practiceSegments: PracticeSegment[] = [];
  private _recordingStartedAt = 0;
  private _lastRecordingEndTime = 0;
  private _isCollectingSegments = false;
  private _stopReason: RecordingCompleteDetail['reason'] = 'manual';
  private readonly _recordingSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    typeof MediaRecorder !== 'undefined';

  private readonly _audioRecorder = new AudioRecorderController({
    onStart: () => {
      this._recordingError = '';
      this._practiceSegments = [];
      this._recordingStartedAt = performance.now();
      this._lastRecordingEndTime = 0;
      this._isCollectingSegments = this.collectSegments;

      this.beforeRecordingStart?.();

      if (this.stopOnMediaEnded) {
        this._attachEndedListener();
      }
      if (this.collectSegments || this.pauseMediaOnSegmentEnd) {
        this._attachSegmentEndListener();
      }

      this._waveformController.clearTracks();
      this._liveTrackId = this._waveformController.prepareLiveTrack(msg('录音'));
      this._hasWaveform = true;
      this._startLiveAnalysis();

      if (this.autoPlayOnStart && this.controller) {
        void this.controller.play();
      }
      // @fixme if not start at a segment.startTime，segments in recording will be incorrect
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

      const segments = [...this._practiceSegments];
      this._isCollectingSegments = false;
      this._recordingStartedAt = 0;
      this._detachEndedListener();
      this._detachSegmentEndListener();
      this._setRecording(false);
      this._audioRecorder.destroy();

      this._dispatchComplete(blob, segments, this._stopReason);
    },
    onError: (error) => {
      this._detachEndedListener();
      this._detachSegmentEndListener();
      this._isCollectingSegments = false;
      this._setRecording(false);
      this._stopLiveAnalysis();
      this._waveformController.clearTracks();
      this._hasWaveform = false;
      this._liveTrackId = null;

      const message =
        error.name === 'NotAllowedError'
          ? msg('未能开启麦克风，请检查权限。')
          : msg('录音失败，请重试。');
      this._recordingError = message;
      this._dispatchError(message);
    },
    onStateChange: (state) => {
      this._setRecording(state === 'recording' || state === 'paused');
    },
  });

  connectedCallback(): void {
    super.connectedCallback();
  }

  disconnectedCallback(): void {
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
    return html`
      ${!this.hideControls
        ? html`
            <div class="recording-controls">
              <ui-tooltip
                title="${this._recording ? msg('停止') : msg('录音')}"
                ?disabled="${this.disabled || !this._recordingSupported}"
              >
                <ui-button
                  variant="primary"
                  ?disabled="${this.disabled || !this._recordingSupported}"
                  @click="${this.toggleRecording}"
                >
                  <ui-icon name="${this._recording ? 'stop-recording' : 'micro-on'}"></ui-icon>
                </ui-button>
              </ui-tooltip>
              ${this._recordingError
                ? html`<ui-alert type="error">${this._recordingError}</ui-alert>`
                : null}
            </div>
          `
        : null}
      ${this._hasWaveform
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

  async startRecording(): Promise<void> {
    if (this.disabled) {
      return;
    }

    if (!this._recordingSupported) {
      const message = msg('当前浏览器不支持录音。');
      this._recordingError = message;
      this._dispatchError(message);
      return;
    }

    this._recordingError = '';
    this._stopReason = 'manual';

    try {
      await this._audioRecorder.start();
    } catch {
      if (!this._recordingError) {
        const message = msg('未能开启麦克风，请检查权限。');
        this._recordingError = message;
        this._dispatchError(message);
      }
    }
  }

  async stopRecording(options: { save?: boolean } = {}): Promise<void> {
    if (this._audioRecorder.getState() === 'inactive') {
      return;
    }

    this._detachEndedListener();
    this._detachSegmentEndListener();

    if (options.save === false) {
      this._isCollectingSegments = false;
      this._stopLiveAnalysis();
      this._waveformController.clearTracks();
      this._hasWaveform = false;
      this._liveTrackId = null;
      this._audioRecorder.destroy();
      this._setRecording(false);
      return;
    }

    this._finalizeOpenSegment();

    try {
      await this._audioRecorder.stop();
    } catch {
      this._audioRecorder.destroy();
      this._setRecording(false);
    }
  }

  destroy(): void {
    void this.stopRecording({ save: false });
  }

  clearWaveform(): void {
    this._waveformController.clearTracks();
    this._hasWaveform = false;
    this._liveTrackId = null;
  }

  get recording(): boolean {
    return this._recording;
  }

  private _onSegmentEnded = (event: Event): void => {
    const customEvent = event as CustomEvent<{ segmentIndex: number; segment: SubtitleSegment }>;
    const segment = customEvent.detail?.segment;
    if (!segment) {
      return;
    }

    if (this._isCollectingSegments && this._audioRecorder.getState() === 'recording') {
      const recordingEndTime = this._getRecordingElapsedSeconds();
      this._practiceSegments.push({
        id: segment.id,
        /** @fixeme 可能不是从segment.startTime开始录音 */
        sourceStartTime: segment.startTime,
        sourceEndTime: segment.endTime,
        recordingStartTime: this._lastRecordingEndTime,
        recordingEndTime,
      });
      this._lastRecordingEndTime = recordingEndTime;

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

  private _getRecordingElapsedSeconds(): number {
    if (this._recordingStartedAt === 0) {
      return 0;
    }
    return (performance.now() - this._recordingStartedAt) / 1000;
  }

  /** 提前停止录音时，补录当前未触发 SEGMENT_END 的句子 */
  private _finalizeOpenSegment(): void {
    if (!this._isCollectingSegments || !this.controller) {
      return;
    }

    const snapshot = this.controller.getSnapshot();
    const segment = snapshot.segments[snapshot.currentSegmentIndex];
    if (!segment) {
      return;
    }

    const last = this._practiceSegments[this._practiceSegments.length - 1];
    if (last?.id === segment.id) {
      return;
    }

    const recordingEndTime = this._getRecordingElapsedSeconds();
    this._practiceSegments.push({
      id: segment.id,
      sourceStartTime: segment.startTime,
      sourceEndTime: segment.endTime,
      recordingStartTime: this._lastRecordingEndTime,
      recordingEndTime,
    });
    this._lastRecordingEndTime = recordingEndTime;
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

  private _startLiveAnalysis(): void {
    this._livePeaks = [];
    this._liveStartedAt = performance.now();
    try {
      this._liveAnalysisDetach = this._audioRecorder.attachWaveformAnalysis((peak) => {
        this._livePeaks.push(peak);
        const duration = (performance.now() - this._liveStartedAt) / 1000;
        const peaks = new Float32Array(this._livePeaks);
        if (this._liveTrackId) {
          this._waveformController.updateLivePeaks(this._liveTrackId, peaks, duration);
        }
      });
    } catch {
      // stream may not be ready; ignore waveform errors
    }
  }

  private _stopLiveAnalysis(): void {
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
