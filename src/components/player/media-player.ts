import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import { MediaControllerHost } from '../../controllers/media-controller-host.js';
import type {
  MediaController,
  MediaControllerSnapshot,
} from '../../controllers/media-controller.js';
import { formatTime, FORWARDED_MEDIA_EVENTS, MAX_SLEEP_MINUTES } from '../../lib/playback-utils.js';
import '../ui/button.js';
import '../ui/slider.js';
import '../ui/tooltip.js';
import '../ui/select.js';
import '../ui/icon.js';
import { MediaControlsConfig, MediaPlayerMode } from '../../types/index.js';
import { SelectChangeDetail } from '../ui/select.js';

// @TODO apply default config
const defaultControlConfig: MediaControlsConfig = {
  loopMode: true,
  sleepMode: true,
  pauseMode: true,
  playPause: true,
  volume: true,
  playbackRate: true,
  progress: true,
  previousNextTrack: true,
  previousNextSegment: false,
  switchMode: false,
};

@customElement('media-player')
@localized()
export class MediaPlayer extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    /* Fixed Mode */
    :host([mode='fixed']) {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.08);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    :host([mode='fixed'][collapsed]) {
      transform: translateY(100%);
    }

    /* Mini Mode */
    :host([mode='mini']) {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 1000;
    }

    .surface {
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #e8e8e8);
      border-radius: var(--radius-md, 8px);
      box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.05));
      overflow: hidden;
      position: relative;
    }

    :host([mode='fixed']) .surface {
      border-radius: 0;
      border-left: none;
      border-right: none;
      border-bottom: none;
    }

    /* APlayer-like body layout */
    .player-body {
      position: relative;
      display: flex;
      align-items: stretch;
      /* height: 72px; */
    }

    /* Cover / Picture */
    .pic-wrap {
      position: relative;
      width: 72px;
      height: 72px;
      background: #eee;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      overflow: hidden;
    }

    .cover-art {
      width: 100%;
      height: 100%;
      background-size: cover;
      background-position: center;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #666);
      transition: transform 0.3s ease;
    }

    .pic-wrap:hover .cover-art {
      transform: scale(1.05);
    }

    /* Play overlay on hover */
    .play-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      color: #fff;
      transition: opacity 0.2s ease;
    }

    .pic-wrap:hover .play-overlay {
      opacity: 1;
    }

    /* Info Column */
    .info-wrap {
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 8px 16px;
      overflow: hidden;
    }

    .info-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 2px;
      gap: 12px;
    }

    .title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--color-text, #333);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex-grow: 1;
    }

    .time-display {
      font-size: 0.75rem;
      color: var(--color-text-secondary, #666);
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }

    .time-separator {
      margin: 0 2px;
      opacity: 0.7;
    }

    /* Progress bar */
    .progress-bar-wrap {
      margin: 2px 0 6px 0;
    }

    /* Control row containing buttons */
    .control-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .nav-buttons {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .action-buttons {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    /* Volume control */
    .volume-control {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 72px;
    }

    .volume-slider {
      flex-grow: 1;
    }

    /* Settings toggle active state */
    .settings-toggle-btn.active {
      color: var(--color-primary, #1677ff);
    }

    /* Settings Panel styling */
    .settings-panel {
      height: 0;
      overflow: hidden;
    }

    .settings-panel.expanded {
      height: auto;
      border-top: 1px solid var(--color-border, #e8e8e8);
      padding: 12px 16px;
      overflow-y: auto;
    }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px 20px;
    }

    .setting-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .setting-label {
      font-size: 0.75rem;
      color: var(--color-text-secondary, #666);
    }

    /* Fixed Switcher arrow handle */
    .fixed-switcher {
      position: absolute;
      top: -20px;
      right: 20px;
      width: 40px;
      height: 20px;
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #e8e8e8);
      border-bottom: none;
      border-radius: 4px 4px 0 0;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.04);
      z-index: 1001;
    }

    /* Mini Player */
    .mini-player {
      position: relative;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      box-shadow: var(--shadow-md, 0 4px 10px rgba(0, 0, 0, 0.1));
      cursor: pointer;
      overflow: visible;
    }

    .mini-cover {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background-size: cover;
      background-position: center;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #666);
      position: relative;
      overflow: hidden;
    }

    .mini-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.3;
      color: #fff;
      transition: opacity 0.2s ease;
      border-radius: 50%;
    }

    .mini-player:hover .mini-overlay {
      opacity: 1;
    }

    .mini-expand-btn {
      position: absolute;
      top: 6px;
      right: 6px;
      font-size: 10px;
      line-height: 1;
      opacity: 0.7;
      user-select: none;
    }

    .mini-expand-btn:hover {
      opacity: 1;
      transform: scale(1.1);
    }

    .progress-ring {
      position: absolute;
      top: 0;
      left: 0;
      transform: rotate(-90deg);
      pointer-events: none;
    }

    .progress-ring__circle {
      transition: stroke-dashoffset 0.1s linear;
    }

    .sleep-status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 16px;
      border-top: 1px solid var(--color-border, #e8e8e8);
      background: rgba(22, 119, 255, 0.05);
      color: var(--color-primary, #1677ff);
      font-size: 0.75rem;
    }

    .media-wrap.is-video {
      background: #000;
      border-radius: var(--radius-md, 8px) var(--radius-md, 8px) 0 0;
      overflow: hidden;
    }

    video {
      display: block;
      width: 100%;
      max-height: 420px;
      object-fit: contain;
    }

    audio {
      display: none;
    }

    :host([mode='fixed']) .media-wrap.is-video {
      position: fixed;
      bottom: 82px;
      left: 16px;
      width: 280px;
      height: 158px;
      border-radius: var(--radius-md, 8px);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      background: #000;
      z-index: 1000;
    }

    :host([mode='fixed'][collapsed]) .media-wrap.is-video {
      display: none;
    }

    :host([mode='mini']) .media-wrap {
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
      pointer-events: none;
      overflow: hidden;
    }
  `;

  @property({ type: String, reflect: true })
  mode: MediaPlayerMode = 'normal';

  @property({ type: Object })
  controlsConfig: MediaControlsConfig = defaultControlConfig;

  @property({ type: Boolean })
  disabled = false;

  @property({ attribute: false })
  controller: MediaController | null = null;

  @property({ type: Boolean, reflect: true })
  collapsed = false;

  @query('video')
  private _videoElement?: HTMLVideoElement;

  @query('audio')
  private _audioElement?: HTMLAudioElement;

  @state()
  private _controllerHost: MediaControllerHost | null = null;

  @state()
  private _showSettings = false;

  private _boundController: MediaController | null = null;
  private _lastVolume = 1;

  disconnectedCallback(): void {
    this.controller?.detachMediaElement();
    super.disconnectedCallback();
  }

  resetSettings(): void {
    this.controller?.resetSettings();
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('controller') && this.controller !== this._boundController) {
      if (this._boundController) {
        this._unbindControllerEvents(this._boundController);
      }
      this._boundController = this.controller;
      if (this.controller) {
        this._bindControllerEvents(this.controller);
        if (!this._controllerHost) {
          this._controllerHost = new MediaControllerHost(this, this.controller);
        }
      }
    }
  }

  private _bindControllerEvents(ctrl: MediaController) {
    for (const evtName of FORWARDED_MEDIA_EVENTS) {
      ctrl.addEventListener(evtName, this._forwardEvent);
    }
  }

  private _unbindControllerEvents(ctrl: MediaController) {
    for (const evtName of FORWARDED_MEDIA_EVENTS) {
      ctrl.addEventListener(evtName, this._forwardEvent);
    }
  }

  private _forwardEvent = (e: Event) => {
    this.dispatchEvent(
      new CustomEvent(e.type, {
        detail: (e as CustomEvent).detail,
        bubbles: true,
        composed: true,
      }),
    );
  };

  protected firstUpdated(): void {
    this._attachMediaElement();
  }

  protected updated(): void {
    this._attachMediaElement();
  }

  private _setMode(newMode: MediaPlayerMode): void {
    this.mode = newMode;
    this.dispatchEvent(
      new CustomEvent('mode-change', {
        detail: { mode: newMode },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _cycleMode(): void {
    if (this.mode === 'normal') {
      this._setMode('fixed');
      return;
    }
    if (this.mode === 'fixed') {
      this._setMode('mini');
      return;
    }
    this._setMode('normal');
  }

  private _expandFromMini(e: Event): void {
    e.stopPropagation();
    this._cycleMode();
  }

  private _toggleFixedCollapse(): void {
    this.collapsed = !this.collapsed;
  }

  private _toggleSettings(): void {
    this._showSettings = !this._showSettings;
  }

  private _toggleMute(): void {
    if (!this.controller) return;
    const vol = this._controllerHost?.snapshot?.volume ?? 1;
    if (vol > 0) {
      this._lastVolume = vol;
      this.controller.setVolume(0);
    } else {
      this.controller.setVolume(this._lastVolume);
    }
  }

  render() {
    const snapshot: MediaControllerSnapshot | undefined = this._controllerHost?.snapshot;

    if (!snapshot?.currentItem) {
      return html`<div class="surface">
        <div
          class="player-body"
          style="justify-content: center; align-items: center; font-size: 0.875rem; color: var(--color-text-secondary);"
        >
          ${msg('未选择媒体')}
        </div>
      </div>`;
    }

    const isVideo = snapshot.currentItem.type === 'video';
    const progressMax = snapshot.duration > 0 ? snapshot.duration : 0;

    if (this.mode === 'mini') {
      const progressPercent = snapshot.duration > 0 ? snapshot.currentTime / snapshot.duration : 0;
      const radius = 22;
      const circumference = 2 * Math.PI * radius;
      const strokeDashoffset = circumference * (1 - progressPercent);

      return html`
        <div class="surface mini-player" title="${snapshot.currentItem.title}">
          <!-- Hidden media tags so standard flow works -->
          <div class="media-wrap">
            ${isVideo
              ? html`<video playsinline @click="${this._togglePlay}"></video>`
              : html`<audio></audio>`}
          </div>
          <div
            class="mini-cover"
            style="background-image: url(${snapshot.currentItem.cover || ''});"
          >
            ${!snapshot.currentItem.cover
              ? html`<ui-icon name="${isVideo ? 'video' : 'audio'}" size="20px"></ui-icon>`
              : ''}
            <div class="mini-overlay">
              <ui-icon
                name="${snapshot.isPlaying ? 'pause' : 'play'}"
                size="18px"
                @click="${this._togglePlay}"
              ></ui-icon>
              ${this.controlsConfig.switchMode
                ? html`<div
                    class="mini-expand-btn"
                    title="${msg('展开播放器')}"
                    @click="${this._expandFromMini}"
                  >
                    ⛶
                  </div>`
                : ''}
            </div>
          </div>
          <svg class="progress-ring" width="50" height="50">
            <circle
              class="progress-ring__circle"
              stroke="var(--color-primary, #1677ff)"
              stroke-width="3"
              fill="transparent"
              r="${radius}"
              cx="25"
              cy="25"
              style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset};"
            />
          </svg>
        </div>
      `;
    }

    const showSegments = this.controlsConfig.previousNextSegment && snapshot.hasSubtitles;
    const showLoopMode = this.controlsConfig.loopMode;
    const showPauseMode = this.controlsConfig.pauseMode && snapshot.hasSubtitles;

    return html`
      <div class="surface">
        ${this.mode === 'normal'
          ? html` <div class="media-wrap ${isVideo ? 'is-video' : 'is-audio'}">
              ${isVideo
                ? html`<video playsinline @click="${this._togglePlay}"></video>`
                : html`<audio></audio>`}
            </div>`
          : html` <!-- For fixed mode: video is floated, audio is hidden -->
              <div class="media-wrap ${isVideo ? 'is-video' : 'is-audio'}">
                ${isVideo
                  ? html`<video playsinline @click="${this._togglePlay}"></video>`
                  : html`<audio></audio>`}
              </div>`}

        <div class="player-body">
          <!-- Cover Left -->
          ${snapshot.currentItem.cover
            ? html`<div class="pic-wrap" @click="${this._togglePlay}">
                <div
                  class="cover-art"
                  style="background-image: url(${snapshot.currentItem.cover || ''});"
                >
                  ${!snapshot.currentItem.cover
                    ? html`<ui-icon name="${isVideo ? 'video' : 'audio'}" size="22px"></ui-icon>`
                    : ''}
                  <div class="play-overlay">
                    <ui-icon name="${snapshot.isPlaying ? 'pause' : 'play'}" size="20px"></ui-icon>
                  </div>
                </div>
              </div>`
            : ''}

          <!-- Info / Progress / Controls Column -->
          <div class="info-wrap">
            <div class="info-header">
              <h3 class="title">${snapshot.currentItem.title}</h3>
              <div class="time-display">
                <span class="current">${formatTime(snapshot.currentTime)}</span>
                <span class="time-separator">/</span>
                <span class="duration">${formatTime(snapshot.duration)}</span>
              </div>
            </div>

            <!-- Progress bar -->
            <div class="progress-bar-wrap">
              <ui-slider
                ?disabled="${this.disabled}"
                .value="${String(snapshot.currentTime)}"
                min="0"
                max="${progressMax}"
                step="0.1"
                .tooltip=${{ open: false }}
                @change=${this._handleSeekInput}
              ></ui-slider>
            </div>

            <!-- Buttons Row -->
            <div class="control-row">
              <div class="nav-buttons">
                ${this.controlsConfig.previousNextTrack
                  ? html`<ui-icon
                      name="previous"
                      title="${msg('上一首')}"
                      size="18px"
                      ?disabled="${!snapshot.canPreviousTrack || this.disabled}"
                      @click="${this._previousTrack}"
                    ></ui-icon>`
                  : ''}
                ${showSegments
                  ? html`<ui-icon
                      name="backward"
                      title="${msg('上一句')}"
                      size="18px"
                      ?disabled="${!snapshot.canPreviousSegment || this.disabled}"
                      @click="${this._previousSegment}"
                    ></ui-icon>`
                  : ''}
                ${this.controlsConfig.playPause
                  ? html`<ui-icon
                      name="${snapshot.isPlaying ? 'pause' : 'play'}"
                      title="${snapshot.isPlaying ? msg('暂停') : msg('播放')}"
                      size="20px"
                      ?disabled="${this.disabled}"
                      @click="${this._togglePlay}"
                    ></ui-icon>`
                  : ''}
                ${showSegments
                  ? html`<ui-icon
                      name="forward"
                      title="${msg('下一句')}"
                      size="18px"
                      ?disabled="${!snapshot.canNextSegment || this.disabled}"
                      @click="${this._nextSegment}"
                    ></ui-icon>`
                  : ''}
                ${this.controlsConfig.previousNextTrack
                  ? html`<ui-icon
                      name="next"
                      title="${msg('下一首')}"
                      size="18px"
                      ?disabled="${!snapshot.canNextTrack || this.disabled}"
                      @click="${this._nextTrack}"
                    ></ui-icon>`
                  : ''}
              </div>

              <div class="action-buttons">
                <!-- Volume slider always visible but compact -->
                ${this.controlsConfig.volume
                  ? html`
                      <div class="volume-control">
                        <ui-icon
                          name="${snapshot.volume === 0 ? 'volume-close' : 'volume'}"
                          size="16px"
                          @click="${this._toggleMute}"
                        ></ui-icon>
                        <ui-slider
                          class="volume-slider"
                          ?disabled="${this.disabled}"
                          .value=${Number(snapshot.volume)}
                          min="0"
                          max="1"
                          step="0.01"
                          .tooltip=${{
                            formatter: (v: number) => `${Number((v * 100).toFixed(0))}%`,
                            placement: 'top',
                          }}
                          @change=${this._handleVolumeChange}
                        ></ui-slider>
                      </div>
                    `
                  : ''}

                <!-- Settings drawer button -->
                <ui-icon
                  name="setting"
                  class="settings-toggle-btn ${this._showSettings ? 'active' : ''}"
                  title="${msg('高级设置')}"
                  size="18px"
                  @click="${this._toggleSettings}"
                ></ui-icon>

                <!-- Change Mode button -->
                ${this.controlsConfig.switchMode
                  ? html`<ui-icon
                      name="media"
                      title="${msg('切换模式')}"
                      size="18px"
                      @click="${this._cycleMode}"
                    ></ui-icon> `
                  : ''}
              </div>
            </div>
          </div>

          <!-- Fixed switcher toggle (only in fixed mode) -->
          <!-- @fixeme fixed模式 没有显示icon -->
          ${this.mode === 'fixed'
            ? html` <div class="fixed-switcher" @click="${this._toggleFixedCollapse}">
                <ui-icon
                  name="${this.collapsed ? 'play' : 'pause'}"
                  size="14px"
                  style="transform: rotate(90deg);"
                ></ui-icon>
              </div>`
            : ''}
        </div>

        <!-- Collapsible Settings Panel -->
        <div class="settings-panel ${this._showSettings ? 'expanded' : ''}">
          <div class="settings-grid">
            ${showLoopMode
              ? html`<div class="setting-item">
                  <span class="setting-label">${msg('循环模式')}</span>
                  <ui-select
                    ?disabled="${this.disabled}"
                    .value=${snapshot.loopMode}
                    .options=${[
                      { value: 'none', label: msg('关闭') },
                      { value: 'single', label: msg('单曲循环') },
                      {
                        value: 'segment',
                        label: msg('单句循环'),
                        disabled: !snapshot.hasSubtitles,
                      },
                      { value: 'list', label: msg('列表循环') },
                      { value: 'shuffle', label: msg('随机播放') },
                    ]}
                    @change=${this._handleLoopModeChange}
                  ></ui-select>
                </div>`
              : ''}
            ${this.controlsConfig.playbackRate
              ? html`<div class="setting-item">
                  <span class="setting-label"
                    >${msg(str`倍速（${Number(snapshot.playbackRate).toFixed(1)}x）`)}</span
                  >
                  <ui-slider
                    ?disabled="${this.disabled}"
                    .value=${Number(snapshot.playbackRate)}
                    min="0.1"
                    max="4"
                    step="0.1"
                    .marks=${{
                      0.5: '0.5',
                      1: '1',
                      1.5: '1.5',
                      2: '2',
                      3: '3',
                      4: '4',
                    }}
                    .tooltip=${{
                      formatter: (v: number) => `${v.toFixed(1)}x`,
                      placement: 'top',
                    }}
                    @change=${this._handleRateChange}
                  ></ui-slider>
                </div>`
              : ''}
            ${showPauseMode
              ? html`
                  <div class="setting-item">
                    <span class="setting-label">${msg('单句暂停模式')}</span>
                    <ui-select
                      ?disabled="${this.disabled}"
                      .value=${snapshot.pauseMode}
                      .options=${[
                        { value: 'off', label: msg('关闭') },
                        { value: 'seconds', label: msg('固定时长') },
                        {
                          value: 'percentage',
                          label: msg('句长百分比'),
                        },
                      ]}
                      @change=${this._handlePauseModeChange}
                    ></ui-select>
                  </div>
                  ${snapshot.pauseMode === 'seconds'
                    ? html`
                        <div class="setting-item">
                          <span class="setting-label"
                            >${msg(str`固定时长（${Number(snapshot.pauseSeconds)}秒）`)}</span
                          >
                          <ui-slider
                            ?disabled="${this.disabled}"
                            .value=${Number(snapshot.pauseSeconds)}
                            min="1"
                            max="30"
                            step="1"
                            .marks=${{
                              1: '1',
                              3: '3',
                              5: '5',
                              10: '10',
                              30: '30',
                            }}
                            .tooltip=${{
                              formatter: (v: number) => `${v} ${msg('秒')}`,
                              placement: 'top',
                            }}
                            @change=${this._handlePauseSecondsChange}
                          ></ui-slider>
                        </div>
                      `
                    : null}
                  ${snapshot.pauseMode === 'percentage'
                    ? html`
                        <div class="setting-item">
                          <span class="setting-label"
                            >${msg(str`句长百分比（${Number(snapshot.pausePercent)}%）`)}</span
                          >
                          <ui-slider
                            ?disabled="${this.disabled}"
                            .value=${Number(snapshot.pausePercent)}
                            min="100"
                            max="500"
                            step="10"
                            .marks=${{
                              100: '100',
                              200: '200',
                              300: '300',
                              400: '400',
                              500: '500',
                            }}
                            .tooltip=${{
                              formatter: (v: number) => `${v}%`,
                              placement: 'top',
                            }}
                            @change=${this._handlePausePercentChange}
                          ></ui-slider>
                        </div>
                      `
                    : null}
                `
              : null}
            ${this.controlsConfig.sleepMode
              ? html`<div class="setting-item">
                  <span class="setting-label">${msg('睡眠模式')}</span>
                  <ui-select
                    ?disabled="${this.disabled}"
                    .value=${snapshot.sleepMode}
                    .options=${[
                      { value: 'off', label: msg('关闭') },
                      { value: 'minutes', label: msg('定时暂停') },
                      { value: 'until-end', label: msg('播完本集暂停') },
                    ]}
                    @change=${this._handleSleepModeChange}
                  ></ui-select>
                </div>`
              : ''}
            ${snapshot.sleepMode === 'minutes'
              ? html`
                  <div class="setting-item">
                    <span class="setting-label"
                      >${msg(str`定时关闭（${Number(snapshot.sleepMinutes)}分钟）`)}</span
                    >
                    <ui-slider
                      ?disabled="${this.disabled}"
                      .value=${Number(snapshot.sleepMinutes)}
                      min="1"
                      max="${MAX_SLEEP_MINUTES}"
                      step="1"
                      .marks=${{
                        0: '0',
                        10: '10',
                        20: '20',
                        30: '30',
                        60: '60',
                        [MAX_SLEEP_MINUTES]: `${MAX_SLEEP_MINUTES}`,
                      }}
                      .tooltip=${{
                        formatter: (v: number) => `${v} ${msg('分钟')}`,
                        placement: 'top',
                      }}
                      @change=${this._handleSleepMinutesChange}
                    ></ui-slider>
                  </div>
                `
              : null}
          </div>
        </div>

        ${snapshot.sleepActive
          ? html`
              <div class="sleep-status">
                <span>
                  ${snapshot.sleepMode === 'minutes'
                    ? msg(str`将在 ${formatTime(snapshot.sleepRemainingSeconds)} 后暂停`)
                    : msg('将在当前集播放结束后暂停')}
                </span>
                <ui-button variant="ghost" size="small" @click="${this._cancelSleep}"
                  >${msg('取消')}</ui-button
                >
              </div>
            `
          : null}
      </div>
    `;
  }

  private _handleLoopModeChange(event: CustomEvent<SelectChangeDetail>): void {
    this.controller?.setLoopMode(
      event.detail.value as 'none' | 'single' | 'segment' | 'list' | 'shuffle',
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

  private _handleSeekInput(event: CustomEvent<{ value: number }>): void {
    this.controller?.seek(Number(event.detail.value));
  }

  private _handleRateChange(event: CustomEvent<{ value: number }>): void {
    this.controller?.setPlaybackRate(Number(event.detail.value));
  }

  private _handleVolumeChange(event: CustomEvent<{ value: number }>): void {
    this.controller?.setVolume(Number(event.detail.value));
  }

  private _handleSleepModeChange(event: CustomEvent<SelectChangeDetail>): void {
    this.controller?.setSleepMode(event.detail.value as 'off' | 'minutes' | 'until-end');
  }

  private _handleSleepMinutesChange(event: CustomEvent<{ value: number }>): void {
    this.controller?.setSleepMinutes(Number(event.detail.value));
  }

  private _cancelSleep(): void {
    this.controller?.cancelSleep();
  }

  private _handlePauseModeChange(event: CustomEvent<SelectChangeDetail>): void {
    this.controller?.setPauseMode(event.detail.value as 'off' | 'seconds' | 'percentage');
  }

  private _handlePauseSecondsChange(event: CustomEvent<{ value: number }>): void {
    this.controller?.setPauseSeconds(Number(event.detail.value));
  }

  private _handlePausePercentChange(event: CustomEvent<{ value: number }>): void {
    this.controller?.setPausePercent(Number(event.detail.value));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'media-player': MediaPlayer;
  }
}
