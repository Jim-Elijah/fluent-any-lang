import { getAppSettings } from '../app-settings.js';
import { getRecordingBlob } from '../../db/record.js';
import { getSubtitle } from '../../db/subtitle.js';
import { getScoreByRecordId, putPronunciationScore } from '../../db/pronunciation-score.js';
import type { PracticeRecord, PronunciationScore } from '../../types/models.js';
import { PronunciationScoreHttpError, scorePronunciation } from './client.js';
import {
  isSpeechScoreConfigured,
  SCORE_MAX_BYTES,
  SCORE_MAX_DURATION_SEC,
  SCORE_TOO_LARGE_MESSAGE,
  SCORE_TOO_LONG_MESSAGE,
} from './constants.js';

export {
  isSpeechScoreConfigured,
  SCORE_MAX_BYTES,
  SCORE_MAX_DURATION_SEC,
  SCORE_TOO_LARGE_MESSAGE,
  SCORE_TOO_LONG_MESSAGE,
} from './constants.js';

export type RequestScoreReason = 'not_configured' | 'validation' | 'api';

export type RequestScoreOutcome =
  | { ok: true; score: PronunciationScore }
  | { ok: false; reason: RequestScoreReason; message: string; score?: PronunciationScore };

export type RequestScoreOptions = {
  signal?: AbortSignal;
  onStatus?: (score: PronunciationScore) => void;
};

const NO_REFERENCE_TEXT = '需要对照原稿才能评分';
const MISSING_BLOB = '录音文件不存在';
const NOT_CONFIGURED = '请先在设置中填写评分服务地址和 API Key';

function joinReferenceTexts(texts: string[]): string {
  return texts
    .map((text) => text.trim())
    .filter(Boolean)
    .join('\n');
}

function liveTextById(
  subtitleTrack: { segments: ReadonlyArray<{ id: string; text: string }> } | undefined,
): Map<string, string> {
  if (!subtitleTrack) {
    return new Map();
  }
  return new Map(subtitleTrack.segments.map((segment) => [segment.id, segment.text]));
}

function segmentReferenceText(
  segment: { id: string; text?: string } | undefined,
  byId: Map<string, string>,
): string | null {
  const snapshot = segment?.text?.trim();
  if (snapshot) {
    return snapshot;
  }
  const live = segment ? byId.get(segment.id)?.trim() : undefined;
  return live ? live : null;
}

/** Resolve reference text from a Practice Record snapshot, falling back to the live Subtitle Track. */
export function resolveReferenceText(
  record: PracticeRecord,
  subtitleTrack: { segments: ReadonlyArray<{ id: string; text: string }> } | undefined,
): string | null {
  const byId = liveTextById(subtitleTrack);

  if (record.mode === 'echo') {
    const segmentId = record.segmentId ?? record.segments[0]?.id;
    const snap = record.segments.find((segment) => segment.id === segmentId) ?? record.segments[0];
    const fromSegment = segmentReferenceText(snap, byId);
    if (fromSegment) {
      return fromSegment;
    }
    if (!segmentId) {
      return null;
    }
    const live = byId.get(segmentId)?.trim();
    return live ? live : null;
  }

  const parts: string[] = [];
  for (const segment of record.segments) {
    const text = segmentReferenceText(segment, byId);
    if (text) {
      parts.push(text);
    }
  }
  const joined = joinReferenceTexts(parts);
  return joined.length > 0 ? joined : null;
}

async function upsertScore(
  recordId: string,
  patch: Omit<PronunciationScore, 'id' | 'recordId' | 'createdAt'> & {
    createdAt?: number;
  },
): Promise<PronunciationScore> {
  const existing = await getScoreByRecordId(recordId);
  const score: PronunciationScore = {
    id: existing?.id ?? crypto.randomUUID(),
    recordId,
    createdAt: existing?.createdAt ?? Date.now(),
    ...patch,
  };
  await putPronunciationScore(score);
  return score;
}

export async function requestScore(
  record: PracticeRecord,
  options: RequestScoreOptions = {},
): Promise<RequestScoreOutcome> {
  const settings = getAppSettings();
  if (!isSpeechScoreConfigured(settings)) {
    return { ok: false, reason: 'not_configured', message: NOT_CONFIGURED };
  }

  const fail = async (
    message: string,
    extra: Partial<PronunciationScore> = {},
  ): Promise<RequestScoreOutcome> => {
    const score = await upsertScore(record.id, {
      status: 'failed',
      referenceText: extra.referenceText ?? '',
      errorMessage: message,
      errorCode: extra.errorCode,
      scoredAt: Date.now(),
    });
    options.onStatus?.(score);
    return { ok: false, reason: extra.errorCode ? 'api' : 'validation', message, score };
  };

  if (record.recordingDuration > SCORE_MAX_DURATION_SEC) {
    return fail(SCORE_TOO_LONG_MESSAGE);
  }

  const blob = await getRecordingBlob(record.id);
  if (!blob) {
    return fail(MISSING_BLOB);
  }
  if (blob.size > SCORE_MAX_BYTES) {
    return fail(SCORE_TOO_LARGE_MESSAGE);
  }

  const subtitleTrack = await getSubtitle(record.mediaId);
  const referenceText = resolveReferenceText(record, subtitleTrack);
  if (!referenceText) {
    return fail(NO_REFERENCE_TEXT);
  }

  const pending = await upsertScore(record.id, {
    status: 'pending',
    referenceText,
  });
  options.onStatus?.(pending);

  try {
    const response = await scorePronunciation({
      baseUrl: settings.speechScoreApiBaseUrl,
      apiKey: settings.speechScoreApiKey,
      audio: blob,
      referenceText,
      language: settings.speechScoreLanguage || 'auto',
      signal: options.signal,
    });

    const score = await upsertScore(record.id, {
      status: 'success',
      referenceText,
      accuracy: response.accuracy,
      fluency: response.fluency,
      completeness: response.completeness,
      prosody: response.prosody,
      overall: response.overall,
      details: response.details,
      meta: response.meta,
      scoredAt: Date.now(),
    });
    options.onStatus?.(score);
    return { ok: true, score };
  } catch (error) {
    if (error instanceof PronunciationScoreHttpError) {
      const score = await upsertScore(record.id, {
        status: 'failed',
        referenceText,
        errorCode: error.status,
        errorMessage: error.message,
        scoredAt: Date.now(),
      });
      options.onStatus?.(score);
      return { ok: false, reason: 'api', message: error.message, score };
    }
    const message = error instanceof Error ? error.message : '评分失败，请重试';
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    const score = await upsertScore(record.id, {
      status: 'failed',
      referenceText,
      errorMessage: aborted ? '评分已取消' : message,
      scoredAt: Date.now(),
    });
    options.onStatus?.(score);
    return { ok: false, reason: 'api', message: score.errorMessage ?? message, score };
  }
}
