import type { ReactiveController, ReactiveControllerHost } from 'lit';

import type { WaveformController, WaveformControllerSnapshot } from './waveform-controller.js';

export class WaveformControllerHost implements ReactiveController {
  snapshot: WaveformControllerSnapshot;

  private controller: WaveformController;
  private connected = false;

  constructor(
    private readonly host: ReactiveControllerHost,
    controller: WaveformController,
  ) {
    this.controller = controller;
    this.host.addController(this);
    this.snapshot = controller.getSnapshot();
  }

  /** Switch the watched controller; no-ops when the instance is unchanged. */
  setController(controller: WaveformController): void {
    if (this.controller === controller) {
      return;
    }

    if (this.connected) {
      this.controller.removeEventListener('state-change', this._handleStateChange);
    }

    this.controller = controller;
    this.snapshot = controller.getSnapshot();

    if (this.connected) {
      this.controller.addEventListener('state-change', this._handleStateChange);
    }

    this.host.requestUpdate();
  }

  hostConnected(): void {
    this.connected = true;
    this.controller.addEventListener('state-change', this._handleStateChange);
  }

  hostDisconnected(): void {
    this.connected = false;
    this.controller.removeEventListener('state-change', this._handleStateChange);
  }

  private _handleStateChange = (event: Event): void => {
    const detail = (event as CustomEvent<WaveformControllerSnapshot>).detail;
    this.snapshot = detail;
    this.host.requestUpdate();
  };
}
