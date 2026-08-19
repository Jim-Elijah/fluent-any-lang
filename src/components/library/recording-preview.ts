import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import {
  DualTrackPlayback,
  isComparePlayMode,
  type DualTrackMode,
} from '../../lib/dual-track-playback.js';
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
  getPracticeSegmentViewRange,
  getPracticeSourceSpan,
  mapPracticeViewRange,
} from '../../lib/playback-utils.js';
import {
  ViewRange,
  WaveformController,
  WaveformEventType,
  type WaveformTrack,
} from '../../controllers/waveform-controller.js';
import type {
  PracticeRecord,
  PronunciationMisreadWord,
  PronunciationScore,
  PronunciationWordScore,
  SpeakingMode,
  PracticeSegment,
  ShadowingGapPolicy,
  SubtitleSegment,
} from '../../types/models.js';
import { getAppSettings, getMaxVolumeBoost } from '../../lib/app-settings.js';
import { getLocale } from '../../i18n/localization.js';
import {
  ackSpeechScorePrivacy,
  formatOverallBadge,
  hasSpeechScorePrivacyAck,
  isSpeechScoreConfigured,
  requestScore,
  resolveReferenceText,
  SCORE_MAX_DURATION_SEC,
  scoreTooLongMessage,
} from '../../lib/pronunciation-score/index.js';
import { getScoreByRecordId } from '../../db/pronunciation-score.js';
import { setLogicalVolume } from '../../lib/media-element-gain.js';
import {
  wordMarkersForPreview,
  WORD_RAIL_LANE_PX,
  type WordWaveformMarker,
} from '../../lib/word-waveform.js';
import type { WaveformSeekRequestDetail } from '../player/waveform-player.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/dropdown.js';
import '../ui/icon.js';
import '../ui/icon-button.js';
import '../ui/modal.js';
import '../ui/slider.js';
import '../ui/tooltip.js';
import { Z_INDEX } from '../ui/internal/z-index.js';
import '../player/waveform-player.js';
import { Message } from '../ui/message.js';

/** Prevent overlay open/close events from bubbling out of the preview modal. */
const stopOverlayOpenEvent = (event: Event): void => {
  event.stopPropagation();
};

const WAVEFORM_CANVAS_HEIGHT = 120;

export type PreviewSubtitleLookup = {
  mode: DualTrackMode;
  subtitleSegments: SubtitleSegment[];
  practiceSegments: PracticeSegment[];
  syncSegmentIndex: number;
  sourceTime: number;
  recordingTime: number;
};

function joinWordList(words: string[]): string {
  return words.join(getLocale() === 'en' ? ', ' : '、');
}

function joinMisreadWordList(words: PronunciationMisreadWord[]): string {
  const sep = getLocale() === 'en' ? ', ' : '、';
  return words.map((word) => `${word.expected} → ${word.actual}`).join(sep);
}

function subtitleFromPracticeSegment(segment: PracticeSegment): SubtitleSegment | null {
  const text = segment.text?.trim();
  if (!text) {
    return null;
  }
  return {
    id: segment.id,
    startTime: segment.sourceStartTime,
    endTime: segment.sourceEndTime,
    text,
    ...(segment.translation ? { translation: segment.translation } : {}),
  };
}

function resolveLineForPractice(
  practice: PracticeSegment | undefined,
  subtitleSegments: SubtitleSegment[],
): SubtitleSegment | null {
  if (!practice) {
    return null;
  }
  return (
    subtitleSegments.find((segment) => segment.id === practice.id) ??
    subtitleFromPracticeSegment(practice)
  );
}

/** Resolve the focused subtitle line for the current preview playback mode. */
export function resolvePreviewSubtitle(input: PreviewSubtitleLookup): SubtitleSegment | null {
  if (input.mode === 'idle') {
    return null;
  }

  if (input.mode === 'sync') {
    return resolveLineForPractice(
      input.practiceSegments[input.syncSegmentIndex],
      input.subtitleSegments,
    );
  }

  if (input.mode === 'continuous' || input.mode === 'source') {
    if (input.subtitleSegments.length > 0) {
      const index = findSegmentIndex(input.subtitleSegments, input.sourceTime);
      return index >= 0 ? input.subtitleSegments[index] : null;
    }
    const practiceIndex = findPracticeSegmentIndex(
      input.practiceSegments,
      input.sourceTime,
      'source',
    );
    return practiceIndex >= 0
      ? resolveLineForPractice(input.practiceSegments[practiceIndex], input.subtitleSegments)
      : null;
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
    return resolveLineForPractice(input.practiceSegments[practiceIndex], input.subtitleSegments);
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

    .segment-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm);
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

    .volume-trigger--boosted {
      color: var(--color-warning, #fa8c16);
    }

    .score-panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      max-height: min(26dvh, 280px);
      min-height: 0;
      overflow-y: auto;
      padding: var(--space-md);
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface, #fff);
    }

    .score-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-sm);
      padding-bottom: var(--space-xs);
      background: var(--color-surface, #fff);
      box-shadow: 0 8px 10px 2px var(--color-surface, #fff);
    }

    .score-overall {
      font-size: 1.75rem;
      font-weight: 700;
      line-height: 1.1;
      color: var(--color-text, rgba(0, 0, 0, 0.88));
    }

    .score-metrics {
      display: grid;
      gap: var(--space-xs);
    }

    .score-metric {
      display: grid;
      grid-template-columns: 3.5rem 1fr 2.5rem;
      align-items: center;
      gap: var(--space-sm);
      font-size: 0.8125rem;
    }

    .score-metric--nested {
      padding-left: 1rem;
      opacity: 0.9;
    }

    .score-bar {
      height: 6px;
      border-radius: 999px;
      background: rgba(22, 119, 255, 0.12);
      overflow: hidden;
    }

    .score-bar-fill {
      height: 100%;
      border-radius: inherit;
      background: var(--color-primary, #1677ff);
    }

    .score-texts {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .score-texts strong {
      color: var(--color-text, rgba(0, 0, 0, 0.88));
      font-weight: 600;
    }

    .word-heatmap {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .word-chip {
      padding: 1px 6px;
      border: none;
      border-radius: 4px;
      font: inherit;
      font-size: 0.8125rem;
      line-height: 1.4;
      cursor: pointer;
    }

    .word-chip.high {
      background: rgba(82, 196, 26, 0.18);
      color: #237804;
    }

    .word-chip.mid {
      background: rgba(250, 173, 20, 0.2);
      color: #ad6800;
    }

    .word-chip.low {
      background: rgba(255, 77, 79, 0.16);
      color: #cf1322;
    }

    .word-chip.is-missing {
      cursor: default;
      opacity: 0.7;
    }

    .word-rail {
      position: relative;
      height: 100%;
      pointer-events: none;
    }

    .word-marker {
      position: absolute;
      top: 0;
      height: 100%;
      width: auto;
      padding: 0 4px;
      border: none;
      border-radius: 3px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font: inherit;
      font-size: 0.6875rem;
      line-height: ${WORD_RAIL_LANE_PX}px;
      text-align: center;
      cursor: pointer;
      pointer-events: auto;
    }

    .word-marker.high {
      background: rgba(82, 196, 26, 0.18);
      color: #237804;
    }

    .word-marker.mid {
      background: rgba(250, 173, 20, 0.2);
      color: #ad6800;
    }

    .word-marker.low {
      background: rgba(255, 77, 79, 0.16);
      color: #cf1322;
    }

    .word-marker.is-missing {
      cursor: default;
      opacity: 0.7;
    }

    .score-skeleton {
      height: 12px;
      border-radius: 6px;
      background: linear-gradient(90deg, #f0f0f0 25%, #e6e6e6 37%, #f0f0f0 63%);
      background-size: 400% 100%;
      animation: preview-score-skeleton 1.2s ease infinite;
    }

    @keyframes preview-score-skeleton {
      0% {
        background-position: 100% 50%;
      }
      100% {
        background-position: 0 50%;
      }
    }

    .score-pending-label {
      margin: 0;
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
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
  practiceMode: SpeakingMode = 'shadowing';

  /** Shadowing gap policy for this take; drives compare-play behavior. */
  @property({ type: String })
  gapPolicy: ShadowingGapPolicy | null = null;

  @property({ attribute: false })
  record: PracticeRecord | null = null;

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
  private _sourceVolume = getAppSettings().defaultSourceVolume;

  @state()
  private _recordingVolume = 1;

  @state()
  private _score: PronunciationScore | null = null;

  @state()
  private _scoring = false;

  @state()
  private _privacyOpen = false;

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

    if (changed.has('record')) {
      void this._loadScore();
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

  private get _useContinuousCompare(): boolean {
    return this.gapPolicy === 'preserve';
  }

  render() {
    const canPlaySource = Boolean(this.sourceBlob);
    const canPlayRecording = Boolean(this.recordingBlob);
    const canPlaySync = canPlaySource && canPlayRecording && this.segments.length > 0;
    const compareActive = isComparePlayMode(this._playMode);
    const wordMarkers = this._wordRailVisible() ? this._wordMarkers() : [];
    const wordLanePx = wordMarkers.length > 0 ? WORD_RAIL_LANE_PX : 0;
    const showSourceVolume = this._playMode === 'source' || compareActive;
    const showRecordingVolume = this._playMode === 'recording' || compareActive;
    const keyboardShortcuts = supportsKeyboardShortcuts();
    const compareLabel = this._useContinuousCompare ? msg('连续对照') : msg('同步播放');
    const compareLabelWithKey = this._useContinuousCompare
      ? msg('连续对照 (E)')
      : msg('同步播放 (E)');

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
        ? compareLabelWithKey
        : compareLabel
      : !canPlaySource
        ? this._useContinuousCompare
          ? msg('无原音，无法连续对照')
          : msg('无原音，无法同步播放')
        : !canPlayRecording
          ? this._useContinuousCompare
            ? msg('无录音，无法连续对照')
            : msg('无录音，无法同步播放')
          : this._useContinuousCompare
            ? msg('无练习片段，无法连续对照')
            : msg('无练习片段，无法同步播放');

    return html`
      <div class="preview">
        ${this._renderScorePanel()}
        <div class="subtitle-area">${this._renderSubtitle()}</div>

        ${this._renderPlaybackNav()}

        <waveform-player
          .controller=${this._controller}
          .canvasHeight=${WAVEFORM_CANVAS_HEIGHT + wordLanePx}
          .topInset=${wordLanePx}
          .resolveTrackViewRange=${this._resolveTrackViewRange}
          @seek-request=${this._handleWaveformSeekRequest}
        >
          ${this._renderWordRail(wordMarkers)}
        </waveform-player>

        <div class="controls">
          <div class="control-group">
            <ui-tooltip title=${sourceTitle} .zIndex=${Z_INDEX.MODAL + 1}>
              <ui-button
                variant="${this._playMode === 'source' ? 'primary' : 'secondary'}"
                ?disabled=${!canPlaySource}
                @click=${() => this._handlePlaySource()}
              >
                ${msg('播放原音')}
              </ui-button>
            </ui-tooltip>
            ${showSourceVolume ? this._renderVolumeControl('source') : nothing}
          </div>
          <div class="control-group">
            <ui-tooltip title=${recordingTitle} .zIndex=${Z_INDEX.MODAL + 1}>
              <ui-button
                variant="${this._playMode === 'recording' ? 'primary' : 'secondary'}"
                ?disabled=${!canPlayRecording}
                @click=${() => this._handlePlayRecording()}
              >
                ${msg('播放录音')}
              </ui-button>
            </ui-tooltip>
            ${showRecordingVolume ? this._renderVolumeControl('recording') : nothing}
          </div>
          <ui-tooltip title=${syncTitle} .zIndex=${Z_INDEX.MODAL + 1}>
            <ui-button
              variant="${compareActive ? 'primary' : 'secondary'}"
              ?disabled=${!canPlaySync}
              @click=${() => this._handlePlaySync()}
            >
              ${compareLabel}
            </ui-button>
          </ui-tooltip>
        </div>

        ${this._playMode !== 'idle' ? html`<p class="status">${this._renderStatus()}</p>` : nothing}
      </div>
      <ui-modal
        title="${msg('上传说明')}"
        .zIndex=${Z_INDEX.MODAL + 80}
        ?open=${this._privacyOpen}
        ok-text="${msg('同意并评分')}"
        cancel-text="${msg('取消')}"
        width="420px"
        centered
        @ok=${() => this._confirmPrivacy()}
        @cancel=${() => {
          this._privacyOpen = false;
        }}
        @update:open="${(e: CustomEvent<{ open: boolean }>) => {
          if (e.target !== e.currentTarget) return;
          if (!e.detail.open) this._privacyOpen = false;
        }}"
      >
        <p>
          ${msg('评分需要将录音上传到你配置的服务器。服务端用于计算分数，不会保存音频。是否继续？')}
        </p>
      </ui-modal>
    `;
  }

  private async _loadScore(): Promise<void> {
    const recordId = this.record?.id;
    if (!recordId) {
      this._score = null;
      return;
    }
    try {
      this._score = (await getScoreByRecordId(recordId)) ?? null;
    } catch {
      this._score = null;
    }
  }

  private _scoreTooLong(): boolean {
    return (this.record?.recordingDuration ?? 0) > SCORE_MAX_DURATION_SEC;
  }

  private _hasReferenceText(): boolean {
    if (!this.record) {
      return false;
    }
    const live = this.subtitleSegments.length > 0 ? { segments: this.subtitleSegments } : undefined;
    return Boolean(resolveReferenceText(this.record, live));
  }

  private _renderScorePanel() {
    if (!this.record) {
      return nothing;
    }
    const score = this._score;
    const pending = this._scoring || score?.status === 'pending';
    const tooLong = this._scoreTooLong();
    const noReference = !this._hasReferenceText();
    const scoreBlocked = tooLong || noReference;
    const label = score?.status === 'success' ? msg('重新评分') : msg('评分');
    const scoreTip = tooLong
      ? scoreTooLongMessage()
      : noReference
        ? msg('需要对照原稿才能评分')
        : label;

    if (pending) {
      return html`
        <div class="score-panel" aria-busy="true">
          <div class="score-skeleton"></div>
          <p class="score-pending-label">${msg('评分中…')}</p>
        </div>
      `;
    }

    return html`
      <div class="score-panel">
        <div class="score-header">
          ${score?.status === 'success' && typeof score.overall === 'number'
            ? html`<span class="score-overall">${formatOverallBadge(score.overall)}</span>`
            : html`<span class="score-overall">—</span>`}
          <ui-tooltip title=${scoreTip} .zIndex=${Z_INDEX.MODAL + 1}>
            <ui-button
              variant="primary"
              aria-label=${label}
              ?disabled=${scoreBlocked || this._scoring}
              @click=${() => this._handleScore()}
            >
              ${label}
            </ui-button>
          </ui-tooltip>
        </div>
        ${score?.status === 'failed' && score.errorMessage
          ? html`<ui-alert type="error">${score.errorMessage}</ui-alert>`
          : nothing}
        ${score?.status === 'success' ? this._renderScoreDetails(score) : nothing}
      </div>
    `;
  }

  private _renderScoreDetails(score: PronunciationScore) {
    const details = score.details;
    const breakdown = details?.prosody_breakdown;
    return html`
      <div class="score-metrics">
        ${this._renderMetric(msg('准确度'), score.accuracy)}
        ${this._renderMetric(msg('流利度'), score.fluency)}
        ${this._renderMetric(msg('完整度'), score.completeness)}
        ${this._renderMetric(msg('韵律'), score.prosody)}
        ${breakdown
          ? html`
              ${this._renderMetric(msg('语速'), breakdown.speed, true)}
              ${this._renderMetric(msg('节奏'), breakdown.rhythm, true)}
              ${this._renderMetric(msg('语调'), breakdown.intonation, true)}
              ${this._renderMetric(msg('重音'), breakdown.stress, true)}
            `
          : nothing}
      </div>
      ${details
        ? html`
            <div class="score-texts">
              <div>
                <strong>${msg('识别文本')}</strong>
                ${details.transcript || '—'}
              </div>
              <div>
                <strong>${msg('参考文本')}</strong>
                ${score.referenceText || '—'}
              </div>
              ${details.missing_words.length
                ? html`<div>
                    <strong>${msg('漏读')}</strong>
                    ${joinWordList(details.missing_words)}
                  </div>`
                : nothing}
              ${(details.misread_words ?? []).length
                ? html`<div>
                    <strong>${msg('读错')}</strong>
                    ${joinMisreadWordList(details.misread_words)}
                  </div>`
                : nothing}
              ${details.extra_words.length
                ? html`<div>
                    <strong>${msg('多读')}</strong>
                    ${joinWordList(details.extra_words)}
                  </div>`
                : nothing}
            </div>
            ${details.word_scores.length
              ? html`<div class="word-heatmap">
                  ${details.word_scores.map((word) => this._renderWordChip(word))}
                </div>`
              : nothing}
          `
        : nothing}
    `;
  }

  private _renderMetric(label: string, value: number | undefined, nested = false) {
    const n = typeof value === 'number' ? value : 0;
    return html`
      <div class="score-metric${nested ? ' score-metric--nested' : ''}">
        <span>${label}</span>
        <div class="score-bar" aria-hidden="true">
          <div class="score-bar-fill" style="width: ${Math.min(100, Math.max(0, n))}%"></div>
        </div>
        <span>${typeof value === 'number' ? value.toFixed(1) : '—'}</span>
      </div>
    `;
  }

  private _wordScoreClass(score: number): string {
    if (score >= 80) return 'high';
    if (score >= 60) return 'mid';
    return 'low';
  }

  private _missingWords(): string[] {
    return this._score?.status === 'success' ? (this._score.details?.missing_words ?? []) : [];
  }

  private _wordIsMissing(word: string): boolean {
    return this._missingWords().includes(word);
  }

  private _renderWordChip(word: PronunciationWordScore) {
    const missing = this._wordIsMissing(word.word);
    return html`<button
      type="button"
      class="word-chip ${this._wordScoreClass(word.score)}${missing ? ' is-missing' : ''}"
      aria-disabled=${missing ? 'true' : 'false'}
      title=${missing ? msg('漏读，录音中没有对应位置') : `${word.word}`}
      @click=${() => this._playScoredWord(word)}
    >
      ${word.word}
    </button>`;
  }

  private _renderWordRail(markers: WordWaveformMarker[]) {
    if (markers.length === 0) {
      return nothing;
    }
    return html`
      <div class="word-rail" slot="over-canvas">
        ${markers.map((marker) => {
          const missing = this._wordIsMissing(marker.word);
          return html`<button
            type="button"
            class="word-marker ${this._wordScoreClass(marker.score)}${missing ? ' is-missing' : ''}"
            style=${styleMap({
              left: `${marker.leftPct}%`,
              'max-width': `calc(${marker.maxWidthPct}% - 4px)`,
            })}
            title=${missing ? msg('漏读，录音中没有对应位置') : `${marker.word}`}
            @click=${() => this._playScoredWord(marker)}
          >
            ${marker.word}
          </button>`;
        })}
      </div>
    `;
  }

  private _wordRailVisible(): boolean {
    return this._playMode !== 'source' && this._playMode !== 'idle';
  }

  private _wordMarkers() {
    const words = this._score?.status === 'success' ? (this._score.details?.word_scores ?? []) : [];
    if (words.length === 0 || this.segments.length === 0) {
      return [];
    }
    return wordMarkersForPreview({
      words,
      segments: this.segments,
      segmentIndex: this._syncSegmentIndex,
      recordingViewRange: this._recordingViewRange(),
    });
  }

  private _recordingViewRange(): ViewRange | null {
    const viewRange = this._controller.viewRange;
    if (!viewRange || this.segments.length === 0 || this._usesRecordingTimeline()) {
      return viewRange;
    }
    if (this._playMode === 'idle') {
      return viewRange;
    }
    return mapPracticeViewRange(viewRange, 'source', 'recording', this.segments);
  }

  private _playScoredWord(word: Pick<PronunciationWordScore, 'word' | 'start'>): void {
    if (this._wordIsMissing(word.word) || !Number.isFinite(word.start)) {
      Message.info(msg('漏读，录音中没有对应位置'));
      return;
    }
    void this._playWordAt(word.start);
  }

  private async _playWordAt(start: number): Promise<void> {
    if (!(await this._ensurePlayback()) || !this._playback) {
      return;
    }

    this._requestAudioFocus();
    if (this._playMode === 'continuous') {
      void this._playback.playContinuousAt(start, 'recording').catch(() => {
        this._playback?.stop();
      });
      return;
    }
    if (this._playMode === 'sync') {
      void this._playback.playSyncAt(start, 'recording').catch(() => {
        this._playback?.stop();
      });
      return;
    }
    if (this._recordingTrackId) {
      this._controller.setActiveId(this._recordingTrackId);
    }
    void this._playback.playRecordingAt(start).catch(() => {
      this._playback?.stop();
    });
  }

  private async _handleScore(): Promise<void> {
    const record = this.record;
    if (!record || this._scoring || this._scoreTooLong() || !this._hasReferenceText()) {
      return;
    }
    if (!isSpeechScoreConfigured(getAppSettings())) {
      Message.warning(msg('请先在设置中填写评分服务地址和 API Key'));
      return;
    }
    if (!hasSpeechScorePrivacyAck()) {
      this._privacyOpen = true;
      return;
    }
    await this._runScore(record);
  }

  private async _confirmPrivacy(): Promise<void> {
    ackSpeechScorePrivacy();
    this._privacyOpen = false;
    if (this.record) {
      await this._runScore(this.record);
    }
  }

  private async _runScore(record: PracticeRecord): Promise<void> {
    this._scoring = true;
    try {
      const result = await requestScore(record, {
        onStatus: (score) => {
          this._score = score;
        },
      });
      if (!result.ok && result.reason === 'not_configured') {
        Message.warning(result.message);
      } else if (!result.ok) {
        Message.error(result.message);
      } else {
        Message.success(msg('评分完成'));
      }
      this.dispatchEvent(
        new CustomEvent('score-updated', {
          detail: { recordId: record.id, score: result.score },
          bubbles: true,
          composed: true,
        }),
      );
    } finally {
      this._scoring = false;
    }
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

  /**
   * Transport between subtitle and waveform (mobile-friendly vs hotkeys-only).
   * Play/pause is always shown; sentence controls appear only when segments exist.
   */
  private _renderPlaybackNav(): TemplateResult {
    const hasSegments = this.segments.length > 0;
    const canNavigate = this._playMode !== 'idle' && hasSegments;
    const canPrevious = canNavigate && this._syncSegmentIndex > 0;
    const canNext = canNavigate && this._syncSegmentIndex < this.segments.length - 1;
    const canTogglePlay = this._playMode !== 'idle';
    const isPlaying = canTogglePlay && !this._playbackPaused;
    const canReplay = canNavigate;
    const keyboardShortcuts = supportsKeyboardShortcuts();
    const selectModeHint = msg('请先选择播放模式');

    const previousTitle = canPrevious
      ? keyboardShortcuts
        ? msg('上一句 (←)')
        : msg('上一句')
      : !hasSegments
        ? msg('无练习片段')
        : this._playMode === 'idle'
          ? selectModeHint
          : msg('已是第一句');
    const playPauseTitle = canTogglePlay
      ? keyboardShortcuts
        ? isPlaying
          ? msg('暂停 (Space)')
          : msg('播放 (Space)')
        : isPlaying
          ? msg('暂停')
          : msg('播放')
      : selectModeHint;
    const nextTitle = canNext
      ? keyboardShortcuts
        ? msg('下一句 (→)')
        : msg('下一句')
      : !hasSegments
        ? msg('无练习片段')
        : this._playMode === 'idle'
          ? selectModeHint
          : msg('已是最后一句');
    const replayTitle = canReplay
      ? keyboardShortcuts
        ? msg('重播本句 (R)')
        : msg('重播本句')
      : !hasSegments
        ? msg('无练习片段，无法重播')
        : selectModeHint;

    return html`
      <div class="segment-nav">
        ${hasSegments
          ? html`
              <ui-icon-button
                name="backward"
                title=${previousTitle}
                size="var(--icon-lg)"
                .zIndex=${Z_INDEX.MODAL + 1}
                ?disabled=${!canPrevious}
                @click=${() => this._navigateSegment(-1)}
              ></ui-icon-button>
            `
          : nothing}
        <ui-icon-button
          name=${isPlaying ? 'pause' : 'play'}
          title=${playPauseTitle}
          size="var(--icon-lg)"
          .zIndex=${Z_INDEX.MODAL + 1}
          ?disabled=${!canTogglePlay}
          @click=${() => {
            if (this._playMode === 'idle') {
              return;
            }
            this._togglePreviewPlayback();
          }}
        ></ui-icon-button>
        ${hasSegments
          ? html`
              <ui-icon-button
                name="replay"
                title=${replayTitle}
                size="var(--icon-lg)"
                .zIndex=${Z_INDEX.MODAL + 1}
                ?disabled=${!canReplay}
                @click=${() => this._replayCurrentSegment()}
              ></ui-icon-button>
              <ui-icon-button
                name="forward"
                title=${nextTitle}
                size="var(--icon-lg)"
                .zIndex=${Z_INDEX.MODAL + 1}
                ?disabled=${!canNext}
                @click=${() => this._navigateSegment(1)}
              ></ui-icon-button>
            `
          : nothing}
      </div>
    `;
  }

  private _renderVolumeControl(track: 'source' | 'recording'): TemplateResult {
    const volume = track === 'source' ? this._sourceVolume : this._recordingVolume;
    const maxVolume = getMaxVolumeBoost();
    const percent = Math.round(volume * 100);
    const label = track === 'source' ? msg('原音音量') : msg('录音音量');
    const title = `${label} ${percent}%`;
    const boosted = volume > 1;

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
          <span
            class="overlay-panel-label"
            style=${boosted ? 'color: var(--color-warning, #fa8c16);' : ''}
            >${label} ${percent}%</span
          >
          <ui-slider
            .value=${volume}
            style="--slider-mark-edge-padding: var(--space-sm);"
            orientation="horizontal"
            min="0"
            max=${maxVolume}
            step="0.01"
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
          class="volume-trigger${boosted ? ' volume-trigger--boosted' : ''}"
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
    const clamped = Math.max(0, Math.min(value, getMaxVolumeBoost()));
    if (track === 'source') {
      this._sourceVolume = clamped;
    } else {
      this._recordingVolume = clamped;
    }
    this._applyVolumes();
  }

  private _applyVolumes(): void {
    if (this._sourceAudio) {
      setLogicalVolume(this._sourceAudio, this._sourceVolume);
    }
    if (this._recordingAudio) {
      setLogicalVolume(this._recordingAudio, this._recordingVolume);
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
        case 'continuous':
          return msg(html`已暂停连续对照${segmentLabel}`);
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
      case 'continuous':
        return msg(html`正在连续对照${segmentLabel}`);
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
        replaySegment: () => {
          this._replayCurrentSegment();
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

  /** Restart the current practice segment on the active preview session and play. */
  private _replayCurrentSegment(): void {
    if (this._playMode === 'idle' || !this._playback || this.segments.length === 0) {
      return;
    }

    this._requestAudioFocus();
    void this._playback.replaySegment(this._syncSegmentIndex).catch(() => {
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
      case 'continuous':
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

  /** Restore first-render track/view after leaving a play mode (true stop / deselect). */
  private _resetPreviewContextAfterStop(): void {
    if (this._recordingTrackId) {
      this._controller.setActiveId(this._recordingTrackId);
    } else if (this._sourceTrackId) {
      this._controller.setActiveId(this._sourceTrackId);
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
    if (this._playMode === 'idle') {
      // Stay idle until the user picks a play mode; block waveform-player's
      // default seek+play so clicking does not start source/recording playback.
      Message.warning(msg('请先选择播放模式'));
      event.preventDefault();
      return;
    }

    if (this._playMode === 'source' || this._playMode === 'recording') {
      this._handleSingleTrackWaveformSeek(event);
      return;
    }

    if (!isComparePlayMode(this._playMode)) {
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

    if (this._playMode === 'continuous') {
      event.preventDefault();
      this._requestAudioFocus();
      void this._playback.playContinuousAt(time, axis).catch(() => {
        this._playback?.stop();
      });
      return;
    }

    let seekTime = time;
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
      const segment = this.segments[segmentIndex];
      seekTime = Math.max(segment.sourceStartTime, Math.min(time, segment.sourceEndTime));
    } else if (segmentIndex < 0) {
      return;
    }

    event.preventDefault();
    this._requestAudioFocus();
    void this._playback.playSyncAt(seekTime, axis).catch(() => {
      this._playback?.stop();
    });
  }

  /**
   * Keep source/recording waveform clicks on DualTrackPlayback so pause state
   * (icon + status) stays in sync. Always seek to the click time and play.
   */
  private _handleSingleTrackWaveformSeek(event: CustomEvent<WaveformSeekRequestDetail>): void {
    if (!this._playback) {
      return;
    }

    const expectedTrackId =
      this._playMode === 'source' ? this._sourceTrackId : this._recordingTrackId;
    const { trackId, time } = event.detail;
    if (!expectedTrackId || trackId !== expectedTrackId) {
      return;
    }

    event.preventDefault();
    this._requestAudioFocus();

    if (this._playMode === 'source') {
      void this._playback.playSourceAt(time).catch(() => {
        this._playback?.stop();
      });
      return;
    }

    void this._playback.playRecordingAt(time).catch(() => {
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
    this.requestUpdate();
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
      // Dual-track compare owns play/pause; only move waveform focus.
      this._controller.setActiveId(activeTrackId, { pausePrevious: false });
    }
  }

  private _zoomToPracticeSegment(segmentIndex: number): void {
    const axis = this._usesRecordingTimeline() ? 'recording' : 'source';
    const range = getPracticeSegmentViewRange(this.segments, segmentIndex, axis);
    if (!range) {
      return;
    }
    this._setPracticeViewRange(range);
  }

  private async _handlePlaySync(): Promise<void> {
    if (!this._playback || this.segments.length === 0) {
      return;
    }

    if (isComparePlayMode(this._playMode)) {
      this._playback.stop();
      return;
    }

    try {
      this._requestAudioFocus();
      if (this._useContinuousCompare) {
        await this._playback.playContinuous();
      } else {
        await this._playback.playSync();
      }
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
      // Prefer recording as the default preview focus (mode arms recording paused on init).
      if (this._recordingTrackId) {
        this._controller.setActiveId(this._recordingTrackId);
      } else if (this._sourceTrackId) {
        this._controller.setActiveId(this._sourceTrackId);
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
      } else if (state.mode === 'sync' || state.mode === 'continuous') {
        this._setSyncActiveTrack(state.syncSegmentIndex);
        this._zoomToPracticeSegment(state.syncSegmentIndex);
      }
    });

    // Default selection: recording (or source if no recording), paused — no autoplay on open.
    if (this._recordingTrackId) {
      this._playback.selectPaused('recording');
    } else if (this._sourceTrackId) {
      this._playback.selectPaused('source');
    }
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
