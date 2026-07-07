import { msg, str, localized } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import '../library/record-list.js';
import { MediaController } from '../../controllers/media-controller.js';
import { AudioRecorderController } from '../../lib/audio-recorder.js';
import { loadPlaylistForPlayback } from '../../lib/media-loader.js';
import { countRecording, saveRecording } from '../../db/service.js';
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
import { ExtendedMediaEventType, formatStorageUsage } from '../../lib/playback-utils.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/icon.js';
import './media-player.js';
import './subtitle-panel.js';
import { RecordList } from '../library/record-list.js';
import { Message } from '../ui/message.js';
import { Loading } from '../ui/loading.js';

type PracticeType = 'listening' | 'speaking';

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

    .messages {
      margin-bottom: 16px;
    }

    .mode-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
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

    .settings-group label {
      display: grid;
      gap: 6px;
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    input[type='number'],
    select {
      padding: 6px 8px;
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface, #fff);
    }

    .recording-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }

    .recording-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--radius-full, 999px);
      background: rgba(255, 77, 79, 0.08);
      color: var(--color-danger, #ff4d4f);
      font-size: 0.875rem;
    }

    .current-segment {
      padding: 12px;
      border-radius: var(--radius-md, 8px);
      background: rgba(22, 119, 255, 0.06);
      color: var(--color-primary, #1677ff);
      font-size: 0.95rem;
      white-space: pre-wrap;
    }

    .recording-list {
      display: grid;
      gap: 10px;
      margin-top: 16px;
    }

    .recording-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-md, 8px);
      background: var(--color-surface, #fff);
    }

    .recording-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
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
  private _error = '';

  @state()
  private _practiceType: PracticeType = 'listening';

  @state()
  private _recording = false;

  @state()
  private _recordingError = '';

  @state()
  private _recordingCount = 0;

  @state()
  private _storageEstimate: StorageEstimate | null = null;

  private _getShadowingTips(): string[] {
    return [
      msg('采用跟读模式练习，点击以下「麦克风图标」并跟随播放语音，停止录音后会自动保存。'),
      msg('温馨提示：'),
      msg('1. 建议使用耳机练习。'),
      msg('2. 如果跟不上原音，可以设置倍速、单句暂停模式。'),
      msg('3. 录音前可以操作播放器设置，录音开始后播放器不可操作。'),
      msg('4. 除了倍速、音量、单句暂停模式，跟读模式会忽略其他的播放器设置。'),
    ];
  }

  @query('record-list')
  private _recordList?: RecordList;

  private readonly _controller = new MediaController();
  private readonly _audioRecorder = new AudioRecorderController({
    onStart: () => {
      this._recordingError = '';
      this._practiceSegments = [];
      this._recordingStartedAt = performance.now();
      this._lastRecordingEndTime = 0;
      this._isCollectingSegments = this._practiceType === 'speaking';
      this._attachEndedListener();

      this._resetSettingsForPractice();

      // start playing media when recording starts (after seek to the beginning if needed)
      // if you want to play at the beginning, use below code
      // void this._controller.seek(0);
      void this._controller.play();
      // @fixme if not start at a segment.startTime，segments in recording will be incorrect
    },
    onStop: (blob) => {
      // save recording to db when recording stopped
      void this._handleRecordingStopped(blob);
      void this._controller.pause();
    },
    onError: (error) => {
      this._detachEndedListener();
      this._isCollectingSegments = false;
      this._recording = false;
      this._recordingError =
        error.name === 'NotAllowedError'
          ? msg('未能开启麦克风，请检查权限。')
          : msg('录音失败，请重试。');
    },
    onStateChange: (state) => {
      this._recording = state === 'recording' || state === 'paused';
    },
  });
  private _practiceSegments: PracticeSegment[] = [];
  private _recordingStartedAt = 0;
  private _lastRecordingEndTime = 0;
  private _isCollectingSegments = false;
  private readonly _recordingLimit = DEFAULT_SETTINGS.maxRecordingsPerMedia;
  private readonly _recordingSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    typeof MediaRecorder !== 'undefined';

  disconnectedCallback(): void {
    this._controller.removeEventListener(ExtendedMediaEventType.SEGMENT_END, this._onSegmentEnded);
    this._controller.removeEventListener(ExtendedMediaEventType.TRACK_CHANGE, this._onTrackChange);
    this._detachEndedListener();
    if (this._audioRecorder.getState() !== 'inactive') {
      void this._audioRecorder.stop().catch(() => this._audioRecorder.destroy());
    } else {
      this._audioRecorder.destroy();
    }
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
    // 有 id 时用路由 id；无 id 时清空，让 _loadPractice 走第一首
    this._mediaId = nextId ?? '';
    void this._loadPractice();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._controller.addEventListener(ExtendedMediaEventType.SEGMENT_END, this._onSegmentEnded);
    this._controller.addEventListener(ExtendedMediaEventType.TRACK_CHANGE, this._onTrackChange);

    if (this.routeContext.params?.id) {
      this._mediaId = this.routeContext.params.id;
    }
    void this._loadPractice();
  }

  // track-change 处理：
  private _onTrackChange = (): void => {
    this._syncMediaIdFromController();
    void this._refreshRecordings();
  };

  render() {
    // @fixme 离开本页面，音频没有暂停，会继续播放
    const remaining = Math.max(this._recordingLimit - this._recordingCount, 0);
    const isSpeaking = this._practiceType === 'speaking';

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
            ${msg('听力')}
          </ui-button>
          <ui-button
            variant="${this._practiceType === 'speaking' ? 'primary' : 'secondary'}"
            @click="${() => this._setPracticeType('speaking')}"
          >
            ${msg('口语')}
          </ui-button>
        </div>
        ${isSpeaking
          ? html`
              <div class="settings-panel">
                <div class="settings-group">
                  <div class="info-text">
                    <div class="info-text">
                      ${this._recordingSupported
                        ? remaining > 0
                          ? html`${this._getShadowingTips().map((tip) => html`<div>${tip}</div>`)}`
                          : msg(
                              str`当前音频的录音已达上限（${this._recordingLimit}条），删除旧录音后可继续。`,
                            )
                        : msg('当前浏览器不支持录音。')}
                    </div>

                    <div class="recording-controls">
                      <ui-icon
                        style="margin-top: 8px;"
                        title="${this._recording ? msg('停止录音') : msg('开始录音')}"
                        name="${this._recording ? 'stop-recording' : 'micro-on'}"
                        size="20px"
                        ?disabled="${!this._recordingSupported || remaining <= 0}"
                        @click="${this._toggleRecording}"
                      ></ui-icon>
                      ${this._recording
                        ? html`<span class="recording-status">${msg('正在录音…')}</span>`
                        : null}
                      ${this._recordingError
                        ? html`<ui-alert type="error">${this._recordingError}</ui-alert>`
                        : null}
                    </div>

                    ${this._storageEstimate
                      ? html`
                          <div class="storage-info">
                            <div>
                              ${msg('当前存储')}：${formatStorageUsage(this._storageEstimate.usage)}
                              / ${formatStorageUsage(this._storageEstimate.quota)}
                              (${Math.round(this._storageEstimate.remainingPercent)}%
                              ${msg('剩余')})
                            </div>
                          </div>
                        `
                      : null}
                    ${this._storageEstimate &&
                    this._storageEstimate.remainingPercent <=
                      DEFAULT_SETTINGS.lowStorageThresholdPercent
                      ? html`<ui-alert type="warning">
                          ${msg('磁盘存储空间不足，建议导出或删除旧录音。')}
                        </ui-alert>`
                      : null}

                    <div class="settings-group">
                      <h3>${msg('当前音频的已保存录音')}</h3>
                      <record-list
                        .mediaId="${this._mediaId}"
                        .showHeader="${false}"
                        @recording-deleted="${this._refreshRecordings}"
                      ></record-list>
                    </div>
                  </div>
                </div>
              </div>
            `
          : null}

        <div class="layout">
          <media-player
            .controller="${this._controller}"
            ?disabled="${isSpeaking && this._recording}"
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
            @segment-change="${(e: CustomEvent) => console.log('当前播放句改变:', e.detail)}"
            @segment-end="${(e: CustomEvent) => console.log('句子播放结束:', e.detail)}"
            @track-change="${(e: CustomEvent) => console.log('当前播放媒体改变:', e.detail)}"
          >
          </media-player>
          <subtitle-panel .controller="${this._controller}"></subtitle-panel>
        </div>
      </section>
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
      // if mediaId is not in playlist, use the first media
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

    this._practiceType = type;
    this._recordingError = '';
    void this._stopRecording();
  }

  private _onSegmentEnded = (event: Event): void => {
    const customEvent = event as CustomEvent<{ segmentIndex: number; segment: SubtitleSegment }>;
    const segment = customEvent.detail?.segment;
    if (!segment) {
      return;
    }

    if (this._isCollectingSegments && this._audioRecorder.getState() === 'recording') {
      const recordingEndTime = this._getRecordingElapsedSeconds();
      this._practiceSegments.push({
        id: segment.id,
        sourceStartTime: segment.startTime,
        sourceEndTime: segment.endTime,
        recordingStartTime: this._lastRecordingEndTime,
        recordingEndTime,
      });
      this._lastRecordingEndTime = recordingEndTime;
    }
  };

  private _getRecordingElapsedSeconds(): number {
    if (this._recordingStartedAt === 0) {
      return 0;
    }
    return (performance.now() - this._recordingStartedAt) / 1000;
  }

  /** 提前停止录音时，补录当前未触发 SEGMENT_END 的句子 */
  private _finalizeOpenSegment(): void {
    if (!this._isCollectingSegments) {
      return;
    }

    const snapshot = this._controller.getSnapshot();
    const segment = snapshot.segments[snapshot.currentSegmentIndex];
    if (!segment) {
      return;
    }

    const last = this._practiceSegments[this._practiceSegments.length - 1];
    if (last?.id === segment.id) {
      return;
    }

    const recordingEndTime = this._getRecordingElapsedSeconds();
    this._practiceSegments.push({
      id: segment.id,
      sourceStartTime: segment.startTime,
      sourceEndTime: segment.endTime,
      recordingStartTime: this._lastRecordingEndTime,
      recordingEndTime,
    });
    this._lastRecordingEndTime = recordingEndTime;
  }

  private async _toggleRecording(): Promise<void> {
    if (this._recording) {
      await this._stopRecording();
      return;
    }

    await this._startRecording();
  }

  private _onEnded = (): void => {
    // stop recording (and save recording to db which is done through onStop callback) when media ended
    void this._stopRecording({ save: true });
  };

  /** Reset loop/sleep for shadowing practice; only keeps rate, volume, and pause settings. */
  private _resetSettingsForPractice(): void {
    const snapshot = this._controller.getSnapshot();
    this._controller.resetSettings();

    this._controller.setVolume(snapshot.volume);
    this._controller.setPlaybackRate(snapshot.playbackRate);
    this._controller.setPauseMode(snapshot.pauseMode);
    this._controller.setPauseSeconds(snapshot.pauseSeconds);
    this._controller.setPausePercent(snapshot.pausePercent);
  }

  private async _startRecording(): Promise<void> {
    if (!this._recordingSupported) {
      this._recordingError = msg('当前浏览器不支持录音。');
      return;
    }

    if (this._recordingCount >= this._recordingLimit) {
      this._recordingError = msg('录音已达上限。');
      return;
    }

    this._recordingError = '';

    try {
      await this._audioRecorder.start();
    } catch {
      if (!this._recordingError) {
        this._recordingError = msg('未能开启麦克风，请检查权限。');
      }
    }
  }

  private async _stopRecording(options: { save?: boolean } = {}): Promise<void> {
    if (this._audioRecorder.getState() === 'inactive') {
      return;
    }

    this._detachEndedListener();

    if (options.save === false) {
      this._isCollectingSegments = false;
      this._audioRecorder.destroy();
      this._recording = false;
      return;
    }

    this._finalizeOpenSegment();

    try {
      await this._audioRecorder.stop();
    } catch {
      this._audioRecorder.destroy();
      this._recording = false;
    }
  }

  private async _handleRecordingStopped(blob: Blob): Promise<void> {
    this._detachEndedListener();
    this._recording = false;
    this._audioRecorder.destroy();

    const snapshot = this._controller.getSnapshot();
    const currentItem = snapshot.currentItem;
    if (!currentItem) {
      return;
    }

    const segments = this._practiceSegments;
    this._isCollectingSegments = false;
    this._recordingStartedAt = 0;
    await this._saveRecording(blob, currentItem, segments);
  }

  private _attachEndedListener(): void {
    this._controller.addEventListener('ended', this._onEnded);
  }

  private _detachEndedListener(): void {
    this._controller.removeEventListener('ended', this._onEnded);
  }

  private async _saveRecording(
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
        sourceDuration: media.duration,
        createdAt: Date.now(),
        segments,
      };

      await saveRecording(record, blob);
      await this._refreshRecordings();
      // fixme 没有刷新录音列表
      await this._recordList?.refresh();
      Message.success(msg('录音已保存'));
    } catch {
      this._recordingError = msg('保存录音失败，请重试。');
    }
  }

  private async _refreshRecordings(): Promise<void> {
    if (!this._mediaId) {
      this._recordingCount = 0;
      this._storageEstimate = null;
      return;
    }

    try {
      this._recordingCount = await countRecording(this._mediaId);
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
