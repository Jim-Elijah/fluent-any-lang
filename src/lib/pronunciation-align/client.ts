import { msg, str } from '@lit/localize';
import type { PronunciationAlignResponse, ReferenceSegmentInput } from '../../types/models.js';
import { normalizeNewlines } from '../pronunciation-score/normalize.js';

export type AlignHttpErrorCode =
  | 'unauthorized'
  | 'too_large'
  | 'invalid'
  | 'quota'
  | 'unavailable'
  | 'network'
  | 'aborted'
  | 'unknown';

export class PronunciationAlignHttpError extends Error {
  readonly status: number;
  readonly code: AlignHttpErrorCode;

  constructor(status: number, code: AlignHttpErrorCode, message: string) {
    super(message);
    this.name = 'PronunciationAlignHttpError';
    this.code = code;
    this.status = status;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/** Maps fetch transport failures (no HTTP response) to a typed client error. */
export function mapAlignFetchFailure(error: unknown): PronunciationAlignHttpError {
  if (isAbortError(error)) {
    return new PronunciationAlignHttpError(0, 'aborted', msg('生成已取消'));
  }
  return new PronunciationAlignHttpError(
    0,
    'network',
    msg('网络不可用或原音词条服务未运行，请检查连接后重试'),
  );
}

const STATUS_CODE_MAP: Record<number, AlignHttpErrorCode> = {
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
      return msg('音频过大或过长，无法生成原音词条');
    case 422:
      return msg('无法生成原音词条，请检查原文、分段与语言设置后重试');
    case 429:
      return msg('生成次数已达上限，请稍后再试');
    case 503:
      return msg('原音词条服务未就绪，请稍后再试');
    default:
      return msg(str`无法生成原音词条（${status}）`);
  }
}

export function mapAlignHttpStatus(status: number): {
  code: AlignHttpErrorCode;
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

export type AlignPronunciationInput = {
  url: string;
  apiKey: string;
  audio: Blob;
  referenceText: string;
  referenceSegments?: ReferenceSegmentInput[];
  language: string;
  signal?: AbortSignal;
};

export async function alignPronunciation(
  input: AlignPronunciationInput,
): Promise<PronunciationAlignResponse> {
  const form = new FormData();
  form.append('audio', input.audio, audioFileName(input.audio));
  form.append('reference_text', normalizeNewlines(input.referenceText).trim());
  if (input.referenceSegments && input.referenceSegments.length > 0) {
    form.append('reference_segments', JSON.stringify(input.referenceSegments));
  }
  form.append('language', input.language);

  let response: Response;
  try {
    response = await fetch(input.url.trim(), {
      method: 'POST',
      headers: { 'X-API-Key': input.apiKey },
      body: form,
      signal: input.signal,
    });
  } catch (error) {
    throw mapAlignFetchFailure(error);
  }

  if (!response.ok) {
    const mapped = mapAlignHttpStatus(response.status);
    throw new PronunciationAlignHttpError(response.status, mapped.code, mapped.message);
  }

  return (await response.json()) as PronunciationAlignResponse;
}
