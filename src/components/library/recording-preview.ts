import { msg } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { DualTrackPlayback, type DualTrackMode } from '../../lib/dual-track-playback.js';
import type { PracticeSegment } from '../../types/models.js';
import '../ui/button.js';

@customElement('recording-preview')
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
    /* 
    .subtitle-area:not(:empty) {
      min-height: 48px;
      padding: 12px 14px;
      border-radius: var(--radius-md, 8px);
      background: rgba(0, 0, 0, 0.02);
      border: 1px solid var(--color-border, #d9d9d9);
      line-height: 1.6;
      font-size: 0.9375rem;
    } */

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
  private _playMode: DualTrackMode = 'idle';

  @state()
  private _syncSegmentIndex = 0;

  @state()
  private _sourceUrl = '';

  @state()
  private _recordingUrl = '';

  private _playback: DualTrackPlayback | null = null;
  private _sourceObjectUrl = '';
  private _recordingObjectUrl = '';
  private _pendingPlaybackInit = false;

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('sourceBlob') || changed.has('recordingBlob')) {
      this._revokeUrls();
      this._sourceObjectUrl = this.sourceBlob ? URL.createObjectURL(this.sourceBlob) : '';
      this._recordingObjectUrl = this.recordingBlob ? URL.createObjectURL(this.recordingBlob) : '';
      this._sourceUrl = this._sourceObjectUrl;
      this._recordingUrl = this._recordingObjectUrl;
      this._schedulePlaybackInit();
    }

    if (changed.has('segments') && this._playback) {
      this._playback.setSegments(this.segments);
    }
  }

  disconnectedCallback(): void {
    this._teardownPlayback();
    this._revokeUrls();
    super.disconnectedCallback();
  }

  render() {
    const canPlaySource = Boolean(this._sourceUrl);
    const canPlayRecording = Boolean(this._recordingUrl);
    const canPlaySync = canPlaySource && canPlayRecording && this.segments.length > 0;

    return html`
      <div class="preview">
        <div class="subtitle-area">
          <slot name="subtitle"></slot>
        </div>

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

      <audio class="source-audio" .src=${this._sourceUrl} hidden></audio>
      <audio class="recording-audio" .src=${this._recordingUrl} hidden></audio>
    `;
  }

  stop(): void {
    this._playback?.stop();
  }

  private _renderStatus() {
    switch (this._playMode) {
      case 'source':
        return html`${msg('正在播放原音…')}`;
      case 'recording':
        return html`${msg('正在播放录音…')}`;
      case 'sync':
        return html`${msg('正在同步播放片段')}
          <strong>${this._syncSegmentIndex + 1} / ${this.segments.length}</strong>`;
      default:
        return nothing;
    }
  }

  private async _handlePlaySource(): Promise<void> {
    if (!this._playback || !this._sourceUrl) {
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
    if (!this._playback || !this._recordingUrl) {
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

    const sourceAudio = this.renderRoot.querySelector('.source-audio') as HTMLAudioElement | null;
    const recordingAudio = this.renderRoot.querySelector(
      '.recording-audio',
    ) as HTMLAudioElement | null;
    if (!sourceAudio || !recordingAudio) {
      return;
    }

    this._playback = new DualTrackPlayback(sourceAudio, recordingAudio, this.segments, (state) => {
      this._playMode = state.mode;
      this._syncSegmentIndex = state.syncSegmentIndex;
    });
  }

  private _teardownPlayback(): void {
    this._playback?.destroy();
    this._playback = null;
    this._playMode = 'idle';
    this._syncSegmentIndex = 0;
  }

  private _revokeUrls(): void {
    if (this._sourceObjectUrl) {
      URL.revokeObjectURL(this._sourceObjectUrl);
      this._sourceObjectUrl = '';
    }
    if (this._recordingObjectUrl) {
      URL.revokeObjectURL(this._recordingObjectUrl);
      this._recordingObjectUrl = '';
    }
    this._sourceUrl = '';
    this._recordingUrl = '';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'recording-preview': RecordingPreview;
  }
}
