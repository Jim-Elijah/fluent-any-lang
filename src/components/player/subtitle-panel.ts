import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { MediaControllerHost } from '../../controllers/media-controller-host.js';
import type {
  MediaController,
  MediaControllerSnapshot,
} from '../../controllers/media-controller.js';
import { importSubtitleForMedia } from '../../lib/import-content.js';
import { formatTime } from '../../lib/playback-utils.js';
import { supportsKeyboardShortcuts } from '../../lib/hotkeys/index.js';
import type { PracticeRecord, SubtitleSegment, SubtitleTrack } from '../../types/models.js';
import '../ui/button.js';
import '../ui/icon.js';
import '../ui/tooltip.js';
import { Message } from '../ui/message.js';
import { isControlledOpen } from '../ui/internal/controlled-state.js';
import { OverlayController } from '../ui/internal/overlay-controller.js';
import { Z_INDEX } from '../ui/internal/z-index.js';

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
      /* Keep active rows clear of the session dock on any scroll container. */
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

  @property({ type: Number })
  echoRecordingSegmentIndex = -1;

  /**
   * True while Echo is preparing/stopping a clip. Disables starting other rows;
   * the active row stays enabled so cancel remains available.
   */
  @property({ type: Boolean })
  echoBusy = false;

  @property({ type: Boolean })
  recordingSupported = true;

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
      (this.echoBusy && !isActiveRow) ||
      (this.echoRecordingSegmentIndex >= 0 && !isActiveRow) ||
      (!isActiveRow && atLimit);
    const tip = isActiveRow
      ? msg('停止')
      : atLimit
        ? msg(str`该句录音已达上限（${this.echoLimitPerSegment}条），删除旧录音后可继续。`)
        : !this.recordingSupported
          ? msg('当前浏览器不支持录音。')
          : msg('跟读');
    // Keep tip when disabled due to limit / unsupported; hide when another row is recording.
    const tipDisabled = disabled && !atLimit && this.recordingSupported;

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

  private _openSubtitlePicker(): void {
    const input = this.renderRoot.querySelector('input[type="file"]') as HTMLInputElement | null;
    input?.click();
  }

  private async _handleSubtitleFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    const mediaId = this._controllerHost?.snapshot?.currentItem?.id;
    if (!file || !mediaId) {
      return;
    }

    this._importingSubtitle = true;
    try {
      const result = await importSubtitleForMedia(mediaId, file);

      for (const error of result.errors) {
        Message.error({ message: `${error.filename}: ${error.message}` });
      }
      for (const warning of result.warnings) {
        Message.warning({ message: `${warning.filename}: ${warning.message}` });
      }
      for (const skipped of result.skipped) {
        Message.info({ message: `${skipped.filename}: ${skipped.message}` });
      }
      if (result.conflicts.length > 0) {
        Message.info({
          message: result.conflicts[0]?.message ?? msg('该媒体已有不同内容的字幕'),
        });
      }

      const track = result.imported.find(
        (item): item is SubtitleTrack => 'segments' in item && item.mediaId === mediaId,
      );
      if (track) {
        Message.success({ message: msg('字幕已导入') });
        this.controller?.updateCurrentTrackSubtitles(track.segments, { hasSubtitles: true });
        this.dispatchEvent(
          new CustomEvent('subtitle-imported', {
            detail: { mediaId, track } satisfies SubtitleImportedDetail,
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
                @click="${this._openSubtitlePicker}"
              >
                <ui-icon name="upload" size="var(--icon-lg)"></ui-icon>
                ${msg('导入字幕')}
              </ui-button>
            </div>
          </div>
          <input type="file" accept=".srt,.lrc" @change="${this._handleSubtitleFile}" />
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
    const block = this.echoMode && this.echoRecordingSegmentIndex >= 0 ? 'nearest' : 'center';
    this.renderRoot.querySelector(selector)?.scrollIntoView({ block, behavior: 'smooth' });
    this._overlay?.getPopupEl(selector)?.scrollIntoView({ block, behavior: 'smooth' });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'subtitle-panel': SubtitlePanel;
  }
}
