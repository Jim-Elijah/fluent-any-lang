import { msg, str, localized } from '@lit/localize';
import { html, LitElement, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { customElement, property, query, state } from 'lit/decorators.js';
import { navigator as Navigator } from 'lit-element-router';

import '../library/record-list.js';
import { PracticeTimeTracker } from '../../analytics/practice-time-tracker.js';
import { MediaController } from '../../controllers/media-controller.js';
import { loadMediaForPlayback, loadPlaylistForPlayback } from '../../lib/media-loader.js';
import {
  countEchoRecordings,
  countShadowingRecordings,
  findAllEchoRecordings,
  saveRecording,
} from '../../db/service.js';
import { getScoresByRecordIds } from '../../db/pronunciation-score.js';
import { aggregateEchoLatestOverall } from '../../lib/pronunciation-score/aggregate.js';
import { estimateStorage } from '../../lib/export-content.js';
import { reportError } from '../../lib/error-reporter.js';
import { getMediaDuration } from '../../lib/file-validation.js';
import type {
  DiscriminationSettings,
  ListeningMode,
  LoopMode,
  PauseMode,
  PracticeType,
  SpeakingMode,
  MediaItem,
  NoiseItem,
  PracticeAnalyticsMode,
  PracticeRecord,
  PracticeSegment,
  RouteContext,
  ShadowingGapPolicy,
  SleepMode,
  SubtitleSegment,
} from '../../types/models.js';
import {
  DISCRIMINATION_LADDER_COUNT_MAX,
  DISCRIMINATION_LADDER_COUNT_MIN,
  DISCRIMINATION_MAX_NOISE_TRACKS,
  DEFAULT_DISCRIMINATION_SETTINGS,
} from '../../types/models.js';
import {
  getAppSettings,
  setAppSettings,
  shouldSkipDiscriminationTips,
} from '../../lib/app-settings.js';
import { NoiseMixer } from '../../lib/noise-mixer.js';
import { RateLadder } from '../../lib/rate-ladder.js';
import { getNoiseBlob, getNoiseList } from '../../db/noise.js';
import {
  AUDIO_FOCUS_REQUEST_EVENT,
  RECORDING_PREVIEW_CLOSE_EVENT,
  RECORDING_PREVIEW_OPEN_EVENT,
} from '../../lib/audio-focus.js';
import { EchoClipPlayer } from '../../lib/echo-clip-player.js';
import {
  PLAYBACK_RATE_HOTKEY_STEP,
  VOLUME_HOTKEY_STEP,
  getHotkeyManager,
  supportsKeyboardShortcuts,
} from '../../lib/hotkeys/index.js';
import {
  ExtendedMediaEventType,
  MediaEventType,
  formatStorageUsage,
  getPracticeSourceDuration,
  practiceScriptFromSubtitle,
} from '../../lib/playback-utils.js';
import { Z_INDEX } from '../ui/internal/z-index.js';
import '../ui/alert.js';
import '../ui/button.js';
import '../ui/icon.js';
import '../ui/icon-button.js';
import '../ui/modal.js';
import './media-player.js';
import './subtitle-panel.js';
import './audio-recorder.js';
import './echo-session-dock.js';
import './discrimination-panel.js';
import './practice-tips-modal.js';
import './practice-hotkeys-help.js';
import {
  AudioRecorder,
  type RecordingCompleteDetail,
  type RecordingCountdownEndDetail,
  type RecordingErrorDetail,
  type RecordingStateChangeDetail,
} from './audio-recorder.js';
import type { RecordingSessionPhase } from './echo-session-dock.js';
import type {
  DiscriminationLadderCountDetail,
  DiscriminationLadderRateDetail,
  DiscriminationNoiseToggleDetail,
  DiscriminationNoiseVolumeDetail,
} from './discrimination-panel.js';
import type { PracticeTipsConfirmDetail } from './practice-tips-modal.js';
import type { PracticeTipsKind } from './practice-tips.js';
import { getEchoSummary, getShadowingSummary } from './practice-tips.js';
import { practiceViewStyles } from './practice-view-styles.js';
import type { WaveformController } from '../../controllers/waveform-controller.js';
import {
  setUserSettings,
  shouldSkipEchoTips,
  shouldSkipShadowingTips,
} from '../../lib/user-settings.js';
import type { RecordList } from '../library/record-list.js';
import { Message } from '../ui/message.js';
import { Loading } from '../ui/loading.js';
import {
  EchoManageRecordingsDetail,
  EchoRecordRequestDetail,
  SubtitlePanel,
  SubtitlePanelFullscreenChangeDetail,
} from './subtitle-panel.js';
import {
  addToSentenceBank,
  getSentenceBankList,
  removeFromSentenceBank,
} from '../../db/service.js';
import {
  canRecordWithMicrophone,
  checkMicrophoneStatus,
  getMicrophoneBlockedMessage,
  invalidateMicrophoneStatusCache,
  isRecordingSupported,
  type MicrophoneStatus,
} from '../../lib/microphone-access.js';

type StorageEstimate = {
  usage: number;
  quota: number;
  remaining: number;
  remainingPercent: number;
};

type PracticeLaunchContext =
  | { kind: 'single'; mediaId: string }
  | { kind: 'playlist'; playlistId: string; mediaId?: string };

const NavigatorElement = Navigator(LitElement);

@customElement('practice-view')
@localized()
export class PracticeView extends NavigatorElement {
  static styles = practiceViewStyles;

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
  private _listeningMode: ListeningMode = 'free';

  @state()
  private _speakingMode: SpeakingMode = 'echo';

  @state()
  private _discriminationSettings: DiscriminationSettings = {
    selected: [],
    ladderCount: DEFAULT_DISCRIMINATION_SETTINGS.ladderCount,
    ladderRates: [...DEFAULT_DISCRIMINATION_SETTINGS.ladderRates],
  };

  @state()
  private _noiseItems: NoiseItem[] = [];

  @state()
  private _ladderDisplayIndex = 0;

  @state()
  private _recording = false;

  @state()
  private _recordingError = '';

  @state()
  private _micStatus: MicrophoneStatus = 'prompt';

  @state()
  private _shadowingCount = 0;

  @state()
  private _echoRecordingsBySegmentId: Record<string, PracticeRecord[]> = {};

  @state()
  private _echoLatestScoreBySegmentId: Record<string, number | null> = {};

  @state()
  private _sentenceBankSegmentIds: string[] = [];

  @state()
  private _sentenceBankBusy = false;

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
  private _tipsModalKind: PracticeTipsKind | null = null;

  @state()
  private _recordingsModalOpen = false;

  @state()
  private _recordingsModalMode: SpeakingMode = 'shadowing';

  @state()
  private _recordingsModalSegmentId: string | null = null;

  @state()
  private _recordingPreviewOpen = false;

  @state()
  private _hotkeysHelpOpen = false;

  private _echoSegment: SubtitleSegment | null = null;

  /** Bumped on each echo start/cancel so in-flight async work cannot affect a newer session. */
  private _echoSessionId = 0;

  /** Gap policy applied for the in-progress shadowing take (snapshotted at record start). */
  private _activeShadowingGapPolicy: ShadowingGapPolicy = 'compress';

  /** Playback knobs suppressed for sessions; restored when the session ends. */
  private _practicePlaybackSettingsSnapshot: {
    loopMode: LoopMode;
    sleepMode: SleepMode;
    sleepMinutes: number;
    pauseMode: PauseMode;
    pauseSeconds: number;
    pausePercent: number;
    playbackRate: number;
  } | null = null;

  private _didInitialLoad = false;

  @query('record-list')
  private _manageRecordList?: RecordList;

  @query('subtitle-panel')
  private _subtitlePanelEl?: SubtitlePanel;

  @query('audio-recorder#shadowing-recorder')
  private _shadowingRecorderEl?: AudioRecorder;

  @query('audio-recorder#echo-recorder')
  private _echoRecorderEl?: AudioRecorder;

  private readonly _controller = new MediaController();
  private readonly _echoClipPlayer = new EchoClipPlayer();
  private readonly _timeTracker = new PracticeTimeTracker();
  private readonly _noiseMixer = new NoiseMixer();
  private readonly _rateLadder = new RateLadder();
  /** 当前从播放列表进入时的 id；单曲练习为空 */
  private _activePlaylistId = '';
  private _discriminationActive = false;
  private _ladderAdvancing = false;
  private _lastRecordingId: string | null = null;
  private get _shadowingLimit() {
    return getAppSettings().maxRecordingsPerMedia;
  }
  private get _echoLimitPerSegment() {
    return getAppSettings().maxEchoPerSegment;
  }
  private readonly _recordingSupported = isRecordingSupported();
  private _micPermissionStatus: PermissionStatus | null = null;

  private get _canUseMicrophone(): boolean {
    return this._recordingSupported && canRecordWithMicrophone(this._micStatus);
  }

  private get _micDisabledTitle(): string {
    return getMicrophoneBlockedMessage(this._recordingSupported ? this._micStatus : 'unsupported');
  }

  disconnectedCallback(): void {
    if (supportsKeyboardShortcuts()) {
      getHotkeyManager().unregisterScope('practice');
    }
    this.removeEventListener(RECORDING_PREVIEW_OPEN_EVENT, this._onRecordingPreviewOpen);
    this.removeEventListener(RECORDING_PREVIEW_CLOSE_EVENT, this._onRecordingPreviewClose);
    this.removeEventListener(AUDIO_FOCUS_REQUEST_EVENT, this._onAudioFocusRequest);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this._micPermissionStatus?.removeEventListener('change', this._onMicPermissionChange);
    this._micPermissionStatus = null;
    if (this._isEchoListenPipelineActive()) {
      this._cancelEchoListen();
    }
    this._echoClipPlayer.dispose();
    this._teardownDiscrimination();
    this._noiseMixer.destroy();
    this._timeTracker.dispose();
    this._controller.removeEventListener(ExtendedMediaEventType.TRACK_CHANGE, this._onTrackChange);
    this._controller.removeEventListener(MediaEventType.PLAY, this._onMainPlay);
    this._controller.removeEventListener(MediaEventType.PAUSE, this._onMainPause);
    this._controller.removeEventListener(MediaEventType.ENDED, this._onMainEnded);
    this._controller.destroy();
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    const sessionDockActive =
      this._sessionPhase === 'listening' ||
      this._sessionPhase === 'draining' ||
      this._sessionPhase === 'countdown' ||
      this._sessionPhase === 'recording';
    this.toggleAttribute('data-session-dock', sessionDockActive);

    if (!changed.has('routeContext') && this._didInitialLoad) {
      return;
    }
    const nextSignature = this._getPracticeRouteSignature();
    if (this._didInitialLoad) {
      const prevContext = changed.get('routeContext') as RouteContext | undefined;
      const prevSignature = this._getPracticeRouteSignature(prevContext);
      if (prevSignature === nextSignature) {
        return;
      }
    }
    this._didInitialLoad = true;
    void this._loadPractice();
  }

  connectedCallback(): void {
    super.connectedCallback();
    const saved = getAppSettings().discrimination;
    this._discriminationSettings = {
      selected: saved.selected.map((s) => ({ ...s })),
      ladderCount: saved.ladderCount,
      ladderRates: [...saved.ladderRates],
    };
    this._rateLadder.setRates(this._discriminationSettings.ladderRates);
    this._controller.addEventListener(ExtendedMediaEventType.TRACK_CHANGE, this._onTrackChange);
    this._controller.addEventListener(MediaEventType.PLAY, this._onMainPlay);
    this._controller.addEventListener(MediaEventType.PAUSE, this._onMainPause);
    this._controller.addEventListener(MediaEventType.ENDED, this._onMainEnded);
    this._timeTracker.attach(this._controller);
    this._timeTracker.setMode(this._resolveAnalyticsMode());
    this.addEventListener(RECORDING_PREVIEW_OPEN_EVENT, this._onRecordingPreviewOpen);
    this.addEventListener(RECORDING_PREVIEW_CLOSE_EVENT, this._onRecordingPreviewClose);
    this.addEventListener(AUDIO_FOCUS_REQUEST_EVENT, this._onAudioFocusRequest);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    void this._attachMicPermissionListener();
    void this._refreshMicStatus();
    void this._refreshNoiseItems();
    if (supportsKeyboardShortcuts()) {
      getHotkeyManager().registerScope({
        id: 'practice',
        enabled: () => this._practiceHotkeysEnabled(),
        handlers: {
          togglePlay: () => {
            if (!this._practiceMediaHotkeysEnabled()) return;
            void this._controller.togglePlay();
          },
          previousSegment: () => {
            if (!this._practiceMediaHotkeysEnabled()) return;
            this._controller.previousSegment();
          },
          nextSegment: () => {
            if (!this._practiceMediaHotkeysEnabled()) return;
            this._controller.nextSegment();
          },
          replaySegment: () => {
            if (!this._practiceMediaHotkeysEnabled()) return;
            this._controller.replaySegment();
          },
          volumeUp: () => {
            if (!this._practiceMediaHotkeysEnabled()) return;
            this._nudgeVolume(VOLUME_HOTKEY_STEP);
          },
          volumeDown: () => {
            if (!this._practiceMediaHotkeysEnabled()) return;
            this._nudgeVolume(-VOLUME_HOTKEY_STEP);
          },
          rateUp: () => {
            if (!this._practiceMediaHotkeysEnabled()) return;
            if (this._isDiscriminationMode()) return;
            this._nudgePlaybackRate(PLAYBACK_RATE_HOTKEY_STEP);
          },
          rateDown: () => {
            if (!this._practiceMediaHotkeysEnabled()) return;
            if (this._isDiscriminationMode()) return;
            this._nudgePlaybackRate(-PLAYBACK_RATE_HOTKEY_STEP);
          },
          toggleSubtitles: () => {
            if (!this._practiceUiHotkeysEnabled()) return;
            this._toggleSubtitlesFromHotkey();
          },
          toggleTranslation: () => {
            if (!this._practiceUiHotkeysEnabled()) return;
            this._toggleTranslationFromHotkey();
          },
          toggleSubtitleFullscreen: () => {
            if (!this._practiceUiHotkeysEnabled()) return;
            this._toggleSubtitleFullscreenFromHotkey();
          },
          toggleHotkeysHelp: () => {
            this._toggleHotkeysHelp();
          },
        },
      });
    }
  }

  private _practiceHotkeysEnabled(): boolean {
    if (this._recordingPreviewOpen || this._recordingsModalOpen) {
      return false;
    }
    return true;
  }

  /** Playback / seek / rate / volume — idle only, and not while help is open. */
  private _practiceMediaHotkeysEnabled(): boolean {
    if (this._hotkeysHelpOpen) {
      return false;
    }
    return this._sessionPhase === 'idle';
  }

  /** Subtitle panel UI toggles — allowed during recording sessions. */
  private _practiceUiHotkeysEnabled(): boolean {
    return !this._hotkeysHelpOpen;
  }

  private _toggleSubtitlesFromHotkey(): void {
    const snapshot = this._controller.getSnapshot();
    if (!snapshot.hasSubtitles) {
      return;
    }
    const nextVisible = !snapshot.subtitlesVisible;
    // Fullscreen is a presentation of visible subtitles; hide ⇒ exit fullscreen.
    if (!nextVisible) {
      this._subtitlePanelFullscreen = false;
    }
    this._controller.setSubtitlesVisible(nextVisible);
  }

  private _toggleTranslationFromHotkey(): void {
    const snapshot = this._controller.getSnapshot();
    if (!snapshot.hasSubtitles || !snapshot.subtitlesVisible) {
      return;
    }
    this._subtitlePanelEl?.toggleTranslationVisible();
  }

  private _toggleSubtitleFullscreenFromHotkey(): void {
    const snapshot = this._controller.getSnapshot();
    if (!snapshot.hasSubtitles || !snapshot.subtitlesVisible) {
      return;
    }
    this._subtitlePanelFullscreen = !this._subtitlePanelFullscreen;
  }

  private _toggleHotkeysHelp = (): void => {
    this._hotkeysHelpOpen = !this._hotkeysHelpOpen;
  };

  /** Pause practice media (and cancel echo listen) so recording review can own the speakers. */
  private _yieldPlaybackToPreview(showTip = true): void {
    const wasPlaying =
      this._controller.getSnapshot().isPlaying || this._isEchoListenPipelineActive();
    if (this._isEchoListenPipelineActive()) {
      this._cancelEchoListen(true);
    } else {
      void this._controller.pause();
    }
    if (this._discriminationActive) {
      this._noiseMixer.setPlaying(false);
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

  private _nudgePlaybackRate(delta: number): void {
    const current = this._controller.getSnapshot().playbackRate;
    this._controller.setPlaybackRate(current + delta);
  }

  private _resolveAnalyticsMode(): PracticeAnalyticsMode {
    if (this._practiceType === 'listening') {
      return this._listeningMode;
    }
    return this._speakingMode;
  }

  private _isDiscriminationMode(): boolean {
    return this._practiceType === 'listening' && this._listeningMode === 'discrimination';
  }

  private _onMainPlay = (): void => {
    if (this._discriminationActive) {
      this._noiseMixer.setPlaying(true);
    }
  };

  private _onMainPause = (): void => {
    if (this._discriminationActive && !this._ladderAdvancing) {
      this._noiseMixer.setPlaying(false);
    }
  };

  private _onMainEnded = (): void => {
    if (!this._discriminationActive || this._ladderAdvancing) {
      return;
    }
    const result = this._rateLadder.onMainEnded();
    this._ladderDisplayIndex = this._rateLadder.getIndex();
    if (result.kind === 'finished') {
      this._noiseMixer.setPlaying(false);
      this._controller.setPlaybackRate(this._rateLadder.getCurrentRate());
      return;
    }
    this._ladderAdvancing = true;
    this._controller.setPlaybackRate(result.rate);
    this._controller.seek(0, { force: true });
    void this._controller.play().finally(() => {
      this._ladderAdvancing = false;
      this._noiseMixer.setPlaying(true);
    });
  };

  private async _refreshNoiseItems(): Promise<void> {
    try {
      this._noiseItems = await getNoiseList();
    } catch {
      this._noiseItems = [];
    }
  }

  private _persistDiscriminationSettings(partial: Partial<DiscriminationSettings>): void {
    const prevIds = this._discriminationSettings.selected.map((s) => s.noiseId).join('\0');
    const next: DiscriminationSettings = {
      selected: partial.selected ?? this._discriminationSettings.selected,
      ladderCount: partial.ladderCount ?? this._discriminationSettings.ladderCount,
      ladderRates: partial.ladderRates ?? this._discriminationSettings.ladderRates,
    };
    this._discriminationSettings = {
      selected: next.selected.map((s) => ({ ...s })),
      ladderCount: next.ladderCount,
      ladderRates: [...next.ladderRates],
    };
    setAppSettings({ discrimination: this._discriminationSettings });
    this._rateLadder.setRates(this._discriminationSettings.ladderRates);
    if (this._discriminationActive) {
      const nextIds = this._discriminationSettings.selected.map((s) => s.noiseId).join('\0');
      if (prevIds !== nextIds) {
        void this._syncNoiseMixerTracks();
      }
      this._controller.setPlaybackRate(this._rateLadder.getCurrentRate());
    }
  }

  private async _syncNoiseMixerTracks(): Promise<void> {
    const tracks = [];
    for (const sel of this._discriminationSettings.selected) {
      const blob = await getNoiseBlob(sel.noiseId);
      if (!blob) continue;
      tracks.push({
        id: sel.noiseId,
        url: URL.createObjectURL(blob),
        volume: sel.volume,
      });
    }
    this._noiseMixer.setTracks(tracks);
    if (this._controller.getSnapshot().isPlaying) {
      this._noiseMixer.setPlaying(true);
    }
  }

  private async _setupDiscrimination(): Promise<void> {
    this._discriminationActive = true;
    this._suppressNonPracticeSettings({ pauseMode: 'off' });
    this._rateLadder.setRates(this._discriminationSettings.ladderRates);
    this._rateLadder.reset();
    this._ladderDisplayIndex = 0;
    this._controller.setPlaybackRate(this._rateLadder.getCurrentRate());
    await this._syncNoiseMixerTracks();
  }

  private _teardownDiscrimination(): void {
    this._discriminationActive = false;
    this._ladderAdvancing = false;
    this._noiseMixer.setPlaying(false);
    this._noiseMixer.setTracks([]);
    this._restorePracticePlaybackSettings();
  }

  private _syncTimeTrackerMedia(): void {
    const item = this._controller.getSnapshot().currentItem;
    if (item) {
      this._timeTracker.setMedia(
        item.id,
        item.title,
        item.type,
        item.filename,
        this._activePlaylistId,
      );
      return;
    }
    this._timeTracker.setMedia('', '', 'audio', '', this._activePlaylistId);
  }

  private _onSubtitleImported = (): void => {
    this.requestUpdate();
  };

  private _onTrackChange = (): void => {
    this._recordingError = '';
    this._lastRecordingId = null;
    if (this._isEchoListenPipelineActive()) {
      this._cancelEchoListen();
    } else {
      this._echoSegmentIndex = -1;
      this._echoSegment = null;
    }
    this._echoClipPlayer.dispose();
    this._syncMediaIdFromController();
    this._syncTimeTrackerMedia();
    this._syncSpeakingModeAvailability();
    if (this._discriminationActive) {
      this._rateLadder.reset();
      this._ladderDisplayIndex = 0;
      this._controller.setPlaybackRate(this._rateLadder.getCurrentRate());
    }
    void this._refreshRecordings();
    void this._refreshSentenceBankIds();
  };

  private _onRecordingDeleted = (id: string): void => {
    if (id === this._lastRecordingId) {
      this._lastRecordingId = null;
      this._shadowingRecorderEl?.clearWaveform();
    }
  };

  private _onRecordingsChanged = (): void => {
    void this._refreshRecordings();
  };

  render() {
    const shadowingRemaining = Math.max(this._shadowingLimit - this._shadowingCount, 0);
    const isSpeaking = this._practiceType === 'speaking';
    const isListening = this._practiceType === 'listening';
    const isDiscrimination = isListening && this._listeningMode === 'discrimination';
    const isFreeListen = isListening && this._listeningMode === 'free';
    const isShadowing = isSpeaking && this._speakingMode === 'shadowing';
    const isEcho = isSpeaking && this._speakingMode === 'echo';
    const sessionActive = this._sessionPhase !== 'idle';

    const headerTitle = this._practiceType === 'listening' ? msg('听力练习') : msg('口语练习');

    const { hasSubtitles } = this._controller.getSnapshot();

    const controlsConfig = isDiscrimination
      ? {
          loopMode: false,
          sleepMode: false,
          pauseMode: false,
          playPause: true,
          volume: true,
          playbackRate: false,
          progress: true,
          previousNextTrack: true,
          previousNextSegment: true,
          replay: true,
          switchMode: false,
          advancedSetting: false,
        }
      : {
          loopMode: true,
          sleepMode: true,
          pauseMode: true,
          playPause: true,
          volume: true,
          playbackRate: true,
          progress: true,
          previousNextTrack: true,
          previousNextSegment: true,
          replay: true,
          switchMode: false,
          advancedSetting: true,
        };

    return html`
      <section>
        <div class="header">
          <h2>${headerTitle}</h2>
          ${supportsKeyboardShortcuts()
            ? html`<ui-icon-button
                name="help"
                title=${msg('快捷键 (H)')}
                size="var(--icon-lg)"
                @click=${this._openHotkeysHelp}
              ></ui-icon-button>`
            : nothing}
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
        ${isListening
          ? html`
              <div class="speaking-mode-tabs">
                <ui-button
                  variant="${isFreeListen ? 'primary' : 'secondary'}"
                  @click="${() => this._setListeningMode('free')}"
                >
                  ${msg('自由听')}
                </ui-button>
                <ui-button
                  variant="${isDiscrimination ? 'primary' : 'secondary'}"
                  @click="${() => this._setListeningMode('discrimination')}"
                >
                  ${msg('抗噪听')}
                </ui-button>
              </div>
            `
          : nothing}
        ${isDiscrimination
          ? html`<discrimination-panel
              .settings=${this._discriminationSettings}
              .noiseItems=${this._noiseItems}
              .ladderDisplayIndex=${this._ladderDisplayIndex}
              .ladderSequence=${this._rateLadder.getSequence()}
              .currentRate=${this._rateLadder.getCurrentRate()}
              @open-tips=${() => this._openTipsModal('discrimination')}
              @open-library=${this._openLibrary}
              @noise-toggle=${this._onDiscriminationNoiseToggle}
              @noise-volume=${this._onDiscriminationNoiseVolume}
              @ladder-count=${this._onDiscriminationLadderCount}
              @ladder-rate=${this._onDiscriminationLadderRate}
            ></discrimination-panel>`
          : nothing}
        ${isSpeaking
          ? html`
              <div class="speaking-mode-tabs">
                ${hasSubtitles
                  ? html`<ui-button
                      variant="${this._speakingMode === 'echo' ? 'primary' : 'secondary'}"
                      @click="${() => this._setSpeakingMode('echo')}"
                    >
                      ${msg('回声跟读')}
                    </ui-button>`
                  : nothing}
                <ui-button
                  variant="${this._speakingMode === 'shadowing' ? 'primary' : 'secondary'}"
                  @click="${() => this._setSpeakingMode('shadowing')}"
                >
                  ${msg('影子跟读')}
                </ui-button>
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
                            <p>${getShadowingSummary()}</p>
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
                                str`当前音频的影子跟读录音已达上限（${this._shadowingLimit}条），删除旧录音后可继续。`,
                              )}
                            </p>
                          </div>`
                      : getMicrophoneBlockedMessage('unsupported')}
                    ${keyed(
                      this._mediaId,
                      html`<audio-recorder
                        id="shadowing-recorder"
                        .controller=${this._controller}
                        .collectSegments=${true}
                        .shadowingLatencyOffset=${0.35}
                        .disabled=${!this._recordingSupported ||
                        !this._canUseMicrophone ||
                        shadowingRemaining <= 0}
                        .disabledTitle=${shadowingRemaining <= 0
                          ? msg(
                              str`当前音频的影子跟读录音已达上限（${this._shadowingLimit}条），删除旧录音后可继续。`,
                            )
                          : this._micDisabledTitle}
                        .hideWaveform=${true}
                        .beforeRecordingStart=${this._applyShadowingPlaybackProfile}
                        @recording-complete=${this._onShadowingRecordingComplete}
                        @recording-state-change=${this._onRecordingStateChange}
                        @recording-error=${this._onRecordingError}
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
                        <p>${getEchoSummary()}</p>
                        <ui-button variant="secondary" @click=${() => this._openTipsModal('echo')}>
                          ${msg('说明')}
                        </ui-button>
                      </div>`
                    : getMicrophoneBlockedMessage('unsupported')}
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
            ?disabled="${isSpeaking && sessionActive}"
            mode="normal"
            .controlsConfig="${controlsConfig}"
          >
          </media-player>
          <subtitle-panel
            .controller="${this._controller}"
            .fullscreen="${this._subtitlePanelFullscreen}"
            showFullscreenIcon="${!this._subtitlePanelFullscreen}"
            .echoMode="${isEcho}"
            .echoRecordingsBySegmentId="${this._echoRecordingsBySegmentId}"
            .echoLatestScoreBySegmentId="${this._echoLatestScoreBySegmentId}"
            .echoRecordingSegmentIndex="${this._echoSegmentIndex}"
            .echoBusy="${this._sessionPhase === 'preparing' ||
            this._sessionPhase === 'stopping' ||
            this._sessionPhase === 'draining'}"
            .reserveSessionDockInset=${sessionActive}
            .recordingSupported="${this._recordingSupported}"
            .micReady=${this._canUseMicrophone}
            .micBlockedTitle=${this._micDisabledTitle}
            .echoLimitPerSegment="${this._echoLimitPerSegment}"
            .seekDisabled=${sessionActive}
            .sentenceBankSegmentIds=${this._sentenceBankSegmentIds}
            .sentenceBankBusy=${this._sentenceBankBusy}
            @update:fullscreen="${(e: CustomEvent<SubtitlePanelFullscreenChangeDetail>) => {
              this._subtitlePanelFullscreen = e.detail.fullscreen;
            }}"
            @subtitle-imported="${this._onSubtitleImported}"
            @echo-record-request="${this._onEchoRecordRequest}"
            @echo-record-stop="${this._onEchoRecordStop}"
            @echo-manage-recordings="${this._onEchoManageRecordings}"
            @sentence-bank-add="${this._onSentenceBankAdd}"
            @sentence-bank-remove="${this._onSentenceBankRemove}"
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
                    .disabled=${!this._canUseMicrophone}
                    .beforeRecordingStart=${this._applyEchoPlaybackProfile}
                    @recording-complete=${this._onEchoRecordingComplete}
                    @recording-state-change=${this._onRecordingStateChange}
                    @recording-error=${this._onRecordingError}
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
        <practice-tips-modal
          .kind=${this._tipsModalKind}
          @close=${this._closeTipsModal}
          @confirm=${this._onTipsConfirm}
        ></practice-tips-modal>
        ${this._renderRecordingsModal()}
        <practice-hotkeys-help
          .open=${this._hotkeysHelpOpen}
          @close=${this._closeHotkeysHelp}
        ></practice-hotkeys-help>
      </section>
    `;
  }

  private _openHotkeysHelp = (): void => {
    this._hotkeysHelpOpen = true;
  };

  private _closeHotkeysHelp = (): void => {
    this._hotkeysHelpOpen = false;
  };

  private _openLibrary = (): void => {
    this.navigate('/library#noise-list-title');
  };

  private _onDiscriminationNoiseToggle = (
    event: CustomEvent<DiscriminationNoiseToggleDetail>,
  ): void => {
    this._toggleNoiseSelection(event.detail.noiseId, event.detail.on);
  };

  private _onDiscriminationNoiseVolume = (
    event: CustomEvent<DiscriminationNoiseVolumeDetail>,
  ): void => {
    this._setNoiseVolume(event.detail.noiseId, event.detail.volume);
  };

  private _onDiscriminationLadderCount = (
    event: CustomEvent<DiscriminationLadderCountDetail>,
  ): void => {
    this._setLadderCount(event.detail.count);
  };

  private _onDiscriminationLadderRate = (
    event: CustomEvent<DiscriminationLadderRateDetail>,
  ): void => {
    this._setLadderRate(event.detail.index, event.detail.rate);
  };

  private _toggleNoiseSelection(noiseId: string, on: boolean): void {
    let selected = [...this._discriminationSettings.selected];
    if (on) {
      if (selected.some((s) => s.noiseId === noiseId)) return;
      if (selected.length >= DISCRIMINATION_MAX_NOISE_TRACKS) {
        Message.warning(msg(str`最多选择 ${DISCRIMINATION_MAX_NOISE_TRACKS} 条噪音`));
        return;
      }
      selected.push({ noiseId, volume: getAppSettings().defaultNoiseVolume });
    } else {
      selected = selected.filter((s) => s.noiseId !== noiseId);
    }
    this._persistDiscriminationSettings({ selected });
  }

  private _setNoiseVolume(noiseId: string, volume: number): void {
    const selected = this._discriminationSettings.selected.map((s) =>
      s.noiseId === noiseId ? { ...s, volume } : s,
    );
    this._persistDiscriminationSettings({ selected });
    this._noiseMixer.setTrackVolume(noiseId, volume);
  }

  private _setLadderCount(count: number): void {
    const ladderCount = Math.max(
      DISCRIMINATION_LADDER_COUNT_MIN,
      Math.min(DISCRIMINATION_LADDER_COUNT_MAX, count),
    );
    const ladderRates = [...this._discriminationSettings.ladderRates];
    while (ladderRates.length < ladderCount) {
      ladderRates.push(1);
    }
    ladderRates.length = ladderCount;
    this._rateLadder.reset();
    this._ladderDisplayIndex = 0;
    this._persistDiscriminationSettings({ ladderCount, ladderRates });
  }

  private _setLadderRate(index: number, rate: number): void {
    const ladderRates = [...this._discriminationSettings.ladderRates];
    if (index < 0 || index >= ladderRates.length) return;
    ladderRates[index] = rate;
    this._rateLadder.reset();
    this._ladderDisplayIndex = 0;
    this._persistDiscriminationSettings({ ladderRates });
  }

  private _renderShadowingRecordingsEntry() {
    const sessionActive = this._sessionPhase !== 'idle';
    return html`
      <div class="recordings-summary">
        <p>${msg(str`已保存 ${this._shadowingCount}/${this._shadowingLimit}`)}</p>
        <ui-tooltip title="${msg('管理录音')}">
          <ui-button
            variant="secondary"
            ?disabled=${!this._shadowingCount || sessionActive}
            @click=${this._openRecordingsModal}
          >
            <ui-icon name="manage" size="var(--icon-md)"></ui-icon>
          </ui-button>
        </ui-tooltip>
      </div>
    `;
  }

  private _renderRecordingsModal() {
    if (!this._recordingsModalOpen) {
      return nothing;
    }

    const isEcho = this._recordingsModalMode === 'echo';
    const title = isEcho ? msg('当前句的回声录音') : msg('当前媒体的影子跟读录音');

    return html`
      <ui-modal
        .open=${true}
        .title=${title}
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
            .modeFilter=${this._recordingsModalMode}
            .segmentId=${this._recordingsModalSegmentId ?? undefined}
            .showHeader=${false}
            .popupZIndex=${Z_INDEX.MODAL + 1}
            .previewDisabled=${this._sessionPhase !== 'idle'}
            @recording-deleted=${(event: CustomEvent<{ id: string }>) =>
              this._onRecordingDeleted(event.detail.id)}
            @recordings-changed=${this._onRecordingsChanged}
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
    this._recordingsModalMode = 'shadowing';
    this._recordingsModalSegmentId = null;
    this._recordingsModalOpen = true;
  };

  private _onEchoManageRecordings = (event: CustomEvent<EchoManageRecordingsDetail>): void => {
    this._recordingsModalMode = 'echo';
    this._recordingsModalSegmentId = event.detail.segmentId;
    this._recordingsModalOpen = true;
  };

  private _closeRecordingsModal = (): void => {
    this._recordingsModalOpen = false;
    this._recordingsModalSegmentId = null;
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
            ${msg('媒体容量不足，建议清理录音或在设置中提高媒体容量上限')}
          </ui-alert>`
        : null}
    `;
  }

  private _syncMediaIdFromController(): void {
    const { playlist, currentIndex } = this._controller.getSnapshot();
    this._mediaId = playlist[currentIndex]?.id ?? '';
  }

  private _getPracticeQueryValue(
    key: 'mediaId' | 'playlistId' | 'segmentId',
    context: RouteContext = this.routeContext,
  ): string {
    const value = context.query?.[key];
    return typeof value === 'string' ? value.trim() : '';
  }

  private _getPracticeRouteSignature(
    context: RouteContext | undefined = this.routeContext,
  ): string {
    if (!context) {
      return '';
    }
    const playlistId = this._getPracticeQueryValue('playlistId', context);
    const mediaId = this._getPracticeQueryValue('mediaId', context);
    const segmentId = this._getPracticeQueryValue('segmentId', context);
    return `${playlistId}\u0000${mediaId}\u0000${segmentId}`;
  }

  private _resolveLaunchContextFromRoute(): PracticeLaunchContext | null {
    const playlistId = this._getPracticeQueryValue('playlistId');
    const mediaId = this._getPracticeQueryValue('mediaId');

    if (playlistId) {
      return mediaId ? { kind: 'playlist', playlistId, mediaId } : { kind: 'playlist', playlistId };
    }
    if (mediaId) {
      return { kind: 'single', mediaId };
    }
    return null;
  }

  private _seekToSegmentId(segmentId: string): void {
    if (!segmentId) {
      return;
    }
    const { segments } = this._controller.getSnapshot();
    const index = segments.findIndex((segment) => segment.id === segmentId);
    if (index < 0) {
      Message.warning(msg('无法定位到来源句子'));
      return;
    }
    this._controller.seekToSegment(index, false, { force: true });
  }

  private async _loadPractice(): Promise<void> {
    const loadingInstance = Loading.service({ text: msg('加载媒体中…') });
    try {
      const launchContext = this._resolveLaunchContextFromRoute();
      if (!launchContext) {
        Message.error(msg('请从媒体或播放列表进入练习。'));
        return;
      }

      this._activePlaylistId = launchContext.kind === 'playlist' ? launchContext.playlistId : '';

      let playlist: Awaited<ReturnType<typeof loadPlaylistForPlayback>>;
      if (launchContext.kind === 'single') {
        const single = await loadMediaForPlayback(launchContext.mediaId);
        playlist = single ? [single] : [];
      } else {
        playlist = await loadPlaylistForPlayback(launchContext.playlistId);
      }

      if (playlist.length === 0) {
        if (launchContext.kind === 'single') {
          Message.error(msg('该媒体不存在或无法加载。'));
        } else {
          Message.error(msg('当前播放列表为空，请先添加媒体。'));
        }
        return;
      }

      let startIndex = 0;
      if (launchContext.kind === 'playlist' && launchContext.mediaId) {
        startIndex = playlist.findIndex((entry) => entry.item.id === launchContext.mediaId);
        if (startIndex === -1) {
          Message.info(
            msg(str`媒体 "${launchContext.mediaId}" 不在当前播放列表，已回退到第一首。`),
          );
          startIndex = 0;
        }
      }
      if (launchContext.kind === 'playlist') {
        setAppSettings({ lastPlayedPlaylistId: launchContext.playlistId });
      }
      await this._controller.loadTracks(playlist, startIndex);
      this._syncMediaIdFromController();
      this._syncTimeTrackerMedia();
      this._syncSpeakingModeAvailability();
      await this._refreshRecordings();
      await this._refreshSentenceBankIds();

      const segmentId = this._getPracticeQueryValue('segmentId');
      if (segmentId) {
        this._seekToSegmentId(segmentId);
      }
    } catch (error) {
      void reportError(error, { where: 'practice-view._loadPractice' });
      Message.error(msg('加载媒体失败，请重试。'));
    } finally {
      loadingInstance.close();
    }
  }

  private _setPracticeType(type: PracticeType): void {
    if (this._practiceType === type) {
      return;
    }

    if (this._isEchoListenPipelineActive()) {
      this._cancelEchoListen();
    }
    if (this._discriminationActive) {
      this._teardownDiscrimination();
    }
    this._practiceType = type;
    this._recordingError = '';
    this._shadowingRecorderEl?.destroy();
    this._echoRecorderEl?.destroy();
    this._echoSegmentIndex = -1;
    this._echoSegment = null;
    this._resetSessionUi();
    if (type === 'speaking') {
      this._syncSpeakingModeAvailability();
      void this._refreshMicStatus();
    }
    this._timeTracker.setMode(this._resolveAnalyticsMode());
    if (type === 'speaking') {
      this._maybeShowTipsForSpeakingMode(this._speakingMode);
    } else if (this._listeningMode === 'discrimination') {
      void this._setupDiscrimination();
      this._maybeShowDiscriminationTips();
    }
  }

  /** Echo needs subtitles; fall back to shadowing when they are unavailable. */
  private _syncSpeakingModeAvailability(): void {
    const { hasSubtitles } = this._controller.getSnapshot();
    if (hasSubtitles) {
      return;
    }
    if (this._speakingMode !== 'echo') {
      return;
    }
    if (this._isEchoListenPipelineActive()) {
      this._cancelEchoListen();
    }
    this._speakingMode = 'shadowing';
    this._echoSegmentIndex = -1;
    this._echoSegment = null;
    this._echoRecorderEl?.destroy();
    this._resetSessionUi();
    this._recordingsModalOpen = false;
    this._recordingPreviewOpen = false;
    this._timeTracker.setMode(this._resolveAnalyticsMode());
  }

  private _setListeningMode(mode: ListeningMode): void {
    if (this._listeningMode === mode) {
      return;
    }
    this._listeningMode = mode;
    if (mode === 'discrimination') {
      void this._setupDiscrimination();
      this._maybeShowDiscriminationTips();
    } else {
      this._teardownDiscrimination();
    }
    this._timeTracker.setMode(this._resolveAnalyticsMode());
  }

  private _maybeShowDiscriminationTips(): void {
    if (!shouldSkipDiscriminationTips()) {
      this._openTipsModal('discrimination');
    }
  }

  private _setSpeakingMode(mode: SpeakingMode): void {
    if (this._speakingMode === mode) {
      return;
    }
    if (mode === 'echo' && !this._controller.getSnapshot().hasSubtitles) {
      return;
    }

    if (this._isEchoListenPipelineActive()) {
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
    void this._refreshMicStatus();
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

  private _openTipsModal(kind: PracticeTipsKind): void {
    this._tipsModalKind = kind;
  }

  private _closeTipsModal = (): void => {
    this._tipsModalKind = null;
  };

  private _onTipsConfirm = (event: CustomEvent<PracticeTipsConfirmDetail>): void => {
    const { kind, skipFuture } = event.detail;
    if (skipFuture) {
      if (kind === 'shadowing') {
        setUserSettings({ skipShadowingTips: true });
      } else if (kind === 'echo') {
        setUserSettings({ skipEchoTips: true });
      } else if (kind === 'discrimination') {
        setUserSettings({ skipDiscriminationTips: true });
      }
    }
    this._closeTipsModal();
  };

  private _applyShadowingPlaybackProfile = (): void => {
    const gapPolicy = getAppSettings().shadowingGapPolicy;
    this._activeShadowingGapPolicy = gapPolicy;
    this._suppressNonPracticeSettings({
      pauseMode: gapPolicy === 'compress' ? 'off' : 'keep',
    });
    this._controller.setShadowingGapCompress(gapPolicy === 'compress');

    // Align recording to a full sentence so PracticeSegment source/recording axes match.
    this._alignShadowingStartSegment();
    void this._scrollSubtitleActiveIntoView();
  };

  /**
   * Seek to the sentence that shadowing should start from.
   * Returns -1 when there are no subtitle segments (audio-only shadowing).
   */
  private _alignShadowingStartSegment(): number {
    const snapshot = this._controller.getSnapshot();
    if (snapshot.segments.length === 0) {
      return -1;
    }
    // At t=0 (typical after load / rewind), always start from the first subtitle —
    // its startTime may be > 0 when there is a non-subtitled intro.
    const segmentIndex =
      snapshot.currentTime <= 0
        ? 0
        : snapshot.currentSegmentIndex >= 0
          ? snapshot.currentSegmentIndex
          : 0;
    this._controller.seekToSegment(segmentIndex, false, { force: true });
    return segmentIndex;
  }

  private async _scrollSubtitleActiveIntoView(): Promise<void> {
    await this.updateComplete;
    await this._subtitlePanelEl?.updateComplete;
    // Let session-dock inset (and reserveSessionDockInset) settle before visibility check.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    this._subtitlePanelEl?.scrollActiveIntoView();
  }

  private _applyEchoPlaybackProfile = (): void => {
    this._controller.setShadowingGapCompress(false);
    this._suppressNonPracticeSettings({ pauseMode: 'off' });

    if (this._echoSegmentIndex >= 0) {
      this._controller.seekToSegment(this._echoSegmentIndex, false, { force: true });
    }
  };

  /** Temporarily ignore loop/sleep (and optionally pause) during sessions. */
  private _suppressNonPracticeSettings(options: { pauseMode: 'keep' | 'off' }): void {
    if (!this._practicePlaybackSettingsSnapshot) {
      const snapshot = this._controller.getSnapshot();
      this._practicePlaybackSettingsSnapshot = {
        loopMode: snapshot.loopMode,
        sleepMode: snapshot.sleepMode,
        sleepMinutes: snapshot.sleepMinutes,
        pauseMode: snapshot.pauseMode,
        pauseSeconds: snapshot.pauseSeconds,
        pausePercent: snapshot.pausePercent,
        playbackRate: snapshot.playbackRate,
      };
    }

    this._controller.setLoopMode('none');
    this._controller.setSleepMode('off');
    if (options.pauseMode === 'off') {
      this._controller.setPauseMode('off');
    }
  }

  private _restorePracticePlaybackSettings(): void {
    const saved = this._practicePlaybackSettingsSnapshot;
    if (!saved) {
      return;
    }
    this._practicePlaybackSettingsSnapshot = null;

    this._controller.setShadowingGapCompress(false);
    this._controller.setLoopMode(saved.loopMode);
    this._controller.setSleepMinutes(saved.sleepMinutes);
    this._controller.setSleepMode(saved.sleepMode);
    this._controller.setPauseSeconds(saved.pauseSeconds);
    this._controller.setPausePercent(saved.pausePercent);
    this._controller.setPauseMode(saved.pauseMode);
    this._controller.setPlaybackRate(saved.playbackRate);
  }

  private _onShadowingRecordingComplete = (event: CustomEvent<RecordingCompleteDetail>): void => {
    const { blob, segments } = event.detail;
    const currentItem = this._controller.getSnapshot().currentItem;
    if (!currentItem) {
      return;
    }
    if (segments.length === 0) {
      Message.warning(msg('录音时长不足，已丢弃'));
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

  private _onRecordingError = (event: CustomEvent<RecordingErrorDetail>): void => {
    Message.error(event.detail.message);
    invalidateMicrophoneStatusCache();
    void this._refreshMicStatus({ force: true });
  };

  private _onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      void this._refreshMicStatus();
    }
  };

  private _onMicPermissionChange = (): void => {
    invalidateMicrophoneStatusCache();
    void this._refreshMicStatus({ force: true });
  };

  private async _attachMicPermissionListener(): Promise<void> {
    try {
      const status = await navigator.permissions?.query({
        name: 'microphone' as PermissionName,
      });
      if (!status) {
        return;
      }
      this._micPermissionStatus = status;
      status.addEventListener('change', this._onMicPermissionChange);
    } catch {
      // Permissions API may not support microphone query in this browser.
    }
  }

  private async _refreshMicStatus(options: { force?: boolean } = {}): Promise<void> {
    const status = await checkMicrophoneStatus(options);
    if (this._micStatus !== status) {
      this._micStatus = status;
    }
  }

  private _onRecordingStateChange = (event: CustomEvent<RecordingStateChangeDetail>): void => {
    this._recording = event.detail.recording;
    this._timeTracker.setFlags({ recording: this._recording });
    if (this._speakingMode === 'echo') {
      if (event.detail.recording) {
        this._setSessionPhase('recording');
        this._sessionWaveformController = this._echoRecorderEl?.waveformController ?? null;
        this._sessionSpeakCue = true;
      } else {
        this._echoSegmentIndex = -1;
        this._resetSessionUi();
      }
      return;
    }

    if (this._speakingMode === 'shadowing') {
      if (event.detail.recording) {
        this._setSessionPhase('recording');
        this._sessionWaveformController = this._shadowingRecorderEl?.waveformController ?? null;
        this._sessionSpeakCue = true;
      } else {
        this._resetSessionUi();
      }
    }
  };

  private _onSessionCountdownStart = (): void => {
    this._setSessionPhase('countdown');
    this._sessionSpeakCue = false;
    // Shadowing: align + scroll as soon as the user taps record (first cue may be off-screen).
    // No-op when there are no subtitle segments.
    if (this._speakingMode === 'shadowing') {
      this._alignShadowingStartSegment();
      void this._scrollSubtitleActiveIntoView();
    }
  };

  private _onSessionCountdownEnd = (event: CustomEvent<RecordingCountdownEndDetail>): void => {
    if (event.detail.cancelled) {
      this._resetSessionUi();
      return;
    }

    const skipped = event.detail.skipped;
    this._setSessionPhase('recording');
    // Waveform controller is bound in _onRecordingStateChange after live analysis starts.
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

  /** Echo listen pipeline: preparing → listening → draining → stopping, before countdown/recording. */
  private _isEchoListenPipelineActive(): boolean {
    return (
      this._echoListening ||
      this._sessionPhase === 'preparing' ||
      this._sessionPhase === 'stopping' ||
      this._sessionPhase === 'listening' ||
      this._sessionPhase === 'draining'
    );
  }

  private _seekEchoSegmentToStart(): void {
    if (this._echoSegmentIndex < 0) {
      return;
    }
    this._controller.seekToSegment(this._echoSegmentIndex, false, { force: true });
  }

  private _onEchoClipEnded = async (): Promise<void> => {
    if (!this._echoListening || !this._echoSegment) {
      return;
    }

    const sessionId = this._echoSessionId;
    this._echoListening = false;
    this._timeTracker.setFlags({ echoListening: false });
    this._seekEchoSegmentToStart();
    this._setSessionPhase('draining');

    // Let the output device finish sounding the clip before the mic opens.
    await this._echoClipPlayer.waitForOutputDrain();
    if (sessionId !== this._echoSessionId) {
      return;
    }

    try {
      await this._echoRecorderEl?.startRecording();
      if (sessionId !== this._echoSessionId) {
        return;
      }
      if (!this._echoRecorderEl?.recording) {
        this._clearEchoSession();
      }
    } catch {
      if (sessionId === this._echoSessionId) {
        this._clearEchoSession();
      }
    }
  };

  private _cancelEchoListen(pauseMedia = true): void {
    this._echoSessionId++;
    this._setSessionPhase('stopping');
    this._echoClipPlayer.stop();
    if (pauseMedia) {
      void this._controller.pause();
    }
    this._seekEchoSegmentToStart();
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
    // Ends every echo session path (cancel, countdown cancel, mic failure): give back a
    // mic that was warmed up for listening but never recorded. No-op while recording.
    this._echoRecorderEl?.releaseMicrophone();
    this._restorePracticePlaybackSettings();
    this._setSessionPhase('idle');
    this._sessionSpeakCue = false;
    this._sessionWaveformController = null;
  }

  private _setSessionPhase(phase: RecordingSessionPhase): void {
    this._sessionPhase = phase;
    this._controller.setNavigationLocked(phase !== 'idle');
  }

  private _onEchoRecordRequest = async (
    event: CustomEvent<EchoRecordRequestDetail>,
  ): Promise<void> => {
    if (!this._recordingSupported || this._recording || this._sessionPhase !== 'idle') {
      return;
    }

    await this._refreshMicStatus({ force: true });
    if (!this._canUseMicrophone) {
      Message.error(this._micDisabledTitle || getMicrophoneBlockedMessage('denied'));
      return;
    }

    const { segmentIndex } = event.detail;
    const snapshot = this._controller.getSnapshot();
    const segment = snapshot.segments[segmentIndex];
    if (!segment || !this._mediaId) {
      return;
    }

    const blob = this._controller.getCurrentBlob();
    if (!blob) {
      return;
    }

    // Claim the session before the first await so repeated taps cannot open overlapping sessions.
    const sessionId = ++this._echoSessionId;
    const { playbackRate, volume } = snapshot;

    this._echoSegmentIndex = segmentIndex;
    this._echoSegment = segment;
    this._recordingError = '';
    this._echoRecorderEl?.clearWaveform();
    this._sessionWaveformController = null;
    this._sessionSpeakCue = false;
    this._setSessionPhase('preparing');
    this._echoListening = false;
    this._timeTracker.setFlags({ echoListening: false });

    let count: number;
    try {
      count = await countEchoRecordings(this._mediaId, segment.id);
    } catch {
      if (sessionId === this._echoSessionId) {
        this._clearEchoSession();
      }
      return;
    }
    if (sessionId !== this._echoSessionId) {
      return;
    }
    if (count >= this._echoLimitPerSegment) {
      Message.warning(
        msg(str`该句录音已达上限（${this._echoLimitPerSegment}条），删除旧录音后可继续。`),
      );
      this._clearEchoSession();
      return;
    }

    this._controller.setShadowingGapCompress(false);
    this._suppressNonPracticeSettings({ pauseMode: 'off' });

    // Hard-cut main player: freeze UI clock at sentence start; clip owns listen audio.
    this._controller.pause();
    this._seekEchoSegmentToStart();

    // Open the mic while nothing is sounding: doing it after the clip lets the
    // device/route switch cut the clip tail (and that tail lands in the recording).
    await this._echoRecorderEl?.warmUpMicrophone();
    if (sessionId !== this._echoSessionId) {
      // Cancelled while the mic was opening: the session already ran its release.
      this._echoRecorderEl?.releaseMicrophone();
      return;
    }

    this._echoClipPlayer.onEnded = () => {
      void this._onEchoClipEnded();
    };

    try {
      await this._echoClipPlayer.prepare(blob);
      if (sessionId !== this._echoSessionId) {
        return;
      }
      await this._echoClipPlayer.play(
        { startTime: segment.startTime, endTime: segment.endTime },
        { playbackRate, volume },
      );
    } catch {
      if (sessionId === this._echoSessionId) {
        this._cancelEchoListen();
      }
      return;
    }

    if (sessionId !== this._echoSessionId) {
      this._echoClipPlayer.stop();
      return;
    }

    this._setSessionPhase('listening');
    this._echoListening = true;
    this._timeTracker.setFlags({ echoListening: true });
  };

  private _onEchoRecordStop = async (): Promise<void> => {
    if (this._isEchoListenPipelineActive()) {
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
        gapPolicy: this._activeShadowingGapPolicy,
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
        ...practiceScriptFromSubtitle(segment),
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
      this._echoLatestScoreBySegmentId = {};
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
      try {
        const scores = await getScoresByRecordIds(echoRecords.map((record) => record.id));
        this._echoLatestScoreBySegmentId = aggregateEchoLatestOverall(grouped, scores);
      } catch {
        this._echoLatestScoreBySegmentId = {};
      }
      this._storageEstimate = await estimateStorage();
    } catch {
      this._storageEstimate = null;
    }
  }

  private async _refreshSentenceBankIds(): Promise<void> {
    if (!this._mediaId) {
      this._sentenceBankSegmentIds = [];
      return;
    }
    try {
      const entries = await getSentenceBankList();
      this._sentenceBankSegmentIds = entries
        .filter((entry) => entry.sourceMediaId === this._mediaId)
        .map((entry) => entry.sourceSegmentId);
    } catch (error) {
      void reportError(error, { where: 'practice-view._refreshSentenceBankIds' });
      this._sentenceBankSegmentIds = [];
    }
  }

  private async _onSentenceBankAdd(
    event: CustomEvent<{ segment: SubtitleSegment }>,
  ): Promise<void> {
    const segment = event.detail.segment;
    const currentItem = this._controller.getSnapshot().currentItem;
    if (!currentItem || !segment) {
      return;
    }
    if (this._sentenceBankBusy) {
      return;
    }

    this._sentenceBankBusy = true;
    const loading = Loading.service({ text: msg('正在加入句库…') });
    try {
      const result = await addToSentenceBank({ media: currentItem, segment });
      if (result.status === 'duplicate') {
        Message.info(msg('该句已在句库'));
      } else {
        Message.success(msg('已加入句库'));
      }
      await this._refreshSentenceBankIds();
    } catch (error) {
      void reportError(error, {
        where: 'practice-view._onSentenceBankAdd',
        mediaId: currentItem.id,
        segmentId: segment.id,
      });
      Message.error(msg('加入句库失败，请重试'));
    } finally {
      loading.close();
      this._sentenceBankBusy = false;
    }
  }

  private async _onSentenceBankRemove(
    event: CustomEvent<{ segment: SubtitleSegment }>,
  ): Promise<void> {
    const segment = event.detail.segment;
    const currentItem = this._controller.getSnapshot().currentItem;
    if (!currentItem || !segment) {
      return;
    }
    if (this._sentenceBankBusy) {
      return;
    }

    this._sentenceBankBusy = true;
    const loading = Loading.service({ text: msg('正在从句库移除…') });
    try {
      const result = await removeFromSentenceBank({ media: currentItem, segment });
      if (result.status === 'missing') {
        Message.info(msg('该句不在句库'));
      } else {
        Message.success(msg('已从句库移除'));
      }
      await this._refreshSentenceBankIds();
    } catch (error) {
      void reportError(error, {
        where: 'practice-view._onSentenceBankRemove',
        mediaId: currentItem.id,
        segmentId: segment.id,
      });
      Message.error(msg('从句库移除失败，请重试'));
    } finally {
      loading.close();
      this._sentenceBankBusy = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'practice-view': PracticeView;
  }
}
