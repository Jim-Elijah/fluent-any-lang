export type NoiseMixerTrack = {
  id: string;
  url: string;
  /** 0–1 */
  volume: number;
};

type TrackRuntime = {
  id: string;
  url: string;
  audio: HTMLAudioElement;
  ownedUrl: boolean;
};

/**
 * Plays one or more ambient noise tracks in sync with a main media play/pause flag.
 * Does not follow seek, rate, or segment navigation. Loops each track on `ended`.
 */
export class NoiseMixer {
  private tracks: TrackRuntime[] = [];
  private playing = false;
  private destroyed = false;

  setTracks(next: NoiseMixerTrack[]): void {
    if (this.destroyed) return;
    this._clearTracks();
    this.tracks = next.map((track) => {
      const audio = new Audio();
      audio.loop = false;
      audio.preload = 'auto';
      audio.src = track.url;
      audio.volume = Math.max(0, Math.min(1, track.volume));
      audio.addEventListener('ended', this._onTrackEnded);
      return { id: track.id, url: track.url, audio, ownedUrl: track.url.startsWith('blob:') };
    });
    if (this.playing) {
      void this._playAll();
    }
  }

  setTrackVolume(id: string, volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    const runtime = this.tracks.find((t) => t.id === id);
    if (runtime) {
      runtime.audio.volume = clamped;
    }
  }

  setPlaying(playing: boolean): void {
    if (this.destroyed) return;
    this.playing = playing;
    if (playing) {
      void this._playAll();
    } else {
      this._pauseAll();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.playing = false;
    this._clearTracks();
  }

  private _onTrackEnded = (event: Event): void => {
    if (!this.playing || this.destroyed) return;
    const audio = event.target as HTMLAudioElement;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Autoplay / interruption — ignore; next setPlaying(true) retries.
    });
  };

  private async _playAll(): Promise<void> {
    await Promise.all(
      this.tracks.map(async (track) => {
        try {
          await track.audio.play();
        } catch {
          // ignore per-track play failures
        }
      }),
    );
  }

  private _pauseAll(): void {
    for (const track of this.tracks) {
      track.audio.pause();
    }
  }

  private _clearTracks(): void {
    for (const track of this.tracks) {
      track.audio.removeEventListener('ended', this._onTrackEnded);
      track.audio.pause();
      track.audio.removeAttribute('src');
      track.audio.load();
      if (track.ownedUrl) {
        URL.revokeObjectURL(track.url);
      }
    }
    this.tracks = [];
  }
}
