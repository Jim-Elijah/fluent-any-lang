import { msg, str, updateWhenLocaleChanges } from '@lit/localize';
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
};

@customElement('media-player')
export class MediaPlayer extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
    /* Normal 模式 (默认) */
    :host([mode='normal']) .surface {
      display: block;
      /* 现有样式 */
    }

    /* Fixed 模式 - 固定在底部 */
    :host([mode='fixed']) {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
      transition: transform 0.3s ease;
    }

    :host([mode='fixed'][collapsed]) {
      transform: translateY(calc(100% - 48px));
      /* 只露出一小部分，比如进度条或切换钮 */
    }

    /* Mini 模式 - 悬浮小球 */
    :host([mode='mini']) .surface {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: var(--shadow-md);
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
      gap: 16px;
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

    .pause-info {
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }
  `;

  @property({ type: String, reflect: true })
  mode: MediaPlayerMode = 'normal';

  // @state()
  // private _isCollapsed = true; // 仅 fixed

  @property({ type: Object })
  controlsConfig: MediaControlsConfig = defaultControlConfig;

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
    // this.controlsConfig = Object.assign(this.controlsConfig, defaultControlConfig);
  }

  disconnectedCallback(): void {
    this.controller?.detachMediaElement();
    super.disconnectedCallback();
  }

  resetSettings(): void {
    this.controller?.resetSettings();
  }

  // protected willUpdate(changed: Map<PropertyKey, unknown>): void {
  //   if (changed.has('controller') && this.controller !== this._boundController) {
  //     this._boundController = this.controller;
  //     if (this.controller && !this._controllerHost) {
  //       this._controllerHost = new MediaControllerHost(this, this.controller);
  //     }
  //   }
  // }

  // added by agy
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
    // 向上层（Shadow DOM 之外）抛出
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

  render() {
    const snapshot = this._controllerHost?.snapshot;

    // if (snapshot) {
    //   // const notLogKeys = ['playlist', 'currentItem', 'segments'];
    //   const logKeys = ['currentTime', 'currentSegmentIndex'];
    //   const entries = Object.entries(snapshot);
    //   console.log('currentItem', snapshot.currentItem?.title);
    //   for (const [key, value] of entries) {
    //     // if (!notLogKeys.includes(key)) {
    //     if (logKeys.includes(key)) {
    //       console.log(`${key}: ${value}`);
    //     }
    //   }
    //   console.log('-'.repeat(50));
    // }

    if (!snapshot?.currentItem) {
      return html`<div class="surface"><div class="controls">${msg('未选择媒体')}</div></div>`;
    }

    const isVideo = snapshot.currentItem.type === 'video';
    const progressMax = snapshot.duration > 0 ? snapshot.duration : 0;

    if (this.mode === 'mini') {
      return this._renderMini(snapshot);
    }
    if (this.mode === 'fixed') {
      return this._renderFixed(snapshot);
    }

    const showSegments = this.controlsConfig.previousNextSegment && snapshot.hasSubtitles;
    const showLoopMode = this.controlsConfig.loopMode;
    const showPauseMode = this.controlsConfig.pauseMode && snapshot.hasSubtitles;

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
          </div>

          <div class="progress">
            <ui-slider
              ?disabled="${this.disabled}"
              .value="${String(snapshot.currentTime)}"
              min="0"
              max="${progressMax}"
              step="0.1"
              .tooltip=${{
                open: false,
              }}
              @change=${this._handleSeekInput}
            ></ui-slider>
            <div class="time">
              <span>${formatTime(snapshot.currentTime)}</span>
              <span>${formatTime(snapshot.duration)}</span>
            </div>
          </div>

          <div class="transport">
            ${this.controlsConfig.previousNextTrack
              ? html` <ui-button
                  variant="secondary"
                  ?disabled="${!snapshot.canPreviousTrack || this.disabled}"
                  @click="${this._previousTrack}"
                >
                  ${msg('上一首')}
                </ui-button>`
              : ''}
            ${showSegments && snapshot.hasSubtitles
              ? html` <ui-button
                  variant="secondary"
                  ?disabled="${!snapshot.canPreviousSegment || this.disabled}"
                  @click="${this._previousSegment}"
                >
                  ${msg('上一句')}
                </ui-button>`
              : ''}
            ${this.controlsConfig.playPause
              ? html` <ui-button
                  variant="primary"
                  ?disabled="${this.disabled}"
                  @click="${this._togglePlay}"
                >
                  ${snapshot.isPlaying ? msg('暂停') : msg('播放')}
                </ui-button>`
              : ''}
            ${showSegments && snapshot.hasSubtitles
              ? html`<ui-button
                  variant="secondary"
                  ?disabled="${!snapshot.canNextSegment || this.disabled}"
                  @click="${this._nextSegment}"
                >
                  ${msg('下一句')}
                </ui-button>`
              : ''}
            ${this.controlsConfig.previousNextTrack
              ? html`<ui-button
                  variant="secondary"
                  ?disabled="${!snapshot.canNextTrack || this.disabled}"
                  @click="${this._nextTrack}"
                >
                  ${msg('下一首')}
                </ui-button>`
              : ''}
          </div>

          <div class="settings">
            ${showLoopMode
              ? html`<label>
                  ${msg('循环模式')}
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
                    placeholder="循环模式"
                    @change=${this._handleLoopModeChange}
                  ></ui-select>
                </label>`
              : ''}
            ${this.controlsConfig.playbackRate
              ? html`<label>
                  ${msg(str`倍速（${Number(snapshot.playbackRate).toFixed(1)}x）`)}
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
                </label>`
              : ''}
            ${this.controlsConfig.volume
              ? html`<label>
                  ${msg(str`音量（${Number(snapshot.volume * 100).toFixed(0)}%）`)}
                  <ui-slider
                    ?disabled="${this.disabled}"
                    .value=${Number(snapshot.volume)}
                    min="0"
                    max="1"
                    step="0.01"
                    .marks=${{
                      0: '0',
                      0.2: '20',
                      0.5: '50',
                      0.8: '80',
                      1: '100',
                    }}
                    .tooltip=${{
                      formatter: (v: number) => `${Number((v * 100).toFixed(0))}%`,
                      placement: 'top',
                    }}
                    @change=${this._handleVolumeChange}
                  ></ui-slider>
                </label>`
              : ''}
          </div>

          <div class="settings">
            ${showPauseMode
              ? html`
                  <label>
                    ${msg('暂停方式')}
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
                      placeholder="暂停方式"
                      @change=${this._handlePauseModeChange}
                    ></ui-select>
                  </label>
                  ${snapshot.pauseMode === 'seconds'
                    ? html`
                        <label>
                          ${msg(str`固定时长（${Number(snapshot.pauseSeconds)}秒）`)}
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
                        </label>
                      `
                    : null}
                  ${snapshot.pauseMode === 'percentage'
                    ? html`
                        <label>
                          ${msg(str`句长百分比（${Number(snapshot.pausePercent)}%）`)}
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
                              formatter: (v: number) => `${v} ${msg('%')}`,
                              placement: 'top',
                            }}
                            @change=${this._handlePausePercentChange}
                          ></ui-slider>
                        </label>
                      `
                    : null}
                `
              : null}
            ${this.controlsConfig.sleepMode
              ? html`<label>
                  ${msg('睡眠模式')}
                  <ui-select
                    ?disabled="${this.disabled}"
                    .value=${snapshot.sleepMode}
                    .options=${[
                      { value: 'off', label: msg('关闭') },
                      { value: 'minutes', label: msg('定时暂停') },
                      { value: 'until-end', label: msg('播完本集暂停') },
                    ]}
                    placeholder="睡眠模式"
                    @change=${this._handleSleepModeChange}
                  ></ui-select>
                </label>`
              : ''}
            ${snapshot.sleepMode === 'minutes'
              ? html`
                  <label>
                    ${msg(str`定时关闭（${Number(snapshot.sleepMinutes)}分钟）`)}
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

  /** @TODO */
  private _renderFixed(snapshot: MediaControllerSnapshot) {
    console.log('_renderFixed', snapshot);
    return html` <div class="surface fixed-player">fixed</div> `;
  }

  /** @TODO */
  private _renderMini(snapshot: MediaControllerSnapshot) {
    console.log('_renderMini', snapshot);
    // <div class="mini-avatar" style="background-image: url(${snapshot.currentItem?.cover || ''})">
    return html`
      <div class="surface mini-player" @click="${this._togglePlay}">
        <!-- 极简圆形，显示播放状态、进度环或封面图 -->
        <div class="mini-avatar">${snapshot.isPlaying ? '⏸️' : '▶️'}</div>
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
