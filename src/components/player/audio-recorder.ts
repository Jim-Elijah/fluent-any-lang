import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  AudioRecorderController,
  RecorderControllerOptions,
  RecorderState,
} from '../../lib/audio-recorder.js';
import '../ui/button.js';

export interface AudioRecordOptions extends RecorderControllerOptions {
  showStart?: boolean;
  showPause?: boolean;
  showResume?: boolean;
  showStop?: boolean;
  showDestroy?: boolean;
}

// const defaultOptions: AudioRecordOptions = {
//   showStart: true,
//   showPause: true,
//   showResume: true,
//   showStop: true,
//   showDestroy: true,
//   onStart: () => console.log('开始录音'),
//   onPause: () => console.log('暂停录音'),
//   onResume: () => console.log('继续录音'),
//   onStop: (blob) => console.log('录音结束', blob),
//   onError: (err) => console.error('录音错误', err),
//   onStateChange: (state) => (this._state = state),
// };

@customElement('audio-recorder')
export class AudioRecorder extends LitElement {
  @property({ type: Object })
  recorderOptions: AudioRecordOptions = {
    showStart: true,
    showPause: true,
    showResume: true,
    showStop: true,
    showDestroy: true,
    onStart: () => console.log('开始录音'),
    onPause: () => console.log('暂停录音'),
    onResume: () => console.log('继续录音'),
    onStop: (blob) => {
      console.log('录音结束', blob);
      const audioUrl = URL.createObjectURL(blob);
      console.log('录音地址:', audioUrl);
      const audio = new Audio(audioUrl);
      audio.play();
    },
    onError: (err) => console.error('录音错误', err),
    onStateChange: (state) => (this._state = state),
  };

  @state()
  private _state: RecorderState = 'inactive';

  private _recorder: AudioRecorderController = new AudioRecorderController({
    onStart: this.recorderOptions.onStart,
    onPause: this.recorderOptions.onPause,
    onResume: this.recorderOptions.onResume,
    onStop: this.recorderOptions.onStop,
    onError: this.recorderOptions.onError,
    onStateChange: this.recorderOptions.onStateChange,
  });

  constructor() {
    super();
  }

  disconnectedCallback(): void {
    console.log('disconnectedCallback');
    this._recorder.destroy();
    super.disconnectedCallback();
  }

  // 开始
  async handleStart() {
    await this._recorder.start();
  }

  // 暂停
  handlePause() {
    this._recorder.pause();
  }

  // 继续
  handleResume() {
    this._recorder.resume();
  }

  // 停止
  async handleStop() {
    await this._recorder.stop();
    // const blob = await this._recorder.stop();
    // const audioUrl = URL.createObjectURL(blob);
    // console.log('录音地址:', audioUrl);

    // const audio = new Audio(audioUrl);
    // audio.play();
  }

  // 销毁
  handleDestroy() {
    this._recorder.destroy();
  }

  render() {
    console.log('options', this.recorderOptions);
    const { showStart, showPause, showResume, showStop, showDestroy } = this.recorderOptions;
    const canStart = this._state === 'inactive';
    const canPause = this._state === 'recording';
    const canResume = this._state === 'paused';
    const canStop = this._state !== 'inactive';
    const canDestroy = this._state !== 'inactive';
    return html`
      ${showStart
        ? html`<ui-button variant="primary" @click=${this.handleStart} ?disabled=${!canStart}
            >开始录音</ui-button
          >`
        : null}
      ${showPause
        ? html`<ui-button variant="secondary" @click=${this.handlePause} ?disabled=${!canPause}
            >暂停录音</ui-button
          >`
        : null}
      ${showResume
        ? html`<ui-button variant="secondary" @click=${this.handleResume} ?disabled=${!canResume}
            >继续录音</ui-button
          >`
        : null}
      ${showStop
        ? html`<ui-button variant="secondary" @click=${this.handleStop} ?disabled=${!canStop}
            >停止录音</ui-button
          >`
        : null}
      ${showDestroy
        ? html`<ui-button variant="secondary" @click=${this.handleDestroy} ?disabled=${!canDestroy}
            >销毁录音</ui-button
          >`
        : null}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'audio-recorder': AudioRecorder;
  }
}
