import { msg } from '@lit/localize';
import { getAppSettings } from '../app-settings.js';
import { clipAudioBlob } from '../audio-clip.js';
import { getMediaBlob } from '../../db/media.js';
import {
  deleteReferenceProsodyProfile,
  getReferenceProsodyProfile,
  putReferenceProsodyProfile,
} from '../../db/reference-prosody-profile.js';
import { getRecordingBlob } from '../../db/record.js';
import { getSubtitle } from '../../db/subtitle.js';
import { getScoreByRecordId, putPronunciationScore } from '../../db/pronunciation-score.js';
import type {
  PracticeRecord,
  PronunciationScore,
  ReferenceProsodyProfile,
  SpeechScoreProsodyBasis,
} from '../../types/models.js';
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

/** Max |profile.reference_duration_sec − referenceDuration| for cache reuse (seconds). */
export const PROFILE_DURATION_TOLERANCE_SEC = 0.05;

export type RequestScoreReason = 'not_configured' | 'validation' | 'api';

export type RequestScoreOutcome =
  | { ok: true; score: PronunciationScore }
  | { ok: false; reason: RequestScoreReason; message: string; score?: PronunciationScore };

export type RequestScoreOptions = {
  signal?: AbortSignal;
  onStatus?: (score: PronunciationScore) => void;
};

type EchoReferenceExtras = {
  referenceAudio?: Blob;
  referenceAudioRoles?: string;
  referenceProsodyProfile?: ReferenceProsodyProfile;
  /** When set, a 422 response should drop this cached profile. */
  cachedProfileSegmentId?: string;
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

export function isCachedProfileValid(
  profile: ReferenceProsodyProfile,
  referenceText: string,
  referenceDuration: number,
): boolean {
  if (profile.reference_text !== referenceText) {
    return false;
  }
  return Math.abs(profile.reference_duration_sec - referenceDuration) <= PROFILE_DURATION_TOLERANCE_SEC;
}

function echoSegmentId(record: PracticeRecord): string | undefined {
  return record.segmentId ?? record.segments[0]?.id;
}

/**
 * Echo-only when prosody basis is `match`: prefer a valid cached profile, else clip source Media,
 * else degrade to text-only. `naturalness` and Shadowing never attach audio/profile.
 */
export async function resolveEchoReferenceExtras(
  record: PracticeRecord,
  referenceText: string,
  referenceDuration: number,
  prosodyBasis: SpeechScoreProsodyBasis = 'naturalness',
): Promise<EchoReferenceExtras> {
  if (record.mode !== 'echo' || prosodyBasis !== 'match') {
    return {};
  }

  const segmentId = echoSegmentId(record);
  if (!segmentId) {
    return {};
  }

  const cached = await getReferenceProsodyProfile(record.mediaId, segmentId);
  if (cached && isCachedProfileValid(cached.profile, referenceText, referenceDuration)) {
    return {
      referenceProsodyProfile: cached.profile,
      cachedProfileSegmentId: segmentId,
    };
  }

  try {
    const mediaBlob = await getMediaBlob(record.mediaId);
    if (!mediaBlob) {
      return {};
    }
    const segment =
      record.segments.find((entry) => entry.id === segmentId) ?? record.segments[0];
    if (!segment) {
      return {};
    }
    const clipped = await clipAudioBlob(
      mediaBlob,
      segment.sourceStartTime,
      segment.sourceEndTime,
    );
    return {
      referenceAudio: clipped.blob,
      referenceAudioRoles: 'prosody',
    };
  } catch {
    // Silent degrade: score with text + duration only.
    return {};
  }
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

  const extras = await resolveEchoReferenceExtras(
    record,
    referenceText,
    referenceDuration,
    settings.speechScoreProsodyBasis,
  );

  try {
    const response = await scorePronunciation({
      url: settings.speechScoreApiUrl,
      apiKey: settings.speechScoreApiKey,
      audio: blob,
      referenceText,
      referenceDuration,
      language: settings.speechScoreLanguage || 'auto',
      referenceAudio: extras.referenceAudio,
      referenceAudioRoles: extras.referenceAudioRoles,
      referenceProsodyProfile: extras.referenceProsodyProfile,
      signal: options.signal,
    });

    const score = await upsertScore(record.id, {
      status: 'success',
      referenceText,
      accuracy: response.accuracy,
      fluency: response.fluency,
      completeness: response.completeness,
      prosody: response.prosody,
      prosody_naturalness:
        response.prosody_naturalness == null ? undefined : response.prosody_naturalness,
      prosody_match: response.prosody_match == null ? undefined : response.prosody_match,
      overall: response.overall,
      details: response.details,
      meta: response.meta,
      scoredAt: Date.now(),
    });

    const newProfile = response.details?.reference_prosody_profile;
    const segmentId = echoSegmentId(record);
    if (record.mode === 'echo' && segmentId && newProfile) {
      await putReferenceProsodyProfile(record.mediaId, segmentId, newProfile);
    }

    options.onStatus?.(score);
    return { ok: true, score };
  } catch (error) {
    if (
      error instanceof PronunciationScoreHttpError &&
      error.status === 422 &&
      extras.cachedProfileSegmentId
    ) {
      await deleteReferenceProsodyProfile(record.mediaId, extras.cachedProfileSegmentId);
    }

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
