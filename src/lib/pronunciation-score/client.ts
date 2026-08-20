import { msg, str } from '@lit/localize';
import type {
  PronunciationScoreApiResponse,
  ReferenceProsodyProfile,
} from '../../types/models.js';

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

const STATUS_CODE_MAP: Record<number, ScoreHttpErrorCode> = {
  401: 'unauthorized',
  413: 'too_large',
  422: 'invalid',
  429: 'quota',
  503: 'unavailable',
};

function statusMessage(status: number): string {
  switch (status) {
    case 401:
      return msg('API Key 无效或已过期，请检查设置');
    case 413:
      return msg('音频过大或过长，无法评分');
    case 422:
      return msg('评分参数无效，请确认参考文本后重试');
    case 429:
      return msg('评分次数已达上限，请稍后再试');
    case 503:
      return msg('评分服务未就绪，请稍后再试');
    default:
      return msg(str`评分失败（${status}）`);
  }
}

export function mapScoreHttpStatus(status: number): {
  code: ScoreHttpErrorCode;
  message: string;
} {
  return {
    code: STATUS_CODE_MAP[status] ?? 'unknown',
    message: statusMessage(status),
  };
}

function audioFileName(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes('wav')) return 'audio.wav';
  if (type.includes('mp4') || type.includes('m4a')) return 'audio.m4a';
  if (type.includes('mpeg') || type.includes('mp3')) return 'audio.mp3';
  return 'audio.webm';
}

export type ScorePronunciationInput = {
  url: string;
  apiKey: string;
  audio: Blob;
  referenceText: string;
  referenceDuration: number;
  language: string;
  /** Echo match: clipped source segment (mutually exclusive with profile). */
  referenceAudio?: Blob;
  /** Echo match roles, typically `prosody`. */
  referenceAudioRoles?: string;
  /** Echo match: cached profile JSON (mutually exclusive with reference audio + prosody). */
  referenceProsodyProfile?: ReferenceProsodyProfile;
  signal?: AbortSignal;
};

export async function scorePronunciation(
  input: ScorePronunciationInput,
): Promise<PronunciationScoreApiResponse> {
  const form = new FormData();
  form.append('audio', input.audio, audioFileName(input.audio));
  form.append('reference_text', input.referenceText);
  form.append('reference_duration', String(input.referenceDuration));
  form.append('language', input.language);

  // Never send both a profile and reference audio with a prosody role.
  if (input.referenceProsodyProfile) {
    form.append('reference_prosody_profile', JSON.stringify(input.referenceProsodyProfile));
  } else if (input.referenceAudio) {
    form.append('reference_audio', input.referenceAudio, audioFileName(input.referenceAudio));
    if (input.referenceAudioRoles) {
      form.append('reference_audio_roles', input.referenceAudioRoles);
    }
  }

  const response = await fetch(input.url.trim(), {
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
