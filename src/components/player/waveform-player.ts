import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import { WaveformControllerHost } from '../../controllers/waveform-controller-host.js';
import type { WaveformController, WaveformLayout } from '../../controllers/waveform-controller.js';
import {
  getPeakIndexRange,
  type TrackRect,
  type ViewRange,
  type WaveformTrack,
  xToTime,
} from '../../controllers/waveform-controller.js';

const MIN_SELECTION_SECONDS = 0.05;

export const WaveformPlayerEventType = {
  SEEK_REQUEST: 'seek-request',
} as const;

export type WaveformSeekRequestDetail = {
  trackId: string;
  time: number;
};

type ViewSelectState = {
  isDown: boolean;
  startX: number;
  endX: number;
  active: boolean;
};

@customElement('waveform-player')
export class WaveformPlayer extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    canvas {
      width: 100%;
      display: block;
      background: linear-gradient(to bottom, var(--color-surface, #fff), #fbfbfd);
      border: 1px solid var(--color-border, #e8e8e8);
      border-radius: var(--radius-md, 8px);
      user-select: none;
      touch-action: none;
    }

    canvas.interactive {
      cursor: crosshair;
    }

    canvas.non-interactive {
      cursor: default;
    }

    .track-legend {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-sm) var(--space-block);
      margin-top: var(--space-sm);
      padding: 0 2px;
    }

    .track-label {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      padding: 2px 0;
      border: none;
      background: none;
      font: inherit;
      font-size: 0.8125rem;
      color: var(--color-text, #374151);
      cursor: pointer;
      user-select: none;
      transition: opacity 0.15s ease;
    }

    .track-label.hidden {
      opacity: 0.4;
    }

    .track-swatch {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
  `;

  @property({ attribute: false })
  controller: WaveformController | null = null;

  @property({ type: Number })
  canvasHeight = 320;

  @property({ type: Boolean })
  interactive = true;

  /**
   * Overlay layout only: map the controller view range from the active track's
   * timeline onto another track before drawing peaks.
   */
  @property({ attribute: false })
  resolveTrackViewRange:
    | ((
        track: WaveformTrack,
        viewRange: ViewRange | null,
        activeTrack: WaveformTrack | null,
      ) => ViewRange | null)
    | null = null;

  @query('canvas')
  private _canvas?: HTMLCanvasElement;

  @state()
  private _controllerHost: WaveformControllerHost | null = null;

  @state()
  private _hiddenTrackIds: string[] = [];

  private _boundController: WaveformController | null = null;
  private _lastTrackRects: TrackRect[] = [];
  private _viewSelect: ViewSelectState = {
    isDown: false,
    startX: 0,
    endX: 0,
    active: false,
  };
  private _resizeObserver: ResizeObserver | null = null;
  private _suppressClick = false;
  private _pendingClickId: ReturnType<typeof setTimeout> | null = null;
  private static readonly CLICK_DELAY_MS = 250;

  disconnectedCallback(): void {
    this._clearPendingClick();
    this._teardownObservers();
    window.removeEventListener('mouseup', this._handleWindowMouseUp);
    super.disconnectedCallback();
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('controller') && this.controller !== this._boundController) {
      this._boundController = this.controller;
      if (this.controller && !this._controllerHost) {
        this._controllerHost = new WaveformControllerHost(this, this.controller);
      }
    }
  }

  protected firstUpdated(): void {
    this._setupObservers();
    window.addEventListener('mouseup', this._handleWindowMouseUp);
    this._renderCanvas();
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('canvasHeight')) {
      this._syncCanvasHeight();
    }
    this._renderCanvas();
  }

  render() {
    const canvasClass = this.interactive ? 'interactive' : 'non-interactive';
    const tracks = this._controllerHost?.snapshot?.tracks ?? [];
    const hiddenSet = new Set(this._hiddenTrackIds);

    return html`
      <canvas
        class=${canvasClass}
        @mousedown=${this._handleMouseDown}
        @mousemove=${this._handleMouseMove}
        @dblclick=${this._handleDoubleClick}
        @click=${this._handleClick}
      ></canvas>
      ${tracks.length > 1
        ? html`<div class="track-legend">
            ${tracks.map(
              (track) =>
                html`<button
                  type="button"
                  class="track-label ${hiddenSet.has(track.id) ? 'hidden' : ''}"
                  @click=${() => this._toggleTrackVisibility(track.id)}
                >
                  <span class="track-swatch" style="background:${track.color}"></span>
                  <span>${track.name}</span>
                </button>`,
            )}
          </div>`
        : null}
    `;
  }

  private _setupObservers(): void {
    this._teardownObservers();
    this._syncCanvasHeight();

    if (!this._canvas) {
      return;
    }

    this._resizeObserver = new ResizeObserver(() => {
      this._renderCanvas();
    });
    this._resizeObserver.observe(this._canvas);

    window.addEventListener('resize', this._handleWindowResize);
  }

  private _teardownObservers(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    window.removeEventListener('resize', this._handleWindowResize);
  }

  private _handleWindowResize = (): void => {
    this._renderCanvas();
  };

  private _syncCanvasHeight(): void {
    if (this._canvas) {
      this._canvas.style.height = `${this.canvasHeight}px`;
    }
  }

  private _renderCanvas(): void {
    const canvas = this._canvas;
    const snapshot = this._controllerHost?.snapshot;
    if (!canvas || !snapshot) {
      return;
    }

    this._pruneHiddenTracks(snapshot.tracks);

    this._lastTrackRects = this._renderWaveforms({
      canvas,
      tracks: snapshot.tracks,
      activeId: snapshot.activeId,
      layout: snapshot.layout,
      viewRange: snapshot.viewRange,
      hiddenTrackIds: new Set(this._hiddenTrackIds),
      resolveTrackViewRange: this.resolveTrackViewRange,
    });

    this._drawPlayhead(canvas, snapshot);
    if (this._viewSelect.active) {
      this._drawSelectionOverlay(canvas);
    }
  }

  private _toggleTrackVisibility(trackId: string): void {
    const hidden = new Set(this._hiddenTrackIds);
    if (hidden.has(trackId)) {
      hidden.delete(trackId);
    } else {
      hidden.add(trackId);
    }
    this._hiddenTrackIds = [...hidden];
    this._renderCanvas();
  }

  private _pruneHiddenTracks(tracks: WaveformTrack[]): void {
    const ids = new Set(tracks.map((track) => track.id));
    const pruned = this._hiddenTrackIds.filter((id) => ids.has(id));
    if (pruned.length !== this._hiddenTrackIds.length) {
      this._hiddenTrackIds = pruned;
    }
  }

  private _renderWaveforms({
    canvas,
    tracks,
    activeId,
    layout,
    viewRange,
    hiddenTrackIds,
    resolveTrackViewRange,
  }: {
    canvas: HTMLCanvasElement;
    tracks: WaveformTrack[];
    activeId: string | null;
    layout: WaveformLayout;
    viewRange: ViewRange | null;
    hiddenTrackIds: Set<string>;
    resolveTrackViewRange: WaveformPlayer['resolveTrackViewRange'];
  }): TrackRect[] {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return [];
    }

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cssW, cssH);

    if (tracks.length === 0) {
      return [];
    }

    const trackRects: TrackRect[] = [];

    const edgePad = 4;
    const visibleTracks = tracks.filter((track) => !hiddenTrackIds.has(track.id));

    /** overlay, 多个track叠在同一条基线上；trackRects为空数组 */
    if (layout === 'overlay') {
      const midY = cssH - edgePad;
      const maxH = cssH - edgePad * 2;

      ctx.strokeStyle = 'rgba(17,24,39,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(cssW, midY);
      ctx.stroke();

      const activeTrack = tracks.find((item) => item.id === activeId) ?? null;

      const drawWave = (track: WaveformTrack, alpha: number, lineWidth: number): void => {
        const { peaks } = track;
        if (!peaks || peaks.length < 2) {
          return;
        }

        const trackViewRange = resolveTrackViewRange?.(track, viewRange, activeTrack) ?? viewRange;
        const { iStart, iEnd } = getPeakIndexRange(track, trackViewRange);
        const visibleCount = Math.max(2, iEnd - iStart + 1);

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = track.color;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.beginPath();
        for (let i = iStart; i <= iEnd; i++) {
          const localIndex = i - iStart;
          const x = (localIndex / (visibleCount - 1)) * cssW;
          const y = midY - peaks[i] * maxH;
          if (localIndex === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      };

      for (const track of visibleTracks.filter((item) => item.id !== activeId)) {
        drawWave(track, 0.28, 1.2);
      }
      const active = visibleTracks.find((item) => item.id === activeId);
      if (active) {
        drawWave(active, 1, 2.2);
      }
      return trackRects;
    }

    /** stack, 多个track分层排列，每个track各占一条水平基线；trackRects为非空数组*/
    const laneGap = 6;
    const topPad = edgePad;
    const bottomPad = edgePad;
    const trackCount = visibleTracks.length;
    if (trackCount === 0) {
      return trackRects;
    }

    const trackH = Math.max(
      24,
      (cssH - topPad - bottomPad - laneGap * (trackCount - 1)) / trackCount,
    );

    for (let idx = 0; idx < visibleTracks.length; idx++) {
      const track = visibleTracks[idx];
      const y0 = topPad + idx * (trackH + laneGap);
      const y1 = y0 + trackH;
      trackRects.push({ id: track.id, y0, y1 });

      const isActive = track.id === activeId;
      const { peaks } = track;
      if (!peaks || peaks.length < 2) {
        continue;
      }

      const midY = y1 - edgePad;
      const maxH = trackH - edgePad * 2;

      ctx.strokeStyle = 'rgba(17,24,39,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(cssW, midY);
      ctx.stroke();

      if (isActive) {
        ctx.fillStyle = 'rgba(79,140,255,0.08)';
        ctx.fillRect(0, y0, cssW, trackH);
      }

      const { iStart, iEnd } = getPeakIndexRange(track, viewRange);
      const visibleCount = Math.max(2, iEnd - iStart + 1);

      ctx.globalAlpha = isActive ? 1 : 0.2;
      ctx.strokeStyle = track.color;
      ctx.lineWidth = isActive ? 2.2 : 1.1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.beginPath();
      for (let i = iStart; i <= iEnd; i++) {
        const localIndex = i - iStart;
        const x = (localIndex / (visibleCount - 1)) * cssW;
        const y = midY - peaks[i] * maxH;
        if (localIndex === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    return trackRects;
  }

  private _drawPlayhead(
    canvas: HTMLCanvasElement,
    snapshot: NonNullable<WaveformControllerHost['snapshot']>,
  ): void {
    const active = snapshot.activeTrack;
    if (!active) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const t = snapshot.currentTime || 0;

    let ratio: number;
    if (snapshot.viewRange) {
      const span = snapshot.viewRange.end - snapshot.viewRange.start;
      ratio = span > 0 ? (t - snapshot.viewRange.start) / span : 0;
    } else {
      ratio = active.duration > 0 ? t / active.duration : 0;
    }
    ratio = Math.min(1, Math.max(0, ratio));
    const x = ratio * cssW;

    ctx.save();
    ctx.strokeStyle = 'rgba(239,68,68,0.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH);
    ctx.stroke();

    ctx.fillStyle = 'rgba(239,68,68,0.95)';
    ctx.beginPath();
    ctx.arc(x, 8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private _drawSelectionOverlay(canvas: HTMLCanvasElement): void {
    if (!this._viewSelect.active) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const cssH = canvas.clientHeight;
    const x1 = Math.min(this._viewSelect.startX, this._viewSelect.endX);
    const x2 = Math.max(this._viewSelect.startX, this._viewSelect.endX);

    ctx.save();
    ctx.fillStyle = 'rgba(79,140,255,0.15)';
    ctx.strokeStyle = 'rgba(79,140,255,0.65)';
    ctx.lineWidth = 1;
    ctx.fillRect(x1, 0, x2 - x1, cssH);
    ctx.strokeRect(x1, 0, x2 - x1, cssH);
    ctx.restore();
  }

  private _getTrackAtY(y: number): WaveformTrack | null {
    const snapshot = this._controllerHost?.snapshot;
    if (!snapshot) {
      return null;
    }

    /** overlay, 点击波形图时，不会切换track，始终返回activeTrack */
    if (snapshot.layout !== 'stack') {
      return snapshot.activeTrack;
    }

    /** stack, 点击波形图时，会切换track，返回点击处的track */
    for (const rect of this._lastTrackRects) {
      if (y >= rect.y0 && y <= rect.y1) {
        return snapshot.tracks.find((track) => track.id === rect.id) ?? null;
      }
    }

    return null;
  }

  private _handleMouseDown = (event: MouseEvent): void => {
    if (!this.interactive) {
      return;
    }

    const snapshot = this._controllerHost?.snapshot;
    if (!snapshot || snapshot.tracks.length === 0 || !this._canvas) {
      return;
    }

    const rect = this._canvas.getBoundingClientRect();
    this._viewSelect.isDown = true;
    this._viewSelect.active = true;
    this._viewSelect.startX = event.clientX - rect.left;
    this._viewSelect.endX = this._viewSelect.startX;
    this._renderCanvas();
  };

  private _handleMouseMove = (event: MouseEvent): void => {
    if (!this.interactive || !this._viewSelect.isDown || !this._canvas) {
      return;
    }

    const rect = this._canvas.getBoundingClientRect();
    this._viewSelect.endX = event.clientX - rect.left;
    this._renderCanvas();
  };

  private _handleWindowMouseUp = (): void => {
    if (!this._viewSelect.isDown) {
      return;
    }

    this._viewSelect.isDown = false;

    const controller = this.controller;
    const snapshot = this._controllerHost?.snapshot;
    if (!controller || !snapshot || !this._canvas) {
      this._viewSelect.active = false;
      this._renderCanvas();
      return;
    }

    const active = snapshot.activeTrack;
    if (!active) {
      this._viewSelect.active = false;
      this._renderCanvas();
      return;
    }

    const rect = this._canvas.getBoundingClientRect();
    const x1 = Math.min(this._viewSelect.startX, this._viewSelect.endX);
    const x2 = Math.max(this._viewSelect.startX, this._viewSelect.endX);

    const startTime = xToTime(x1, rect.width, active.duration, snapshot.viewRange);
    const endTime = xToTime(x2, rect.width, active.duration, snapshot.viewRange);

    const dragged = Math.abs(endTime - startTime) >= MIN_SELECTION_SECONDS;
    this._suppressClick = dragged;

    if (dragged) {
      controller.setViewRange({
        start: Math.min(startTime, endTime),
        end: Math.max(startTime, endTime),
      });
    }

    this._viewSelect.active = false;
    this._renderCanvas();
  };

  private _handleDoubleClick = (): void => {
    if (!this.interactive) {
      return;
    }

    this._clearPendingClick();
    this.controller?.setViewRange(null);
  };

  private _clearPendingClick(): void {
    if (this._pendingClickId !== null) {
      clearTimeout(this._pendingClickId);
      this._pendingClickId = null;
    }
  }

  private _handleClick = (event: MouseEvent): void => {
    if (!this.interactive) {
      return;
    }

    if (this._suppressClick) {
      this._suppressClick = false;
      return;
    }

    this._clearPendingClick();
    this._pendingClickId = setTimeout(() => {
      this._pendingClickId = null;
      void this._performClick(event);
    }, WaveformPlayer.CLICK_DELAY_MS);
  };

  private async _performClick(event: MouseEvent): Promise<void> {
    if (!this.interactive) {
      return;
    }

    if (this._suppressClick) {
      this._suppressClick = false;
      return;
    }

    const controller = this.controller;
    const snapshot = this._controllerHost?.snapshot;
    if (!controller || !snapshot || snapshot.tracks.length === 0 || !this._canvas) {
      return;
    }

    const rect = this._canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let target = this._getTrackAtY(y);
    if (!target) {
      target = snapshot.activeTrack;
    }
    if (!target) {
      return;
    }

    const time = xToTime(x, rect.width, target.duration, snapshot.viewRange);
    const clamped = Math.max(0, Math.min(target.duration, time));

    const seekRequest = new CustomEvent<WaveformSeekRequestDetail>(
      WaveformPlayerEventType.SEEK_REQUEST,
      {
        detail: { trackId: target.id, time: clamped },
        bubbles: true,
        composed: true,
        cancelable: true,
      },
    );
    this.dispatchEvent(seekRequest);
    if (seekRequest.defaultPrevented) {
      return;
    }

    controller.setActiveId(target.id);
    controller.seek(clamped);
    await controller.play();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'waveform-player': WaveformPlayer;
  }
}
