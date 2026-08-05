import { getAudioContext } from './audio-context.js';

export type EchoClipRange = {
  startTime: number;
  endTime: number;
};

export type EchoClipPlayOptions = {
  playbackRate: number;
  volume: number;
};

/** Reported latency is an estimate; device buffers need headroom on top of it. */
const OUTPUT_DRAIN_SAFETY_MS = 60;
const OUTPUT_DRAIN_MIN_MS = 80;
const OUTPUT_DRAIN_MAX_MS = 400;

/**
 * Plays a subtitle-aligned media slice via Web Audio (AudioBufferSourceNode).
 * Independent of the main HTMLMediaElement so Echo listen does not seek/play the shared element.
 */
export class EchoClipPlayer {
  private _buffer: AudioBuffer | null = null;
  private _preparedBlob: Blob | null = null;
  private _source: AudioBufferSourceNode | null = null;
  private _gain: GainNode | null = null;
  private _generation = 0;
  private _playing = false;

  /** Fired only when the current clip ends naturally (not after stop / superseded play). */
  onEnded: (() => void) | null = null;

  get isPlaying(): boolean {
    return this._playing;
  }

  /**
   * Decode and cache `blob`. Skips re-decode when the same Blob reference is already prepared.
   */
  async prepare(blob: Blob): Promise<void> {
    if (this._preparedBlob === blob && this._buffer) {
      return;
    }

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    this._buffer = audioBuffer;
    this._preparedBlob = blob;
  }

  /**
   * Play `[startTime, endTime]` from the prepared buffer.
   * Stops any in-flight source first so it cannot keep sounding or fire `onEnded`.
   */
  async play(range: EchoClipRange, opts: EchoClipPlayOptions): Promise<void> {
    if (!this._buffer) {
      throw new Error('EchoClipPlayer.play called before prepare');
    }
    if (!(range.endTime > range.startTime)) {
      throw new Error('Invalid echo clip range');
    }

    this.stop();

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const duration = range.endTime - range.startTime;
    const generation = ++this._generation;

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = this._buffer;
    source.playbackRate.value = opts.playbackRate;
    gain.gain.value = opts.volume;
    source.connect(gain);
    gain.connect(ctx.destination);

    source.onended = () => {
      if (generation !== this._generation) {
        return;
      }
      this._playing = false;
      this._source = null;
      this._gain = null;
      this.onEnded?.();
    };

    this._source = source;
    this._gain = gain;
    this._playing = true;
    // Schedule at "now" rather than 0: a grain whose start time is in the past may be
    // trimmed to keep its original end time, which cuts the beginning of the clip.
    source.start(ctx.currentTime, range.startTime, duration);
  }

  /**
   * `onEnded` only means the audio graph finished; the output device can still be sounding.
   * Callers that open a microphone next must await this, or the mic captures the clip tail.
   */
  async waitForOutputDrain(): Promise<void> {
    const delayMs = this._outputDrainMs();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  private _outputDrainMs(): number {
    let reportedMs = 0;
    try {
      const ctx = getAudioContext();
      const outputLatency = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : 0;
      const baseLatency = Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0;
      reportedMs = (outputLatency + baseLatency) * 1000;
    } catch {
      // No AudioContext available — fall back to the floor below.
    }
    const target = Math.round(reportedMs) + OUTPUT_DRAIN_SAFETY_MS;
    return Math.min(OUTPUT_DRAIN_MAX_MS, Math.max(OUTPUT_DRAIN_MIN_MS, target));
  }

  /** Synchronously stop and disconnect the current source (if any). */
  stop(): void {
    this._generation += 1;
    const source = this._source;
    const gain = this._gain;
    this._source = null;
    this._gain = null;
    this._playing = false;

    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already stopped
      }
      try {
        source.disconnect();
      } catch {
        // already disconnected
      }
    }
    if (gain) {
      try {
        gain.disconnect();
      } catch {
        // already disconnected
      }
    }
  }

  /** Stop playback and drop the cached buffer. */
  dispose(): void {
    this.stop();
    this._buffer = null;
    this._preparedBlob = null;
    this.onEnded = null;
  }
}
