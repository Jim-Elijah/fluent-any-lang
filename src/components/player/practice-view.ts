import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { customElement, property, query, state } from 'lit/decorators.js';

import '../library/record-list.js';
import { PracticeTimeTracker } from '../../analytics/practice-time-tracker.js';
import { MediaController } from '../../controllers/media-controller.js';
import { loadPlaylistForPlayback } from '../../lib/media-loader.js';
import {
  countEchoRecordings,
  countShadowingRecordings,
  findAllEchoRecordings,
  saveRecording,
} from '../../db/service.js';
import { estimateStorage } from '../../lib/export-content.js';
import { getMediaDuration } from '../../lib/file-validation.js';
import type {
  MediaItem,
  PracticeAnalyticsMode,
  PracticeRecord,
  PracticeSegment,
  RouteContext,
  SubtitleSegment,
} from '../../types/models.js';
import { getAppSettings } from '../../lib/app-settings.js';
import {
  AUDIO_FOCUS_REQUEST_EVENT,
  RECORDING_PREVIEW_CLOSE_EVENT,
  RECORDING_PREVIEW_OPEN_EVENT,
} from '../../lib/audio-focus.js';
import {
  VOLUME_HOTKEY_STEP,
  getHotkeyCatalog,
  getHotkeyManager,
  stepPlaybackRate,
  supportsKeyboardShortcuts,
} from '../../lib/hotkeys/index.js';
import {
  ExtendedMediaEventType,
  formatStorageUsage,
  getPracticeSourceDuration,
} from '../../lib/playback-utils.js';
import { Z_INDEX } from '../ui/internal/z-index.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/icon.js';
import '../ui/modal.js';
import './media-player.js';
import './subtitle-panel.js';
import './audio-recorder.js';
import './echo-session-dock.js';
import {
  AudioRecorder,
  type RecordingCompleteDetail,
  type RecordingCountdownEndDetail,
  type RecordingStateChangeDetail,
} from './audio-recorder.js';
import type { RecordingSessionPhase } from './echo-session-dock.js';
import type { WaveformController } from '../../controllers/waveform-controller.js';
import {
  setUserSettings,
  shouldSkipEchoTips,
  shouldSkipShadowingTips,
} from '../../lib/user-settings.js';
import type { RecordList } from '../library/record-list.js';
import { Message } from '../ui/message.js';
import { Loading } from '../ui/loading.js';
import { EchoRecordRequestDetail, SubtitlePanelFullscreenChangeDetail } from './subtitle-panel.js';

type PracticeType = 'listening' | 'speaking';
type SpeakingMode = 'shadowing' | 'echo';
type TipsModalKind = 'shadowing' | 'echo' | null;

type StorageEstimate = {
  usage: number;
  quota: number;
  remaining: number;
  remainingPercent: number;
};

@customElement('practice-view')
@localized()
export class PracticeView extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-block);
      margin-bottom: var(--space-inline);
    }

    .header h2 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
    }

    .layout {
      display: grid;
      gap: var(--space-inline);
    }

    .mode-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
      margin-bottom: var(--space-inline);
    }

    .speaking-mode-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
      margin-bottom: var(--space-block);
    }

    .settings-panel {
      display: grid;
      gap: var(--space-block);
      padding: var(--space-inline);
      margin-bottom: var(--space-inline);
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface, #fff);
    }

    .settings-panel h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .settings-group {
      display: grid;
      gap: var(--space-sm);
    }

    .storage-info {
      display: grid;
      gap: var(--space-xs);
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .info-text {
      display: grid;
      gap: var(--space-sm);
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .echo-recorder {
      margin-top: var(--space-sm);
    }

    :host([data-session-dock]) {
      padding-bottom: var(--session-dock-inset, var(--echo-dock-inset, 140px));
    }

    .tips-summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-sm);
    }

    .tips-summary p {
      margin: 0;
      flex: 1;
      min-width: 12rem;
    }

    .recordings-summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-sm);
    }

    .recordings-summary p {
      margin: 0;
      flex: 1;
      min-width: 10rem;
    }

    .recordings-modal-body {
      min-height: 12rem;
    }

    .tips-modal-body {
      display: grid;
      gap: var(--space-sm);
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .tips-skip {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm);
      margin: 0;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
      font-size: 0.8125rem;
      cursor: pointer;
      user-select: none;
    }

    .tips-skip input {
      width: 16px;
      height: 16px;
      margin: 0;
      cursor: pointer;
      accent-color: var(--color-primary, #1677ff);
    }

    .tips-modal-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-block);
      width: 100%;
    }

    .hotkeys-help-body {
      display: grid;
      gap: var(--space-inline);
    }

    .hotkeys-help-section {
      display: grid;
      gap: var(--space-sm);
    }

    .hotkeys-help-section h3 {
      margin: 0;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .hotkeys-help-list {
      display: grid;
      gap: var(--space-xs);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .hotkeys-help-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-block);
      font-size: 0.875rem;
    }

    .hotkeys-help-code {
      flex-shrink: 0;
      min-width: 3.5rem;
      padding: 0.125rem 0.5rem;
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-sm, 4px);
      background: var(--color-surface-secondary, #f5f5f5);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.8125rem;
      text-align: center;
    }

    .hotkeys-help-note {
      margin: 0;
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }
  `;

  @property({ type: String })
  route: string = '';

  @property({ type: Object })
  routeContext: RouteContext = {
    route: '',
    params: {},
    query: {},
    data: {},
  };

  @state()
  private _mediaId = '';

  @state()
  private _practiceType: PracticeType = 'listening';

  @state()
  private _speakingMode: SpeakingMode = 'shadowing';

  @state()
  private _recording = false;

  @state()
  private _recordingError = '';

  @state()
  private _shadowingCount = 0;

  @state()
  private _echoRecordingsBySegmentId: Record<string, PracticeRecord[]> = {};

  @state()
  private _storageEstimate: StorageEstimate | null = null;

  @state()
  private _subtitlePanelFullscreen = false;

  @state()
  private _echoSegmentIndex = -1;

  @state()
  private _echoListening = false;

  @state()
  private _sessionPhase: RecordingSessionPhase = 'idle';

  @state()
  private _sessionSpeakCue = false;

  @state()
  private _sessionWaveformController: WaveformController | null = null;

  @state()
  private _tipsModalKind: TipsModalKind = null;

  @state()
  private _tipsSkipChecked = false;

  @state()
  private _recordingsModalOpen = false;

  @state()
  private _recordingPreviewOpen = false;

  @state()
  private _hotkeysHelpOpen = false;

  private _echoSegment: SubtitleSegment | null = null;

  private _didInitialLoad = false;

  private _getShadowingTips(): string[] {
    return [
      msg(
        '跟读（Shadowing）：点击下方【麦克风】开始【同步】跟读；录音前有倒计时提醒（默认开启），录音停止后自动保存。',
      ),
      msg('温馨提示：'),
      msg('1. 建议使用耳机练习。'),
      msg('2. 如果跟不上原音，可以设置倍速、单句暂停模式。'),
      msg('3. 录音前可以操作播放器设置，录音开始后播放器不可操作。'),
      msg('4. 除了倍速、音量、单句暂停模式，跟读模式会忽略其他的播放器设置。'),
      msg('5. 录音时底部会显示状态与波形，全屏字幕下也可看到。'),
    ];
  }

  private _getEchoTips(): string[] {
    return [
      msg(
        '单句（Echo）：点击字幕行右侧【麦克风】：先播原音 → 倒计时提醒（默认开启）→ 录音；跟读完后手动停止录音。',
      ),
      msg('温馨提示：'),
      msg('1. 建议使用耳机练习。'),
      msg('2. 每句最多保存若干条录音，可在字幕行右侧下拉查看。'),
      msg('3. 听音和录音期间播放器不可操作。'),
      msg('4. 录音时底部会显示状态与波形，全屏字幕下也可看到。'),
    ];
  }

  private _getShadowingSummary(): string {
    return msg('点击下方麦克风开始同步跟读；录音时底部显示状态与波形。');
  }

  private _getEchoSummary(): string {
    return msg('点击字幕行麦克风：先听原音，再录音；底部会显示状态与波形。');
  }

  @query('record-list')
  private _manageRecordList?: RecordList;

  @query('audio-recorder#shadowing-recorder')
  private _shadowingRecorderEl?: AudioRecorder;

  @query('audio-recorder#echo-recorder')
  private _echoRecorderEl?: AudioRecorder;

  private readonly _controller = new MediaController();
  private readonly _timeTracker = new PracticeTimeTracker();
  private _lastRecordingId: string | null = null;
  private get _shadowingLimit() {
    return getAppSettings().maxRecordingsPerMedia;
  }
  private get _echoLimitPerSegment() {
    return getAppSettings().maxEchoPerSegment;
  }
  private readonly _recordingSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    typeof MediaRecorder !== 'undefined';

  disconnectedCallback(): void {
    if (supportsKeyboardShortcuts()) {
      getHotkeyManager().unregisterScope('practice');
    }
    this.removeEventListener(RECORDING_PREVIEW_OPEN_EVENT, this._onRecordingPreviewOpen);
    this.removeEventListener(RECORDING_PREVIEW_CLOSE_EVENT, this._onRecordingPreviewClose);
    this.removeEventListener(AUDIO_FOCUS_REQUEST_EVENT, this._onAudioFocusRequest);
    if (this._echoListening) {
      this._cancelEchoListen();
    }
    this._timeTracker.dispose();
    this._controller.removeEventListener(ExtendedMediaEventType.TRACK_CHANGE, this._onTrackChange);
    this._controller.destroy();
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    const sessionDockActive =
      this._sessionPhase === 'listening' ||
      this._sessionPhase === 'countdown' ||
      this._sessionPhase === 'recording';
    this.toggleAttribute('data-session-dock', sessionDockActive);

    if (!changed.has('routeContext') && this._didInitialLoad) {
      return;
    }
    const nextId = this.routeContext.params?.id ?? '';
    if (this._didInitialLoad) {
      const prevContext = changed.get('routeContext') as RouteContext | undefined;
      const prevId = prevContext?.params?.id ?? '';
      if (prevId === nextId) {
        return;
      }
    }
    this._didInitialLoad = true;
    this._mediaId = nextId;
    void this._loadPractice();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._controller.addEventListener(ExtendedMediaEventType.TRACK_CHANGE, this._onTrackChange);
    this._timeTracker.attach(this._controller);
    this._timeTracker.setMode(this._resolveAnalyticsMode());
    this.addEventListener(RECORDING_PREVIEW_OPEN_EVENT, this._onRecordingPreviewOpen);
    this.addEventListener(RECORDING_PREVIEW_CLOSE_EVENT, this._onRecordingPreviewClose);
    this.addEventListener(AUDIO_FOCUS_REQUEST_EVENT, this._onAudioFocusRequest);
    if (supportsKeyboardShortcuts()) {
      getHotkeyManager().registerScope({
        id: 'practice',
        enabled: () => this._practiceHotkeysEnabled(),
        handlers: {
          togglePlay: () => {
            void this._controller.togglePlay();
          },
          previousSegment: () => {
            this._controller.previousSegment();
          },
          nextSegment: () => {
            this._controller.nextSegment();
          },
          volumeUp: () => {
            this._nudgeVolume(VOLUME_HOTKEY_STEP);
          },
          volumeDown: () => {
            this._nudgeVolume(-VOLUME_HOTKEY_STEP);
          },
          rateUp: () => {
            this._nudgePlaybackRate(1);
          },
          rateDown: () => {
            this._nudgePlaybackRate(-1);
          },
        },
      });
    }
  }

  private _practiceHotkeysEnabled(): boolean {
    if (this._hotkeysHelpOpen) {
      return false;
    }
    if (this._recordingPreviewOpen || this._recordingsModalOpen) {
      return false;
    }
    if (this._recording || this._echoListening) {
      return false;
    }
    if (this._sessionPhase === 'countdown' || this._sessionPhase === 'recording') {
      return false;
    }
    return true;
  }

  /** Pause practice media (and cancel echo listen) so recording review can own the speakers. */
  private _yieldPlaybackToPreview(showTip = true): void {
    const wasPlaying = this._controller.getSnapshot().isPlaying || this._echoListening;
    if (this._echoListening) {
      this._cancelEchoListen(true);
    } else {
      void this._controller.pause();
    }
    if (showTip && wasPlaying) {
      Message.info(msg('练习音频已暂停'));
    }
  }

  private _onRecordingPreviewOpen = (): void => {
    this._recordingPreviewOpen = true;
    this._yieldPlaybackToPreview(true);
  };

  private _onRecordingPreviewClose = (): void => {
    this._recordingPreviewOpen = false;
  };

  private _onAudioFocusRequest = (): void => {
    // Preview started/resumed — keep practice media paused without repeating the tip.
    this._yieldPlaybackToPreview(false);
  };

  private _nudgeVolume(delta: number): void {
    const current = this._controller.getSnapshot().volume;
    this._controller.setVolume(current + delta);
  }

  private _nudgePlaybackRate(direction: 1 | -1): void {
    const current = this._controller.getSnapshot().playbackRate;
    this._controller.setPlaybackRate(stepPlaybackRate(current, direction));
  }

  private _resolveAnalyticsMode(): PracticeAnalyticsMode {
    if (this._practiceType === 'listening') {
      return 'listening';
    }
    return this._speakingMode;
  }

  private _syncTimeTrackerMedia(): void {
    const item = this._controller.getSnapshot().currentItem;
    if (item) {
      this._timeTracker.setMedia(item.id, item.title, item.type, item.filename);
      return;
    }
    this._timeTracker.setMedia('', '', 'audio', '');
  }

  private _onTrackChange = (): void => {
    this._recordingError = '';
    this._lastRecordingId = null;
    if (this._echoListening) {
      this._cancelEchoListen();
    } else {
      this._echoSegmentIndex = -1;
      this._echoSegment = null;
    }
    this._syncMediaIdFromController();
    this._syncTimeTrackerMedia();
    void this._refreshRecordings();
  };

  private _onRecordingDeleted = (id: string): void => {
    if (id === this._lastRecordingId) {
      this._lastRecordingId = null;
      this._shadowingRecorderEl?.clearWaveform();
    }
    void this._refreshRecordings();
  };

  render() {
    const shadowingRemaining = Math.max(this._shadowingLimit - this._shadowingCount, 0);
    const isSpeaking = this._practiceType === 'speaking';
    const isShadowing = isSpeaking && this._speakingMode === 'shadowing';
    const isEcho = isSpeaking && this._speakingMode === 'echo';

    const headerTitle = this._practiceType === 'listening' ? msg('听力练习') : msg('口语练习');

    const { hasSubtitles } = this._controller.getSnapshot();

    return html`
      <section>
        <div class="header">
          <h2>${headerTitle}</h2>
          ${supportsKeyboardShortcuts()
            ? html`<ui-button
                variant="secondary"
                title=${msg('快捷键')}
                aria-label=${msg('快捷键')}
                @click=${this._openHotkeysHelp}
              >
                ?
              </ui-button>`
            : nothing}
        </div>

        <div class="mode-tabs">
          <ui-button
            variant="${this._practiceType === 'listening' ? 'primary' : 'secondary'}"
            @click="${() => this._setPracticeType('listening')}"
          >
            <ui-icon name="listen" size="var(--icon-xl)"></ui-icon> ${msg('听力')}
          </ui-button>
          <ui-button
            variant="${this._practiceType === 'speaking' ? 'primary' : 'secondary'}"
            @click="${() => this._setPracticeType('speaking')}"
          >
            <ui-icon name="speak" size="var(--icon-xl)"></ui-icon> ${msg('口语')}
          </ui-button>
        </div>
        ${isSpeaking
          ? html`
              <div class="speaking-mode-tabs">
                <ui-button
                  variant="${this._speakingMode === 'shadowing' ? 'primary' : 'secondary'}"
                  @click="${() => this._setSpeakingMode('shadowing')}"
                >
                  ${msg('跟读 (Shadowing)')}
                </ui-button>
                ${hasSubtitles
                  ? html`<ui-button
                      variant="${this._speakingMode === 'echo' ? 'primary' : 'secondary'}"
                      @click="${() => this._setSpeakingMode('echo')}"
                    >
                      ${msg('单句 (Echo)')}
                    </ui-button>`
                  : nothing}
              </div>
            `
          : nothing}
        ${isShadowing
          ? html`
              <div class="settings-panel">
                <div class="settings-group">
                  <div class="info-text">
                    ${this._recordingSupported
                      ? shadowingRemaining > 0
                        ? html`<div class="tips-summary">
                            <p>${this._getShadowingSummary()}</p>
                            <ui-button
                              variant="secondary"
                              @click=${() => this._openTipsModal('shadowing')}
                            >
                              ${msg('说明')}
                            </ui-button>
                          </div>`
                        : html`<div class="tips-summary">
                            <p>
                              ${msg(
                                str`当前音频的跟读录音已达上限（${this._shadowingLimit}条），删除旧录音后可继续。`,
                              )}
                            </p>
                          </div>`
                      : msg('当前浏览器不支持录音。')}
                    ${keyed(
                      this._mediaId,
                      html`<audio-recorder
                        id="shadowing-recorder"
                        .controller=${this._controller}
                        .collectSegments=${true}
                        .disabled=${!this._recordingSupported || shadowingRemaining <= 0}
                        .hideWaveform=${true}
                        .beforeRecordingStart=${this._resetSettingsForShadowing}
                        @recording-complete=${this._onShadowingRecordingComplete}
                        @recording-state-change=${this._onRecordingStateChange}
                        @recording-countdown-start=${this._onSessionCountdownStart}
                        @recording-countdown-end=${this._onSessionCountdownEnd}
                      ></audio-recorder>`,
                    )}
                    ${this._recordingError
                      ? html`<ui-alert type="error">${this._recordingError}</ui-alert>`
                      : null}
                    ${this._renderStorageInfo()} ${this._renderShadowingRecordingsEntry()}
                  </div>
                </div>
              </div>
            `
          : null}
        ${isEcho
          ? html`
              <div class="settings-panel">
                <div class="info-text">
                  ${this._recordingSupported
                    ? html`<div class="tips-summary">
                        <p>${this._getEchoSummary()}</p>
                        <ui-button variant="secondary" @click=${() => this._openTipsModal('echo')}>
                          ${msg('说明')}
                        </ui-button>
                      </div>`
                    : msg('当前浏览器不支持录音。')}
                  ${this._recordingError
                    ? html`<ui-alert type="error">${this._recordingError}</ui-alert>`
                    : null}
                  ${this._renderStorageInfo()}
                </div>
              </div>
            `
          : null}

        <div class="layout">
          <media-player
            .controller="${this._controller}"
            ?disabled="${isSpeaking && (this._recording || this._echoListening)}"
            mode="normal"
            .controlsConfig="${{
              loopMode: true,
              sleepMode: true,
              pauseMode: true,
              playPause: true,
              volume: true,
              playbackRate: true,
              progress: true,
              previousNextTrack: true,
              previousNextSegment: true,
              switchMode: false,
            }}"
          >
          </media-player>
          <subtitle-panel
            .controller="${this._controller}"
            .fullscreen="${this._subtitlePanelFullscreen}"
            showFullscreenIcon="${!this._subtitlePanelFullscreen}"
            .echoMode="${isEcho}"
            .echoRecordingsBySegmentId="${this._echoRecordingsBySegmentId}"
            .echoRecordingSegmentIndex="${this._echoSegmentIndex}"
            .recordingSupported="${this._recordingSupported}"
            .echoLimitPerSegment="${this._echoLimitPerSegment}"
            .previewDisabled=${this._recording ||
            this._sessionPhase === 'countdown' ||
            this._sessionPhase === 'recording'}
            @update:fullscreen="${(e: CustomEvent<SubtitlePanelFullscreenChangeDetail>) => {
              this._subtitlePanelFullscreen = e.detail.fullscreen;
            }}"
            @echo-record-request="${this._onEchoRecordRequest}"
            @echo-record-stop="${this._onEchoRecordStop}"
          ></subtitle-panel>
          ${isEcho
            ? html`<div class="echo-recorder">
                ${keyed(
                  `${this._mediaId}-echo`,
                  html`<audio-recorder
                    id="echo-recorder"
                    .controller=${this._controller}
                    .collectSegments=${false}
                    .autoPlayOnStart=${false}
                    .stopOnMediaEnded=${false}
                    .stopOnSegmentEnd=${false}
                    .pauseMediaOnSegmentEnd=${false}
                    .hideControls=${true}
                    .hideWaveform=${true}
                    .beforeRecordingStart=${this._resetSettingsForEcho}
                    @recording-complete=${this._onEchoRecordingComplete}
                    @recording-state-change=${this._onRecordingStateChange}
                    @recording-countdown-start=${this._onSessionCountdownStart}
                    @recording-countdown-end=${this._onSessionCountdownEnd}
                  ></audio-recorder>`,
                )}
              </div>`
            : null}
        </div>
        ${isEcho || isShadowing
          ? html`<echo-session-dock
              .phase=${this._sessionPhase}
              .waveformController=${this._sessionWaveformController}
              .speakCue=${this._sessionSpeakCue}
              @echo-session-stop=${this._onSessionDockStop}
              @echo-session-cancel=${this._onSessionDockCancel}
            ></echo-session-dock>`
          : nothing}
        ${this._renderTipsModal()} ${this._renderRecordingsModal()}
        ${this._renderHotkeysHelpModal()}
      </section>
    `;
  }

  private _openHotkeysHelp = (): void => {
    this._hotkeysHelpOpen = true;
  };

  private _closeHotkeysHelp = (): void => {
    this._hotkeysHelpOpen = false;
  };

  private _renderHotkeysHelpModal() {
    if (!this._hotkeysHelpOpen) {
      return nothing;
    }

    const catalog = getHotkeyCatalog();

    return html`
      <ui-modal
        .open=${true}
        .title=${msg('快捷键')}
        .centered=${true}
        .footer=${false}
        ok-text="${msg('知道了')}"
        @update:open=${(e: CustomEvent<{ open: boolean }>) => {
          if (e.target !== e.currentTarget) {
            return;
          }
          if (!e.detail.open) {
            this._closeHotkeysHelp();
          }
        }}
      >
        <div class="hotkeys-help-body">
          ${catalog.map(
            (section) => html`
              <section class="hotkeys-help-section">
                <h3>${section.title}</h3>
                <ul class="hotkeys-help-list">
                  ${section.rows.map(
                    (row) => html`
                      <li class="hotkeys-help-row">
                        <span>${row.actionLabel}</span>
                        <kbd class="hotkeys-help-code">${row.codeLabel}</kbd>
                      </li>
                    `,
                  )}
                </ul>
              </section>
            `,
          )}
          <p class="hotkeys-help-note">${msg('暂不支持自定义快捷键。')}</p>
        </div>
        <div slot="footer" class="tips-modal-footer">
          <span></span>
          <ui-button variant="primary" @click=${this._closeHotkeysHelp}>${msg('知道了')}</ui-button>
        </div>
      </ui-modal>
    `;
  }

  private _renderTipsModal() {
    if (!this._tipsModalKind) {
      return nothing;
    }

    const isShadowing = this._tipsModalKind === 'shadowing';
    const tips = isShadowing ? this._getShadowingTips() : this._getEchoTips();
    const title = isShadowing ? msg('跟读说明') : msg('单句说明');
    const shouldSkipTips = isShadowing ? shouldSkipShadowingTips() : shouldSkipEchoTips();

    return html`
      <ui-modal
        .open=${true}
        .title=${title}
        .centered=${true}
        .footer=${false}
        ok-text="${msg('知道了')}"
        @update:open=${(e: CustomEvent<{ open: boolean }>) => {
          if (e.target !== e.currentTarget) {
            return;
          }
          if (!e.detail.open) {
            this._closeTipsModal();
          }
        }}
      >
        <div class="tips-modal-body">${tips.map((tip) => html`<div>${tip}</div>`)}</div>
        <div slot="footer" class="tips-modal-footer">
          ${!shouldSkipTips
            ? html` <label class="tips-skip">
                <input
                  type="checkbox"
                  .checked=${this._tipsSkipChecked}
                  @change=${(event: Event) => {
                    this._tipsSkipChecked = (event.target as HTMLInputElement).checked;
                  }}
                />
                ${msg('以后不再提醒')}
              </label>`
            : nothing}
          <ui-button style="margin-left: auto;" variant="primary" @click=${this._confirmTipsModal}
            >${msg('知道了')}</ui-button
          >
        </div>
      </ui-modal>
    `;
  }

  private _renderShadowingRecordingsEntry() {
    return html`
      <div class="recordings-summary">
        <p>${msg(str`已保存 ${this._shadowingCount}/${this._shadowingLimit}`)}</p>
        <ui-button variant="secondary" @click=${this._openRecordingsModal}>
          ${msg('管理录音')}
        </ui-button>
      </div>
    `;
  }

  private _renderRecordingsModal() {
    if (!this._recordingsModalOpen) {
      return nothing;
    }

    return html`
      <ui-modal
        .open=${true}
        .title=${msg('当前音频的跟读录音')}
        .centered=${true}
        .footer=${false}
        @update:open=${(e: CustomEvent<{ open: boolean }>) => {
          // Ignore nested overlays (record-list preview, tooltips, popconfirm)
          // that also emit composed update:open.
          if (e.target !== e.currentTarget) {
            return;
          }
          if (!e.detail.open) {
            this._closeRecordingsModal();
          }
        }}
      >
        <div class="recordings-modal-body">
          <record-list
            .mediaId=${this._mediaId}
            .modeFilter=${'shadowing'}
            .showHeader=${false}
            .popupZIndex=${Z_INDEX.MODAL + 1}
            .previewDisabled=${this._recording ||
            this._sessionPhase === 'countdown' ||
            this._sessionPhase === 'recording'}
            @recording-deleted=${(event: CustomEvent<{ id: string }>) =>
              this._onRecordingDeleted(event.detail.id)}
          ></record-list>
        </div>
        <div slot="footer" class="tips-modal-footer">
          <span></span>
          <ui-button variant="primary" @click=${this._closeRecordingsModal}
            >${msg('关闭')}</ui-button
          >
        </div>
      </ui-modal>
    `;
  }

  private _openRecordingsModal = (): void => {
    this._recordingsModalOpen = true;
  };

  private _closeRecordingsModal = (): void => {
    this._recordingsModalOpen = false;
    this._recordingPreviewOpen = false;
  };

  private _renderStorageInfo() {
    if (!this._storageEstimate) {
      return null;
    }

    return html`
      <div class="storage-info">
        <div>
          ${msg('当前存储')}：${formatStorageUsage(this._storageEstimate.usage)} /
          ${formatStorageUsage(this._storageEstimate.quota)}
          (${Math.round(this._storageEstimate.remainingPercent)}% ${msg('剩余')})
        </div>
      </div>
      ${this._storageEstimate.remainingPercent <= getAppSettings().lowStorageThresholdPercent
        ? html`<ui-alert type="warning">
            ${msg('磁盘存储空间不足，建议导出或删除旧录音。')}
          </ui-alert>`
        : null}
    `;
  }

  private _syncMediaIdFromController(): void {
    const { playlist, currentIndex } = this._controller.getSnapshot();
    this._mediaId = playlist[currentIndex]?.id ?? '';
  }

  private async _loadPractice(): Promise<void> {
    const loadingInstance = Loading.service({ text: msg('加载媒体中…') });
    try {
      const playlist = await loadPlaylistForPlayback();
      if (playlist.length === 0) {
        Message.error(msg('内容库为空，请先导入媒体。'));
        return;
      }
      let startIndex = 0;
      if (this._mediaId) {
        startIndex = playlist.findIndex((entry) => entry.item.id === this._mediaId);
        if (startIndex === -1) {
          Message.info(msg(str`媒体 "${this._mediaId}" 不存在，回退到第一首媒体。`));
          startIndex = 0;
        }
      }
      await this._controller.loadTracks(playlist, startIndex);
      this._syncMediaIdFromController();
      this._syncTimeTrackerMedia();
      await this._refreshRecordings();
    } catch (error) {
      console.error('[practice-view] failed to load practice media', error);
      Message.error(msg('加载媒体失败，请重试。'));
    } finally {
      loadingInstance.close();
    }
  }

  private _setPracticeType(type: PracticeType): void {
    if (this._practiceType === type) {
      return;
    }

    if (this._echoListening) {
      this._cancelEchoListen();
    }
    this._practiceType = type;
    this._recordingError = '';
    this._shadowingRecorderEl?.destroy();
    this._echoRecorderEl?.destroy();
    this._echoSegmentIndex = -1;
    this._echoSegment = null;
    this._resetSessionUi();
    this._timeTracker.setMode(this._resolveAnalyticsMode());
    if (type === 'speaking') {
      this._maybeShowTipsForSpeakingMode(this._speakingMode);
    }
  }

  private _setSpeakingMode(mode: SpeakingMode): void {
    if (this._speakingMode === mode) {
      return;
    }

    if (this._echoListening) {
      this._cancelEchoListen();
    }
    this._speakingMode = mode;
    this._recordingError = '';
    this._shadowingRecorderEl?.destroy();
    this._echoRecorderEl?.destroy();
    this._echoSegmentIndex = -1;
    this._echoSegment = null;
    this._resetSessionUi();
    this._recordingsModalOpen = false;
    this._recordingPreviewOpen = false;
    this._timeTracker.setMode(this._resolveAnalyticsMode());
    this._maybeShowTipsForSpeakingMode(mode);
  }

  private _maybeShowTipsForSpeakingMode(mode: SpeakingMode): void {
    if (mode === 'shadowing' && !shouldSkipShadowingTips()) {
      this._openTipsModal('shadowing');
      return;
    }
    if (mode === 'echo' && !shouldSkipEchoTips()) {
      this._openTipsModal('echo');
    }
  }

  private _openTipsModal(kind: 'shadowing' | 'echo'): void {
    this._tipsSkipChecked = false;
    this._tipsModalKind = kind;
  }

  private _closeTipsModal(): void {
    this._tipsModalKind = null;
    this._tipsSkipChecked = false;
  }

  private _confirmTipsModal = (): void => {
    if (this._tipsSkipChecked && this._tipsModalKind) {
      if (this._tipsModalKind === 'shadowing') {
        setUserSettings({ skipShadowingTips: true });
      } else {
        setUserSettings({ skipEchoTips: true });
      }
    }
    this._closeTipsModal();
  };

  private _resetSettingsForShadowing = (): void => {
    const snapshot = this._controller.getSnapshot();
    this._controller.resetSettings();

    this._controller.setVolume(snapshot.volume);
    this._controller.setPlaybackRate(snapshot.playbackRate);
    this._controller.setPauseMode(snapshot.pauseMode);
    this._controller.setPauseSeconds(snapshot.pauseSeconds);
    this._controller.setPausePercent(snapshot.pausePercent);
  };

  private _resetSettingsForEcho = (): void => {
    const snapshot = this._controller.getSnapshot();
    this._controller.resetSettings();

    this._controller.setVolume(snapshot.volume);
    this._controller.setPlaybackRate(snapshot.playbackRate);
    this._controller.setPauseMode('off');

    if (this._echoSegmentIndex >= 0) {
      this._controller.seekToSegment(this._echoSegmentIndex);
    }
  };

  private _onShadowingRecordingComplete = (event: CustomEvent<RecordingCompleteDetail>): void => {
    const { blob, segments } = event.detail;
    const currentItem = this._controller.getSnapshot().currentItem;
    if (!currentItem) {
      return;
    }
    void this._saveShadowingRecording(blob, currentItem, segments);
  };

  private _onEchoRecordingComplete = (event: CustomEvent<RecordingCompleteDetail>): void => {
    const { blob } = event.detail;
    const currentItem = this._controller.getSnapshot().currentItem;
    const segment = this._echoSegment;
    if (!currentItem || !segment) {
      this._echoSegmentIndex = -1;
      this._echoSegment = null;
      return;
    }
    void this._saveEchoRecording(blob, currentItem, segment);
    this._echoSegmentIndex = -1;
    this._echoSegment = null;
  };

  private _onRecordingStateChange = (event: CustomEvent<RecordingStateChangeDetail>): void => {
    this._recording = event.detail.recording;
    this._timeTracker.setFlags({ recording: this._recording });
    if (this._speakingMode === 'echo') {
      if (event.detail.recording) {
        this._sessionPhase = 'recording';
        this._sessionWaveformController = this._echoRecorderEl?.waveformController ?? null;
      } else {
        this._echoSegmentIndex = -1;
        this._resetSessionUi();
      }
      return;
    }

    if (this._speakingMode === 'shadowing') {
      if (event.detail.recording) {
        this._sessionPhase = 'recording';
        this._sessionWaveformController = this._shadowingRecorderEl?.waveformController ?? null;
      } else {
        this._resetSessionUi();
      }
    }
  };

  private _onSessionCountdownStart = (): void => {
    this._sessionPhase = 'countdown';
    this._sessionSpeakCue = false;
  };

  private _onSessionCountdownEnd = (event: CustomEvent<RecordingCountdownEndDetail>): void => {
    const skipped = event.detail.skipped;
    this._sessionPhase = 'recording';
    this._sessionWaveformController =
      this._speakingMode === 'echo'
        ? (this._echoRecorderEl?.waveformController ?? null)
        : (this._shadowingRecorderEl?.waveformController ?? null);
    if (skipped) {
      this._sessionSpeakCue = true;
      Message.primary(msg('请开始跟读'));
      try {
        console.log('[practice-view] vibrate');
        navigator.vibrate?.(40);
      } catch {
        console.error('[practice-view] vibrate may be unsupported / blocked');
      }
    } else {
      this._sessionSpeakCue = false;
    }
  };

  private _onSessionDockStop = async (): Promise<void> => {
    if (this._speakingMode === 'echo') {
      await this._onEchoRecordStop();
      return;
    }
    await this._shadowingRecorderEl?.stopRecording();
  };

  private _onSessionDockCancel = async (): Promise<void> => {
    if (this._speakingMode === 'echo') {
      await this._onEchoRecordStop();
    }
  };

  private _onEchoListenSegmentEnd = (event: Event): void => {
    const customEvent = event as CustomEvent<{ segmentIndex: number; segment: SubtitleSegment }>;
    if (!this._echoListening || !this._echoSegment) {
      return;
    }
    if (customEvent.detail.segment.id !== this._echoSegment.id) {
      return;
    }

    this._controller.removeEventListener(
      ExtendedMediaEventType.SEGMENT_END,
      this._onEchoListenSegmentEnd,
    );
    this._echoListening = false;
    this._timeTracker.setFlags({ echoListening: false });
    void this._controller.pause();

    void (async () => {
      try {
        await this._echoRecorderEl?.startRecording();
        if (!this._echoRecorderEl?.recording) {
          this._clearEchoSession();
        }
      } catch {
        this._clearEchoSession();
      }
    })();
  };

  private _cancelEchoListen(pauseMedia = true): void {
    this._controller.removeEventListener(
      ExtendedMediaEventType.SEGMENT_END,
      this._onEchoListenSegmentEnd,
    );
    if (pauseMedia) {
      void this._controller.pause();
    }
    this._clearEchoSession();
  }

  private _clearEchoSession(): void {
    this._echoListening = false;
    this._echoSegmentIndex = -1;
    this._echoSegment = null;
    this._timeTracker.setFlags({ echoListening: false });
    this._resetSessionUi();
  }

  private _resetSessionUi(): void {
    this._sessionPhase = 'idle';
    this._sessionSpeakCue = false;
    this._sessionWaveformController = null;
  }

  private _onEchoRecordRequest = async (
    event: CustomEvent<EchoRecordRequestDetail>,
  ): Promise<void> => {
    if (!this._recordingSupported || this._recording || this._echoListening) {
      return;
    }

    const { segmentIndex } = event.detail;
    const snapshot = this._controller.getSnapshot();
    const segment = snapshot.segments[segmentIndex];
    if (!segment || !this._mediaId) {
      return;
    }

    const count = await countEchoRecordings(this._mediaId, segment.id);
    if (count >= this._echoLimitPerSegment) {
      Message.warning(
        msg(str`该句录音已达上限（${this._echoLimitPerSegment}条），删除旧录音后可继续。`),
      );
      return;
    }

    this._echoSegmentIndex = segmentIndex;
    this._echoSegment = segment;
    this._recordingError = '';
    this._echoRecorderEl?.clearWaveform();
    this._sessionWaveformController = null;
    this._sessionSpeakCue = false;
    this._sessionPhase = 'listening';
    this._resetSettingsForEcho();
    this._echoListening = true;
    this._timeTracker.setFlags({ echoListening: true });
    this._controller.addEventListener(
      ExtendedMediaEventType.SEGMENT_END,
      this._onEchoListenSegmentEnd,
    );

    try {
      await this._controller.play();
    } catch {
      this._cancelEchoListen();
    }
  };

  private _onEchoRecordStop = async (): Promise<void> => {
    if (this._echoListening) {
      this._cancelEchoListen();
      return;
    }
    await this._echoRecorderEl?.stopRecording();
  };

  private async _saveShadowingRecording(
    blob: Blob,
    media: MediaItem,
    segments: PracticeSegment[],
  ): Promise<void> {
    try {
      const duration = await getMediaDuration(blob, blob.type);
      const record: PracticeRecord = {
        id: crypto.randomUUID(),
        mediaId: media.id,
        mediaTitle: media.title,
        mediaFilename: media.filename,
        mode: 'shadowing',
        mimeType: blob.type || 'audio/webm',
        recordingDuration: duration,
        sourceDuration: getPracticeSourceDuration(segments),
        createdAt: Date.now(),
        segments,
      };

      await saveRecording(record, blob);
      this._lastRecordingId = record.id;
      await this._refreshRecordings();
      await this._manageRecordList?.refresh();
      Message.success(msg('录音已保存'));
    } catch {
      this._recordingError = msg('保存录音失败，请重试。');
    }
  }

  private async _saveEchoRecording(
    blob: Blob,
    media: MediaItem,
    segment: SubtitleSegment,
  ): Promise<void> {
    try {
      const duration = await getMediaDuration(blob, blob.type);
      const practiceSegment: PracticeSegment = {
        id: segment.id,
        sourceStartTime: segment.startTime,
        sourceEndTime: segment.endTime,
        recordingStartTime: 0,
        recordingEndTime: duration,
      };
      const record: PracticeRecord = {
        id: crypto.randomUUID(),
        mediaId: media.id,
        mediaTitle: media.title,
        mediaFilename: media.filename,
        mode: 'echo',
        segmentId: segment.id,
        mimeType: blob.type || 'audio/webm',
        recordingDuration: duration,
        sourceDuration: getPracticeSourceDuration([practiceSegment]),
        createdAt: Date.now(),
        segments: [practiceSegment],
      };

      await saveRecording(record, blob);
      this._lastRecordingId = record.id;
      await this._refreshRecordings();
      Message.success(msg('录音已保存'));
    } catch {
      this._recordingError = msg('保存录音失败，请重试。');
    }
  }

  private async _refreshRecordings(): Promise<void> {
    if (!this._mediaId) {
      this._shadowingCount = 0;
      this._echoRecordingsBySegmentId = {};
      this._storageEstimate = null;
      return;
    }

    try {
      this._shadowingCount = await countShadowingRecordings(this._mediaId);
      const echoRecords = await findAllEchoRecordings(this._mediaId);
      const grouped: Record<string, PracticeRecord[]> = {};
      for (const record of echoRecords) {
        const segmentId = record.segmentId ?? record.segments[0]?.id;
        if (!segmentId) {
          continue;
        }
        grouped[segmentId] ??= [];
        grouped[segmentId].push(record);
      }
      for (const segmentId of Object.keys(grouped)) {
        grouped[segmentId].sort((a, b) => b.createdAt - a.createdAt);
      }
      this._echoRecordingsBySegmentId = grouped;
      this._storageEstimate = await estimateStorage();
    } catch {
      this._storageEstimate = null;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'practice-view': PracticeView;
  }
}
