import { msg } from '@lit/localize';
import { getAppSettings } from '../app-settings.js';
import { getRecordingBlob } from '../../db/record.js';
import { getSubtitle } from '../../db/subtitle.js';
import { getScoreByRecordId, putPronunciationScore } from '../../db/pronunciation-score.js';
import type { PracticeRecord, PronunciationScore } from '../../types/models.js';
import { getPracticeSegmentDuration } from '../playback-utils.js';
import { PronunciationScoreHttpError, scorePronunciation } from './client.js';
import {
  isSpeechScoreConfigured,
  SCORE_MAX_BYTES,
  SCORE_MAX_DURATION_SEC,
  scoreTooLargeMessage,
  scoreTooLongMessage,
} from './constants.js';

export {
  isSpeechScoreConfigured,
  SCORE_MAX_BYTES,
  SCORE_MAX_DURATION_SEC,
  scoreTooLargeMessage,
  scoreTooLongMessage,
} from './constants.js';

export type RequestScoreReason = 'not_configured' | 'validation' | 'api';

export type RequestScoreOutcome =
  | { ok: true; score: PronunciationScore }
  | { ok: false; reason: RequestScoreReason; message: string; score?: PronunciationScore };

export type RequestScoreOptions = {
  signal?: AbortSignal;
  onStatus?: (score: PronunciationScore) => void;
};

function noReferenceText() {
  return msg('需要对照原稿才能评分');
}
function noReferenceDuration() {
  return msg('无法确定参考原声时长，请确认录音片段信息后重试');
}
function missingBlob() {
  return msg('录音文件不存在');
}
function notConfigured() {
  return msg('请先在设置中填写评分服务地址和 API Key');
}

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

/** Sum of source-axis Practice Segment durations (excludes inter-segment gaps in shadowing). */
export function resolveReferenceDuration(record: PracticeRecord): number | null {
  if (record.segments.length === 0) {
    return null;
  }
  let total = 0;
  for (const segment of record.segments) {
    total += getPracticeSegmentDuration(segment, 'source');
  }
  return total > 0 ? total : null;
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
    return { ok: false, reason: 'not_configured', message: notConfigured() };
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
    return fail(scoreTooLongMessage());
  }

  const blob = await getRecordingBlob(record.id);
  if (!blob) {
    return fail(missingBlob());
  }
  if (blob.size > SCORE_MAX_BYTES) {
    return fail(scoreTooLargeMessage());
  }

  const subtitleTrack = await getSubtitle(record.mediaId);
  const referenceText = resolveReferenceText(record, subtitleTrack);
  if (!referenceText) {
    return fail(noReferenceText());
  }

  const referenceDuration = resolveReferenceDuration(record);
  if (referenceDuration === null) {
    return fail(noReferenceDuration(), { referenceText });
  }

  const pending = await upsertScore(record.id, {
    status: 'pending',
    referenceText,
  });
  options.onStatus?.(pending);

  try {
    const response = await scorePronunciation({
      url: settings.speechScoreApiUrl,
      apiKey: settings.speechScoreApiKey,
      audio: blob,
      referenceText,
      referenceDuration,
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
    const message = error instanceof Error ? error.message : msg('评分失败，请重试');
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    const score = await upsertScore(record.id, {
      status: 'failed',
      referenceText,
      errorMessage: aborted ? msg('评分已取消') : message,
      scoredAt: Date.now(),
    });
    options.onStatus?.(score);
    return { ok: false, reason: 'api', message: score.errorMessage ?? message, score };
  }
}
