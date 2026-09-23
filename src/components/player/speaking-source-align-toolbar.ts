import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { MediaControllerHost } from '../../controllers/media-controller-host.js';
import type { MediaController } from '../../controllers/media-controller.js';
import { WaveformControllerHost } from '../../controllers/waveform-controller-host.js';
import { WaveformController } from '../../controllers/waveform-controller.js';
import { getMediaBlob } from '../../db/media.js';
import { getSubtitle } from '../../db/subtitle.js';
import { getAppSettings, setAppSettings } from '../../lib/app-settings.js';
import {
  ExtendedMediaEventType,
  getSubtitleSegmentViewRange,
  subtitleSegmentsToAlignTargets,
} from '../../lib/playback-utils.js';
import {
  ackSpeechScorePrivacy,
  hasSpeechScorePrivacyAck,
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
import '../shared/source-segment-align-button.js';
import '../shared/source-word-align-all-button.js';
import '../shared/word-marker-layout-toggle.js';
import type { WordMarkerLayout, WordTiming } from '../../types/models.js';
import {
  WORD_RAIL_LANE_PX,
  wordMarkersForSourceSubtitle,
  type WordWaveformMarker,
} from '../../lib/word-waveform.js';
import { Message } from '../ui/message.js';
import { Z_INDEX } from '../ui/internal/z-index.js';
import '../ui/button.js';
import '../ui/modal.js';
import type { WaveformSeekRequestDetail } from './waveform-player.js';
import './waveform-player.js';
import { wordRailStyles } from './word-rail-styles.js';

const SOURCE_WAVEFORM_CANVAS_HEIGHT = 140;

function bindSoftPauseAt(controller: MediaController, endTime: number): () => void {
  if (!Number.isFinite(endTime)) {
    return () => {};
  }
  const handler = (): void => {
    if (controller.currentTime >= endTime - 0.02) {
      controller.pause();
      cleanup();
    }
  };
  const cleanup = (): void => {
    controller.removeEventListener('state-change', handler);
  };
  controller.addEventListener('state-change', handler);
  return cleanup;
}

@customElement('speaking-source-align-toolbar')
@localized()
export class SpeakingSourceAlignToolbar extends LitElement {
  static styles = [
    wordRailStyles,
    css`
      :host {
        display: grid;
        gap: var(--space-block);
        padding: var(--space-inline);
        margin-bottom: var(--space-inline);
        border: 1px solid var(--color-border, #d9d9d9);
        border-radius: var(--radius-md, 8px);
        background: var(--color-surface, #fff);
      }

      .align-row,
      .word-layout-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-sm, 8px);
      }

      .word-layout-label {
        font-size: 0.8125rem;
        color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
        white-space: nowrap;
      }

      .rail-toggle-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
      }
    `,
  ];

  @property({ attribute: false })
  controller: MediaController | null = null;

  @property({ type: String })
  mediaId = '';

  @property({ type: Boolean })
  sessionLocked = false;

  @property({ type: Boolean })
  disabled = false;

  /** Bumped when subtitles change without a media switch. */
  @property({ type: Number })
  subtitleRevision = 0;

  @state()
  private _aligning = false;

  @state()
  private _alignMediaBlockedTip: string | null = null;

  @state()
  private _hasWholeMediaAlign = false;

  @state()
  private _railOpen = false;

  @state()
  private _privacyOpen = false;

  @state()
  private _wordMarkerLayout: WordMarkerLayout = getAppSettings().wordMarkerLayout;

  private _waveformController = new WaveformController();
  private _waveformHost = new WaveformControllerHost(this, this._waveformController);
  private _mediaHost: MediaControllerHost | null = null;
  private _boundMediaController: MediaController | null = null;

  @state()
  private _sourceTrackId = '';

  private _alignWordsBySegmentId = new Map<string, WordTiming[]>();
  private _softPauseCleanup: (() => void) | null = null;
  private _loadMediaGeneration = 0;
  private _alignAllForce = false;
  private _alignSegmentForce = false;
  private _privacyAction: 'align-segment' | 'align-all' = 'align-all';

  connectedCallback(): void {
    super.connectedCallback();
    this._attachMediaController(this.controller);
    if (this.mediaId) {
      void this._loadSourceWaveform();
      void this._refreshAlignMediaBlockedTip();
    }
  }

  disconnectedCallback(): void {
    this._detachMediaController();
    this._softPauseCleanup?.();
    this._softPauseCleanup = null;
    this._waveformController.clearTracks();
    this._sourceTrackId = '';
    super.disconnectedCallback();
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has('controller')) {
      this._attachMediaController(this.controller);
    }

    if (
      changed.has('mediaId') ||
      changed.has('subtitleRevision') ||
      changed.has('controller')
    ) {
      this._alignWordsBySegmentId.clear();
      void this._refreshAlignMediaBlockedTip();
      if (changed.has('mediaId')) {
        void this._loadSourceWaveform();
      }
    }

    if (
      changed.has('mediaId') ||
      changed.has('subtitleRevision') ||
      changed.has('_railOpen') ||
      changed.has('controller')
    ) {
      void this._syncViewRangeAndWords();
    }
  }

  private _attachMediaController(controller: MediaController | null): void {
    if (controller === this._boundMediaController) {
      return;
    }
    this._detachMediaController();
    this._boundMediaController = controller;
    if (!controller) {
      return;
    }
    if (!this._mediaHost) {
      this._mediaHost = new MediaControllerHost(this, controller);
    }
    controller.addEventListener('state-change', this._onMediaStateChange);
    controller.addEventListener(
      ExtendedMediaEventType.SEGMENT_CHANGE,
      this._onMediaSegmentChange,
    );
    this._syncWaveformTime();
  }

  private _detachMediaController(): void {
    const controller = this._boundMediaController;
    if (!controller) {
      return;
    }
    controller.removeEventListener('state-change', this._onMediaStateChange);
    controller.removeEventListener(
      ExtendedMediaEventType.SEGMENT_CHANGE,
      this._onMediaSegmentChange,
    );
    this._boundMediaController = null;
  }

  private _syncWaveformTime(): void {
    const controller = this.controller;
    if (!controller || !this._sourceTrackId) {
      return;
    }
    this._waveformController.seek(controller.currentTime);
  }

  private _onMediaStateChange = (): void => {
    this._syncWaveformTime();
  };

  private _onMediaSegmentChange = (): void => {
    void this._syncViewRangeAndWords();
  };

  private async _loadSourceWaveform(): Promise<void> {
    const mediaId = this.mediaId;
    const generation = ++this._loadMediaGeneration;
    this._waveformController.clearTracks();
    this._sourceTrackId = '';
    if (!mediaId) {
      return;
    }
    try {
      const blob = await getMediaBlob(mediaId);
      if (generation !== this._loadMediaGeneration || !blob) {
        return;
      }
      this._sourceTrackId = await this._waveformController.addFromBlob(blob, msg('原音'));
      this._waveformController.setLayout('overlay');
      this._waveformController.setActiveId(this._sourceTrackId);
      void this._refreshAlignMediaBlockedTip();
      void this._syncViewRangeAndWords();
    } catch {
      // Waveform stays empty.
    }
  }

  private async _refreshAlignMediaBlockedTip(): Promise<void> {
    const { segments } = this.controller?.getSnapshot() ?? { segments: [] };
    if (!this.mediaId) {
      this._alignMediaBlockedTip = null;
      this._hasWholeMediaAlign = false;
      return;
    }
    const [blockedTip, hasWholeMediaAlign] = await Promise.all([
      resolveWholeMediaAlignBlockedTip({
        mediaId: this.mediaId,
        subtitleSegments: segments,
      }),
      hasCurrentMediaSourceWordAlignment(this.mediaId),
    ]);
    this._alignMediaBlockedTip = blockedTip;
    this._hasWholeMediaAlign = hasWholeMediaAlign;
  }

  private async _syncViewRangeAndWords(): Promise<void> {
    const controller = this.controller;
    if (!controller || !this._railOpen || !this._sourceTrackId) {
      return;
    }
    const { segments, currentSegmentIndex } = controller.getSnapshot();
    if (currentSegmentIndex < 0) {
      this._waveformController.setViewRange(null);
      this.requestUpdate();
      return;
    }
    const viewRange = getSubtitleSegmentViewRange(segments, currentSegmentIndex);
    this._waveformController.setViewRange(viewRange);
    await this._loadAlignWordsForSegment(currentSegmentIndex);
    this.requestUpdate();
  }

  private async _loadAlignWordsForSegment(segmentIndex: number): Promise<void> {
    const controller = this.controller;
    if (!controller || !this.mediaId) {
      return;
    }
    const { segments } = controller.getSnapshot();
    const segment = segments[segmentIndex];
    if (!segment || this._alignWordsBySegmentId.has(segment.id)) {
      return;
    }
    const alignSegment = subtitleSegmentsToAlignTargets(segments).find((s) => s.id === segment.id);
    if (!alignSegment) {
      return;
    }
    try {
      const subtitleTrack = await getSubtitle(this.mediaId);
      const words = await resolveSegmentSourceWords({
        mediaId: this.mediaId,
        segment: alignSegment,
        subtitleTrack,
      });
      if (words.length > 0) {
        this._alignWordsBySegmentId.set(segment.id, words);
      }
    } catch {
      // Ignore cache read errors.
    }
  }

  private _wordMarkers(): WordWaveformMarker[] {
    const controller = this.controller;
    if (!controller || !this._railOpen) {
      return [];
    }
    const { segments, currentSegmentIndex } = controller.getSnapshot();
    if (currentSegmentIndex < 0) {
      return [];
    }
    const segment = segments[currentSegmentIndex];
    if (!segment) {
      return [];
    }
    const words = this._alignWordsBySegmentId.get(segment.id) ?? [];
    if (words.length === 0) {
      return [];
    }
    return wordMarkersForSourceSubtitle({
      words,
      segments,
      segmentIndex: currentSegmentIndex,
      sourceViewRange: getSubtitleSegmentViewRange(segments, currentSegmentIndex),
      layout: this._wordMarkerLayout,
    });
  }

  private _setWordMarkerLayout(layout: WordMarkerLayout): void {
    if (layout === this._wordMarkerLayout) {
      return;
    }
    this._wordMarkerLayout = setAppSettings({ wordMarkerLayout: layout }).wordMarkerLayout;
  }

  private async _handleAlignSegment(force = false): Promise<void> {
    if (this._aligning || !this.controller || !this.mediaId) {
      return;
    }
    if (!isSpeechAlignConfigured(getAppSettings())) {
      Message.warning(msg('请先在设置中填写对齐接口地址和 API Key'));
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
    if (this._aligning || !this.controller || !this.mediaId) {
      return;
    }
    if (!isSpeechAlignConfigured(getAppSettings())) {
      Message.warning(msg('请先在设置中填写对齐接口地址和 API Key'));
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
    const controller = this.controller;
    if (!controller || !this.mediaId) {
      return;
    }
    const { segments, currentSegmentIndex } = controller.getSnapshot();
    const segment = segments[currentSegmentIndex];
    if (!segment) {
      return;
    }
    const alignSegment = subtitleSegmentsToAlignTargets(segments).find((s) => s.id === segment.id);
    if (!alignSegment) {
      return;
    }
    this._aligning = true;
    try {
      const result = await alignPracticeSegment({
        mediaId: this.mediaId,
        segment: alignSegment,
        subtitleSegments: segments,
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
      this._alignWordsBySegmentId.set(segment.id, result.alignment.words);
      void this._refreshAlignMediaBlockedTip();
      this.requestUpdate();
      Message.success(force ? msg('本句已重新生成') : msg('本句词条已生成'));
    } finally {
      this._aligning = false;
    }
  }

  private async _runAlignAll(force = false): Promise<void> {
    const controller = this.controller;
    if (!controller || !this.mediaId) {
      return;
    }
    const { segments } = controller.getSnapshot();
    if (segments.length === 0) {
      return;
    }
    this._aligning = true;
    try {
      const alignSegments = subtitleSegmentsToAlignTargets(segments);
      const result = await alignAllPracticeSegments({
        mediaId: this.mediaId,
        segments: alignSegments,
        subtitleSegments: segments,
        options: { force },
      });
      this._alignWordsBySegmentId.clear();
      const subtitleTrack = await getSubtitle(this.mediaId);
      await Promise.all(
        alignSegments.map(async (segment) => {
          try {
            const words = await resolveSegmentSourceWords({
              mediaId: this.mediaId,
              segment,
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
    const force = this._alignAllForce;
    this._alignAllForce = false;
    await this._runAlignAll(force);
  }

  private _onAlignSegmentRequest = (event: CustomEvent<SourceSegmentAlignDetail>): void => {
    event.stopPropagation();
    void this._handleAlignSegment(event.detail.force);
  };

  private _onAlignAllRequest = (event: CustomEvent<SourceWordAlignAllDetail>): void => {
    event.stopPropagation();
    void this._handleAlignAll(event.detail.force);
  };

  private _onWordLayoutChange = (event: CustomEvent<WordMarkerLayoutToggleDetail>): void => {
    event.stopPropagation();
    this._setWordMarkerLayout(event.detail.layout);
  };

  private _handleWaveformSeekRequest(event: CustomEvent<WaveformSeekRequestDetail>): void {
    if (this.sessionLocked) {
      return;
    }
    const controller = this.controller;
    if (!controller || event.detail.trackId !== this._sourceTrackId) {
      return;
    }
    event.preventDefault();
    this._softPauseCleanup?.();
    this._softPauseCleanup = null;
    controller.seek(event.detail.time);
    void controller.play();
  }

  private _playAlignedWord(word: Pick<WordTiming, 'start' | 'end'>): void {
    if (this.sessionLocked) {
      return;
    }
    const controller = this.controller;
    if (!controller || !Number.isFinite(word.start)) {
      return;
    }
    this._softPauseCleanup?.();
    controller.seek(word.start);
    void controller.play();
    if (typeof word.end === 'number' && Number.isFinite(word.end) && word.end > word.start) {
      this._softPauseCleanup = bindSoftPauseAt(controller, word.end);
    }
  }

  private _renderWordRail(markers: WordWaveformMarker[]) {
    if (markers.length === 0) {
      return nothing;
    }
    const compact = this._wordMarkerLayout === 'compact';
    const locked = this.sessionLocked;
    return html`
      <div class="word-rail" slot="over-canvas">
        ${markers.map(
          (marker) => html`
            <button
              type="button"
              class="word-marker is-align${compact ? ' is-compact' : ''}"
              ?disabled=${locked}
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
              @click=${() => this._playAlignedWord(marker)}
            >
              ${marker.word}
            </button>
          `,
        )}
      </div>
    `;
  }

  render() {
    if (!isSpeechAlignConfigured(getAppSettings())) {
      return nothing;
    }

    const controller = this.controller;
    const snapshot = controller?.getSnapshot();
    const segments = snapshot?.segments ?? [];
    const showAlignAll = segments.length > 1;
    const busy = this._aligning || this.disabled;
    const alignAllBlocked = Boolean(this._alignMediaBlockedTip);
    const markers = this._wordMarkers();
    const wordLanePx = markers.length > 0 ? WORD_RAIL_LANE_PX : 0;
    const interactive = !this.sessionLocked && !this.disabled;
    const { currentSegmentIndex } = snapshot ?? { currentSegmentIndex: -1 };
    const currentSegment =
      currentSegmentIndex >= 0 ? segments[currentSegmentIndex] : undefined;
    const hasSegmentCache = Boolean(
      currentSegment && this._alignWordsBySegmentId.has(currentSegment.id),
    );

    return html`
      <div class="align-row" role="group" aria-label=${msg('生成原音词条')}>
        <span class="word-layout-label">${msg('生成原音词条')}</span>
        <source-segment-align-button
          .hasCache=${hasSegmentCache}
          ?disabled=${busy}
          tooltipPlacement="right"
          @align-segment=${this._onAlignSegmentRequest}
        ></source-segment-align-button>
        ${showAlignAll
          ? html`
              <source-word-align-all-button
                .hasWholeMediaCache=${this._hasWholeMediaAlign}
                .blockedTip=${this._alignMediaBlockedTip}
                .blocked=${alignAllBlocked}
                ?disabled=${busy}
                tooltipPlacement="right"
                @align-all=${this._onAlignAllRequest}
              ></source-word-align-all-button>
            `
          : nothing}
      </div>
      ${this._railOpen
        ? html`
            <div class="word-layout-row" role="group" aria-label=${msg('波形词条')}>
              <span class="word-layout-label">${msg('波形词条')}</span>
              <word-marker-layout-toggle
                density="compact"
                ?visible=${markers.length > 0}
                .layout=${this._wordMarkerLayout}
                ?showLabel=${false}
                ?disabled=${this.disabled}
                @layout-change=${this._onWordLayoutChange}
              ></word-marker-layout-toggle>
            </div>
          `
        : nothing}
      <div class="rail-toggle-row">
        <ui-button
          size="small"
          variant="${this._railOpen ? 'primary' : 'secondary'}"
          ?disabled=${this.disabled || !this._sourceTrackId}
          @click=${() => {
            this._railOpen = !this._railOpen;
            if (this._railOpen) {
              void this._syncViewRangeAndWords();
            }
          }}
        >
          ${this._railOpen ? msg('隐藏词轨') : msg('显示词轨')}
        </ui-button>
      </div>
      ${this._railOpen
        ? html`
            <waveform-player
              .controller=${this._waveformController}
              .canvasHeight=${SOURCE_WAVEFORM_CANVAS_HEIGHT + wordLanePx}
              .topInset=${wordLanePx}
              .interactive=${interactive}
              @seek-request=${this._handleWaveformSeekRequest}
            >
              ${this._renderWordRail(markers)}
            </waveform-player>
          `
        : nothing}
      <ui-modal
        title="${msg('上传说明')}"
        .zIndex=${Z_INDEX.MODAL + 80}
        ?open=${this._privacyOpen}
        ok-text="${msg('同意并生成')}"
        cancel-text="${msg('取消')}"
        width="420px"
        centered
        @ok=${() => void this._confirmPrivacy()}
        @cancel=${() => {
          this._privacyOpen = false;
          this._alignAllForce = false;
          this._alignSegmentForce = false;
        }}
        @update:open="${(e: CustomEvent<{ open: boolean }>) => {
          if (e.target !== e.currentTarget) return;
          if (!e.detail.open) {
            this._privacyOpen = false;
            this._alignAllForce = false;
            this._alignSegmentForce = false;
          }
        }}"
      >
        <p>
          ${msg(
            '生成原音词条会将原声片段上传到你配置的服务器以获取词级时间戳。服务端不保存音频。是否继续？',
          )}
        </p>
      </ui-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'speaking-source-align-toolbar': SpeakingSourceAlignToolbar;
  }
}
