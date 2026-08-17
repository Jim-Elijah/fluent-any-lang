export {
  SCORE_MAX_BYTES,
  SCORE_MAX_DURATION_SEC,
  SCORE_TOO_LONG_MESSAGE,
  SCORE_TOO_LARGE_MESSAGE,
  SCORE_API_PATH,
  SCORE_HEALTH_PATH,
  joinApiUrl,
  isSpeechScoreConfigured,
} from './constants.js';
export {
  PronunciationScoreHttpError,
  mapScoreHttpStatus,
  scorePronunciation,
  checkSpeechScoreHealth,
} from './client.js';
export {
  resolveReferenceText,
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
