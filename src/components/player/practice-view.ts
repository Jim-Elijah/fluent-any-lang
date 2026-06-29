import { msg, updateWhenLocaleChanges } from '@lit/localize';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import '../library/record-list.js';
import { MediaController } from '../../controllers/media-controller.js';
import { loadPlaylistForPlayback } from '../../lib/media-loader.js';
import { countRecording, getMedia, saveRecording } from '../../db/service.js';
import { estimateStorage } from '../../lib/export-content.js';
import { getMediaDuration } from '../../lib/file-validation.js';
import type { PracticeMode, PracticeRecord, SubtitleSegment } from '../../types/models.js';
import { DEFAULT_SETTINGS } from '../../types/models.js';
import { formatStorageUsage } from '../../lib/playback-utils.js';
import '../ui/alert.js';
import '../ui/button.js';
import './media-player.js';
import './subtitle-panel.js';

type PracticeType = 'listening' | 'speaking';

type StorageEstimate = {
  usage: number;
  quota: number;
  remaining: number;
  remainingPercent: number;
};

@customElement('practice-view')
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
      font-size: 0.875rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .mode-buttons {
      display: flex;
      gap: 10px;
    }
  `;

  @property({ type: String })
  mediaId = '';

  @state()
  private _loading = true;

  @state()
  private _error = '';

  @state()
  private _practiceType: PracticeType = 'listening';

  @state()
  private _speakingMode: PracticeMode = 'repeat';

  @state()
  private _repeatPauseMode: 'seconds' | 'percentage' = 'seconds';

  @state()
  private _repeatPauseSeconds = 1;

  @state()
  private _repeatPausePercent = 100;

  @state()
  private _recording = false;

  @state()
  private _recordingError = '';

  @state()
  private _recordingCount = 0;

  @state()
  private _recordingSaved = false;

  // @state()
  // private _recordings: PracticeRecord[] = [];

  @state()
  private _storageEstimate: StorageEstimate | null = null;

  private readonly _controller = new MediaController();
  private _mediaRecorder: MediaRecorder | null = null;
  private _recordingStream: MediaStream | null = null;
  private _recordingChunks: Blob[] = [];
  private _segmentRepeatTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _recordingLimit = DEFAULT_SETTINGS.maxRecordingsPerMedia;
  private readonly _recordingSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    typeof MediaRecorder !== 'undefined';

  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  disconnectedCallback(): void {
    this._controller.removeEventListener('segment-end', this._onSegmentEnded);
    this._controller.removeEventListener('state-change', this._onRecordingControllerStateChange);
    this._stopRecording().catch(() => undefined);
    this._clearSegmentRepeatTimer();
    this._controller.destroy();
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('mediaId') && this.mediaId) {
      void this._loadPractice();
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (this.mediaId) {
      void this._loadPractice();
    }
  }

  render() {
    console.log('practice-view render');
    // const snapshot = this._controller.getSnapshot();
    // const currentSegment = snapshot.segments[snapshot.currentSegmentIndex];
    const remaining = Math.max(this._recordingLimit - this._recordingCount, 0);
    const isSpeaking = this._practiceType === 'speaking';

    const headerTitle =
      this._practiceType === 'listening'
        ? msg('Listening 练习')
        : this._speakingMode === 'repeat'
          ? msg('Speaking - Repeat 练习')
          : msg('Speaking - Shadowing 练习');

    return html`
      <section>
        <div class="header">
          <h2>${headerTitle}</h2>
          <ui-button variant="secondary" @click="${this._handleBack}">
            ${msg('返回内容库')}
          </ui-button>
        </div>

        <div class="mode-tabs">
          <ui-button
            variant="${this._practiceType === 'listening' ? 'primary' : 'secondary'}"
            @click="${() => this._setPracticeType('listening')}"
          >
            ${msg('Listening')}
          </ui-button>
          <ui-button
            variant="${this._practiceType === 'speaking' ? 'primary' : 'secondary'}"
            @click="${() => this._setPracticeType('speaking')}"
          >
            ${msg('Speaking')}
          </ui-button>
        </div>

        ${this._error
          ? html`<ui-alert class="messages" variant="error">${this._error}</ui-alert>`
          : null}
        ${this._loading ? html`<ui-alert variant="info">${msg('加载媒体中…')}</ui-alert>` : null}
        ${isSpeaking
          ? html`
              <div class="settings-panel">
                <h3>${msg('Speaking 设置')}</h3>

                <div class="settings-group">
                  <label>
                    ${msg('练习模式')}
                    <div class="mode-buttons">
                      <ui-button
                        variant="${this._speakingMode === 'repeat' ? 'primary' : 'secondary'}"
                        @click="${() => this._setSpeakingMode('repeat')}"
                      >
                        ${msg('Repeat')}
                      </ui-button>
                      <ui-button
                        variant="${this._speakingMode === 'shadowing' ? 'primary' : 'secondary'}"
                        @click="${() => this._setSpeakingMode('shadowing')}"
                      >
                        ${msg('Shadowing')}
                      </ui-button>
                    </div>
                  </label>
                </div>

                ${this._speakingMode === 'repeat'
                  ? html`
                      <div class="settings-group">
                        <label>
                          ${msg('暂停方式')}
                          <select
                            .value="${this._repeatPauseMode}"
                            @change="${this._handleRepeatPauseModeChange}"
                          >
                            <option value="seconds">${msg('固定秒数')}</option>
                            <option value="percentage">${msg('句长百分比')}</option>
                          </select>
                        </label>
                      </div>

                      ${this._repeatPauseMode === 'seconds'
                        ? html`
                            <div class="settings-group">
                              <label>
                                ${msg('暂停时间（秒）')}
                                <input
                                  type="number"
                                  min="1"
                                  max="30"
                                  .value="${String(this._repeatPauseSeconds)}"
                                  @change="${this._handleRepeatPauseSecondsChange}"
                                />
                              </label>
                            </div>
                          `
                        : html`
                            <div class="settings-group">
                              <label>
                                ${msg('暂停比例（%）')}
                                <input
                                  type="number"
                                  min="100"
                                  max="500"
                                  step="10"
                                  .value="${String(this._repeatPausePercent)}"
                                  @change="${this._handleRepeatPausePercentChange}"
                                />
                              </label>
                            </div>
                          `}

                      <p class="info-text">
                        ${msg(
                          '每句话播放完毕后会自动暂停，您可在暂停期间进行跟读。该模式下的录音不会保存。',
                        )}
                      </p>
                    `
                  : html`
                      <div class="settings-group">
                        <div class="info-text">
                          <div>
                            ${msg('已保存录音')}：${this._recordingCount}/${this._recordingLimit}
                          </div>
                          <div>
                            ${this._recordingSupported
                              ? remaining > 0
                                ? msg('点击"开始录音"并跟随播放语音，录音会自动保存。')
                                : msg('录音已达上限，删除旧录音后可继续。')
                              : msg('当前浏览器不支持录音。')}
                          </div>
                        </div>
                        <div class="recording-controls">
                          <ui-button
                            variant="primary"
                            ?disabled="${this._recording ||
                            !this._recordingSupported ||
                            remaining <= 0}"
                            @click="${this._toggleRecording}"
                          >
                            ${this._recording ? msg('停止录音') : msg('开始录音')}
                          </ui-button>
                          ${this._recording
                            ? html`<span class="recording-status">${msg('正在录音…')}</span>`
                            : null}
                          ${this._recordingSaved
                            ? html`<ui-alert variant="success">${msg('录音已保存')}</ui-alert>`
                            : null}
                          ${this._recordingError
                            ? html`<ui-alert variant="error">${this._recordingError}</ui-alert>`
                            : null}
                        </div>

                        ${this._storageEstimate
                          ? html`
                              <div class="storage-info">
                                <div>
                                  ${msg('当前存储')}：${formatStorageUsage(
                                    this._storageEstimate.usage,
                                  )}
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
                          ? html`<ui-alert variant="warning">
                              ${msg('磁盘存储空间不足，建议导出或删除旧录音。')}
                            </ui-alert>`
                          : null}

                        <div class="settings-group">
                          <h3>${msg('已保存录音')}</h3>
                          <record-list
                            .mediaId="${this.mediaId}"
                            .showHeader="${false}"
                          ></record-list>
                        </div>
                      </div>
                    `}
              </div>
            `
          : null}

        <div class="layout">
          <media-player
            .controller="${this._controller}"
            ?disabled="${isSpeaking}"
            mode=""
            .controlsConfig="${{
              loopMode: true,
              sleepMode: true,
              playPause: true,
              volume: true,
              playbackRate: true,
              progress: true,
              previousNextTrack: true,
              previousNextSegment: true,
            }}"
            @segment-change="${(e: CustomEvent) => console.log('当前播放句改变:', e.detail)}"
            @segment-end="${(e: CustomEvent) => console.log('句子播放结束:', e.detail)}"
          >
          </media-player>
          <subtitle-panel .controller="${this._controller}"></subtitle-panel>
        </div>
      </section>
    `;
  }

  private async _loadPractice(): Promise<void> {
    this._loading = true;
    this._error = '';
    this._recordingSaved = false;

    try {
      const playlist = await loadPlaylistForPlayback();
      if (playlist.length === 0) {
        this._error = msg('内容库为空，请先导入媒体。');
        return;
      }

      const startIndex = Math.max(
        0,
        playlist.findIndex((entry) => entry.item.id === this.mediaId),
      );

      await this._controller.loadTracks(playlist, startIndex);
      await this._refreshRecordings();
      this._controller.addEventListener('segment-end', this._onSegmentEnded);
    } catch {
      this._error = msg('加载媒体失败，请重试。');
    } finally {
      this._loading = false;
    }
  }

  private _setPracticeType(type: PracticeType): void {
    if (this._practiceType === type) {
      return;
    }

    this._practiceType = type;
    this._recordingError = '';
    this._recordingSaved = false;
    this._clearSegmentRepeatTimer();
    void this._stopRecording();
  }

  private _setSpeakingMode(mode: PracticeMode): void {
    if (this._speakingMode === mode) {
      return;
    }

    this._speakingMode = mode;
    this._recordingError = '';
    this._recordingSaved = false;
    this._clearSegmentRepeatTimer();
    void this._stopRecording();
  }

  private _handleRepeatPauseModeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this._repeatPauseMode = target.value as 'seconds' | 'percentage';
  }

  private _handleRepeatPauseSecondsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value, 10);
    if (!Number.isNaN(value) && value >= 1 && value <= 30) {
      this._repeatPauseSeconds = value;
    }
  }

  private _handleRepeatPausePercentChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value, 10);
    if (!Number.isNaN(value) && value >= 100) {
      this._repeatPausePercent = value;
    }
  }

  private _onSegmentEnded = (event: Event): void => {
    console.log('on segment-end', event);
    if (this._practiceType !== 'speaking' || this._speakingMode !== 'repeat') {
      return;
    }

    const customEvent = event as CustomEvent<{ segmentIndex: number; segment: SubtitleSegment }>;
    const detail = customEvent.detail;
    const segment = detail?.segment;
    if (!segment) {
      return;
    }

    this._clearSegmentRepeatTimer();
    const pauseDuration =
      this._repeatPauseMode === 'seconds'
        ? this._repeatPauseSeconds * 1000
        : (((segment.endTime - segment.startTime) * this._repeatPausePercent) / 100) * 1000;

    this._controller.pause();
    this._recordingError = '';
    this._recordingSaved = false;

    // @fixme 单据循环时，不会等待
    this._segmentRepeatTimer = setTimeout(() => {
      if (this._practiceType === 'speaking' && this._speakingMode === 'repeat') {
        void this._controller.play();
      }
    }, pauseDuration);
  };

  private _clearSegmentRepeatTimer(): void {
    if (this._segmentRepeatTimer !== null) {
      clearTimeout(this._segmentRepeatTimer);
      this._segmentRepeatTimer = null;
    }
  }

  private async _toggleRecording(): Promise<void> {
    if (this._recording) {
      await this._stopRecording();
      return;
    }

    await this._startRecording();
  }

  private _onRecordingControllerStateChange = (event: Event): void => {
    const snapshot = (event as CustomEvent).detail;
    if (!snapshot) return;
    const epsilon = 0.2;
    const isEnded =
      Number.isFinite(snapshot.duration) &&
      snapshot.duration > 0 &&
      snapshot.currentTime >= snapshot.duration - epsilon &&
      !snapshot.isPlaying;
    if (this._recording && isEnded) {
      void this._stopRecording();
    }
  };
  private async _startRecording(): Promise<void> {
    if (!this._recordingSupported) {
      this._recordingError = msg('当前浏览器不支持录音。');
      return;
    }

    if (this._recordingCount >= this._recordingLimit) {
      this._recordingError = msg('录音已达上限。');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._recordingStream = stream;
      this._recordingChunks = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });
      this._mediaRecorder = recorder;

      recorder.addEventListener('dataavailable', (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this._recordingChunks.push(event.data);
        }
      });

      recorder.addEventListener('stop', async () => {
        const blob = new Blob(this._recordingChunks, { type: recorder.mimeType });
        const mediaItem = await getMedia(this.mediaId);
        const mediaTitle = mediaItem?.title;
        void this._saveRecording(blob, mediaTitle || '');
      });

      recorder.start();
      this._recording = true;

      this._recordingError = '';
      this._recordingSaved = false;

      // 在 recorder.start(); this._recording = true; 之后添加：
      this._controller.addEventListener('state-change', this._onRecordingControllerStateChange);

      console.log('_startRecording');

      if (this._controller) {
        void this._controller.play();
      }
    } catch {
      this._recordingError = msg('未能开启麦克风，请检查权限。');
    }
  }

  private async _stopRecording(): Promise<void> {
    if (!this._recording || !this._mediaRecorder) {
      return;
    }

    const recorder = this._mediaRecorder;
    const stopped = new Promise<void>((resolve) => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
    });

    recorder.stop();
    await stopped;
    this._recording = false;
    this._mediaRecorder = null;
    // 在 await stopped; this._recording = false; 之后添加：
    this._controller.removeEventListener('state-change', this._onRecordingControllerStateChange);
    this._disposeRecordingStream();
  }

  private async _saveRecording(blob: Blob, mediaTitle: string): Promise<void> {
    try {
      const snapshot = this._controller.getSnapshot();
      const duration = await getMediaDuration(blob, blob.type);
      const record: PracticeRecord = {
        id: crypto.randomUUID(),
        mediaId: this.mediaId,
        mediaTitle,
        mode: 'shadowing',
        mimeType: blob.type || 'audio/webm',
        duration,
        createdAt: Date.now(),
        segmentIndex: snapshot.currentSegmentIndex >= 0 ? snapshot.currentSegmentIndex : undefined,
      };

      await saveRecording(record, blob);
      // fixme 没有刷新录音列表
      await this._refreshRecordings();
      this._recordingSaved = true;
    } catch {
      this._recordingError = msg('保存录音失败，请重试。');
    }
  }

  private _disposeRecordingStream(): void {
    if (!this._recordingStream) {
      return;
    }

    for (const track of this._recordingStream.getTracks()) {
      track.stop();
    }

    this._recordingStream = null;
  }

  private async _refreshRecordings(): Promise<void> {
    if (!this.mediaId) {
      // this._recordings = [];
      this._recordingCount = 0;
      this._storageEstimate = null;
      return;
    }

    try {
      // this._recordings = await (this.mediaId);
      this._recordingCount = await countRecording(this.mediaId);
      this._storageEstimate = await estimateStorage();
    } catch {
      this._storageEstimate = null;
    }
  }

  private _handleBack(): void {
    this.dispatchEvent(
      new CustomEvent('practice-close', {
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'practice-view': PracticeView;
  }
}
