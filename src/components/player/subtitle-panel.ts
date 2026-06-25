import { msg, updateWhenLocaleChanges } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { MediaControllerHost } from '../../controllers/media-controller-host.js';
import type { MediaController } from '../../controllers/media-controller.js';
import { formatTime } from '../../lib/playback-utils.js';

@customElement('subtitle-panel')
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

    .list {
      max-height: 360px;
      overflow-y: auto;
      margin: 0;
      padding: 8px 0;
      list-style: none;
    }

    .segment {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 12px;
      align-items: start;
      padding: 10px 16px;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .segment:hover {
      background: rgba(22, 119, 255, 0.04);
    }

    .segment.active {
      background: rgba(22, 119, 255, 0.1);
      border-left: 3px solid var(--color-primary, #1677ff);
      padding-left: 13px;
    }

    .time {
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .text {
      margin: 0;
      line-height: 1.6;
      white-space: pre-wrap;
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
  `;

  @property({ attribute: false })
  controller: MediaController | null = null;

  @state()
  private _controllerHost: MediaControllerHost | null = null;

  @state()
  private _lastScrolledIndex = -1;

  private _boundController: MediaController | null = null;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
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

  protected updated(): void {
    const index = this._controllerHost?.snapshot.currentSegmentIndex ?? -1;
    if (index !== this._lastScrolledIndex) {
      this._lastScrolledIndex = index;
      this._scrollActiveIntoView(index);
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
          <div class="empty">${msg('当前媒体没有字幕')}</div>
        </div>
      `;
    }

    if (!snapshot.subtitlesVisible) {
      return html`
        <div class="surface">
          <div class="hidden-note">${msg('字幕已隐藏')}</div>
        </div>
      `;
    }

    return html`
      <div class="surface">
        <div class="header">${msg('字幕')}</div>
        <ul class="list">
          ${snapshot.segments.map(
            (segment, index) => html`
              <li
                class="segment ${index === snapshot.currentSegmentIndex ? 'active' : ''}"
                data-segment-index="${index}"
                @click="${() => this._handleSegmentClick(index)}"
              >
                <span class="time">${formatTime(segment.startTime)}</span>
                <p class="text">${segment.text}</p>
              </li>
            `,
          )}
        </ul>
      </div>
    `;
  }

  private _handleSegmentClick(index: number): void {
    this.controller?.seekToSegment(index);
  }

  private _scrollActiveIntoView(index: number): void {
    if (index < 0) {
      return;
    }

    const element = this.renderRoot.querySelector(`[data-segment-index="${index}"]`);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'subtitle-panel': SubtitlePanel;
  }
}
