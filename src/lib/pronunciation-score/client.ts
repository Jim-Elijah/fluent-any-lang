import type {
  PronunciationScoreApiResponse,
  SpeechScoreHealthResponse,
} from '../../types/models.js';
import { joinApiUrl, SCORE_API_PATH, SCORE_HEALTH_PATH } from './constants.js';

export type ScoreHttpErrorCode =
  | 'unauthorized'
  | 'too_large'
  | 'invalid'
  | 'quota'
  | 'unavailable'
  | 'unknown';

export class PronunciationScoreHttpError extends Error {
  readonly status: number;
  readonly code: ScoreHttpErrorCode;

  constructor(status: number, code: ScoreHttpErrorCode, message: string) {
    super(message);
    this.name = 'PronunciationScoreHttpError';
    this.status = status;
    this.code = code;
  }
}

const STATUS_MAP: Record<number, { code: ScoreHttpErrorCode; message: string }> = {
  401: { code: 'unauthorized', message: 'API Key 无效或已过期，请检查设置' },
  413: { code: 'too_large', message: '音频过大或过长，无法评分' },
  422: { code: 'invalid', message: '评分参数无效，请确认参考文本后重试' },
  429: { code: 'quota', message: '评分次数已达上限，请稍后再试' },
  503: { code: 'unavailable', message: '评分服务未就绪，请稍后再试' },
};

export function mapScoreHttpStatus(status: number): {
  code: ScoreHttpErrorCode;
  message: string;
} {
  return (
    STATUS_MAP[status] ?? {
      code: 'unknown',
      message: `评分失败（${status}）`,
    }
  );
}

function audioFileName(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes('wav')) return 'audio.wav';
  if (type.includes('mp4') || type.includes('m4a')) return 'audio.m4a';
  if (type.includes('mpeg') || type.includes('mp3')) return 'audio.mp3';
  return 'audio.webm';
}

export type ScorePronunciationInput = {
  baseUrl: string;
  apiKey: string;
  audio: Blob;
  referenceText: string;
  language: string;
  signal?: AbortSignal;
};

export async function scorePronunciation(
  input: ScorePronunciationInput,
): Promise<PronunciationScoreApiResponse> {
  const form = new FormData();
  form.append('audio', input.audio, audioFileName(input.audio));
  form.append('reference_text', input.referenceText);
  form.append('language', input.language);

  const response = await fetch(joinApiUrl(input.baseUrl, SCORE_API_PATH), {
    method: 'POST',
    headers: { 'X-API-Key': input.apiKey },
    body: form,
    signal: input.signal,
  });

  if (!response.ok) {
    const mapped = mapScoreHttpStatus(response.status);
    throw new PronunciationScoreHttpError(response.status, mapped.code, mapped.message);
  }

  return (await response.json()) as PronunciationScoreApiResponse;
}

export async function checkSpeechScoreHealth(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<SpeechScoreHealthResponse> {
  const response = await fetch(joinApiUrl(baseUrl, SCORE_HEALTH_PATH), { signal });
  if (!response.ok) {
    throw new PronunciationScoreHttpError(
      response.status,
      'unavailable',
      `无法连接评分服务（${response.status}）`,
    );
  }
  return (await response.json()) as SpeechScoreHealthResponse;
}
