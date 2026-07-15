import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { DualTrackPlayback, type DualTrackMode } from '../../lib/dual-track-playback.js';
import { dispatchAudioFocusRequest } from '../../lib/audio-focus.js';
import {
  VOLUME_HOTKEY_STEP,
  getHotkeyManager,
  supportsKeyboardShortcuts,
} from '../../lib/hotkeys/index.js';
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
import '../ui/dropdown.js';
import '../ui/icon.js';
import '../ui/slider.js';
import { Z_INDEX } from '../ui/internal/z-index.js';
import '../player/waveform-player.js';
import { Message } from '../ui/message.js';

/** Prevent overlay open/close events from bubbling out of the preview modal. */
const stopOverlayOpenEvent = (event: Event): void => {
  event.stopPropagation();
};

export type PreviewSubtitleLookup = {
  mode: DualTrackMode;
  subtitleSegments: SubtitleSegment[];
  practiceSegments: PracticeSegment[];
  syncSegmentIndex: number;
  sourceTime: number;
  recordingTime: number;
};

/** Resolve the focused subtitle line for the current preview playback mode. */
export function resolvePreviewSubtitle(input: PreviewSubtitleLookup): SubtitleSegment | null {
  if (input.mode === 'idle' || input.subtitleSegments.length === 0) {
    return null;
  }

  if (input.mode === 'sync') {
    const practice = input.practiceSegments[input.syncSegmentIndex];
    if (!practice) {
      return null;
    }
    return input.subtitleSegments.find((segment) => segment.id === practice.id) ?? null;
  }

  if (input.mode === 'source') {
    const index = findSegmentIndex(input.subtitleSegments, input.sourceTime);
    return index >= 0 ? input.subtitleSegments[index] : null;
  }

  if (input.mode === 'recording') {
    const practiceIndex = findPracticeSegmentIndex(
      input.practiceSegments,
      input.recordingTime,
      'recording',
    );
    if (practiceIndex < 0) {
      return null;
    }
    const practice = input.practiceSegments[practiceIndex];
    return input.subtitleSegments.find((segment) => segment.id === practice.id) ?? null;
  }

  return null;
}

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
      gap: var(--space-inline);
    }

    .subtitle-area {
      min-height: 0;
      text-align: center;
    }

    .subtitle-text {
      margin: 0;
      font-size: 1rem;
      line-height: 1.5;
      color: var(--color-text, rgba(0, 0, 0, 0.88));
      white-space: pre-wrap;
    }

    .subtitle-translation {
      margin: var(--space-xs) 0 0;
      font-size: 0.875rem;
      line-height: 1.45;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      white-space: pre-wrap;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-sm);
    }

    .control-group {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
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

    .overlay-panel-label {
      display: block;
      margin-bottom: var(--space-xs);
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .volume-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-xs);
      border: none;
      border-radius: var(--radius-md, 8px);
      background: transparent;
      color: inherit;
      line-height: 0;
      cursor: pointer;
    }

    .volume-trigger:hover {
      background: rgba(0, 0, 0, 0.04);
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
  private _playbackPaused = false;

  @state()
  private _syncSegmentIndex = 0;

  @state()
  private _activeSubtitle: SubtitleSegment | null = null;

  @state()
  private _sourceVolume = 1;

  @state()
  private _recordingVolume = 1;

  private _playback: DualTrackPlayback | null = null;
  private _sourceTrackId = '';
  private _recordingTrackId = '';
  private _sourceAudio: HTMLAudioElement | null = null;
  private _recordingAudio: HTMLAudioElement | null = null;
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
    this._registerHotkeys();
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
      this._refreshActiveSubtitle();
    }

    if (changed.has('subtitleSegments')) {
      this._refreshActiveSubtitle();
    }
  }

  disconnectedCallback(): void {
    if (supportsKeyboardShortcuts()) {
      getHotkeyManager().unregisterScope('recording-preview');
    }
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
    const showSourceVolume = this._playMode === 'source' || this._playMode === 'sync';
    const showRecordingVolume = this._playMode === 'recording' || this._playMode === 'sync';
    const keyboardShortcuts = supportsKeyboardShortcuts();

    const sourceTitle = canPlaySource
      ? keyboardShortcuts
        ? msg('播放原音 (Q)')
        : msg('播放原音')
      : msg('无原音，无法播放');
    const recordingTitle = canPlayRecording
      ? keyboardShortcuts
        ? msg('播放录音 (W)')
        : msg('播放录音')
      : msg('无录音，无法播放');
    const syncTitle = canPlaySync
      ? keyboardShortcuts
        ? msg('同步播放 (E)')
        : msg('同步播放')
      : !canPlaySource
        ? msg('无原音，无法同步播放')
        : !canPlayRecording
          ? msg('无录音，无法同步播放')
          : msg('无练习片段，无法同步播放');

    return html`
      <div class="preview">
        <div class="subtitle-area">${this._renderSubtitle()}</div>

        <waveform-player
          .controller=${this._controller}
          .canvasHeight=${120}
          .resolveTrackViewRange=${this._resolveTrackViewRange}
          @seek-request=${this._handleWaveformSeekRequest}
        ></waveform-player>

        <div class="controls">
          <div class="control-group">
            <ui-button
              variant="${this._playMode === 'source' ? 'primary' : 'secondary'}"
              ?disabled=${!canPlaySource}
              title=${sourceTitle}
              @click=${() => this._handlePlaySource()}
            >
              ${keyboardShortcuts ? msg('播放原音 (Q)') : msg('播放原音')}
            </ui-button>
            ${showSourceVolume ? this._renderVolumeControl('source') : nothing}
          </div>
          <div class="control-group">
            <ui-button
              variant="${this._playMode === 'recording' ? 'primary' : 'secondary'}"
              ?disabled=${!canPlayRecording}
              title=${recordingTitle}
              @click=${() => this._handlePlayRecording()}
            >
              ${keyboardShortcuts ? msg('播放录音 (W)') : msg('播放录音')}
            </ui-button>
            ${showRecordingVolume ? this._renderVolumeControl('recording') : nothing}
          </div>
          <ui-button
            variant="${this._playMode === 'sync' ? 'primary' : 'secondary'}"
            ?disabled=${!canPlaySync}
            title=${syncTitle}
            @click=${() => this._handlePlaySync()}
          >
            ${keyboardShortcuts ? msg('同步播放 (E)') : msg('同步播放')}
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

  private _renderSubtitle() {
    const subtitle = this._activeSubtitle;
    if (!subtitle || this._playMode === 'idle') {
      return nothing;
    }

    return html`
      <p class="subtitle-text">${subtitle.text}</p>
      ${subtitle.translation
        ? html`<p class="subtitle-translation">${subtitle.translation}</p>`
        : nothing}
    `;
  }

  private _renderVolumeControl(track: 'source' | 'recording'): TemplateResult {
    const volume = track === 'source' ? this._sourceVolume : this._recordingVolume;
    const percent = Math.round(volume * 100);
    const label = track === 'source' ? msg('原音音量') : msg('录音音量');
    const title = `${label} ${percent}%`;

    return html`
      <ui-dropdown
        trigger="click"
        placement="top"
        .arrow=${true}
        .zIndex=${Z_INDEX.MODAL + 1}
        style="--dropdown-overlay-min-width: 160px; --dropdown-overlay-padding-block: var(--space-sm); --dropdown-overlay-padding-inline: var(--space-sm);"
        @open=${stopOverlayOpenEvent}
        @close=${stopOverlayOpenEvent}
        @open-change=${stopOverlayOpenEvent}
        @update:open=${stopOverlayOpenEvent}
        .overlay=${html`
          <span class="overlay-panel-label">${label} ${percent}%</span>
          <ui-slider
            .value=${volume}
            style="--slider-mark-edge-padding: var(--space-sm);"
            orientation="horizontal"
            min="0"
            max="1"
            step="0.01"
            .marks=${{
              0: '0%',
              0.5: '50%',
              1: '100%',
            }}
            .tooltip=${{
              formatter: (v: number) => `${Math.round(v * 100)}%`,
              placement: 'top',
            }}
            @change=${(e: CustomEvent<{ value: number }>) =>
              this._handleVolumeChange(track, e.detail.value)}
          ></ui-slider>
        `}
      >
        <button
          type="button"
          class="volume-trigger"
          title=${title}
          aria-label=${title}
          data-volume-track=${track}
        >
          <ui-icon name=${volume === 0 ? 'volume-close' : 'volume'} size="var(--icon-lg)"></ui-icon>
        </button>
      </ui-dropdown>
    `;
  }

  private _handleVolumeChange(track: 'source' | 'recording', value: number): void {
    const clamped = Math.max(0, Math.min(value, 1));
    if (track === 'source') {
      this._sourceVolume = clamped;
    } else {
      this._recordingVolume = clamped;
    }
    this._applyVolumes();
  }

  private _applyVolumes(): void {
    if (this._sourceAudio) {
      this._sourceAudio.volume = this._sourceVolume;
    }
    if (this._recordingAudio) {
      this._recordingAudio.volume = this._recordingVolume;
    }
  }

  private _refreshActiveSubtitle(): void {
    const next = resolvePreviewSubtitle({
      mode: this._playMode,
      subtitleSegments: this.subtitleSegments,
      practiceSegments: this.segments,
      syncSegmentIndex: this._syncSegmentIndex,
      sourceTime: this._sourceAudio?.currentTime ?? 0,
      recordingTime: this._recordingAudio?.currentTime ?? 0,
    });

    if (next?.id === this._activeSubtitle?.id && next?.text === this._activeSubtitle?.text) {
      if (next?.translation === this._activeSubtitle?.translation) {
        return;
      }
    }
    this._activeSubtitle = next;
  }

  private _handleAudioTimeUpdate = (): void => {
    this._refreshActiveSubtitle();
  };

  private _bindAudioTimeUpdates(): void {
    this._sourceAudio?.addEventListener('timeupdate', this._handleAudioTimeUpdate);
    this._recordingAudio?.addEventListener('timeupdate', this._handleAudioTimeUpdate);
  }

  private _unbindAudioTimeUpdates(): void {
    this._sourceAudio?.removeEventListener('timeupdate', this._handleAudioTimeUpdate);
    this._recordingAudio?.removeEventListener('timeupdate', this._handleAudioTimeUpdate);
  }

  private _renderStatus() {
    const segmentCount = this.segments.length;
    const segmentLabel =
      segmentCount > 0
        ? html` <strong>${this._syncSegmentIndex + 1} / ${segmentCount}</strong>`
        : nothing;

    if (this._playbackPaused) {
      switch (this._playMode) {
        case 'source':
          return segmentCount > 0
            ? msg(html`已暂停原音片段${segmentLabel}`)
            : html`${msg('已暂停原音')}`;
        case 'recording':
          return segmentCount > 0
            ? msg(html`已暂停录音片段${segmentLabel}`)
            : html`${msg('已暂停录音')}`;
        case 'sync':
          return msg(html`已暂停同步片段${segmentLabel}`);
        default:
          return nothing;
      }
    }

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

  private _registerHotkeys(): void {
    if (!supportsKeyboardShortcuts()) {
      return;
    }

    getHotkeyManager().registerScope({
      id: 'recording-preview',
      handlers: {
        playSource: () => {
          void this._handlePlaySource();
        },
        playRecording: () => {
          void this._handlePlayRecording();
        },
        playSync: () => {
          void this._handlePlaySync();
        },
        togglePlay: () => {
          if (this._playMode === 'idle') {
            return;
          }
          this._togglePreviewPlayback();
        },
        previousSegment: () => {
          this._navigateSegment(-1);
        },
        nextSegment: () => {
          this._navigateSegment(1);
        },
        volumeUp: () => {
          this._nudgeVolume(VOLUME_HOTKEY_STEP);
        },
        volumeDown: () => {
          this._nudgeVolume(-VOLUME_HOTKEY_STEP);
        },
      },
    });
  }

  private _togglePreviewPlayback(): void {
    if (this._playbackPaused) {
      this._requestAudioFocus();
    }
    void this._playback?.togglePause();
  }

  /** Ask the host practice player (if any) to yield the audio channel. */
  private _requestAudioFocus(): void {
    dispatchAudioFocusRequest(this);
  }

  private _navigateSegment(direction: -1 | 1): void {
    if (this._playMode === 'idle' || !this._playback || this.segments.length === 0) {
      return;
    }

    const nextIndex = this._syncSegmentIndex + direction;
    if (nextIndex < 0 || nextIndex >= this.segments.length) {
      return;
    }

    void this._playback.goToSegment(nextIndex).catch(() => {
      this._playback?.stop();
    });
  }

  private _resolveVolumeTrackForHotkey(): 'source' | 'recording' | null {
    switch (this._playMode) {
      case 'source':
        return 'source';
      case 'recording':
        return 'recording';
      case 'sync':
        if (this._controller.activeId === this._recordingTrackId) {
          return 'recording';
        }
        return 'source';
      default:
        return null;
    }
  }

  private _nudgeVolume(delta: number): void {
    const track = this._resolveVolumeTrackForHotkey();
    if (!track) {
      return;
    }

    const current = track === 'source' ? this._sourceVolume : this._recordingVolume;
    this._handleVolumeChange(track, current + delta);
  }

  /** Restore first-render track/view after leaving a play mode (true stop, not Space pause). */
  private _resetPreviewContextAfterStop(): void {
    if (this._sourceTrackId) {
      this._controller.setActiveId(this._sourceTrackId);
    } else if (this._recordingTrackId) {
      this._controller.setActiveId(this._recordingTrackId);
    }

    if (this.segments.length === 0) {
      return;
    }
    if (this.practiceMode === 'echo') {
      this._zoomToPracticeSegment(0);
      return;
    }
    this._setPracticeViewRange(null);
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
      this._requestAudioFocus();
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
      this._requestAudioFocus();
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
    this._requestAudioFocus();
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
      this._requestAudioFocus();
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

    this._sourceAudio = sourceAudio;
    this._recordingAudio = recordingAudio;
    this._applyVolumes();
    this._bindAudioTimeUpdates();

    this._playback = new DualTrackPlayback(sourceAudio, recordingAudio, this.segments, (state) => {
      const previousMode = this._playMode;
      const previousSegmentIndex = this._syncSegmentIndex;

      this._playMode = state.mode;
      this._playbackPaused = state.paused;
      this._syncSegmentIndex = state.syncSegmentIndex;
      this._refreshActiveSubtitle();

      if (state.mode === 'idle') {
        this._resetPreviewContextAfterStop();
        return;
      }

      // Space pause/resume keeps mode + segment; do not reset track/view.
      if (state.mode === previousMode && state.syncSegmentIndex === previousSegmentIndex) {
        return;
      }

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
    this._unbindAudioTimeUpdates();
    this._playback?.destroy();
    this._playback = null;
    this._sourceAudio = null;
    this._recordingAudio = null;
    this._playMode = 'idle';
    this._playbackPaused = false;
    this._syncSegmentIndex = 0;
    this._activeSubtitle = null;
    this._controller.pause();
    this._setPracticeViewRange(null);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'recording-preview': RecordingPreview;
  }
}
