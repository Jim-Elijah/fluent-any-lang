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
  getPracticeSegmentSpeechRange,
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
  WordMarkerLayout,
} from '../../types/models.js';
import { getAppSettings, getMaxVolumeBoost, setAppSettings } from '../../lib/app-settings.js';
import { getLocale } from '../../i18n/localization.js';
import {
  ackSpeechScorePrivacy,
  buildReferenceHighlightSpans,
  buildTranscriptHighlightSpans,
  formatOverallBadge,
  hasSpeechScorePrivacyAck,
  isSpeechScoreConfigured,
  misreadHasPlayableStart,
  requestScore,
  resolveReferenceText,
  SCORE_MAX_DURATION_SEC,
  scoreBand,
  scoreTooLongMessage,
  type ScoreTextHighlightSpan,
} from '../../lib/pronunciation-score/index.js';
import {
  alignAllPracticeSegments,
  alignPracticeSegment,
  hasCurrentMediaSourceWordAlignment,
  isSpeechAlignConfigured,
  resolveSegmentSourceWords,
  resolveWholeMediaAlignBlockedTip,
} from '../../lib/pronunciation-align/index.js';
import type { SourceSegmentAlignDetail } from '../shared/source-segment-align-button.js';
import type { SourceWordAlignAllDetail } from '../shared/source-word-align-all-button.js';
import type { WordMarkerLayoutToggleDetail } from '../shared/word-marker-layout-toggle.js';
import { scoreBandStyles } from '../shared/score-band-styles.js';
import '../shared/source-segment-align-button.js';
import '../shared/source-word-align-all-button.js';
import '../shared/word-marker-layout-toggle.js';
import { getScoreByRecordId } from '../../db/pronunciation-score.js';
import { getSubtitle } from '../../db/subtitle.js';
import { setLogicalVolume } from '../../lib/media-element-gain.js';
import {
  wordMarkersForPreview,
  wordMarkersForSourceSubtitle,
  WORD_RAIL_LANE_PX,
  type WordWaveformMarker,
} from '../../lib/word-waveform.js';
import type { WordTiming } from '../../types/models.js';
import type { WaveformSeekRequestDetail } from '../player/waveform-player.js';
import { wordRailStyles } from '../player/word-rail-styles.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/dropdown.js';
import '../ui/icon.js';
import '../ui/icon-button.js';
import '../ui/modal.js';
import '../ui/popconfirm.js';
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

function wordListSeparator(): string {
  return getLocale() === 'en' ? ', ' : '、';
}

/** Error-type highlight for summary lists (same classes as in-text spans; not word-chips). */
function renderErrorWordList(
  words: Array<{ word: string }>,
  kind: 'missing' | 'extra',
): TemplateResult {
  const sep = wordListSeparator();
  return html`${words.map(
    (item, i) =>
      html`${i > 0 ? sep : nothing}<span class="score-hl score-hl--${kind}">${item.word}</span>`,
  )}`;
}

const PAIRED_MISREAD_MS = 1000;

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

/** Subtitle bounds for source word rail (live subtitles or Practice Segment times). */
function sourceSubtitleLineForWordRail(
  segment: PracticeSegment,
  subtitleSegments: SubtitleSegment[],
): SubtitleSegment {
  return (
    resolveLineForPractice(segment, subtitleSegments) ?? {
      id: segment.id,
      startTime: segment.sourceStartTime,
      endTime: segment.sourceEndTime,
      text: '',
    }
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
  static styles = [
    scoreBandStyles,
    wordRailStyles,
    css`
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
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-sm);
      }

      .mode-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-sm);
      }

      .volume-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-md);
      }

      .volume-item {
        display: inline-flex;
        align-items: center;
        gap: var(--space-xs);
      }

      .volume-item-label {
        font-size: 0.8125rem;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
        white-space: nowrap;
      }

      .word-layout-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-sm);
      }

      .word-layout-label {
        font-size: 0.8125rem;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
        white-space: nowrap;
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
        grid-template-columns: minmax(3.5rem, max-content) 1fr 2.5rem;
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

      .score-text-body {
        display: inline;
        line-height: 1.55;
        word-break: break-word;
      }

      .score-hl {
        border-radius: 2px;
        padding: 0 1px;
      }

      /* Error-type legend (independent of word-chip score bands):
       missing = omitted → gray strikethrough; extra = inserted → purple wavy;
       misread = substituted → red tint. Same classes on in-text + summary lists. */
      .score-hl--missing {
        background: rgba(0, 0, 0, 0.06);
        color: #8c8c8c;
        text-decoration: line-through;
      }

      .score-hl--extra {
        background: rgba(114, 46, 209, 0.14);
        color: #531dab;
        text-decoration: underline;
        text-decoration-style: wavy;
        text-underline-offset: 2px;
      }

      .score-hl--misread {
        background: rgba(255, 77, 79, 0.18);
        color: #cf1322;
      }

      button.score-hl--misread {
        margin: 0;
        border: none;
        font: inherit;
        cursor: pointer;
        vertical-align: baseline;
      }

      button.score-hl--misread:focus-visible {
        outline: 2px solid var(--color-primary, #1677ff);
        outline-offset: 1px;
      }

      .score-hl--paired {
        box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.45);
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

      .align-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-sm, 8px);
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
    `,
  ];

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
  private _wordMarkerLayout: WordMarkerLayout = getAppSettings().wordMarkerLayout;

  @state()
  private _score: PronunciationScore | null = null;

  @state()
  private _scoring = false;

  @state()
  private _privacyOpen = false;

  /** Pending action after privacy ack (`score` | `align-segment` | `align-all`). */
  private _privacyAction: 'score' | 'align-segment' | 'align-all' = 'score';

  /** When privacy ack resumes `align-segment`, force overwrite cache. */
  private _alignSegmentForce = false;

  /** When privacy ack resumes `align-all`, force overwrite whole-Media cache. */
  private _alignAllForce = false;

  @state()
  private _aligning = false;

  /** Cached Source Word Alignment words by Practice Segment id (Media absolute times). */
  private _alignWordsBySegmentId = new Map<string, WordTiming[]>();

  /** When set, whole-Media align is blocked (same 60s/10MB gate as score). */
  @state()
  private _alignMediaBlockedTip: string | null = null;

  @state()
  private _hasWholeMediaAlign = false;

  /** Index into `details.misread_words` while expected↔actual are paired-emphasized. */
  @state()
  private _pairedMisreadIndex: number | null = null;

  private _pairClearTimer: ReturnType<typeof setTimeout> | null = null;
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
      void this._refreshAlignMediaBlockedTip();
    }

    if (changed.has('segments')) {
      if (this._playback) {
        this._playback.setSegments(this.segments);
      }
      this._enforceViewRangeBounds();
      this._refreshActiveSubtitle();
      this._alignWordsBySegmentId.clear();
      void this._loadAlignWordsForCurrentSegment();
    }

    if (changed.has('subtitleSegments')) {
      this._refreshActiveSubtitle();
      void this._refreshAlignMediaBlockedTip();
    }

    if (changed.has('record')) {
      this._alignWordsBySegmentId.clear();
      void this._loadScore();
      void this._loadAlignWordsForCurrentSegment();
      void this._refreshAlignMediaBlockedTip();
    }
  }

  disconnectedCallback(): void {
    if (supportsKeyboardShortcuts()) {
      getHotkeyManager().unregisterScope('recording-preview');
    }
    this._clearPairedMisread(true);
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

        ${this._renderPlaybackNav()} ${this._renderWordLayoutToggle(wordMarkers.length > 0)}
        ${this._renderAlignActions()}

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
          <div class="mode-row">
            <ui-tooltip title=${sourceTitle} .zIndex=${Z_INDEX.MODAL + 1}>
              <ui-button
                variant="${this._playMode === 'source' ? 'primary' : 'secondary'}"
                ?disabled=${!canPlaySource}
                @click=${() => this._handlePlaySource()}
              >
                ${msg('播放原音')}
              </ui-button>
            </ui-tooltip>
            <ui-tooltip title=${recordingTitle} .zIndex=${Z_INDEX.MODAL + 1}>
              <ui-button
                variant="${this._playMode === 'recording' ? 'primary' : 'secondary'}"
                ?disabled=${!canPlayRecording}
                @click=${() => this._handlePlayRecording()}
              >
                ${msg('播放录音')}
              </ui-button>
            </ui-tooltip>
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
          ${showSourceVolume || showRecordingVolume
            ? html`
                <div class="volume-row">
                  ${showSourceVolume ? this._renderVolumeControl('source') : nothing}
                  ${showRecordingVolume ? this._renderVolumeControl('recording') : nothing}
                </div>
              `
            : nothing}
        </div>

        ${this._playMode !== 'idle' ? html`<p class="status">${this._renderStatus()}</p>` : nothing}
      </div>
      <ui-modal
        title="${msg('上传说明')}"
        .zIndex=${Z_INDEX.MODAL + 80}
        ?open=${this._privacyOpen}
        ok-text="${this._privacyAction === 'score' ? msg('同意并评分') : msg('同意并生成')}"
        cancel-text="${msg('取消')}"
        width="420px"
        centered
        @ok=${() => this._confirmPrivacy()}
        @cancel=${() => {
          this._privacyOpen = false;
          this._alignSegmentForce = false;
          this._alignAllForce = false;
        }}
        @update:open="${(e: CustomEvent<{ open: boolean }>) => {
          if (e.target !== e.currentTarget) return;
          if (!e.detail.open) {
            this._privacyOpen = false;
            this._alignSegmentForce = false;
            this._alignAllForce = false;
          }
        }}"
      >
        <p>${this._privacyModalBody()}</p>
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
    const configured = isSpeechScoreConfigured(getAppSettings());
    const tooLong = this._scoreTooLong();
    const noReference = !this._hasReferenceText();
    const scoreBlocked = tooLong || noReference;
    const label = score?.status === 'success' ? msg('重新评分') : msg('评分');
    const scoreTip = tooLong
      ? scoreTooLongMessage()
      : noReference
        ? msg('需要对照原稿才能评分')
        : label;
    const hasStoredScore = score?.status === 'success' || score?.status === 'failed';

    if (pending) {
      return html`
        <div class="score-panel" aria-busy="true">
          <div class="score-skeleton"></div>
          <p class="score-pending-label">${msg('评分中…')}</p>
        </div>
      `;
    }

    if (!configured && !hasStoredScore) {
      return nothing;
    }

    return html`
      <div class="score-panel">
        <div class="score-header">
          ${score?.status === 'success' && typeof score.overall === 'number'
            ? html`<span class="score-overall">${formatOverallBadge(score.overall)}</span>`
            : html`<span class="score-overall">—</span>`}
          ${configured
            ? html`<ui-tooltip title=${scoreTip} .zIndex=${Z_INDEX.MODAL + 1}>
                <ui-button
                  variant="primary"
                  aria-label=${label}
                  ?disabled=${scoreBlocked || this._scoring}
                  @click=${() => this._handleScore()}
                >
                  ${label}
                </ui-button>
              </ui-tooltip>`
            : nothing}
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
    const matchProsody = typeof score.prosody_match === 'number';
    return html`
      <div class="score-metrics">
        ${this._renderMetric(msg('准确度'), score.accuracy)}
        ${this._renderMetric(msg('流利度'), score.fluency)}
        ${this._renderMetric(msg('完整度'), score.completeness)}
        ${this._renderMetric(msg('韵律'), score.prosody)}
        ${breakdown
          ? html`
              ${matchProsody
                ? html`
                    ${this._renderMetric(msg('语速贴近'), breakdown.speed, true)}
                    ${this._renderMetric(msg('节奏贴近'), breakdown.rhythm, true)}
                    ${this._renderMetric(msg('语调贴近'), breakdown.intonation, true)}
                    ${this._renderMetric(msg('重音贴近'), breakdown.stress, true)}
                  `
                : html`
                    ${this._renderMetric(msg('语速'), breakdown.speed, true)}
                    ${this._renderMetric(msg('节奏'), breakdown.rhythm, true)}
                    ${this._renderMetric(msg('语调'), breakdown.intonation, true)}
                    ${this._renderMetric(msg('重音'), breakdown.stress, true)}
                  `}
            `
          : nothing}
      </div>
      ${details
        ? html`
            <div class="score-texts">
              <div>
                <strong>${msg('参考文本')}</strong>
                ${this._renderScoreTextBody(
                  buildReferenceHighlightSpans(
                    score.referenceText,
                    details.missing_words,
                    details.misread_words ?? [],
                  ),
                  details.misread_words ?? [],
                )}
              </div>
              <div>
                <strong>${msg('识别文本')}</strong>
                ${this._renderScoreTextBody(
                  buildTranscriptHighlightSpans(
                    details.transcript,
                    details.extra_words,
                    details.misread_words ?? [],
                  ),
                  details.misread_words ?? [],
                )}
              </div>
              ${details.missing_words.length
                ? html`<div>
                    <strong>${msg('漏读')}</strong>
                    ${renderErrorWordList(details.missing_words, 'missing')}
                  </div>`
                : nothing}
              ${(details.misread_words ?? []).length
                ? html`<div>
                    <strong>${msg('读错')}</strong>
                    ${this._renderMisreadWordList(details.misread_words ?? [])}
                  </div>`
                : nothing}
              ${details.extra_words.length
                ? html`<div>
                    <strong>${msg('多读')}</strong>
                    ${renderErrorWordList(details.extra_words, 'extra')}
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

  private _renderScoreTextBody(
    spans: ScoreTextHighlightSpan[],
    misreads: PronunciationMisreadWord[],
  ): TemplateResult | string {
    if (spans.length === 0) {
      return '—';
    }
    return html`<span class="score-text-body"
      >${spans.map((span) => this._renderScoreTextSpan(span, misreads))}</span
    >`;
  }

  private _renderScoreTextSpan(
    span: ScoreTextHighlightSpan,
    misreads: PronunciationMisreadWord[],
  ): TemplateResult | string {
    if (span.kind === 'plain') {
      return span.text;
    }

    if (span.kind === 'misread' && span.misreadIndex !== undefined) {
      const misread = misreads[span.misreadIndex];
      if (misread) {
        return this._renderMisreadToken(span.text, misread, span.misreadIndex);
      }
    }

    return html`<span class="score-hl score-hl--${span.kind}">${span.text}</span>`;
  }

  private _renderMisreadToken(
    text: string,
    misread: PronunciationMisreadWord,
    index: number,
  ): TemplateResult {
    const paired = index === this._pairedMisreadIndex;
    const classes = `score-hl score-hl--misread${paired ? ' score-hl--paired' : ''}`;
    if (misreadHasPlayableStart(misread)) {
      return html`<button
        type="button"
        class=${classes}
        title=${msg('播放该词')}
        @click=${() => this._onMisreadHighlightClick(misread, index)}
      >
        ${text}
      </button>`;
    }
    return html`<span class=${classes}>${text}</span>`;
  }

  private _renderMisreadWordList(words: PronunciationMisreadWord[]): TemplateResult {
    const sep = wordListSeparator();
    return html`${words.map((word, i) => {
      const pair = html`${this._renderMisreadToken(
        word.expected,
        word,
        i,
      )}${' → '}${this._renderMisreadToken(word.actual, word, i)}`;
      return i > 0 ? html`${sep}${pair}` : pair;
    })}`;
  }

  private _onMisreadHighlightClick(misread: PronunciationMisreadWord, index: number): void {
    if (!misreadHasPlayableStart(misread)) {
      return;
    }
    this._pairedMisreadIndex = index;
    if (this._pairClearTimer !== null) {
      clearTimeout(this._pairClearTimer);
    }
    this._pairClearTimer = setTimeout(() => {
      this._pairClearTimer = null;
      this._pairedMisreadIndex = null;
    }, PAIRED_MISREAD_MS);
    void this._playWordAt(misread.start as number, 'recording', misread.end);
  }

  private _clearPairedMisread(silent = false): void {
    if (this._pairClearTimer !== null) {
      clearTimeout(this._pairClearTimer);
      this._pairClearTimer = null;
    }
    if (silent) {
      this._pairedMisreadIndex = null;
      return;
    }
    if (this._pairedMisreadIndex !== null) {
      this._pairedMisreadIndex = null;
    }
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

  private _renderWordLayoutToggle(visible: boolean) {
    return html`
      <word-marker-layout-toggle
        ?visible=${visible}
        .layout=${this._wordMarkerLayout}
        @layout-change=${this._onWordLayoutChange}
      ></word-marker-layout-toggle>
    `;
  }

  private _onWordLayoutChange = (event: CustomEvent<WordMarkerLayoutToggleDetail>): void => {
    event.stopPropagation();
    this._setWordMarkerLayout(event.detail.layout);
  };

  private _setWordMarkerLayout(layout: WordMarkerLayout): void {
    if (layout === this._wordMarkerLayout) {
      return;
    }
    this._wordMarkerLayout = setAppSettings({ wordMarkerLayout: layout }).wordMarkerLayout;
  }

  private _renderWordChip(word: PronunciationWordScore) {
    return html`<button
      type="button"
      class="word-chip score-band ${scoreBand(word.score)}"
      title=${word.word}
      @click=${() => this._playScoredWord(word)}
    >
      ${word.word}
    </button>`;
  }

  private _renderWordRail(markers: WordWaveformMarker[]) {
    if (markers.length === 0) {
      return nothing;
    }
    const compact = this._wordMarkerLayout === 'compact';
    const alignRail = this._playMode === 'source';
    return html`
      <div class="word-rail" slot="over-canvas">
        ${markers.map((marker) => {
          const bandClass =
            typeof marker.score === 'number' ? `score-band ${scoreBand(marker.score)}` : 'is-align';
          return html`<button
            type="button"
            class="word-marker ${bandClass}${compact ? ' is-compact' : ''}"
            style=${styleMap(
              compact
                ? {
                    left: `${marker.leftPct}%`,
                    width: 'auto',
                    'max-width': `calc(${marker.widthPct}% - 4px)`,
                  }
                : {
                    left: `${marker.leftPct}%`,
                    width: `${marker.widthPct}%`,
                    'max-width': 'none',
                  },
            )}
            title=${marker.word}
            @click=${() =>
              alignRail ? this._playAlignedWord(marker) : this._playScoredWord(marker)}
          >
            ${marker.word}
          </button>`;
        })}
      </div>
    `;
  }

  private _wordRailVisible(): boolean {
    return this._playMode !== 'idle';
  }

  private _wordMarkers() {
    if (this.segments.length === 0) {
      return [];
    }
    if (this._playMode === 'source') {
      const segment = this.segments[this._syncSegmentIndex];
      const words = segment ? (this._alignWordsBySegmentId.get(segment.id) ?? []) : [];
      if (words.length === 0) {
        return [];
      }
      const subtitleLine = sourceSubtitleLineForWordRail(segment, this.subtitleSegments);
      return wordMarkersForSourceSubtitle({
        words,
        segments: [subtitleLine],
        segmentIndex: 0,
        sourceViewRange: this._sourceViewRange(),
        layout: this._wordMarkerLayout,
      });
    }
    if (this._playMode === 'idle') {
      return [];
    }
    const words = this._score?.status === 'success' ? (this._score.details?.word_scores ?? []) : [];
    if (words.length === 0) {
      return [];
    }
    return wordMarkersForPreview({
      words,
      segments: this.segments,
      segmentIndex: this._syncSegmentIndex,
      recordingViewRange: this._recordingViewRange(),
      layout: this._wordMarkerLayout,
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

  private _sourceViewRange(): ViewRange | null {
    const viewRange = this._controller.viewRange;
    if (!viewRange || this.segments.length === 0) {
      return viewRange;
    }
    if (this._usesRecordingTimeline()) {
      return mapPracticeViewRange(viewRange, 'recording', 'source', this.segments);
    }
    return viewRange;
  }

  private _playScoredWord(word: Pick<PronunciationWordScore, 'word' | 'start' | 'end'>): void {
    if (!Number.isFinite(word.start)) {
      return;
    }
    void this._playWordAt(word.start, 'recording', word.end);
  }

  private _playAlignedWord(word: Pick<WordTiming, 'word' | 'start' | 'end'>): void {
    if (!Number.isFinite(word.start)) {
      return;
    }
    void this._playWordAt(word.start, 'source', word.end);
  }

  private async _playWordAt(
    start: number,
    axis: 'source' | 'recording' = 'recording',
    end?: number | null,
  ): Promise<void> {
    if (!(await this._ensurePlayback()) || !this._playback) {
      return;
    }

    this._requestAudioFocus();
    const hasEnd = typeof end === 'number' && Number.isFinite(end) && end > start;
    if (axis === 'source') {
      if (this._sourceTrackId && !isComparePlayMode(this._playMode)) {
        this._controller.setActiveId(this._sourceTrackId);
      }
      const play = hasEnd
        ? this._playback.playSourceRange(start, end as number)
        : this._playback.playSourceAt(start);
      void play.catch(() => {
        this._playback?.stop();
      });
      return;
    }
    if (this._recordingTrackId && !isComparePlayMode(this._playMode)) {
      this._controller.setActiveId(this._recordingTrackId);
    }
    try {
      if (isComparePlayMode(this._playMode)) {
        if (this._playMode === 'sync') {
          const ok = hasEnd
            ? await this._playback.playSyncRecordingRange(start, end as number)
            : await this._playback.playSyncAt(start, 'recording');
          if (!ok) {
            if (hasEnd) {
              await this._playback.playRecordingRange(start, end as number);
            } else {
              await this._playback.playRecordingAt(start);
            }
          }
          return;
        }
        const play = hasEnd
          ? this._playback.playContinuousRecordingRange(start, end as number)
          : this._playback.playContinuousAt(start, 'recording');
        await play;
        return;
      }
      if (hasEnd) {
        await this._playback.playRecordingRange(start, end as number);
      } else {
        await this._playback.playRecordingAt(start);
      }
    } catch {
      this._playback?.stop();
    }
  }

  private _privacyModalBody(): string {
    if (this._privacyAction === 'score') {
      return msg('评分会将录音上传到你配置的服务器以计算分数。服务端不保存音频。是否继续？');
    }
    return msg(
      '生成原音词条会将原音片段上传到你配置的服务器，以便在波形上标出每个词。服务端不保存音频。是否继续？',
    );
  }

  private _renderAlignActions() {
    if (this._playMode !== 'source') {
      return nothing;
    }
    if (!this.record || !this.sourceBlob || this.segments.length === 0) {
      return nothing;
    }
    if (!isSpeechAlignConfigured(getAppSettings())) {
      return nothing;
    }
    const showAlignAll = this.segments.length > 1;
    const currentSegment = this.segments[this._syncSegmentIndex];
    const hasSegmentCache = Boolean(
      currentSegment && this._alignWordsBySegmentId.has(currentSegment.id),
    );
    const busy = this._aligning || this._scoring;
    const alignAllBlocked = Boolean(this._alignMediaBlockedTip);
    return html`
      <div class="align-row" role="group" aria-label=${msg('生成原音词条')}>
        <span class="word-layout-label">${msg('生成原音词条')}</span>
        <source-segment-align-button
          .hasCache=${hasSegmentCache}
          ?disabled=${busy}
          tooltipPlacement="top"
          @align-segment=${this._onAlignSegmentRequest}
        ></source-segment-align-button>
        ${showAlignAll
          ? html`
              <source-word-align-all-button
                .hasWholeMediaCache=${this._hasWholeMediaAlign}
                .blockedTip=${this._alignMediaBlockedTip}
                .blocked=${alignAllBlocked}
                ?disabled=${busy}
                tooltipPlacement="top"
                @align-all=${this._onAlignAllRequest}
              ></source-word-align-all-button>
            `
          : nothing}
      </div>
    `;
  }

  private _onAlignSegmentRequest = (event: CustomEvent<SourceSegmentAlignDetail>): void => {
    event.stopPropagation();
    void this._handleAlignSegment(event.detail.force);
  };

  private _onAlignAllRequest = (event: CustomEvent<SourceWordAlignAllDetail>): void => {
    event.stopPropagation();
    void this._handleAlignAll(event.detail.force);
  };

  private async _refreshAlignMediaBlockedTip(): Promise<void> {
    const record = this.record;
    const blob = this.sourceBlob;
    if (!record || !blob) {
      this._alignMediaBlockedTip = null;
      this._hasWholeMediaAlign = false;
      return;
    }
    const [blockedTip, hasWholeMediaAlign] = await Promise.all([
      resolveWholeMediaAlignBlockedTip({
        mediaId: record.mediaId,
        subtitleSegments: this.subtitleSegments,
        sourceBlob: blob,
      }),
      hasCurrentMediaSourceWordAlignment(record.mediaId),
    ]);
    this._alignMediaBlockedTip = blockedTip;
    this._hasWholeMediaAlign = hasWholeMediaAlign;
  }

  private async _loadAlignWordsForCurrentSegment(): Promise<void> {
    const record = this.record;
    const segment = this.segments[this._syncSegmentIndex];
    if (!record || !segment) {
      this.requestUpdate();
      return;
    }
    if (this._alignWordsBySegmentId.has(segment.id)) {
      this.requestUpdate();
      return;
    }
    try {
      const subtitleTrack = await getSubtitle(record.mediaId);
      const words = await resolveSegmentSourceWords({
        mediaId: record.mediaId,
        segment,
        allSegments: this.segments,
        subtitleTrack,
      });
      if (words.length > 0) {
        this._alignWordsBySegmentId.set(segment.id, words);
      }
    } catch {
      // Ignore cache read errors; UI stays without markers.
    }
    this.requestUpdate();
  }

  private _rememberAlignment(segmentId: string, words: WordTiming[]): void {
    this._alignWordsBySegmentId.set(segmentId, words);
    this.requestUpdate();
  }

  private async _handleAlignSegment(force = false): Promise<void> {
    if (!this.record || this._aligning) {
      return;
    }
    if (!isSpeechAlignConfigured(getAppSettings())) {
      Message.warning(msg('请先在设置中填写原音词条接口地址和 API Key'));
      return;
    }
    if (!hasSpeechScorePrivacyAck()) {
      this._privacyAction = 'align-segment';
      this._alignSegmentForce = force;
      this._privacyOpen = true;
      return;
    }
    await this._runAlignSegment(force);
  }

  private async _handleAlignAll(force = false): Promise<void> {
    if (!this.record || this._aligning) {
      return;
    }
    if (!isSpeechAlignConfigured(getAppSettings())) {
      Message.warning(msg('请先在设置中填写原音词条接口地址和 API Key'));
      return;
    }
    if (!hasSpeechScorePrivacyAck()) {
      this._privacyAction = 'align-all';
      this._alignAllForce = force;
      this._privacyOpen = true;
      return;
    }
    await this._runAlignAll(force);
  }

  private async _runAlignSegment(force = false): Promise<void> {
    const record = this.record;
    const segment = this.segments[this._syncSegmentIndex];
    if (!record || !segment) {
      return;
    }
    this._aligning = true;
    try {
      const result = await alignPracticeSegment({
        mediaId: record.mediaId,
        segment,
        subtitleSegments: this.subtitleSegments,
        options: { source: 'segment', skipIfCached: !force },
      });
      if (!result.ok) {
        if (result.reason === 'not_configured') {
          Message.warning(result.message);
        } else {
          Message.error(result.message);
        }
        return;
      }
      this._rememberAlignment(segment.id, result.alignment.words);
      Message.success(force ? msg('本句已重新生成') : msg('本句词条已生成'));
    } finally {
      this._aligning = false;
    }
  }

  private async _runAlignAll(force = false): Promise<void> {
    const record = this.record;
    if (!record) {
      return;
    }
    this._aligning = true;
    try {
      const result = await alignAllPracticeSegments({
        mediaId: record.mediaId,
        segments: this.segments,
        subtitleSegments: this.subtitleSegments,
        options: { force },
      });
      // Refresh in-memory cache from IDB for all segments.
      this._alignWordsBySegmentId.clear();
      const subtitleTrack = await getSubtitle(record.mediaId);
      await Promise.all(
        this.segments.map(async (segment) => {
          try {
            const words = await resolveSegmentSourceWords({
              mediaId: record.mediaId,
              segment,
              allSegments: this.segments,
              subtitleTrack,
            });
            if (words.length > 0) {
              this._alignWordsBySegmentId.set(segment.id, words);
            }
          } catch {
            // ignore
          }
        }),
      );
      void this._refreshAlignMediaBlockedTip();
      this.requestUpdate();
      if (!result.ok && result.message) {
        Message.warning(result.message);
      } else {
        Message.success(
          force ? msg('全部原音词条已重新生成') : msg('全部原音词条已生成'),
        );
      }
    } finally {
      this._aligning = false;
    }
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
      this._privacyAction = 'score';
      this._privacyOpen = true;
      return;
    }
    await this._runScore(record);
  }

  private async _confirmPrivacy(): Promise<void> {
    ackSpeechScorePrivacy();
    this._privacyOpen = false;
    const action = this._privacyAction;
    if (action === 'align-segment') {
      const force = this._alignSegmentForce;
      this._alignSegmentForce = false;
      await this._runAlignSegment(force);
      return;
    }
    if (action === 'align-all') {
      const force = this._alignAllForce;
      this._alignAllForce = false;
      await this._runAlignAll(force);
      return;
    }
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
      } else if (!result.ok && result.score?.status === 'success') {
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
    const shortLabel = track === 'source' ? msg('原音') : msg('录音');
    const label = track === 'source' ? msg('原音音量') : msg('录音音量');
    const title = `${label} ${percent}%`;
    const boosted = volume > 1;

    return html`
      <div class="volume-item">
        <span class="volume-item-label">${shortLabel}</span>
        <ui-dropdown
          trigger="click"
          placement="right"
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
            <ui-icon
              name=${volume === 0 ? 'volume-close' : 'volume'}
              size="var(--icon-lg)"
            ></ui-icon>
          </button>
        </ui-dropdown>
      </div>
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
    if (isComparePlayMode(this._playMode)) {
      return;
    }
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
    const range = getPracticeSegmentSpeechRange(this.segments, segmentIndex, axis);
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
      if (state.syncSegmentIndex !== previousSegmentIndex) {
        void this._loadAlignWordsForCurrentSegment();
      }

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
