/** Max audio duration accepted by the pronunciation scoring API (seconds). */
export const SCORE_MAX_DURATION_SEC = 60;

/** Max audio payload accepted by the pronunciation scoring API (bytes). */
export const SCORE_MAX_BYTES = 10 * 1024 * 1024;

function formatScoreMaxMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
}

export const SCORE_TOO_LONG_MESSAGE = `录音超过 ${SCORE_MAX_DURATION_SEC} 秒，无法评分`;
export const SCORE_TOO_LARGE_MESSAGE = `录音文件超过 ${formatScoreMaxMb(SCORE_MAX_BYTES)} MB，无法评分`;

export const SCORE_API_PATH = '/api/v1/pronunciation/score';
export const SCORE_HEALTH_PATH = '/health';

export function joinApiUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${trimmed}${suffix}`;
}

export function isSpeechScoreConfigured(settings: {
  speechScoreApiBaseUrl: string;
  speechScoreApiKey: string;
}): boolean {
  return (
    settings.speechScoreApiBaseUrl.trim().length > 0 && settings.speechScoreApiKey.trim().length > 0
  );
}
