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
  SPEECH_SCORE_PRIVACY_ACK_KEY,
  hasSpeechScorePrivacyAck,
  ackSpeechScorePrivacy,
} from './privacy.js';
