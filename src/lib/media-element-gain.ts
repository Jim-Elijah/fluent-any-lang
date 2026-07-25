import { getAudioContext } from './audio-context.js';

export type MediaElementGainHandle = {
  element: HTMLMediaElement;
  source: MediaElementAudioSourceNode;
  gainNode: GainNode;
};

const handles = new WeakMap<HTMLMediaElement, MediaElementGainHandle>();

/** Map logical volume (0 = mute, 1 = 100%, >1 = boosted) to element + gain. */
export function mapLogicalVolume(volume: number): { elementVolume: number; gainValue: number } {
  const v = Math.max(0, volume);
  if (v <= 1) {
    return { elementVolume: v, gainValue: 1 };
  }
  return { elementVolume: 1, gainValue: v };
}

export function applyLogicalVolume(
  element: HTMLMediaElement,
  volume: number,
  gainNode?: GainNode | null,
): void {
  const { elementVolume, gainValue } = mapLogicalVolume(volume);
  element.volume = elementVolume;
  if (gainNode) {
    gainNode.gain.value = gainValue;
  }
}

export function attachMediaElementGain(element: HTMLMediaElement): MediaElementGainHandle | null {
  const existing = handles.get(element);
  if (existing) {
    return existing;
  }

  try {
    const audioContext = getAudioContext();
    void audioContext.resume();

    const source = audioContext.createMediaElementSource(element);
    const gainNode = audioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const handle: MediaElementGainHandle = { element, source, gainNode };
    handles.set(element, handle);
    return handle;
  } catch {
    return null;
  }
}

export function getMediaElementGain(element: HTMLMediaElement): MediaElementGainHandle | undefined {
  return handles.get(element);
}

export function setLogicalVolume(element: HTMLMediaElement, volume: number): void {
  const handle = handles.get(element);
  applyLogicalVolume(element, volume, handle?.gainNode);
}

export function detachMediaElementGain(element: HTMLMediaElement): void {
  const handle = handles.get(element);
  if (!handle) {
    return;
  }
  try {
    handle.gainNode.disconnect();
    handle.source.disconnect();
  } catch {
    // ignore disconnect errors during teardown
  }
  handles.delete(element);
}
