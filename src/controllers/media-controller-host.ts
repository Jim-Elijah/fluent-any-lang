import type { ReactiveController, ReactiveControllerHost } from 'lit';

import type { MediaController, MediaControllerSnapshot } from './media-controller.js';

export class MediaControllerHost implements ReactiveController {
  snapshot: MediaControllerSnapshot;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly controller: MediaController,
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
    const detail = (event as CustomEvent<MediaControllerSnapshot>).detail;
    this.snapshot = detail;
    this.host.requestUpdate();
  };
}
