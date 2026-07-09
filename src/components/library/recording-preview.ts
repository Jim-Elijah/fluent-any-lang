import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { DualTrackPlayback, type DualTrackMode } from '../../lib/dual-track-playback.js';
import { findPracticeSegmentIndex } from '../../lib/playback-utils.js';
import { WaveformController } from '../../controllers/waveform-controller.js';
import type { PracticeSegment } from '../../types/models.js';
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

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('sourceBlob') || changed.has('recordingBlob')) {
      void this._loadTracks();
    }

    if (changed.has('segments') && this._playback) {
      this._playback.setSegments(this.segments);
    }
  }

  disconnectedCallback(): void {
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
    switch (this._playMode) {
      case 'source':
        return html`${msg('正在播放原音…')}`;
      case 'recording':
        return html`${msg('正在播放录音…')}`;
      case 'sync':
        return msg(
          html`正在同步播放片段
            <strong>${this._syncSegmentIndex + 1} / ${this.segments.length}</strong>`,
        );
      default:
        return nothing;
    }
  }

  private async _handlePlaySource(): Promise<void> {
    if (!this._playback || !this.sourceBlob) {
      return;
    }

    if (this._playMode === 'source') {
      this._playback.stop();
      return;
    }

    try {
      await this._playback.playSource();
    } catch {
      this._playback.stop();
    }
  }

  private async _handlePlayRecording(): Promise<void> {
    if (!this._playback || !this.recordingBlob) {
      return;
    }

    if (this._playMode === 'recording') {
      this._playback.stop();
      return;
    }

    try {
      await this._playback.playRecording();
    } catch {
      this._playback.stop();
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
    let segmentIndex = -1;

    if (trackId === this._sourceTrackId) {
      segmentIndex = findPracticeSegmentIndex(this.segments, time, 'source');
    } else if (trackId === this._recordingTrackId) {
      segmentIndex = findPracticeSegmentIndex(this.segments, time, 'recording');
    }

    console.log('source segmentIndex', segmentIndex);
    /** @TODO UI上缩放视图 setViewRange */
    /**  当点击处的time不在任何片段范围内时，将播放第一个片段或最后一个片段 */
    if (segmentIndex < 0) {
      const { sourceStartTime } = this.segments[0];
      const { sourceEndTime } = this.segments[this.segments.length - 1];
      if (time < sourceStartTime) {
        segmentIndex = 0;
        Message.warning(msg('无法找到对应的片段，将播放第一个片段'));
      } else if (time > sourceEndTime) {
        segmentIndex = this.segments.length - 1;
        Message.warning(msg('无法找到对应的片段，将播放最后一个片段'));
      }
    }

    event.preventDefault();
    void this._playback.playSyncFromSegment(segmentIndex).catch(() => {
      this._playback?.stop();
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
      } else if (state.mode === 'recording' && this._recordingTrackId) {
        this._controller.setActiveId(this._recordingTrackId);
      } else if (state.mode === 'sync' && this._sourceTrackId) {
        this._controller.setActiveId(this._sourceTrackId);
      }
    });
  }

  private _teardownPlayback(): void {
    this._playback?.destroy();
    this._playback = null;
    this._playMode = 'idle';
    this._syncSegmentIndex = 0;
    this._controller.pause();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'recording-preview': RecordingPreview;
  }
}
