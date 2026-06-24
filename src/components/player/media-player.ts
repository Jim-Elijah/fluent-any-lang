import { msg, str, updateWhenLocaleChanges } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import { MediaControllerHost } from '../../controllers/media-controller-host.js';
import type { MediaController } from '../../controllers/media-controller.js';
import { formatTime, MAX_SLEEP_MINUTES, PLAYBACK_RATES } from '../../lib/playback-utils.js';
import '../ui/button.js';

@customElement('media-player')
export class MediaPlayer extends LitElement {
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

    .media-wrap {
      background: #000;
    }

    video,
    audio {
      display: block;
      width: 100%;
    }

    video {
      max-height: 420px;
      object-fit: contain;
    }

    .controls {
      display: grid;
      gap: 14px;
      padding: 16px;
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
    }

    .progress {
      display: grid;
      gap: 6px;
    }

    input[type='range'] {
      width: 100%;
      accent-color: var(--color-primary, #1677ff);
    }

    .time {
      display: flex;
      justify-content: space-between;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.8125rem;
      font-variant-numeric: tabular-nums;
    }

    .transport {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }

    .settings {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }

    label {
      display: grid;
      gap: 6px;
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    select {
      padding: 6px 8px;
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface, #fff);
    }

    .volume {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 8px;
    }

    .sleep-status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: var(--radius-md, 8px);
      background: rgba(22, 119, 255, 0.06);
      color: var(--color-primary, #1677ff);
      font-size: 0.8125rem;
    }

    .sleep-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      align-items: end;
    }
  `;

  @property({ type: Boolean })
  disabled = false;

  @property({ attribute: false })
  controller: MediaController | null = null;

  @query('video')
  private _videoElement?: HTMLVideoElement;

  @query('audio')
  private _audioElement?: HTMLAudioElement;

  @state()
  private _controllerHost: MediaControllerHost | null = null;

  private _boundController: MediaController | null = null;

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  disconnectedCallback(): void {
    this.controller?.detachMediaElement();
    super.disconnectedCallback();
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('controller') && this.controller !== this._boundController) {
      this._boundController = this.controller;
      if (this.controller && !this._controllerHost) {
        this._controllerHost = new MediaControllerHost(this, this.controller);
      }
    }
  }

  protected firstUpdated(): void {
    this._attachMediaElement();
  }

  protected updated(): void {
    this._attachMediaElement();
  }

  render() {
    const snapshot = this._controllerHost?.snapshot;
    if (!snapshot?.currentItem) {
      return html`<div class="surface"><div class="controls">${msg('未选择媒体')}</div></div>`;
    }

    const isVideo = snapshot.currentItem.type === 'video';
    const progressMax = snapshot.duration > 0 ? snapshot.duration : 0;

    return html`
      <div class="surface">
        <div class="media-wrap">
          ${isVideo
            ? html`<video playsinline @click="${this._togglePlay}"></video>`
            : html`<audio></audio>`}
        </div>

        <div class="controls">
          <div class="title-row">
            <h3 class="title">${snapshot.currentItem.title}</h3>
            <ui-button variant="ghost" @click="${this._toggleSubtitles}">
              ${snapshot.subtitlesVisible ? msg('隐藏字幕') : msg('显示字幕')}
            </ui-button>
          </div>

          <div class="progress">
            <input
              type="range"
              min="0"
              max="${progressMax}"
              step="0.1"
              .value="${String(snapshot.currentTime)}"
              @input="${this._handleSeekInput}"
            />
            <div class="time">
              <span>${formatTime(snapshot.currentTime)}</span>
              <span>${formatTime(snapshot.duration)}</span>
            </div>
          </div>

          <div class="transport">
            <ui-button
              variant="secondary"
              ?disabled="${!snapshot.canPreviousTrack || this.disabled}"
              @click="${this._previousTrack}"
            >
              ${msg('上一首')}
            </ui-button>
            <ui-button
              variant="secondary"
              ?disabled="${!snapshot.hasSubtitles || this.disabled}"
              @click="${this._previousSegment}"
            >
              ${msg('上一句')}
            </ui-button>
            <ui-button variant="primary" @click="${this._togglePlay}">
              ${snapshot.isPlaying ? msg('暂停') : msg('播放')}
            </ui-button>
            <ui-button
              variant="secondary"
              ?disabled="${!snapshot.hasSubtitles || !snapshot.canNextSegment || this.disabled}"
              @click="${this._nextSegment}"
            >
              ${msg('下一句')}
            </ui-button>
            <ui-button
              variant="secondary"
              ?disabled="${!snapshot.canNextTrack || this.disabled}"
              @click="${this._nextTrack}"
            >
              ${msg('下一首')}
            </ui-button>
          </div>

          <div class="settings">
            <label>
              ${msg('循环模式')}
              <select .value="${snapshot.loopMode}" @change="${this._handleLoopModeChange}">
                <option value="none">${msg('不循环')}</option>
                <option value="single">${msg('单曲循环')}</option>
                <option value="segment" ?disabled="${!snapshot.hasSubtitles}">
                  ${msg('单句循环')}
                </option>
                <option value="list">${msg('列表循环')}</option>
                <option value="shuffle">${msg('随机播放')}</option>
              </select>
            </label>

            <label>
              ${msg('倍速')}
              <select .value="${String(snapshot.playbackRate)}" @change="${this._handleRateChange}">
                ${PLAYBACK_RATES.map((rate) => html` <option value="${rate}">${rate}x</option> `)}
              </select>
            </label>

            <label class="volume">
              ${msg('音量')}
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                .value="${String(snapshot.volume)}"
                @input="${this._handleVolumeChange}"
              />
            </label>
          </div>

          <div class="sleep-row">
            <label>
              ${msg('睡眠模式')}
              <select .value="${snapshot.sleepMode}" @change="${this._handleSleepModeChange}">
                <option value="off">${msg('关闭')}</option>
                <option value="minutes">${msg('定时暂停')}</option>
                <option value="until-end">${msg('播完本集暂停')}</option>
              </select>
            </label>

            ${snapshot.sleepMode === 'minutes'
              ? html`
                  <label>
                    ${msg(str`定时（0–${MAX_SLEEP_MINUTES} 分钟）`)}
                    <input
                      type="range"
                      min="0"
                      max="${MAX_SLEEP_MINUTES}"
                      step="1"
                      .value="${String(snapshot.sleepMinutes)}"
                      @input="${this._handleSleepMinutesChange}"
                    />
                    <span>${snapshot.sleepMinutes} ${msg('分钟')}</span>
                  </label>
                `
              : null}
          </div>

          ${snapshot.sleepActive
            ? html`
                <div class="sleep-status">
                  <span>
                    ${snapshot.sleepMode === 'minutes'
                      ? msg(str`将在 ${formatTime(snapshot.sleepRemainingSeconds)} 后暂停`)
                      : msg('将在当前集播放结束后暂停')}
                  </span>
                  <ui-button variant="ghost" @click="${this._cancelSleep}"
                    >${msg('取消')}</ui-button
                  >
                </div>
              `
            : null}
        </div>
      </div>
    `;
  }

  private _handleLoopModeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.controller?.setLoopMode(
      select.value as 'none' | 'single' | 'segment' | 'list' | 'shuffle',
    );
  }

  private _attachMediaElement(): void {
    if (!this.controller) {
      return;
    }

    const element = this._videoElement ?? this._audioElement;
    if (element) {
      this.controller.attachMediaElement(element);
    }
  }

  private _togglePlay(): void {
    void this.controller?.togglePlay();
  }

  private _previousTrack(): void {
    this.controller?.previousTrack();
  }

  private _nextTrack(): void {
    this.controller?.nextTrack();
  }

  private _previousSegment(): void {
    this.controller?.previousSegment();
  }

  private _nextSegment(): void {
    this.controller?.nextSegment();
  }

  private _toggleSubtitles(): void {
    const snapshot = this._controllerHost?.snapshot;
    if (!snapshot) {
      return;
    }
    this.controller?.setSubtitlesVisible(!snapshot.subtitlesVisible);
  }

  private _handleSeekInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.controller?.seek(Number(input.value));
  }

  private _handleRateChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.controller?.setPlaybackRate(Number(select.value));
  }

  private _handleVolumeChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.controller?.setVolume(Number(input.value));
  }

  private _handleSleepModeChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.controller?.setSleepMode(select.value as 'off' | 'minutes' | 'until-end');
  }

  private _handleSleepMinutesChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.controller?.setSleepMinutes(Number(input.value));
  }

  private _cancelSleep(): void {
    this.controller?.cancelSleep();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'media-player': MediaPlayer;
  }
}
