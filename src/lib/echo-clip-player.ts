import { getAudioContext } from './audio-context.js';
import {
  attachMediaElementGain,
  detachMediaElementGain,
  setLogicalVolume,
} from './media-element-gain.js';

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

/** Align with MediaController segment-end epsilon. */
const CLIP_END_EPSILON = 0.015;

/**
 * Plays a subtitle-aligned media slice on a private HTMLMediaElement.
 * Independent of the main MediaController element so Echo listen does not seek/play the shared clock.
 * Uses element.playbackRate (preservesPitch) so rate matches Free Listening / Shadowing.
 */
export class EchoClipPlayer {
  private _element: HTMLMediaElement | null = null;
  private _objectUrl: string | null = null;
  private _preparedBlob: Blob | null = null;
  private _generation = 0;
  private _prepareId = 0;
  private _playing = false;
  private _clipEndTime = 0;
  private _rafId = 0;

  /** Fired only when the current clip ends naturally (not after stop / superseded play). */
  onEnded: (() => void) | null = null;

  get isPlaying(): boolean {
    return this._playing;
  }

  /**
   * Load and cache `blob` on a private media element.
   * Skips reload when the same Blob reference is already prepared.
   */
  async prepare(blob: Blob): Promise<void> {
    if (this._preparedBlob === blob && this._element && this._objectUrl) {
      return;
    }

    const prepareId = ++this._prepareId;
    this.stop();
    this._teardownMedia();

    const element = this._createElement(blob);
    const objectUrl = URL.createObjectURL(blob);
    element.preload = 'auto';
    this._enablePreservesPitch(element);

    try {
      await this._loadMetadata(element, objectUrl);
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      element.removeAttribute('src');
      try {
        element.load();
      } catch {
        // ignore teardown errors
      }
      throw error;
    }

    if (prepareId !== this._prepareId) {
      URL.revokeObjectURL(objectUrl);
      element.removeAttribute('src');
      try {
        element.load();
      } catch {
        // ignore teardown errors
      }
      return;
    }

    this._element = element;
    this._objectUrl = objectUrl;
    this._preparedBlob = blob;
    attachMediaElementGain(element);
  }

  /**
   * Play `[startTime, endTime]` from the prepared media element.
   * Stops any in-flight playback first so it cannot keep sounding or fire `onEnded`.
   */
  async play(range: EchoClipRange, opts: EchoClipPlayOptions): Promise<void> {
    if (!this._element) {
      throw new Error('EchoClipPlayer.play called before prepare');
    }
    if (!(range.endTime > range.startTime)) {
      throw new Error('Invalid echo clip range');
    }

    this.stop();

    const generation = ++this._generation;
    const element = this._element;
    this._clipEndTime = range.endTime;

    element.playbackRate = opts.playbackRate;
    setLogicalVolume(element, opts.volume);

    await this._seekTo(element, range.startTime, generation);
    if (generation !== this._generation) {
      return;
    }

    this._playing = true;
    this._attachWatchers(element);

    try {
      await element.play();
    } catch (error) {
      if (generation !== this._generation) {
        return;
      }
      this._playing = false;
      this._detachWatchers(element);
      throw error;
    }

    if (generation !== this._generation) {
      return;
    }

    // Seek inaccuracy or empty range near EOF can leave us already at/past the end.
    if (element.currentTime >= this._clipEndTime - CLIP_END_EPSILON) {
      this._finishNaturalEnd();
    }
  }

  /**
   * `onEnded` only means the media element paused at the clip end; the output device can still be sounding.
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

  /** Synchronously stop playback (if any). Does not fire `onEnded`. */
  stop(): void {
    this._generation += 1;
    this._playing = false;
    this._cancelRaf();

    const element = this._element;
    if (element) {
      this._detachWatchers(element);
      element.pause();
    }
  }

  /** Stop playback and drop the cached media element / object URL. */
  dispose(): void {
    this.stop();
    this._prepareId += 1;
    this._teardownMedia();
    this.onEnded = null;
  }

  private _createElement(blob: Blob): HTMLMediaElement {
    if (blob.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      return video;
    }
    return document.createElement('audio');
  }

  private _enablePreservesPitch(element: HTMLMediaElement): void {
    const el = element as HTMLMediaElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    if ('preservesPitch' in el) {
      el.preservesPitch = true;
    }
    if ('mozPreservesPitch' in el) {
      el.mozPreservesPitch = true;
    }
    if ('webkitPreservesPitch' in el) {
      el.webkitPreservesPitch = true;
    }
  }

  private _loadMetadata(element: HTMLMediaElement, objectUrl: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onLoaded = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new Error('Failed to load echo clip media'));
      };
      const cleanup = (): void => {
        element.removeEventListener('loadedmetadata', onLoaded);
        element.removeEventListener('error', onError);
      };

      element.addEventListener('loadedmetadata', onLoaded);
      element.addEventListener('error', onError);
      element.src = objectUrl;
      element.load();

      if (element.readyState >= HTMLMediaElement.HAVE_METADATA) {
        cleanup();
        resolve();
      }
    });
  }

  private _seekTo(element: HTMLMediaElement, time: number, generation: number): Promise<void> {
    const target = Math.max(0, time);
    if (Math.abs(element.currentTime - target) < CLIP_END_EPSILON && !element.seeking) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        fn();
      };
      const onSeeked = (): void => {
        finish(resolve);
      };
      const onError = (): void => {
        finish(() => reject(new Error('Failed to seek echo clip media')));
      };
      const cleanup = (): void => {
        element.removeEventListener('seeked', onSeeked);
        element.removeEventListener('error', onError);
      };

      element.addEventListener('seeked', onSeeked);
      element.addEventListener('error', onError);
      element.currentTime = target;

      // Some engines complete short seeks synchronously and never emit `seeked`.
      queueMicrotask(() => {
        if (generation !== this._generation) {
          finish(resolve);
          return;
        }
        if (!element.seeking) {
          finish(resolve);
        }
      });
    });
  }

  private _attachWatchers(element: HTMLMediaElement): void {
    element.addEventListener('timeupdate', this._onTimeUpdate);
    element.addEventListener('ended', this._onNativeEnded);
    this._scheduleWatchTick();
  }

  private _detachWatchers(element: HTMLMediaElement): void {
    element.removeEventListener('timeupdate', this._onTimeUpdate);
    element.removeEventListener('ended', this._onNativeEnded);
    this._cancelRaf();
  }

  private _scheduleWatchTick(): void {
    this._cancelRaf();
    const tick = (): void => {
      this._rafId = 0;
      if (!this._playing || !this._element) {
        return;
      }
      if (this._element.currentTime >= this._clipEndTime - CLIP_END_EPSILON) {
        this._finishNaturalEnd();
        return;
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  private _cancelRaf(): void {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  private _onTimeUpdate = (): void => {
    if (!this._playing || !this._element) {
      return;
    }
    if (this._element.currentTime >= this._clipEndTime - CLIP_END_EPSILON) {
      this._finishNaturalEnd();
    }
  };

  private _onNativeEnded = (): void => {
    if (!this._playing) {
      return;
    }
    this._finishNaturalEnd();
  };

  private _finishNaturalEnd(): void {
    if (!this._playing) {
      return;
    }

    this._playing = false;
    this._cancelRaf();

    const element = this._element;
    if (element) {
      this._detachWatchers(element);
      element.pause();
    }

    // Invalidate late events the same way `stop()` does, then notify.
    this._generation += 1;
    this.onEnded?.();
  }

  private _teardownMedia(): void {
    const element = this._element;
    const objectUrl = this._objectUrl;
    this._element = null;
    this._objectUrl = null;
    this._preparedBlob = null;
    this._clipEndTime = 0;

    if (element) {
      this._detachWatchers(element);
      detachMediaElementGain(element);
      element.pause();
      element.removeAttribute('src');
      try {
        element.load();
      } catch {
        // ignore teardown errors
      }
    }

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
