import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { customElement, property, query, state } from 'lit/decorators.js';

import '../library/record-list.js';
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
  PracticeRecord,
  PracticeSegment,
  RouteContext,
  SubtitleSegment,
} from '../../types/models.js';
import { DEFAULT_SETTINGS } from '../../types/models.js';
import {
  ExtendedMediaEventType,
  formatStorageUsage,
  getPracticeSourceDuration,
} from '../../lib/playback-utils.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/icon.js';
import './media-player.js';
import './subtitle-panel.js';
import './audio-recorder.js';
import {
  AudioRecorder,
  type RecordingCompleteDetail,
  type RecordingStateChangeDetail,
} from './audio-recorder.js';
import { RecordList } from '../library/record-list.js';
import { Message } from '../ui/message.js';
import { Loading } from '../ui/loading.js';
import { EchoRecordRequestDetail, SubtitlePanelFullscreenChangeDetail } from './subtitle-panel.js';

type PracticeType = 'listening' | 'speaking';
type SpeakingMode = 'shadowing' | 'echo';

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
      gap: 12px;
      margin-bottom: 16px;
    }

    .header h2 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
    }

    .layout {
      display: grid;
      gap: 16px;
    }

    .mode-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
    }

    .speaking-mode-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }

    .settings-panel {
      display: grid;
      gap: 12px;
      padding: 16px;
      margin-bottom: 16px;
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
      gap: 8px;
    }

    .storage-info {
      display: grid;
      gap: 4px;
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .info-text {
      display: grid;
      gap: 8px;
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .echo-recorder {
      margin-top: 8px;
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

  private _echoSegment: SubtitleSegment | null = null;

  private _getShadowingTips(): string[] {
    return [
      msg('采用跟读模式练习，点击以下【麦克风图标】并跟随播放语音，停止录音后会自动保存。'),
      msg('温馨提示：'),
      msg('1. 建议使用耳机练习。'),
      msg('2. 如果跟不上原音，可以设置倍速、单句暂停模式。'),
      msg('3. 录音前可以操作播放器设置，录音开始后播放器不可操作。'),
      msg('4. 除了倍速、音量、单句暂停模式，跟读模式会忽略其他的播放器设置。'),
    ];
  }

  private _getEchoTips(): string[] {
    return [
      msg(
        '采用单句跟读（Echo）模式：点击字幕行右侧【麦克风图标】，先播放该句原音，原音结束后自动开始录音，跟读完成后手动停止。',
      ),
      msg('温馨提示：'),
      msg('1. 建议使用耳机练习。'),
      msg('2. 每句最多保存若干条录音，可在字幕行右侧下拉查看。'),
      msg('3. 听音和录音期间播放器不可操作。'),
    ];
  }

  @query('record-list')
  private _recordList?: RecordList;

  @query('audio-recorder#shadowing-recorder')
  private _shadowingRecorderEl?: AudioRecorder;

  @query('audio-recorder#echo-recorder')
  private _echoRecorderEl?: AudioRecorder;

  private readonly _controller = new MediaController();
  private _lastRecordingId: string | null = null;
  private readonly _shadowingLimit = DEFAULT_SETTINGS.maxRecordingsPerMedia;
  private readonly _echoLimitPerSegment = DEFAULT_SETTINGS.maxEchoPerSegment;
  private readonly _recordingSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    typeof MediaRecorder !== 'undefined';

  disconnectedCallback(): void {
    if (this._echoListening) {
      this._cancelEchoListen();
    }
    this._controller.removeEventListener(ExtendedMediaEventType.TRACK_CHANGE, this._onTrackChange);
    this._controller.destroy();
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (!changed.has('routeContext')) {
      return;
    }
    const prevContext = changed.get('routeContext') as RouteContext | undefined;
    const prevId = prevContext?.params?.id;
    const nextId = this.routeContext.params.id;
    if (prevId === nextId) {
      return;
    }
    this._mediaId = nextId ?? '';
    void this._loadPractice();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._controller.addEventListener(ExtendedMediaEventType.TRACK_CHANGE, this._onTrackChange);

    if (this.routeContext.params?.id) {
      this._mediaId = this.routeContext.params.id;
    }
    void this._loadPractice();
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

    return html`
      <section>
        <div class="header">
          <h2>${headerTitle}</h2>
        </div>

        <div class="mode-tabs">
          <ui-button
            variant="${this._practiceType === 'listening' ? 'primary' : 'secondary'}"
            @click="${() => this._setPracticeType('listening')}"
          >
            <ui-icon name="listen" size="20px"></ui-icon> ${msg('听力')}
          </ui-button>
          <ui-button
            variant="${this._practiceType === 'speaking' ? 'primary' : 'secondary'}"
            @click="${() => this._setPracticeType('speaking')}"
          >
            <ui-icon name="speak" size="20px"></ui-icon> ${msg('口语')}
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
                <ui-button
                  variant="${this._speakingMode === 'echo' ? 'primary' : 'secondary'}"
                  @click="${() => this._setSpeakingMode('echo')}"
                >
                  ${msg('单句 (Echo)')}
                </ui-button>
              </div>
            `
          : null}
        ${isShadowing
          ? html`
              <div class="settings-panel">
                <div class="settings-group">
                  <div class="info-text">
                    ${this._recordingSupported
                      ? shadowingRemaining > 0
                        ? html`${this._getShadowingTips().map((tip) => html`<div>${tip}</div>`)}`
                        : msg(
                            str`当前音频的跟读录音已达上限（${this._shadowingLimit}条），删除旧录音后可继续。`,
                          )
                      : msg('当前浏览器不支持录音。')}
                    ${keyed(
                      this._mediaId,
                      html`<audio-recorder
                        id="shadowing-recorder"
                        .controller=${this._controller}
                        .collectSegments=${true}
                        .disabled=${!this._recordingSupported || shadowingRemaining <= 0}
                        .beforeRecordingStart=${this._resetSettingsForShadowing}
                        @recording-complete=${this._onShadowingRecordingComplete}
                        @recording-state-change=${this._onRecordingStateChange}
                      ></audio-recorder>`,
                    )}
                    ${this._recordingError
                      ? html`<ui-alert type="error">${this._recordingError}</ui-alert>`
                      : null}
                    ${this._renderStorageInfo()}

                    <div class="settings-group">
                      <h3>${msg('当前音频的已保存录音')}</h3>
                      <record-list
                        .mediaId="${this._mediaId}"
                        .modeFilter="${'shadowing'}"
                        .showHeader="${false}"
                        @recording-deleted="${(event: CustomEvent<{ id: string }>) =>
                          this._onRecordingDeleted(event.detail.id)}"
                      ></record-list>
                    </div>
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
                    ? html`${this._getEchoTips().map((tip) => html`<div>${tip}</div>`)}`
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
                    .beforeRecordingStart=${this._resetSettingsForEcho}
                    @recording-complete=${this._onEchoRecordingComplete}
                    @recording-state-change=${this._onRecordingStateChange}
                  ></audio-recorder>`,
                )}
              </div>`
            : null}
        </div>
      </section>
    `;
  }

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
      ${this._storageEstimate.remainingPercent <= DEFAULT_SETTINGS.lowStorageThresholdPercent
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
      await this._refreshRecordings();
    } catch {
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
  }

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
    if (!event.detail.recording && this._speakingMode === 'echo') {
      this._echoSegmentIndex = -1;
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
    this._resetSettingsForEcho();
    this._echoListening = true;
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
      await this._recordList?.refresh();
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
