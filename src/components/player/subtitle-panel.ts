import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { MediaControllerHost } from '../../controllers/media-controller-host.js';
import type {
  MediaController,
  MediaControllerSnapshot,
} from '../../controllers/media-controller.js';
import { reportSubtitleImportResult } from '../import/subtitle-import-feedback.js';
import { formatTime } from '../../lib/playback-utils.js';
import { formatOverallBadge } from '../../lib/pronunciation-score/aggregate.js';
import { supportsKeyboardShortcuts } from '../../lib/hotkeys/index.js';
import { getMicrophoneBlockedMessage } from '../../lib/microphone-access.js';
import {
  findImportedSubtitleTrack,
  runSubtitleImport,
  subtitleBasenameMatchesMedia,
  type PendingSubtitleImport,
} from '../../lib/subtitle-import-helpers.js';
import type { PracticeRecord, SubtitleSegment, SubtitleTrack } from '../../types/models.js';
import '../ui/button.js';
import '../ui/icon.js';
import '../ui/modal.js';
import '../ui/tooltip.js';
import { Message } from '../ui/message.js';
import { isControlledOpen } from '../ui/internal/controlled-state.js';
import { OverlayController } from '../ui/internal/overlay-controller.js';
import { Z_INDEX } from '../ui/internal/z-index.js';
import { SESSION_DOCK_INSET_PX } from './echo-session-dock.js';

export type SubtitleImportedDetail = {
  mediaId: string;
  track: SubtitleTrack;
};

export type SubtitlePanelFullscreenChangeDetail = {
  fullscreen: boolean;
};

export type EchoRecordRequestDetail = {
  segmentIndex: number;
};

export type EchoManageRecordingsDetail = {
  segmentId: string;
};

const FULLSCREEN_PORTAL_STYLES = `
  .fullscreen-root {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    pointer-events: auto;
    background: var(--color-surface, #fff);
    color: var(--color-text, rgba(0, 0, 0, 0.88));
  }

  .fullscreen-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    background: inherit;
  }

  .fullscreen-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-block);
    padding: var(--space-block) var(--space-inline);
    border-bottom: 1px solid var(--color-border, #d9d9d9);
  }

  .fullscreen-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .close-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: currentColor;
  }

  .list {
    margin: 0;
    padding: var(--space-sm) 0;
    list-style: none;
  }

  .list.fullscreen {
    flex: 1;
    min-height: 0;
    max-height: none;
    overflow-y: auto;
    scroll-padding-bottom: var(--session-dock-inset, var(--echo-dock-inset, 0px));
    /* Padding creates real space so content never slides under the dock. */
    padding-bottom: var(--session-dock-inset, var(--echo-dock-inset, 0px));
  }

  .segment {
    display: flex;
    gap: var(--space-xs);
    align-items: center;
    padding: 6px var(--space-inline);
    cursor: pointer;
    transition: background-color 0.15s ease;
    scroll-margin-bottom: var(--session-dock-inset, 0px);
  }

  .segment:hover {
    background: rgba(22, 119, 255, 0.04);
  }

  .segment:hover .text {
    text-decoration: underline;
  }

  .segment.active {
    background: rgba(22, 119, 255, 0.1);
    border-left: 3px solid var(--color-primary, #1677ff);
    padding-left: calc(var(--space-inline) - 3px);
  }

  .navigation-locked .segment {
    cursor: default;
  }

  .navigation-locked .segment:not(.active) {
    opacity: 0.45;
  }

  .navigation-locked .segment:not(.active):hover {
    background: transparent;
  }

  .navigation-locked .segment:not(.active):hover .text {
    text-decoration: none;
  }

  .content {
    display: flex;
    align-items: center;
    flex-direction: column;
    flex: 1;
  }

  .time {
    color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .text {
    margin: 0;
    font-weight: 600;
    text-align: center;
  }

  .translation {
    font-weight: 400;
  }

  .translation.hidden {
    display: none;
  }

  .echo-controls {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-shrink: 0;
    margin-left: auto;
  }

  @media (max-width: 767px) {
    .content {
      align-items: flex-start;
    }

    .text {
        text-align: left;
      }
  }
`;

@customElement('subtitle-panel')
@localized()
export class SubtitlePanel extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .surface {
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.06));
      overflow: hidden;
    }

    .header {
      padding: var(--space-block) var(--space-inline);
      border-bottom: 1px solid var(--color-border, #d9d9d9);
      font-size: 0.9375rem;
      font-weight: 600;
    }
    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-block);
    }

    .title {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: auto;
    }

    .list {
      /* Let .main-content own page scroll; avoid a second scrollbar beside it. */
      max-height: none;
      overflow: visible;
      margin: 0;
      padding: var(--space-sm) 0;
      list-style: none;
    }

    .segment {
      display: flex;
      gap: var(--space-xs);
      align-items: center;
      padding: 6px var(--space-inline);
      cursor: pointer;
      transition: background-color 0.15s ease;
      /* Keep active rows clear of the session dock (covers mobile nav while active). */
      scroll-margin-bottom: var(--session-dock-inset, 0px);
    }

    .segment:hover {
      background: rgba(22, 119, 255, 0.04);
    }

    .segment:hover .text {
      text-decoration: underline;
    }

    .segment.active {
      background: rgba(22, 119, 255, 0.1);
      border-left: 3px solid var(--color-primary, #1677ff);
      padding-left: calc(var(--space-inline) - 3px);
    }

    .navigation-locked .segment {
      cursor: default;
    }

    .navigation-locked .segment:not(.active) {
      opacity: 0.45;
    }

    .navigation-locked .segment:not(.active):hover {
      background: transparent;
    }

    .navigation-locked .segment:not(.active):hover .text {
      text-decoration: none;
    }

    .content {
      display: flex;
      align-items: center;
      flex-direction: column;
      flex: 1;
    }

    .time {
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .text {
      margin: 0;
      font-weight: 600;
      text-align: center;
    }

    .translation {
      font-weight: 400;
    }

    .translation.hidden {
      display: none;
    }

    .empty {
      padding: var(--space-stack) var(--space-inline);
      text-align: center;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .empty p {
      margin: 0;
    }

    .empty-actions {
      display: flex;
      justify-content: center;
      margin-top: var(--space-block);
    }

    input[type='file'] {
      display: none;
    }

    .hidden-note {
      padding: var(--space-stack) var(--space-inline);
      text-align: center;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .echo-controls {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      flex-shrink: 0;
      margin-left: auto;
    }

    .echo-controls ui-button button {
      padding: var(--space-xs) var(--space-sm);
    }

    .row-actions {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      flex-shrink: 0;
    }

    .row-actions ui-button button {
      padding: var(--space-xs) var(--space-sm);
    }

    .echo-score {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.375rem;
      height: 1.25rem;
      padding: 0 4px;
      border-radius: 999px;
      font-size: 0.6875rem;
      font-weight: 600;
      line-height: 1;
      background: rgba(82, 196, 26, 0.16);
      color: #389e0d;
    }

    .echo-score.mid {
      background: rgba(250, 173, 20, 0.2);
      color: #ad6800;
    }

    .echo-score.low {
      background: rgba(255, 77, 79, 0.16);
      color: #cf1322;
    }

    @media (max-width: 767px) {
      .content {
        align-items: flex-start;
      }
      .text {
        text-align: left;
      }
    }
  `;

  @property({ attribute: false })
  controller: MediaController | null = null;

  @property({ type: Boolean })
  fullscreen?: boolean;

  @property({ type: Boolean, attribute: 'default-fullscreen' })
  defaultFullscreen = false;

  @property({ type: Boolean })
  showFullscreenIcon?: boolean;

  @property({ type: Number, attribute: 'z-index' })
  zIndex = Z_INDEX.FULLSCREEN;

  @property()
  popupContainer: string | HTMLElement | null = 'body';

  @property({ type: Boolean })
  echoMode = false;

  @property({ attribute: false })
  echoRecordingsBySegmentId: Record<string, PracticeRecord[]> = {};

  /** Latest successful overall Pronunciation Score per Echo Subtitle Segment. */
  @property({ attribute: false })
  echoLatestScoreBySegmentId: Record<string, number | null> = {};

  @property({ type: Number })
  echoRecordingSegmentIndex = -1;

  /**
   * True while Echo is preparing/stopping a clip. Disables starting other rows;
   * the active row stays enabled so cancel remains available.
   */
  @property({ type: Boolean })
  echoBusy = false;

  /**
   * When true, treat the tallest session-dock height as bottom chrome even before
   * `--session-dock-inset` is published (shadowing countdown / echo preparing).
   */
  @property({ type: Boolean })
  reserveSessionDockInset = false;

  @property({ type: Boolean })
  recordingSupported = true;

  /** False when the microphone is denied or unavailable. */
  @property({ type: Boolean })
  micReady = true;

  @property({ type: String })
  micBlockedTitle = '';

  @property({ type: Number })
  echoLimitPerSegment = 10;

  /**
   * When true, segment row clicks do not seek and manage actions are locked
   * (speaking session lock).
   */
  @property({ type: Boolean })
  seekDisabled = false;

  /** Segment ids already saved in the sentence bank for the current media. */
  @property({ attribute: false })
  sentenceBankSegmentIds: string[] = [];

  @property({ type: Boolean })
  sentenceBankBusy = false;

  @state()
  private _controllerHost: MediaControllerHost | null = null;

  @state()
  private _lastScrolledIndex = -1;

  @state()
  private _translationVisible = false;

  @state()
  private _internalFullscreen = false;

  @state()
  private _importingSubtitle = false;

  @state()
  private _overwriteSubtitleOnImport = false;

  @state()
  private _mismatchConfirmOpen = false;

  private _pendingMismatchImport: PendingSubtitleImport | null = null;

  private _boundController: MediaController | null = null;
  private _overlay: OverlayController | null = null;
  private _globalBound = false;
  private _prevIsFullscreen = false;

  connectedCallback(): void {
    super.connectedCallback();
    if (!isControlledOpen(this.fullscreen)) {
      this._internalFullscreen = this.defaultFullscreen;
    }
  }

  disconnectedCallback(): void {
    if (this._globalBound) {
      this._overlay?.triggers.unbindGlobal();
      this._globalBound = false;
    }
    this._overlay?.destroy();
    this._overlay = null;
    super.disconnectedCallback();
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('controller') && this.controller !== this._boundController) {
      this._boundController = this.controller;
      this._lastScrolledIndex = -1;
      if (this.controller && !this._controllerHost) {
        this._controllerHost = new MediaControllerHost(this, this.controller);
      }
    }
  }

  private _getActiveSegmentIndex(snapshot: MediaControllerSnapshot): number {
    if (this.echoMode && this.echoRecordingSegmentIndex >= 0) {
      return this.echoRecordingSegmentIndex;
    }
    return snapshot.currentSegmentIndex;
  }

  protected updated(changed: PropertyValues): void {
    const snapshot = this._controllerHost?.snapshot;
    const index = snapshot ? this._getActiveSegmentIndex(snapshot) : -1;
    if (index !== this._lastScrolledIndex) {
      this._lastScrolledIndex = index;
      this._scrollActiveIntoView(index);
    }

    const isFullscreen = this._isFullscreen();
    const wasFullscreen = this._prevIsFullscreen;

    this._handleControlledFullscreenEdge(changed, isFullscreen, wasFullscreen);

    if (isFullscreen !== wasFullscreen) {
      this._onFullscreenStateChanged(isFullscreen);
    } else if (isFullscreen) {
      this._syncFullscreenPortal();
    }

    if (changed.has('zIndex')) {
      this.style.setProperty('--subtitle-fullscreen-z', String(this.zIndex));
    }

    this._prevIsFullscreen = isFullscreen;
  }

  private _getOverlay(): OverlayController {
    if (!this._overlay) {
      this._overlay = new OverlayController({
        host: this,
        portal: {
          dataAttr: 'data-subtitle-fullscreen-portal',
          styleText: FULLSCREEN_PORTAL_STYLES,
          zIndex: this.zIndex,
          popupContainer: this.popupContainer,
        },
        isControlledOpen: () => isControlledOpen(this.fullscreen),
        readOpen: () => this._isFullscreen(),
        writeOpen: (next) => {
          this._internalFullscreen = next;
        },
      });
    }
    return this._overlay;
  }

  private _isFullscreen(): boolean {
    return isControlledOpen(this.fullscreen) ? this.fullscreen! : this._internalFullscreen;
  }

  private _assignFullscreen(next: boolean): void {
    if (!isControlledOpen(this.fullscreen)) {
      this._internalFullscreen = next;
    }
  }

  private _dispatch(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _emitFullscreenChange(next: boolean): void {
    const detail: SubtitlePanelFullscreenChangeDetail = { fullscreen: next };
    this._dispatch('fullscreen-change', detail);
    this._dispatch('update:fullscreen', detail);
  }

  private _setFullscreen(next: boolean): void {
    if (this._isFullscreen() === next) {
      return;
    }

    this._assignFullscreen(next);
    this._emitFullscreenChange(next);
    this.requestUpdate();
  }

  private _toggleFullscreen(): void {
    const snapshot = this._controllerHost?.snapshot;
    if (!snapshot?.hasSubtitles || !snapshot.subtitlesVisible) {
      return;
    }
    this._setFullscreen(!this._isFullscreen());
  }

  private _handleControlledFullscreenEdge(
    changed: PropertyValues,
    isFullscreen: boolean,
    wasFullscreen: boolean,
  ): void {
    if (!changed.has('fullscreen')) {
      return;
    }

    if (isFullscreen && !wasFullscreen) {
      this._dispatch('enter-fullscreen', {});
    } else if (!isFullscreen && wasFullscreen) {
      this._dispatch('exit-fullscreen', {});
    }
  }

  private _onFullscreenStateChanged(isFullscreen: boolean): void {
    const overlay = this._getOverlay();

    if (isFullscreen) {
      if (!this._globalBound) {
        overlay.triggers.bindGlobal({
          onEsc: (e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              this._setFullscreen(false);
            }
          },
        });
        this._globalBound = true;
      }
    } else if (this._globalBound) {
      overlay.triggers.unbindGlobal();
      this._globalBound = false;
    }

    this._syncFullscreenPortal();
  }

  private _syncFullscreenPortal(): void {
    const overlay = this._getOverlay();
    if (!this._isFullscreen()) {
      overlay.hideContent();
      return;
    }

    overlay.updatePortalOptions({ zIndex: this.zIndex, popupContainer: this.popupContainer });
    overlay.syncContent(this._fullscreenTemplate());
  }

  private _renderSegmentsList(
    snapshot: MediaControllerSnapshot,
    listClass = 'list',
  ): TemplateResult {
    const activeIndex = this._getActiveSegmentIndex(snapshot);
    const lockedClass = this.seekDisabled ? 'navigation-locked' : '';
    return html`<ul class="${listClass} ${lockedClass}">
      ${snapshot.segments.map(
        (segment, index) => html`
          <li
            class="segment ${index === activeIndex ? 'active' : ''}"
            data-segment-index="${index}"
            @click="${() => this._handleSegmentClick(index)}"
          >
            <div class="content">
              <span class="time">${formatTime(segment.startTime)}</span>
              <p class="text">${segment.text}</p>
              ${segment.translation
                ? html`<p class="text translation ${!this._translationVisible ? 'hidden' : ''}">
                    ${segment.translation}
                  </p>`
                : ''}
            </div>
            <div class="row-actions" @click="${this._stopRowClick}">
              ${this._renderSentenceBankButton(segment)}
              ${this.echoMode
                ? html`${this._renderEchoRecordButton(index)}
                  ${this._renderEchoScoreBadge(segment.id)}
                  ${this._renderEchoManageButton(segment.id)}`
                : nothing}
            </div>
          </li>
        `,
      )}
    </ul>`;
  }

  private _stopRowClick(event: Event): void {
    event.stopPropagation();
  }

  private _renderSentenceBankButton(segment: SubtitleSegment): TemplateResult {
    const saved = this.sentenceBankSegmentIds.includes(segment.id);
    const label = saved ? msg('从句库移除') : msg('加入句库');
    return html`
      <ui-tooltip
        title="${label}"
        .zIndex=${this._isFullscreen() ? Z_INDEX.POPUP_ABOVE_FULLSCREEN : Z_INDEX.TOOLTIP}
      >
        <ui-button
          variant="ghost"
          aria-label="${label}"
          ?disabled=${this.sentenceBankBusy}
          @click="${() => this._handleSentenceBankToggle(segment)}"
        >
          <ui-icon
            name="${saved ? 'like-fill' : 'like'}"
            style="color: red"
            size="var(--icon-md)"
          ></ui-icon>
        </ui-button>
      </ui-tooltip>
    `;
  }

  private _handleSentenceBankToggle(segment: SubtitleSegment): void {
    if (this.sentenceBankBusy) {
      return;
    }
    const saved = this.sentenceBankSegmentIds.includes(segment.id);
    this.dispatchEvent(
      new CustomEvent(saved ? 'sentence-bank-remove' : 'sentence-bank-add', {
        detail: { segment },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _renderEchoRecordButton(segmentIndex: number): TemplateResult {
    const isActiveRow = this.echoRecordingSegmentIndex === segmentIndex;
    const atLimit =
      (this.echoRecordingsBySegmentId[
        this._controllerHost?.snapshot.segments[segmentIndex]?.id ?? ''
      ]?.length ?? 0) >= this.echoLimitPerSegment;
    const disabled =
      !this.recordingSupported ||
      !this.micReady ||
      (this.echoBusy && !isActiveRow) ||
      (this.echoRecordingSegmentIndex >= 0 && !isActiveRow) ||
      (!isActiveRow && atLimit);
    const tip = isActiveRow
      ? msg('停止')
      : atLimit
        ? msg(str`该句录音已达上限（${this.echoLimitPerSegment}条），删除旧录音后可继续。`)
        : !this.recordingSupported
          ? getMicrophoneBlockedMessage('unsupported')
          : !this.micReady
            ? this.micBlockedTitle || getMicrophoneBlockedMessage('denied')
            : msg('跟读');
    const tipDisabled = disabled && !atLimit && this.recordingSupported && this.micReady;

    return html`
      <ui-tooltip
        title="${tip}"
        .zIndex=${this._isFullscreen() ? Z_INDEX.POPUP_ABOVE_FULLSCREEN : Z_INDEX.TOOLTIP}
        ?disabled=${tipDisabled}
      >
        <ui-button
          variant="${isActiveRow ? 'primary' : 'secondary'}"
          aria-label="${isActiveRow ? msg('停止') : msg('跟读')}"
          ?disabled=${disabled}
          @click="${() => this._handleEchoRecord(segmentIndex)}"
        >
          <ui-icon
            name="${isActiveRow ? 'stop-recording' : 'micro'}"
            size="var(--icon-md)"
          ></ui-icon>
        </ui-button>
      </ui-tooltip>
    `;
  }

  private _renderEchoManageButton(segmentId: string): TemplateResult {
    const count = this.echoRecordingsBySegmentId[segmentId]?.length ?? 0;
    const disabled = count === 0 || this.seekDisabled;
    const tip = msg(str`已保存 ${count}/${this.echoLimitPerSegment}`);

    return html`
      <ui-tooltip
        title="${tip}"
        .zIndex=${this._isFullscreen() ? Z_INDEX.POPUP_ABOVE_FULLSCREEN : Z_INDEX.TOOLTIP}
      >
        <ui-button
          class="echo-manage"
          variant="ghost"
          aria-label="${msg('管理录音')}"
          ?disabled=${disabled}
          @click=${() => this._handleEchoManage(segmentId)}
        >
          <ui-icon name="manage" size="var(--icon-md)"></ui-icon>
        </ui-button>
      </ui-tooltip>
    `;
  }

  private _renderEchoScoreBadge(segmentId: string): TemplateResult | typeof nothing {
    const overall = this.echoLatestScoreBySegmentId[segmentId];
    if (typeof overall !== 'number') {
      return nothing;
    }
    const band = overall >= 80 ? '' : overall >= 60 ? 'mid' : 'low';
    return html`
      <span
        class="echo-score ${band}"
        aria-label="${msg(str`发音评分 ${formatOverallBadge(overall)}`)}"
        >${formatOverallBadge(overall)}</span
      >
    `;
  }

  private _handleEchoRecord(segmentIndex: number): void {
    if (this.echoRecordingSegmentIndex === segmentIndex) {
      this._dispatch('echo-record-stop', {});
      return;
    }
    this._dispatch('echo-record-request', { segmentIndex } satisfies EchoRecordRequestDetail);
  }

  private _handleEchoManage(segmentId: string): void {
    this._dispatch('echo-manage-recordings', {
      segmentId,
    } satisfies EchoManageRecordingsDetail);
  }

  private _fullscreenTemplate(): TemplateResult {
    const snapshot = this._controllerHost?.snapshot;
    if (!snapshot) {
      return html``;
    }

    return html`
      <div class="fullscreen-root" role="dialog" aria-modal="true" aria-label="${msg('字幕')}">
        <div class="fullscreen-panel">
          <div class="fullscreen-header">
            <h3 class="fullscreen-title">${msg('字幕')}</h3>
            <ui-tooltip
              title="${supportsKeyboardShortcuts() ? msg('退出全屏 (F)') : msg('退出全屏')}"
              .zIndex=${Z_INDEX.POPUP_ABOVE_FULLSCREEN}
              placement="left"
            >
              <ui-button variant="ghost" @click="${() => this._setFullscreen(false)}">
                <ui-icon size="var(--icon-xl)" name="close"></ui-icon>
              </ui-button>
            </ui-tooltip>
          </div>
          ${this._renderSegmentsList(snapshot, 'list fullscreen')}
        </div>
      </div>
    `;
  }

  private _toggleSubtitles(): void {
    const snapshot = this._controllerHost?.snapshot;
    if (!snapshot?.hasSubtitles) {
      return;
    }
    const nextVisible = !snapshot.subtitlesVisible;
    // Fullscreen is a presentation of visible subtitles; hide ⇒ exit fullscreen.
    if (!nextVisible) {
      this._setFullscreen(false);
    }
    this.controller?.setSubtitlesVisible(nextVisible);
  }

  private _openSubtitlePicker(overwrite = false): void {
    this._overwriteSubtitleOnImport = overwrite;
    const input = this.renderRoot.querySelector('input[type="file"]') as HTMLInputElement | null;
    input?.click();
  }

  private async _handleSubtitleFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    const currentItem = this._controllerHost?.snapshot?.currentItem;
    const overwrite = this._overwriteSubtitleOnImport;
    this._overwriteSubtitleOnImport = false;

    if (!file || !currentItem) {
      return;
    }

    const pending: PendingSubtitleImport = {
      mediaId: currentItem.id,
      file,
      overwrite,
    };

    if (!subtitleBasenameMatchesMedia(file, currentItem.filename)) {
      this._pendingMismatchImport = pending;
      this._mismatchConfirmOpen = true;
      return;
    }

    await this._runSubtitleImport(pending);
  }

  private _clearMismatchConfirm(): void {
    this._mismatchConfirmOpen = false;
    this._pendingMismatchImport = null;
  }

  private _cancelMismatchImport(): void {
    this._clearMismatchConfirm();
  }

  private async _confirmMismatchImport(): Promise<void> {
    const pending = this._pendingMismatchImport;
    if (!pending) {
      this._clearMismatchConfirm();
      return;
    }
    this._clearMismatchConfirm();
    await this._runSubtitleImport(pending);
  }

  private async _runSubtitleImport(pending: PendingSubtitleImport): Promise<void> {
    this._importingSubtitle = true;
    try {
      const result = await runSubtitleImport(pending.mediaId, pending.file, {
        overwrite: pending.overwrite,
      });
      reportSubtitleImportResult(result);

      const track = findImportedSubtitleTrack(result, pending.mediaId);
      if (track) {
        Message.success({ message: msg('字幕已导入') });
        this.controller?.updateCurrentTrackSubtitles(track.segments, { hasSubtitles: true });
        this.dispatchEvent(
          new CustomEvent('subtitle-imported', {
            detail: { mediaId: pending.mediaId, track } satisfies SubtitleImportedDetail,
            bubbles: true,
            composed: true,
          }),
        );
      }
    } catch {
      Message.error({ message: msg('导入字幕失败，请重试') });
    } finally {
      this._importingSubtitle = false;
    }
  }

  private _renderMismatchConfirmModal(): TemplateResult {
    const pending = this._pendingMismatchImport;
    return html`
      <ui-modal
        title="${msg('字幕文件名不一致')}"
        ?open=${this._mismatchConfirmOpen}
        width="420px"
        centered
        ok-text="${msg('仍要导入')}"
        cancel-text="${msg('取消')}"
        ?confirm-loading=${this._importingSubtitle}
        @ok=${() => void this._confirmMismatchImport()}
        @cancel=${this._cancelMismatchImport}
      >
        <p style="margin:0;line-height:1.6">
          ${msg('所选字幕文件名与当前媒体不一致，仍要导入到当前媒体吗？')}
        </p>
        ${pending
          ? html`<p style="margin:var(--space-sm) 0 0;color:var(--color-text-secondary,rgba(0,0,0,0.65));font-size:0.875rem;line-height:1.5">
              ${pending.file.name}
            </p>`
          : nothing}
      </ui-modal>
    `;
  }

  render() {
    const snapshot = this._controllerHost?.snapshot;

    if (!snapshot) {
      return null;
    }

    if (!snapshot.hasSubtitles) {
      return html`
        <div class="surface">
          <div class="empty">
            <p>${msg('当前媒体没有字幕')}</p>
            <div class="empty-actions">
              <ui-button
                variant="primary"
                ?disabled="${this._importingSubtitle || !snapshot.currentItem}"
                @click="${() => this._openSubtitlePicker(false)}"
              >
                <ui-icon name="upload" size="var(--icon-lg)"></ui-icon>
                ${msg('导入字幕')}
              </ui-button>
            </div>
          </div>
          <input type="file" accept=".srt,.lrc" @change="${this._handleSubtitleFile}" />
          ${this._renderMismatchConfirmModal()}
        </div>
      `;
    }

    const hasTranslation = snapshot.segments.some((segment) => segment.translation);
    const keyboardShortcuts = supportsKeyboardShortcuts();
    const subtitlesTitle = snapshot.subtitlesVisible
      ? keyboardShortcuts
        ? msg('隐藏字幕 (C)')
        : msg('隐藏字幕')
      : keyboardShortcuts
        ? msg('显示字幕 (C)')
        : msg('显示字幕');
    const translationTitle = this._translationVisible
      ? keyboardShortcuts
        ? msg('隐藏翻译 (T)')
        : msg('隐藏翻译')
      : keyboardShortcuts
        ? msg('显示翻译 (T)')
        : msg('显示翻译');
    const fullscreenTitle = this._isFullscreen()
      ? keyboardShortcuts
        ? msg('退出全屏 (F)')
        : msg('退出全屏')
      : keyboardShortcuts
        ? msg('全屏 (F)')
        : msg('全屏');

    return html`
      <div class="surface">
        <div class="header title-row">
          <h3 class="title">${msg('字幕')}</h3>
          ${snapshot.hasSubtitles
            ? html`<ui-tooltip title="${msg('更新字幕')}">
                <ui-button
                  variant="ghost"
                  size="small"
                  aria-label="${msg('更新字幕')}"
                  ?disabled="${this._importingSubtitle || !snapshot.currentItem}"
                  @click="${() => this._openSubtitlePicker(true)}"
                >
                  <ui-icon size="var(--icon-md)" name="subtitle"></ui-icon>
                </ui-button>
              </ui-tooltip>`
            : ''}
          ${snapshot.hasSubtitles
            ? html`<ui-tooltip title="${subtitlesTitle}">
                <ui-button
                  variant="ghost"
                  aria-label="${subtitlesTitle}"
                  @click="${this._toggleSubtitles}"
                >
                  <ui-icon
                    size="var(--icon-xl)"
                    name="${snapshot.subtitlesVisible ? 'subtitle-off' : 'subtitle-on'}"
                  ></ui-icon>
                </ui-button>
              </ui-tooltip>`
            : ''}
          ${snapshot.hasSubtitles && snapshot.subtitlesVisible && hasTranslation
            ? html`<ui-tooltip title="${translationTitle}">
                <ui-button
                  variant="ghost"
                  aria-label="${translationTitle}"
                  @click="${() => this.toggleTranslationVisible()}"
                >
                  <ui-icon size="var(--icon-xl)" name="translate"></ui-icon>
                </ui-button>
              </ui-tooltip>`
            : ''}
          ${snapshot.hasSubtitles && snapshot.subtitlesVisible && this.showFullscreenIcon
            ? html`<ui-tooltip title="${fullscreenTitle}">
                <ui-button
                  variant="ghost"
                  aria-label="${fullscreenTitle}"
                  @click="${this._toggleFullscreen}"
                >
                  <ui-icon
                    size="var(--icon-xl)"
                    name="${this._isFullscreen() ? 'fullscreen-exit' : 'fullscreen'}"
                  ></ui-icon>
                </ui-button>
              </ui-tooltip>`
            : ''}
        </div>
        ${!snapshot.subtitlesVisible
          ? html`<div class="hidden-note">${msg('字幕已隐藏')}</div>`
          : this._renderSegmentsList(snapshot)}
        <input type="file" accept=".srt,.lrc" @change="${this._handleSubtitleFile}" />
        ${this._renderMismatchConfirmModal()}
      </div>
    `;
  }

  /** Practice hotkeys / external UI can toggle translation visibility. */
  toggleTranslationVisible(): void {
    const snapshot = this._controllerHost?.snapshot;
    if (!snapshot?.hasSubtitles || !snapshot.subtitlesVisible) {
      return;
    }
    this._translationVisible = !this._translationVisible;
  }

  /**
   * Scroll the active subtitle row into view if needed.
   * No-op when there are no subtitle segments (e.g. shadowing without cues).
   */
  scrollActiveIntoView(): void {
    const snapshot = this._controllerHost?.snapshot;
    if (!snapshot?.hasSubtitles || snapshot.segments.length === 0) {
      return;
    }
    const index = this._getActiveSegmentIndex(snapshot);
    if (index < 0 || index >= snapshot.segments.length) {
      return;
    }
    // Force a pass even when the active index did not change (e.g. shadowing record).
    this._lastScrolledIndex = index;
    this._scrollActiveIntoView(index);
  }

  private _handleSegmentClick(index: number): void {
    if (this.seekDisabled) {
      return;
    }
    this.controller?.seekToSegment(index);
  }

  private _scrollActiveIntoView(index: number): void {
    if (index < 0) {
      return;
    }

    const selector = `[data-segment-index="${index}"]`;

    const scrollTarget = (el: Element | null | undefined) => {
      if (!(el instanceof HTMLElement)) {
        return;
      }
      // Skip when already fully visible (dock + mobile nav accounted for); otherwise center.
      if (this._isElementFullyVisible(el)) {
        return;
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    scrollTarget(this.renderRoot.querySelector(selector));
    scrollTarget(this._overlay?.getPopupEl(selector));
  }

  /** True when `el` is fully inside every clipping ancestor and the clear viewport (minus bottom chrome). */
  private _isElementFullyVisible(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const bottomInset = this._readBottomChromeInset();
    const epsilon = 1;

    // Viewport: session dock covers the mobile bottom nav while a session is active.
    if (
      rect.top < -epsilon ||
      rect.left < -epsilon ||
      rect.bottom > window.innerHeight - bottomInset + epsilon ||
      rect.right > window.innerWidth + epsilon
    ) {
      return false;
    }

    let ancestor = this._parentCrossingRoots(el);
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      const clipsY = SubtitlePanel._overflowClips(style.overflowY);
      const clipsX = SubtitlePanel._overflowClips(style.overflowX);
      if (clipsY || clipsX) {
        const parentRect = ancestor.getBoundingClientRect();
        const top = parentRect.top + ancestor.clientTop;
        const left = parentRect.left + ancestor.clientLeft;
        const bottom = top + ancestor.clientHeight;
        const right = left + ancestor.clientWidth;

        if (
          (clipsY && (rect.top < top - epsilon || rect.bottom > bottom + epsilon)) ||
          (clipsX && (rect.left < left - epsilon || rect.right > right + epsilon))
        ) {
          return false;
        }
      }
      ancestor = this._parentCrossingRoots(ancestor);
    }

    return true;
  }

  /**
   * Bottom obstruction: session dock (covers nav) or mobile nav when no dock.
   * While an echo row is active but CSS inset is not applied yet, reserve the
   * tallest dock floor so scroll-before-dock does not leave the line under the dock.
   */
  private _readBottomChromeInset(): number {
    const dockCss = SubtitlePanel._resolveCssLength(
      getComputedStyle(document.documentElement).getPropertyValue('--session-dock-inset'),
    );
    const nav = SubtitlePanel._resolveCssLength(
      getComputedStyle(this).getPropertyValue('--app-bottom-nav-inset') ||
        getComputedStyle(document.documentElement).getPropertyValue('--app-bottom-nav-inset'),
    );
    const sessionReserve =
      this.reserveSessionDockInset || (this.echoMode && this.echoRecordingSegmentIndex >= 0)
        ? SESSION_DOCK_INSET_PX
        : 0;
    return Math.max(dockCss, sessionReserve, nav);
  }

  /** Resolve a CSS length (incl. `calc` / `env`) to CSS pixels. */
  private static _resolveCssLength(raw: string): number {
    const value = raw.trim();
    if (!value) {
      return 0;
    }
    if (/^-?[\d.]+px$/i.test(value)) {
      return Number.parseFloat(value);
    }
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;padding-bottom:' + value;
    document.body.appendChild(probe);
    const px = Number.parseFloat(getComputedStyle(probe).paddingBottom);
    probe.remove();
    return Number.isFinite(px) ? px : 0;
  }

  private _parentCrossingRoots(el: Element): Element | null {
    if (el.parentElement) {
      return el.parentElement;
    }
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }

  private static _overflowClips(value: string): boolean {
    return value === 'auto' || value === 'scroll' || value === 'hidden' || value === 'overlay';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'subtitle-panel': SubtitlePanel;
  }
}
