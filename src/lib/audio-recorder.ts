import { msg } from '@lit/localize';
import { getAudioContext } from './audio-context.js';

export type RecorderState = 'inactive' | 'recording' | 'paused';

export interface WaveformAnalysisOptions {
  intervalMs?: number;
}

export interface RecorderControllerOptions {
  mimeType?: string;
  onDataAvailable?: (blob: Blob) => void;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: (blob: Blob) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: RecorderState) => void;
}

export class AudioRecorderController {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private state: RecorderState = 'inactive';
  private options: RecorderControllerOptions;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private analysisIntervalId: ReturnType<typeof setInterval> | null = null;
  private analysisData: Uint8Array<ArrayBuffer> | null = null;

  constructor(options: RecorderControllerOptions = {}) {
    this.options = options;
  }

  /**
   * 获取当前录音状态
   */
  public getState(): RecorderState {
    return this.state;
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  public setState(state: RecorderState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }

  /**
   * 初始化麦克风和 MediaRecorder
   */
  private async initRecorder(): Promise<void> {
    if (this.mediaRecorder) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = this.getSupportedMimeType(this.options.mimeType);

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
      });

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
          this.options.onDataAvailable?.(event.data);
        }
      };

      this.mediaRecorder.onstart = () => {
        this.setState('recording');
        this.options.onStart?.();
      };

      this.mediaRecorder.onpause = () => {
        this.setState('paused');
        this.options.onPause?.();
      };

      this.mediaRecorder.onresume = () => {
        this.setState('recording');
        this.options.onResume?.();
      };

      this.mediaRecorder.onerror = (event: ErrorEvent) => {
        const error = event.error || new Error(msg('录音发生未知错误'));
        this.options.onError?.(error);
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(msg('初始化录音器失败'));
      this.options.onError?.(err);
      throw err;
    }
  }

  /**
   * 获取浏览器支持的 mimeType
   */
  private getSupportedMimeType(preferredMimeType?: string): string {
    const mimeTypes = [
      preferredMimeType,
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mpeg',
    ].filter(Boolean) as string[];

    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return '';
  }

  /**
   * 开始录音
   */
  public async start(): Promise<void> {
    if (this.state === 'recording') {
      throw new Error(msg('当前已经在录音中'));
    }

    if (this.state === 'paused') {
      this.resume();
      return;
    }

    await this.initRecorder();

    if (!this.mediaRecorder) {
      throw new Error(msg('MediaRecorder 初始化失败'));
    }

    this.chunks = [];

    await new Promise<void>((resolve, reject) => {
      const recorder = this.mediaRecorder!;

      const handleStart = () => {
        cleanup();
        resolve();
      };

      const handleError = (event: Event) => {
        cleanup();
        const error = (event as ErrorEvent).error ?? new Error(msg('录音启动失败'));
        reject(error);
      };

      const cleanup = () => {
        recorder.removeEventListener('start', handleStart);
        recorder.removeEventListener('error', handleError);
      };

      recorder.addEventListener('start', handleStart, { once: true });
      recorder.addEventListener('error', handleError, { once: true });

      try {
        recorder.start();
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error(msg('录音启动失败')));
      }
    });
  }

  /**
   * 暂停录音
   */
  public pause(): void {
    if (!this.mediaRecorder) {
      throw new Error(msg('录音器未初始化'));
    }

    if (this.state !== 'recording') {
      throw new Error(msg('当前不是录音状态，无法暂停'));
    }

    this.mediaRecorder.pause();
  }

  /**
   * 继续录音
   */
  public resume(): void {
    if (!this.mediaRecorder) {
      throw new Error(msg('录音器未初始化'));
    }

    if (this.state !== 'paused') {
      throw new Error(msg('当前不是暂停状态，无法继续'));
    }

    this.mediaRecorder.resume();
  }

  /**
   * 停止录音，返回最终 Blob
   */
  public stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error(msg('录音器未初始化')));
        return;
      }

      if (this.state === 'inactive') {
        reject(new Error(msg('当前没有正在进行的录音')));
        return;
      }

      const mimeType = this.mediaRecorder.mimeType || 'audio/webm';

      this.mediaRecorder.onstop = () => {
        this.setState('inactive');
        const blob = new Blob(this.chunks, { type: mimeType });
        this.options.onStop?.(blob);
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * 从麦克风 stream 采样波形峰值，返回 detach 函数
   */
  public attachWaveformAnalysis(
    onPeak: (peak: number) => void,
    options: WaveformAnalysisOptions = {},
  ): () => void {
    if (!this.stream) {
      throw new Error(msg('录音流未就绪'));
    }

    this.detachWaveformAnalysis();

    const audioContext = getAudioContext();
    void audioContext.resume();

    this.analyserNode = audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.sourceNode = audioContext.createMediaStreamSource(this.stream);
    this.sourceNode.connect(this.analyserNode);

    this.analysisData = new Uint8Array(new ArrayBuffer(this.analyserNode.fftSize));
    const intervalMs = options.intervalMs ?? 50;

    this.analysisIntervalId = setInterval(() => {
      if (!this.analyserNode || !this.analysisData) {
        return;
      }

      this.analyserNode.getByteTimeDomainData(this.analysisData);
      let max = 0;
      for (let i = 0; i < this.analysisData.length; i++) {
        const v = Math.abs(this.analysisData[i] - 128) / 128;
        if (v > max) max = v;
      }
      onPeak(max);
    }, intervalMs);

    return () => this.detachWaveformAnalysis();
  }

  public detachWaveformAnalysis(): void {
    if (this.analysisIntervalId !== null) {
      clearInterval(this.analysisIntervalId);
      this.analysisIntervalId = null;
    }

    this.sourceNode?.disconnect();
    this.analyserNode?.disconnect();
    this.sourceNode = null;
    this.analyserNode = null;
    this.analysisData = null;
  }

  /**
   * 销毁录音器，释放麦克风资源
   */
  public destroy(): void {
    this.detachWaveformAnalysis();

    if (this.mediaRecorder && this.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }

    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.setState('inactive');
  }
}

export default AudioRecorderController;
