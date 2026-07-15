/** Bubbled when a recording-preview modal opens (review context). */
export const RECORDING_PREVIEW_OPEN_EVENT = 'recording-preview-open';

/** Bubbled when a recording-preview modal closes. */
export const RECORDING_PREVIEW_CLOSE_EVENT = 'recording-preview-close';

/** Bubbled when preview audio starts or resumes — host should yield media focus. */
export const AUDIO_FOCUS_REQUEST_EVENT = 'audio-focus-request';

export function dispatchRecordingPreviewOpen(target: EventTarget): void {
  target.dispatchEvent(
    new CustomEvent(RECORDING_PREVIEW_OPEN_EVENT, { bubbles: true, composed: true }),
  );
}

export function dispatchRecordingPreviewClose(target: EventTarget): void {
  target.dispatchEvent(
    new CustomEvent(RECORDING_PREVIEW_CLOSE_EVENT, { bubbles: true, composed: true }),
  );
}

export function dispatchAudioFocusRequest(target: EventTarget): void {
  target.dispatchEvent(
    new CustomEvent(AUDIO_FOCUS_REQUEST_EVENT, { bubbles: true, composed: true }),
  );
}
