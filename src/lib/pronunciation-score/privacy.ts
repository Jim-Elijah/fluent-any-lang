export const SPEECH_SCORE_PRIVACY_ACK_KEY = 'fluent-any-lang:speech-score-privacy-ack';

export function hasSpeechScorePrivacyAck(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }
  try {
    return localStorage.getItem(SPEECH_SCORE_PRIVACY_ACK_KEY) === '1';
  } catch {
    return false;
  }
}

export function ackSpeechScorePrivacy(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(SPEECH_SCORE_PRIVACY_ACK_KEY, '1');
  } catch {
    // Quota / private mode — treat as unacked next time.
  }
}
