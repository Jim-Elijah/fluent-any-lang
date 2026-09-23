export {
  ALIGN_API_PATH,
  ALIGN_MAX_BYTES,
  ALIGN_MAX_DURATION_SEC,
  alignTooLargeMessage,
  alignTooLongMessage,
  isSpeechAlignConfigured,
  suggestAlignApiUrlFromScoreUrl,
  toAlignApiUrl,
} from './constants.js';
export {
  PronunciationAlignHttpError,
  alignPronunciation,
  mapAlignFetchFailure,
  mapAlignHttpStatus,
} from './client.js';
export { canAlignWholeMedia } from './can-align-whole-media.js';
export { resolveWholeMediaAlignBlockedTip } from './whole-media-align-gate.js';
export {
  resolveSubtitleAlignWindow,
  subtitleAlignWindowDurationSec,
  type SubtitleAlignWindow,
} from './subtitle-align-window.js';
export { buildSubtitleTrackReferenceText, buildSubtitleSegmentsReferenceText } from './reference-text.js';
export { projectWordsToSourceRange } from './project-words.js';
export { resolveSegmentSourceWords } from './resolve-segment-words.js';
export {
  hasCurrentMediaSourceWordAlignment,
  isMediaSourceWordAlignmentCurrent,
} from './media-alignment-current.js';
export {
  alignAllPracticeSegments,
  alignMediaSource,
  alignPracticeSegment,
  type AlignAllOptions,
  type AlignMediaOutcome,
  type AlignSegmentOptions,
  type AlignSegmentOutcome,
} from './service.js';
