import { msg, localized } from '@lit/localize';
import { css, html, LitElement, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { MediaControllerHost } from '../../controllers/media-controller-host.js';
import type {
  MediaController,
  MediaControllerSnapshot,
} from '../../controllers/media-controller.js';
import { formatTime } from '../../lib/playback-utils.js';
import '../ui/button.js';
import '../ui/icon.js';
import '../ui/tooltip.js';
import { isControlledOpen } from '../ui/internal/controlled-state.js';
import { OverlayController } from '../ui/internal/overlay-controller.js';

export type SubtitlePanelFullscreenChangeDetail = {
  fullscreen: boolean;
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
    gap: 12px;
    padding: 12px 16px;
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
    max-height: 360px;
    overflow-y: auto;
    margin: 0;
    padding: 8px 0;
    list-style: none;
  }

  .list.fullscreen {
    flex: 1;
    max-height: none;
  }

  .segment {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 6px 16px;
    cursor: pointer;
    transition: background-color 0.15s ease;
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
    padding-left: 13px;
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
  }

  .translation {
    font-weight: 400;
  }

  .translation.hidden {
    display: none;
  }

  @media (max-width: 767px) {
    .content {
      align-items: flex-start;
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
      padding: 12px 16px;
      border-bottom: 1px solid var(--color-border, #d9d9d9);
      font-size: 0.9375rem;
      font-weight: 600;
    }
    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
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
      max-height: 360px;
      overflow-y: auto;
      margin: 0;
      padding: 8px 0;
      list-style: none;
    }

    .segment {
      display: flex;
      gap: 4px;
      align-items: center;
      padding: 6px 16px;
      cursor: pointer;
      transition: background-color 0.15s ease;
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
      padding-left: 13px;
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
    }

    .translation {
      font-weight: 400;
    }

    .translation.hidden {
      display: none;
    }

    .empty {
      padding: 24px 16px;
      text-align: center;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .hidden-note {
      padding: 24px 16px;
      text-align: center;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    @media (max-width: 767px) {
      .content {
        align-items: flex-start;
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
  zIndex = 1500;

  @property()
  popupContainer: string | HTMLElement | null = 'body';

  @state()
  private _controllerHost: MediaControllerHost | null = null;

  @state()
  private _lastScrolledIndex = -1;

  @state()
  private _translationVisible = false;

  @state()
  private _internalFullscreen = false;

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

  protected updated(changed: PropertyValues): void {
    const index = this._controllerHost?.snapshot.currentSegmentIndex ?? -1;
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
    return html`<ul class="${listClass}">
      ${snapshot.segments.map(
        (segment, index) => html`
          <li
            class="segment ${index === snapshot.currentSegmentIndex ? 'active' : ''}"
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
          </li>
        `,
      )}
    </ul>`;
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
            <ui-button variant="ghost" @click="${() => this._setFullscreen(false)}">
              <span class="close-icon" title="${msg('退出全屏')}">
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    fill="none"
                  ></path>
                </svg>
              </span>
            </ui-button>
          </div>
          ${this._renderSegmentsList(snapshot, 'list fullscreen')}
        </div>
      </div>
    `;
  }

  private _toggleSubtitles(): void {
    const snapshot = this._controllerHost?.snapshot;
    if (!snapshot) {
      return;
    }
    this.controller?.setSubtitlesVisible(!snapshot.subtitlesVisible);
  }

  render() {
    const snapshot = this._controllerHost?.snapshot;

    if (!snapshot) {
      return null;
    }

    if (!snapshot.hasSubtitles) {
      return html`
        <div class="surface">
          <div class="empty">${msg('当前媒体没有字幕')}</div>
        </div>
      `;
    }

    const hasTranslation = snapshot.segments.some((segment) => segment.translation);

    return html`
      <div class="surface">
        <div class="header title-row">
          <h3 class="title">${msg('字幕')}</h3>
          ${snapshot.hasSubtitles
            ? html`<ui-tooltip
                title="${snapshot.subtitlesVisible ? msg('隐藏字幕') : msg('显示字幕')}"
              >
                <ui-button
                  variant="ghost"
                  aria-label="${snapshot.subtitlesVisible ? msg('隐藏字幕') : msg('显示字幕')}"
                  @click="${this._toggleSubtitles}"
                >
                  <ui-icon
                    size="20px"
                    name="${snapshot.subtitlesVisible ? 'subtitle-off' : 'subtitle'}"
                  ></ui-icon>
                </ui-button>
              </ui-tooltip>`
            : ''}
          ${snapshot.hasSubtitles && snapshot.subtitlesVisible && hasTranslation
            ? html`<ui-tooltip
                title="${this._translationVisible ? msg('隐藏翻译') : msg('显示翻译')}"
              >
                <ui-button
                  variant="ghost"
                  aria-label="${this._translationVisible ? msg('隐藏翻译') : msg('显示翻译')}"
                  @click="${this._toggleTranslationVisible}"
                >
                  <ui-icon size="20px" name="translate"></ui-icon>
                </ui-button>
              </ui-tooltip>`
            : ''}
          ${snapshot.hasSubtitles && snapshot.subtitlesVisible && this.showFullscreenIcon
            ? html`<ui-tooltip title="${this._isFullscreen() ? msg('退出全屏') : msg('全屏')}">
                <ui-button
                  variant="ghost"
                  aria-label="${this._isFullscreen() ? msg('退出全屏') : msg('全屏')}"
                  @click="${this._toggleFullscreen}"
                >
                  <ui-icon size="20px" name="sort"></ui-icon>
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

  private _toggleTranslationVisible(): void {
    this._translationVisible = !this._translationVisible;
  }

  private _handleSegmentClick(index: number): void {
    this.controller?.seekToSegment(index);
  }

  private _scrollActiveIntoView(index: number): void {
    if (index < 0) {
      return;
    }

    const selector = `[data-segment-index="${index}"]`;
    this.renderRoot
      .querySelector(selector)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this._overlay?.getPopupEl(selector)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'subtitle-panel': SubtitlePanel;
  }
}
