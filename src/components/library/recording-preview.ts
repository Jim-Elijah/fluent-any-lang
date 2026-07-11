import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { DualTrackPlayback, type DualTrackMode } from '../../lib/dual-track-playback.js';
import {
  findPracticeSegmentIndex,
  findSegmentIndex,
  getLongerPracticeAxis,
  getPracticeRecordingSpan,
  getPracticeSourceSpan,
  mapPracticeViewRange,
} from '../../lib/playback-utils.js';
import {
  ViewRange,
  WaveformController,
  WaveformEventType,
  type WaveformTrack,
} from '../../controllers/waveform-controller.js';
import type { PracticeMode, PracticeSegment, SubtitleSegment } from '../../types/models.js';
import type { WaveformSeekRequestDetail } from '../player/waveform-player.js';
import '../ui/button.js';
import '../player/waveform-player.js';
import { Message } from '../ui/message.js';

@customElement('recording-preview')
@localized()
export class RecordingPreview extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .preview {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .subtitle-area {
      min-height: 0;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .status {
      margin: 0;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.8125rem;
    }

    .status strong {
      color: var(--color-text, rgba(0, 0, 0, 0.88));
      font-weight: 600;
    }
  `;

  @property({ attribute: false })
  sourceBlob: Blob | null = null;

  @property({ attribute: false })
  recordingBlob: Blob | null = null;

  @property({ type: Array })
  segments: PracticeSegment[] = [];

  @property({ type: Array })
  subtitleSegments: SubtitleSegment[] = [];

  @property({ type: String })
  practiceMode: PracticeMode = 'shadowing';

  @state()
  private _controller: WaveformController = new WaveformController();

  @state()
  private _playMode: DualTrackMode = 'idle';

  @state()
  private _syncSegmentIndex = 0;

  private _playback: DualTrackPlayback | null = null;
  private _sourceTrackId = '';
  private _recordingTrackId = '';
  private _pendingPlaybackInit = false;
  private _loadGeneration = 0;
  private readonly _fallbackAudio = new Audio();

  connectedCallback(): void {
    super.connectedCallback();
    this._controller.addEventListener(
      WaveformEventType.VIEW_RANGE_CHANGE,
      this._handleViewRangeChange,
    );
    this._controller.addEventListener(WaveformEventType.TRACK_CHANGE, this._handleTrackChange);
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('sourceBlob') || changed.has('recordingBlob')) {
      void this._loadTracks();
    }

    if (changed.has('segments')) {
      if (this._playback) {
        this._playback.setSegments(this.segments);
      }
      this._enforceViewRangeBounds();
    }
  }

  disconnectedCallback(): void {
    this._controller.removeEventListener(
      WaveformEventType.VIEW_RANGE_CHANGE,
      this._handleViewRangeChange,
    );
    this._controller.removeEventListener(WaveformEventType.TRACK_CHANGE, this._handleTrackChange);
    this._teardownPlayback();
    this._controller.destroy();
    super.disconnectedCallback();
  }

  render() {
    const canPlaySource = Boolean(this.sourceBlob);
    const canPlayRecording = Boolean(this.recordingBlob);
    const canPlaySync = canPlaySource && canPlayRecording && this.segments.length > 0;

    return html`
      <div class="preview">
        <div class="subtitle-area">
          <slot name="subtitle"></slot>
        </div>

        <waveform-player
          .controller=${this._controller}
          .canvasHeight=${120}
          .resolveTrackViewRange=${this._resolveTrackViewRange}
          @seek-request=${this._handleWaveformSeekRequest}
        ></waveform-player>

        <div class="controls">
          <ui-button
            variant="${this._playMode === 'source' ? 'primary' : 'secondary'}"
            ?disabled=${!canPlaySource}
            @click=${() => this._handlePlaySource()}
          >
            ${msg('播放原音')}
          </ui-button>
          <ui-button
            variant="${this._playMode === 'recording' ? 'primary' : 'secondary'}"
            ?disabled=${!canPlayRecording}
            @click=${() => this._handlePlayRecording()}
          >
            ${msg('播放录音')}
          </ui-button>
          <ui-button
            variant="${this._playMode === 'sync' ? 'primary' : 'secondary'}"
            ?disabled=${!canPlaySync}
            @click=${() => this._handlePlaySync()}
          >
            ${msg('同步播放')}
          </ui-button>
        </div>

        ${this._playMode !== 'idle' ? html`<p class="status">${this._renderStatus()}</p>` : nothing}
      </div>
    `;
  }

  stop(): void {
    this._playback?.stop();
    this._controller.pause();
  }

  private _renderStatus() {
    const segmentCount = this.segments.length;
    const segmentLabel =
      segmentCount > 0
        ? html` <strong>${this._syncSegmentIndex + 1} / ${segmentCount}</strong>`
        : nothing;

    switch (this._playMode) {
      case 'source':
        return segmentCount > 0
          ? msg(html`正在播放片段${segmentLabel}`)
          : html`${msg('正在播放原音…')}`;
      case 'recording':
        return segmentCount > 0
          ? msg(html`正在播放片段${segmentLabel}`)
          : html`${msg('正在播放录音…')}`;
      case 'sync':
        return msg(html`正在同步播放片段${segmentLabel}`);
      default:
        return nothing;
    }
  }

  private async _handlePlaySource(): Promise<void> {
    if (!this.sourceBlob) {
      return;
    }
    if (!(await this._ensurePlayback())) {
      return;
    }

    if (this._playMode === 'source') {
      this._playback!.stop();
      return;
    }

    try {
      if (this._sourceTrackId) {
        this._controller.setActiveId(this._sourceTrackId);
      }
      await this._playback!.playSource();
    } catch {
      this._playback?.stop();
    }
  }

  private async _handlePlayRecording(): Promise<void> {
    if (!this.recordingBlob) {
      return;
    }
    if (!(await this._ensurePlayback())) {
      return;
    }

    if (this._playMode === 'recording') {
      this._playback!.stop();
      return;
    }

    try {
      if (this._recordingTrackId) {
        this._controller.setActiveId(this._recordingTrackId);
      }
      await this._playback!.playRecording();
    } catch {
      this._playback?.stop();
    }
  }

  private _handleWaveformSeekRequest(event: CustomEvent<WaveformSeekRequestDetail>): void {
    if (this._playMode !== 'sync') {
      return;
    }
    if (!this._playback || this.segments.length === 0) {
      return;
    }
    if (!this._sourceTrackId || !this._recordingTrackId) {
      return;
    }

    const { trackId, time } = event.detail;
    if (trackId !== this._sourceTrackId && trackId !== this._recordingTrackId) {
      return;
    }

    const axis = trackId === this._recordingTrackId ? 'recording' : 'source';
    let segmentIndex = findPracticeSegmentIndex(this.segments, time, axis);
    if (segmentIndex < 0 && axis === 'source' && this.subtitleSegments.length > 0) {
      const subtitleIndex = findSegmentIndex(this.subtitleSegments, time);
      if (subtitleIndex < 0) {
        Message.warning(msg('无法定位到字幕句子'));
        return;
      }
      const subtitle = this.subtitleSegments[subtitleIndex];
      segmentIndex = this.segments.findIndex((segment) => segment.id === subtitle.id);
      if (segmentIndex < 0) {
        Message.info(msg('该句无录音，无法同步播放'));
        return;
      }
    } else if (segmentIndex < 0) {
      return;
    }

    event.preventDefault();
    this._zoomToPracticeSegment(segmentIndex);
    void this._playback.playSyncFromSegment(segmentIndex).catch(() => {
      this._playback?.stop();
    });
  }

  private _getPracticeViewBounds(): ViewRange | null {
    if (this._usesRecordingTimeline()) {
      return getPracticeRecordingSpan(this.segments);
    }
    return getPracticeSourceSpan(this.segments);
  }

  private _usesRecordingTimeline(): boolean {
    if (this._playMode === 'recording') {
      return true;
    }
    return Boolean(this._recordingTrackId && this._controller.activeId === this._recordingTrackId);
  }

  private _clampViewRangeToBounds(range: ViewRange, bounds: ViewRange): ViewRange {
    const start = Math.max(bounds.start, Math.min(range.start, range.end));
    const end = Math.min(bounds.end, Math.max(range.start, range.end));
    if (end <= start) {
      return { start: bounds.start, end: bounds.end };
    }
    return { start, end };
  }

  private _setPracticeViewRange(range: ViewRange | null): void {
    const bounds = this._getPracticeViewBounds();
    if (!bounds) {
      this._controller.setViewRange(range);
      return;
    }
    if (!range) {
      this._controller.setViewRange(bounds);
      return;
    }
    this._controller.setViewRange(this._clampViewRangeToBounds(range, bounds));
  }

  private _enforceViewRangeBounds(): void {
    const bounds = this._getPracticeViewBounds();
    if (!bounds) {
      return;
    }

    const current = this._controller.viewRange;
    if (!current) {
      this._controller.setViewRange(bounds);
      return;
    }

    const clamped = this._clampViewRangeToBounds(current, bounds);
    if (clamped.start !== current.start || clamped.end !== current.end) {
      this._controller.setViewRange(clamped);
    }
  }

  private _handleViewRangeChange = (): void => {
    this._enforceViewRangeBounds();
  };

  private _handleTrackChange = (): void => {
    this._setPracticeViewRange(null);
  };

  private _resolveTrackViewRange = (
    track: WaveformTrack,
    viewRange: ViewRange | null,
    activeTrack: WaveformTrack | null,
  ): ViewRange | null => {
    if (!viewRange || !activeTrack || track.id === activeTrack.id || this.segments.length === 0) {
      return viewRange;
    }

    if (activeTrack.id === this._sourceTrackId && track.id === this._recordingTrackId) {
      return mapPracticeViewRange(viewRange, 'source', 'recording', this.segments);
    }
    if (activeTrack.id === this._recordingTrackId && track.id === this._sourceTrackId) {
      return mapPracticeViewRange(viewRange, 'recording', 'source', this.segments);
    }

    return viewRange;
  };

  private _setSyncActiveTrack(segmentIndex: number): void {
    const segment = this.segments[segmentIndex];
    if (!segment) {
      return;
    }

    const longerAxis = getLongerPracticeAxis(segment);
    const activeTrackId = longerAxis === 'recording' ? this._recordingTrackId : this._sourceTrackId;
    if (activeTrackId) {
      this._controller.setActiveId(activeTrackId);
    }
  }

  private _zoomToPracticeSegment(segmentIndex: number): void {
    const segment = this.segments[segmentIndex];
    if (!segment) {
      return;
    }

    if (this._usesRecordingTimeline()) {
      this._setPracticeViewRange({
        start: segment.recordingStartTime,
        end: segment.recordingEndTime,
      });
      return;
    }

    this._setPracticeViewRange({
      start: segment.sourceStartTime,
      end: segment.sourceEndTime,
    });
  }

  private async _handlePlaySync(): Promise<void> {
    if (!this._playback || this.segments.length === 0) {
      return;
    }

    if (this._playMode === 'sync') {
      this._playback.stop();
      return;
    }

    try {
      await this._playback.playSync();
    } catch {
      this._playback.stop();
    }
  }

  private async _loadTracks(): Promise<void> {
    const generation = ++this._loadGeneration;
    this._teardownPlayback();
    this._controller.clearTracks();
    this._sourceTrackId = '';
    this._recordingTrackId = '';

    if (this.sourceBlob) {
      this._sourceTrackId = await this._controller.addFromBlob(this.sourceBlob, msg('原音'));
    }
    if (generation !== this._loadGeneration) {
      return;
    }
    if (this.recordingBlob) {
      this._recordingTrackId = await this._controller.addFromBlob(this.recordingBlob, msg('录音'));
    }
    if (generation !== this._loadGeneration) {
      return;
    }

    if (this._sourceTrackId || this._recordingTrackId) {
      /** make sure layout is overlay, otherwise clicking waveform will switch track unexpectedly */
      this._controller.setLayout('overlay');
      if (this._sourceTrackId) {
        this._controller.setActiveId(this._sourceTrackId);
      } else if (this._recordingTrackId) {
        this._controller.setActiveId(this._recordingTrackId);
      }
    }

    this._schedulePlaybackInit();

    if (this.segments.length > 0) {
      if (this.practiceMode === 'echo') {
        this._zoomToPracticeSegment(0);
      } else {
        this._setPracticeViewRange(null);
      }
    }
  }

  private _schedulePlaybackInit(): void {
    if (this._pendingPlaybackInit) {
      return;
    }
    this._pendingPlaybackInit = true;
    void this.updateComplete.then(() => {
      this._pendingPlaybackInit = false;
      this._initPlayback();
    });
  }

  private _initPlayback(): void {
    this._teardownPlayback();

    if (!this._sourceTrackId && !this._recordingTrackId) {
      return;
    }

    const sourceAudio =
      (this._sourceTrackId && this._controller.getAudioElement(this._sourceTrackId)) ||
      this._fallbackAudio;
    const recordingAudio =
      (this._recordingTrackId && this._controller.getAudioElement(this._recordingTrackId)) ||
      this._fallbackAudio;

    this._playback = new DualTrackPlayback(sourceAudio, recordingAudio, this.segments, (state) => {
      this._playMode = state.mode;
      this._syncSegmentIndex = state.syncSegmentIndex;

      if (state.mode === 'source' && this._sourceTrackId) {
        this._controller.setActiveId(this._sourceTrackId);
        this._setPracticeViewRange(null);
        if (this.segments.length > 0) {
          this._zoomToPracticeSegment(state.syncSegmentIndex);
        }
      } else if (state.mode === 'recording' && this._recordingTrackId) {
        this._controller.setActiveId(this._recordingTrackId);
        this._setPracticeViewRange(null);
        if (this.segments.length > 0) {
          this._zoomToPracticeSegment(state.syncSegmentIndex);
        }
      } else if (state.mode === 'sync') {
        this._setSyncActiveTrack(state.syncSegmentIndex);
        this._zoomToPracticeSegment(state.syncSegmentIndex);
      }
    });
  }

  private async _ensurePlayback(): Promise<boolean> {
    if (this._playback) {
      return true;
    }

    await this.updateComplete;
    this._initPlayback();
    return Boolean(this._playback);
  }

  private _teardownPlayback(): void {
    this._playback?.destroy();
    this._playback = null;
    this._playMode = 'idle';
    this._syncSegmentIndex = 0;
    this._controller.pause();
    this._setPracticeViewRange(null);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'recording-preview': RecordingPreview;
  }
}
