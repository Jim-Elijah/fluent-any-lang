import type { ReactiveController, ReactiveControllerHost } from 'lit';

import type { WaveformController, WaveformControllerSnapshot } from './waveform-controller.js';

export class WaveformControllerHost implements ReactiveController {
  snapshot: WaveformControllerSnapshot;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly controller: WaveformController,
  ) {
    this.host.addController(this);
    this.snapshot = controller.getSnapshot();
  }

  hostConnected(): void {
    this.controller.addEventListener('state-change', this._handleStateChange);
  }

  hostDisconnected(): void {
    this.controller.removeEventListener('state-change', this._handleStateChange);
  }

  private _handleStateChange = (event: Event): void => {
    const detail = (event as CustomEvent<WaveformControllerSnapshot>).detail;
    this.snapshot = detail;
    this.host.requestUpdate();
  };
}
