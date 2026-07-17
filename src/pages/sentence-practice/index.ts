import { msg, localized } from '@lit/localize';
import { css, html, LitElement, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { customElement, property, state } from 'lit/decorators.js';
import { navigator } from 'lit-element-router';

import { MediaController } from '../../controllers/media-controller.js';
import { loadSentenceForPractice, sentenceToLoadedTrack } from '../../lib/media-loader.js';
import { reportError } from '../../lib/error-reporter.js';
import {
  VOLUME_HOTKEY_STEP,
  getHotkeyCatalog,
  getHotkeyManager,
  stepPlaybackRate,
  supportsKeyboardShortcuts,
} from '../../lib/hotkeys/index.js';
import type { MediaControlsConfig, RouteContext, SentenceBankEntry } from '../../types/models.js';
import { Message } from '../../components/ui/message.js';
import { Loading } from '../../components/ui/loading.js';
import type { RecordingStateChangeDetail } from '../../components/player/audio-recorder.js';

import '../../components/ui/alert.js';
import '../../components/ui/button.js';
import '../../components/ui/modal.js';
import '../../components/player/media-player.js';
import '../../components/player/audio-recorder.js';

type PracticeMode = 'listening' | 'speaking';

const SENTENCE_PLAYER_CONTROLS: MediaControlsConfig = {
  progress: true,
  playPause: true,
  playbackRate: true,
  volume: true,
  loopMode: false,
  sleepMode: false,
  pauseMode: false,
  previousNextTrack: false,
  previousNextSegment: false,
  switchMode: false,
  advancedSetting: false,
};

const NavigatorElement = navigator(LitElement);

@customElement('sentence-practice-page')
@localized()
export class SentencePracticePage extends NavigatorElement {
  static styles = css`
    :host {
      display: block;
    }

    .page {
      display: flex;
      flex-direction: column;
      gap: var(--space-inline);
      max-width: 720px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-block);
    }

    .header h2 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
    }

    .card {
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #d9d9d9);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-inline);
      display: flex;
      flex-direction: column;
      gap: var(--space-inline);
    }

    .sentence-text {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      line-height: 1.5;
    }

    .sentence-translation {
      margin: 0;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.65));
    }

    .meta {
      margin: 0;
      font-size: 0.8125rem;
      color: var(--color-text-secondary, rgba(0, 0, 0, 0.45));
    }

    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
    }

    .recorder {
      margin-top: var(--space-sm);
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

  @property({ type: Object })
  routeContext: RouteContext = {
    route: '',
    params: {},
    query: {},
    data: {},
  };

  @state()
  private _entry: SentenceBankEntry | null = null;

  @state()
  private _mode: PracticeMode = 'listening';

  @state()
  private _error = '';

  @state()
  private _hotkeysHelpOpen = false;

  @state()
  private _recording = false;

  private readonly _controller = new MediaController();
  private _didLoad = false;

  connectedCallback(): void {
    super.connectedCallback();
    if (supportsKeyboardShortcuts()) {
      getHotkeyManager().registerScope({
        id: 'sentence-practice',
        enabled: () => this._sentencePracticeHotkeysEnabled(),
        handlers: {
          togglePlay: () => {
            void this._controller.togglePlay();
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

  disconnectedCallback(): void {
    if (supportsKeyboardShortcuts()) {
      getHotkeyManager().unregisterScope('sentence-practice');
    }
    this.shadowRoot?.querySelector('audio-recorder')?.destroy();
    this._controller.destroy();
    super.disconnectedCallback();
  }
  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (!changed.has('routeContext') && this._didLoad) {
      return;
    }
    this._didLoad = true;
    void this._load();
  }

  private _getEntryId(): string {
    const value = this.routeContext.query?.id;
    return typeof value === 'string' ? value.trim() : '';
  }

  private async _load(): Promise<void> {
    const entryId = this._getEntryId();
    if (!entryId) {
      this._error = msg('缺少句子 ID');
      return;
    }

    const loading = Loading.service({ text: msg('加载句子中…') });
    try {
      const loaded = await loadSentenceForPractice(entryId);
      if (!loaded) {
        this._error = msg('该句子不存在或无法加载');
        this._entry = null;
        return;
      }

      this._error = '';
      this._entry = loaded.entry;
      await this._controller.loadTracks([sentenceToLoadedTrack(loaded)]);
    } catch (error) {
      void reportError(error, { where: 'sentence-practice-page.load', entryId });
      this._error = msg('加载失败，请重试');
    } finally {
      loading.close();
    }
  }

  private _viewSource(): void {
    const entry = this._entry;
    if (!entry) {
      return;
    }
    if (!entry.sourceAvailable) {
      Message.warning(msg('源媒体已删除，无法查看来源'));
      return;
    }
    const query = new URLSearchParams({
      mediaId: entry.sourceMediaId,
      segmentId: entry.sourceSegmentId,
    });
    this.navigate(`/practice?${query.toString()}`);
  }

  private _backToBank(): void {
    this.navigate('/sentences');
  }

  private _sentencePracticeHotkeysEnabled(): boolean {
    if (this._hotkeysHelpOpen) {
      return false;
    }
    if (this._recording) {
      return false;
    }
    return true;
  }

  private _nudgeVolume(delta: number): void {
    const current = this._controller.getSnapshot().volume;
    this._controller.setVolume(current + delta);
  }

  private _nudgePlaybackRate(direction: 1 | -1): void {
    const current = this._controller.getSnapshot().playbackRate;
    this._controller.setPlaybackRate(stepPlaybackRate(current, direction));
  }

  private _pauseMediaBeforeRecording = (): void => {
    if (this._controller.getSnapshot().isPlaying) {
      void this._controller.pause();
    }
  };

  private _onRecordingStateChange = (event: CustomEvent<RecordingStateChangeDetail>): void => {
    this._recording = event.detail.recording;
  };

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

    const catalog = getHotkeyCatalog().filter((section) => section.scopeId === 'sentence-practice');

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
        <div slot="footer">
          <ui-button variant="primary" @click=${this._closeHotkeysHelp}>${msg('知道了')}</ui-button>
        </div>
      </ui-modal>
    `;
  }

  render() {
    const entry = this._entry;
    return html`
      <div class="page">
        <div class="header">
          <h2>${msg('句子练习')}</h2>
          <div class="actions">
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
            <ui-button variant="secondary" @click=${this._backToBank}>${msg('返回句库')}</ui-button>
            <ui-button
              variant="secondary"
              ?disabled=${!entry?.sourceAvailable}
              @click=${this._viewSource}
            >
              ${msg('查看来源')}
            </ui-button>
          </div>
        </div>

        ${this._error ? html`<ui-alert type="error">${this._error}</ui-alert>` : nothing}
        ${!entry
          ? nothing
          : html`
              <section class="card">
                <p class="sentence-text">${entry.text}</p>
                ${entry.translation
                  ? html`<p class="sentence-translation">${entry.translation}</p>`
                  : nothing}
                <p class="meta">
                  ${msg('来自')}：${entry.sourceTitleSnapshot}
                  ${entry.sourceAvailable ? nothing : html` · ${msg('源媒体已删除')}`}
                </p>

                <div class="tabs">
                  <ui-button
                    variant="${this._mode === 'listening' ? 'primary' : 'secondary'}"
                    @click=${() => {
                      this._mode = 'listening';
                    }}
                  >
                    ${msg('听力')}
                  </ui-button>
                  <ui-button
                    variant="${this._mode === 'speaking' ? 'primary' : 'secondary'}"
                    @click=${() => {
                      this._mode = 'speaking';
                    }}
                  >
                    ${msg('口语')}
                  </ui-button>
                </div>
              </section>

              <media-player
                .controller=${this._controller}
                mode="normal"
                .controlsConfig=${SENTENCE_PLAYER_CONTROLS}
              ></media-player>

              ${this._mode === 'speaking'
                ? html`<div class="recorder">
                    ${keyed(
                      entry.id,
                      html`<audio-recorder
                        .controller=${this._controller}
                        .collectSegments=${false}
                        .countdownBeforeStart=${false}
                        .autoPlayOnStart=${false}
                        .beforeRecordingStart=${this._pauseMediaBeforeRecording}
                        @recording-state-change=${this._onRecordingStateChange}
                      ></audio-recorder>`,
                    )}
                  </div>`
                : nothing}
            `}
        ${this._renderHotkeysHelpModal()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sentence-practice-page': SentencePracticePage;
  }
}
