import { describe, expect, it, vi } from 'vitest';

import {
  AUDIO_FOCUS_REQUEST_EVENT,
  dispatchAudioFocusRequest,
  dispatchRecordingPreviewClose,
  dispatchRecordingPreviewOpen,
  RECORDING_PREVIEW_CLOSE_EVENT,
  RECORDING_PREVIEW_OPEN_EVENT,
} from './audio-focus.js';

describe('audio-focus', () => {
  it('dispatches preview open/close and focus request events', () => {
    const target = new EventTarget();
    const open = vi.fn();
    const close = vi.fn();
    const focus = vi.fn();

    target.addEventListener(RECORDING_PREVIEW_OPEN_EVENT, open);
    target.addEventListener(RECORDING_PREVIEW_CLOSE_EVENT, close);
    target.addEventListener(AUDIO_FOCUS_REQUEST_EVENT, focus);

    dispatchRecordingPreviewOpen(target);
    dispatchRecordingPreviewClose(target);
    dispatchAudioFocusRequest(target);

    expect(open).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);

    const openEvent = open.mock.calls[0]![0] as CustomEvent;
    expect(openEvent.bubbles).toBe(true);
    expect(openEvent.composed).toBe(true);
  });
});
