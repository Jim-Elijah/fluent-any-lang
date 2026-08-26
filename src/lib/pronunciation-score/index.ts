export {
  SCORE_MAX_BYTES,
  SCORE_MAX_DURATION_SEC,
  scoreTooLongMessage,
  scoreTooLargeMessage,
  SCORE_API_PATH,
  joinApiUrl,
  toScoreApiUrl,
  isSpeechScoreConfigured,
} from './constants.js';
export { PronunciationScoreHttpError, mapScoreHttpStatus, scorePronunciation } from './client.js';
export {
  resolveReferenceText,
  resolveReferenceDuration,
  requestScore,
  type RequestScoreOutcome,
  type RequestScoreOptions,
} from './service.js';
export { aggregateEchoLatestOverall, formatOverallBadge } from './aggregate.js';
export {
  scoreBand,
  SCORE_BAND_HIGH_MIN,
  SCORE_BAND_GOOD_MIN,
  SCORE_BAND_MID_MIN,
  type ScoreBand,
} from './score-band.js';
export {
  SPEECH_SCORE_PRIVACY_ACK_KEY,
  hasSpeechScorePrivacyAck,
  ackSpeechScorePrivacy,
} from './privacy.js';
export { normalizeNewlines } from './normalize.js';
export {
  buildReferenceHighlightSpans,
  buildTranscriptHighlightSpans,
  misreadHasPlayableStart,
  type ScoreTextHighlightKind,
  type ScoreTextHighlightSpan,
} from './text-highlight.js';
