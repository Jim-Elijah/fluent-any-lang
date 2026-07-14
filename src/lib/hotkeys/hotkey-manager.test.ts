import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { shouldIgnoreHotkey } from './guards.js';
import { HotkeyManager, getHotkeyManager, setHotkeyManagerForTests } from './hotkey-manager.js';

function dispatchKey(code: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    code,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.dispatchEvent(event);
  return event;
}

describe('shouldIgnoreHotkey', () => {
  it('ignores composing and modifier keys', () => {
    expect(
      shouldIgnoreHotkey(new KeyboardEvent('keydown', { code: 'Space', isComposing: true })),
    ).toBe(true);
    expect(shouldIgnoreHotkey(new KeyboardEvent('keydown', { code: 'Space', ctrlKey: true }))).toBe(
      true,
    );
    expect(
      shouldIgnoreHotkey(new KeyboardEvent('keydown', { code: 'Space', shiftKey: true })),
    ).toBe(true);
  });

  it('ignores events targeted at form fields', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
    Object.defineProperty(event, 'target', { value: input });
    expect(shouldIgnoreHotkey(event)).toBe(true);
    input.remove();
  });

  it('allows plain Space on document body', () => {
    const event = new KeyboardEvent('keydown', { code: 'Space' });
    Object.defineProperty(event, 'target', { value: document.body });
    expect(shouldIgnoreHotkey(event)).toBe(false);
  });

  it('ignores events targeted at ui-slider', () => {
    const slider = document.createElement('ui-slider');
    document.body.appendChild(slider);
    const event = new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true });
    Object.defineProperty(event, 'target', { value: slider });
    expect(shouldIgnoreHotkey(event)).toBe(true);
    slider.remove();
  });
});

describe('HotkeyManager', () => {
  let manager: HotkeyManager;

  beforeEach(() => {
    manager = new HotkeyManager();
    setHotkeyManagerForTests(manager);
  });

  afterEach(() => {
    manager.reset();
    setHotkeyManagerForTests(null);
  });

  it('invokes practice togglePlay on Space', () => {
    const togglePlay = vi.fn();
    manager.registerScope({
      id: 'practice',
      handlers: { togglePlay },
    });

    const event = dispatchKey('Space');
    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('maps ArrowLeft / ArrowRight to segment navigation', () => {
    const previousSegment = vi.fn();
    const nextSegment = vi.fn();
    manager.registerScope({
      id: 'practice',
      handlers: { previousSegment, nextSegment },
    });

    dispatchKey('ArrowLeft');
    dispatchKey('ArrowRight');
    expect(previousSegment).toHaveBeenCalledTimes(1);
    expect(nextSegment).toHaveBeenCalledTimes(1);
  });

  it('skips handlers when enabled returns false', () => {
    const togglePlay = vi.fn();
    manager.registerScope({
      id: 'practice',
      enabled: () => false,
      handlers: { togglePlay },
    });

    const event = dispatchKey('Space');
    expect(togglePlay).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not fire after unregisterScope', () => {
    const togglePlay = vi.fn();
    manager.registerScope({
      id: 'practice',
      handlers: { togglePlay },
    });
    manager.unregisterScope('practice');

    dispatchKey('Space');
    expect(togglePlay).not.toHaveBeenCalled();
  });

  it('ignores Space while an input is focused', () => {
    const togglePlay = vi.fn();
    manager.registerScope({
      id: 'practice',
      handlers: { togglePlay },
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', {
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(togglePlay).not.toHaveBeenCalled();
    input.remove();
  });

  it('getHotkeyManager returns the test singleton', () => {
    expect(getHotkeyManager()).toBe(manager);
  });

  it('later recording-preview scope wins Space over practice', () => {
    const practiceToggle = vi.fn();
    const previewToggle = vi.fn();
    manager.registerScope({
      id: 'practice',
      handlers: { togglePlay: practiceToggle },
    });
    manager.registerScope({
      id: 'recording-preview',
      handlers: { togglePlay: previewToggle },
    });

    dispatchKey('Space');
    expect(previewToggle).toHaveBeenCalledTimes(1);
    expect(practiceToggle).not.toHaveBeenCalled();

    manager.unregisterScope('recording-preview');
    dispatchKey('Space');
    expect(practiceToggle).toHaveBeenCalledTimes(1);
    expect(previewToggle).toHaveBeenCalledTimes(1);
  });

  it('maps recording-preview KeyQ / KeyW / KeyE to play actions', () => {
    const playSource = vi.fn();
    const playRecording = vi.fn();
    const playSync = vi.fn();
    manager.registerScope({
      id: 'recording-preview',
      handlers: { playSource, playRecording, playSync },
    });

    dispatchKey('KeyQ');
    dispatchKey('KeyW');
    dispatchKey('KeyE');
    expect(playSource).toHaveBeenCalledTimes(1);
    expect(playRecording).toHaveBeenCalledTimes(1);
    expect(playSync).toHaveBeenCalledTimes(1);
  });

  it('maps ArrowUp / BracketRight to volume and rate actions', () => {
    const volumeUp = vi.fn();
    const rateUp = vi.fn();
    manager.registerScope({
      id: 'practice',
      handlers: { volumeUp, rateUp },
    });

    dispatchKey('ArrowUp');
    dispatchKey('BracketRight');
    expect(volumeUp).toHaveBeenCalledTimes(1);
    expect(rateUp).toHaveBeenCalledTimes(1);
  });
});
