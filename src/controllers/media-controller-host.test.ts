import { describe, expect, it, vi } from 'vitest';

import { MediaController } from './media-controller.js';
import { MediaControllerHost } from './media-controller-host.js';

describe('MediaControllerHost', () => {
  it('syncs snapshot from controller state-change events', () => {
    const controller = new MediaController();
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    };

    const bridge = new MediaControllerHost(host, controller);
    expect(host.addController).toHaveBeenCalledWith(bridge);
    expect(bridge.snapshot).toEqual(controller.getSnapshot());

    bridge.hostConnected();
    controller.setVolume(0.25);
    expect(bridge.snapshot.volume).toBe(0.25);
    expect(host.requestUpdate).toHaveBeenCalled();

    bridge.hostDisconnected();
    controller.setVolume(0.5);
    expect(bridge.snapshot.volume).toBe(0.25);

    controller.destroy();
  });
});
