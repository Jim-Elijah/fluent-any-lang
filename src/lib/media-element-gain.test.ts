import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockGainNode {
  gain = { value: 1 };
  disconnect = vi.fn();
  connect = vi.fn();
}

class MockMediaElementSource {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);

  createGain(): MockGainNode {
    return new MockGainNode();
  }

  createMediaElementSource(): MockMediaElementSource {
    return new MockMediaElementSource();
  }
}

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('webkitAudioContext', MockAudioContext);

import {
  attachMediaElementGain,
  detachMediaElementGain,
  mapLogicalVolume,
  setLogicalVolume,
} from './media-element-gain.js';

describe('mapLogicalVolume', () => {
  it('maps 0–100% through element.volume only', () => {
    expect(mapLogicalVolume(0)).toEqual({ elementVolume: 0, gainValue: 1 });
    expect(mapLogicalVolume(0.5)).toEqual({ elementVolume: 0.5, gainValue: 1 });
    expect(mapLogicalVolume(1)).toEqual({ elementVolume: 1, gainValue: 1 });
  });

  it('maps >100% through gain only', () => {
    expect(mapLogicalVolume(1.5)).toEqual({ elementVolume: 1, gainValue: 1.5 });
    expect(mapLogicalVolume(3)).toEqual({ elementVolume: 1, gainValue: 3 });
  });

  it('clamps negative values to mute', () => {
    expect(mapLogicalVolume(-0.5)).toEqual({ elementVolume: 0, gainValue: 1 });
  });
});

describe('attachMediaElementGain', () => {
  let element: HTMLAudioElement;

  beforeEach(() => {
    element = document.createElement('audio');
  });

  afterEach(() => {
    detachMediaElementGain(element);
  });

  it('wires createMediaElementSource → gain → destination', () => {
    const handle = attachMediaElementGain(element);
    expect(handle.element).toBe(element);
    expect(handle.gainNode).toBeInstanceOf(MockGainNode);
    expect(handle.source.connect).toHaveBeenCalledWith(handle.gainNode);
    expect(handle.gainNode.connect).toHaveBeenCalled();
  });

  it('returns the same handle when attach is called twice', () => {
    const first = attachMediaElementGain(element);
    const second = attachMediaElementGain(element);
    expect(second).toBe(first);
    expect(second.source.connect).toHaveBeenCalledTimes(1);
  });

  it('applies logical volume through setLogicalVolume', () => {
    attachMediaElementGain(element);
    setLogicalVolume(element, 0.5);
    expect(element.volume).toBe(0.5);

    setLogicalVolume(element, 1.5);
    expect(element.volume).toBe(1);
    const handle = attachMediaElementGain(element);
    expect((handle.gainNode as MockGainNode).gain.value).toBe(1.5);
  });

  it('disconnects nodes on detach', () => {
    const handle = attachMediaElementGain(element);
    detachMediaElementGain(element);
    expect(handle.gainNode.disconnect).toHaveBeenCalled();
    expect(handle.source.disconnect).toHaveBeenCalled();
  });
});
