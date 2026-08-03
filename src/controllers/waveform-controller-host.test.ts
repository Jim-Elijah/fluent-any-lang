import { describe, expect, it, vi } from 'vitest';

import { WaveformController } from './waveform-controller.js';
import { WaveformControllerHost } from './waveform-controller-host.js';

describe('WaveformControllerHost', () => {
  it('syncs snapshot from controller state-change events', () => {
    const controller = new WaveformController();
    const host = {
      addController: vi.fn(),
      removeController: vi.fn(),
      requestUpdate: vi.fn(),
    };

    const bridge = new WaveformControllerHost(host, controller);
    expect(host.addController).toHaveBeenCalledWith(bridge);
    expect(bridge.snapshot).toEqual(controller.getSnapshot());

    bridge.hostConnected();
    controller.setLayout('overlay');
    expect(bridge.snapshot.layout).toBe('overlay');
    expect(host.requestUpdate).toHaveBeenCalled();

    bridge.hostDisconnected();
    controller.setLayout('stack');
    expect(bridge.snapshot.layout).toBe('overlay');

    controller.destroy();
  });

  it('rebinds to a new controller and stops listening to the previous one', () => {
    const first = new WaveformController();
    const second = new WaveformController();
    const host = {
      addController: vi.fn(),
      removeController: vi.fn(),
      requestUpdate: vi.fn(),
    };

    const bridge = new WaveformControllerHost(host, first);
    bridge.hostConnected();

    bridge.setController(second);
    expect(bridge.snapshot).toEqual(second.getSnapshot());

    first.setLayout('overlay');
    expect(bridge.snapshot.layout).toBe('stack');

    second.setLayout('overlay');
    expect(bridge.snapshot.layout).toBe('overlay');

    first.destroy();
    second.destroy();
  });
});
