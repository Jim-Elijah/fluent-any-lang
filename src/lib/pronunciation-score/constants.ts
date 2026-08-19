import { msg, str } from '@lit/localize';

/** Max audio duration accepted by the pronunciation scoring API (seconds). */
export const SCORE_MAX_DURATION_SEC = 60;

/** Max audio payload accepted by the pronunciation scoring API (bytes). */
export const SCORE_MAX_BYTES = 10 * 1024 * 1024;

function formatScoreMaxMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
}

export function scoreTooLongMessage(): string {
  return msg(str`录音超过 ${SCORE_MAX_DURATION_SEC} 秒，无法评分`);
}

export function scoreTooLargeMessage(): string {
  return msg(str`录音文件超过 ${formatScoreMaxMb(SCORE_MAX_BYTES)} MB，无法评分`);
}

export const SCORE_API_PATH = '/api/v1/pronunciation/score';

export function joinApiUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${trimmed}${suffix}`;
}

/**
 * Settings store the full POST URL. Legacy values were a host/base URL and
 * must still resolve to `SCORE_API_PATH`.
 */
export function toScoreApiUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith(SCORE_API_PATH)) return trimmed;
  return joinApiUrl(trimmed, SCORE_API_PATH);
}

export function isSpeechScoreConfigured(settings: {
  speechScoreApiUrl: string;
  speechScoreApiKey: string;
}): boolean {
  return (
    settings.speechScoreApiUrl.trim().length > 0 && settings.speechScoreApiKey.trim().length > 0
  );
}
