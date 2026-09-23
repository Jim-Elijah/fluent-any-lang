import { msg, str } from '@lit/localize';
import { getAppSettings } from '../app-settings.js';
import { clipAudioBlob } from '../audio-clip.js';
import { getMedia, getMediaBlob } from '../../db/media.js';
import {
  getMediaSourceWordAlignment,
  putMediaSourceWordAlignment,
} from '../../db/media-source-word-alignment.js';
import { getSubtitle } from '../../db/subtitle.js';
import {
  getSourceWordAlignment,
  putSourceWordAlignment,
  sourceWordAlignmentId,
} from '../../db/source-word-alignment.js';
import type {
  PracticeSegment,
  SourceWordAlignmentSource,
  StoredMediaSourceWordAlignment,
  StoredSourceWordAlignment,
  SubtitleSegment,
  SubtitleTrack,
  WordTiming,
} from '../../types/models.js';
import { normalizeNewlines } from '../pronunciation-score/normalize.js';
import { canAlignWholeMedia } from './can-align-whole-media.js';
import { PronunciationAlignHttpError, alignPronunciation } from './client.js';
import {
  ALIGN_MAX_BYTES,
  ALIGN_MAX_DURATION_SEC,
  alignTooLargeMessage,
  alignTooLongMessage,
  isSpeechAlignConfigured,
} from './constants.js';
import { buildSubtitleTrackReferenceText } from './reference-text.js';
import { projectWordsToSourceRange } from './project-words.js';
import { isMediaSourceWordAlignmentCurrent } from './media-alignment-current.js';
import { resolveSegmentSourceWords } from './resolve-segment-words.js';
import {
  resolveSubtitleAlignWindow,
  subtitleAlignWindowDurationSec,
  type SubtitleAlignWindow,
} from './subtitle-align-window.js';

export {
  ALIGN_MAX_BYTES,
  ALIGN_MAX_DURATION_SEC,
  alignTooLargeMessage,
  alignTooLongMessage,
  isSpeechAlignConfigured,
} from './constants.js';

export type AlignSegmentReason = 'not_configured' | 'validation' | 'api' | 'skipped';

export type AlignSegmentOutcome =
  | { ok: true; alignment: StoredSourceWordAlignment }
  | { ok: false; reason: AlignSegmentReason; message: string };

export type AlignMediaOutcome =
  | { ok: true; alignment: StoredMediaSourceWordAlignment }
  | { ok: false; reason: AlignSegmentReason; message: string };

export type AlignSegmentOptions = {
  signal?: AbortSignal;
  /** `segment` always overwrites; `batch` skips rows already written by `segment`. */
  source?: SourceWordAlignmentSource;
  /**
   * When true, skip the HTTP call if any cache row already exists.
   * Batch always uses true; single-segment uses true on first align and false on
   * confirmed re-align.
   */
  skipIfCached?: boolean;
};

export type AlignAllOptions = {
  signal?: AbortSignal;
  /** Re-run whole-Media `/align` and overwrite batch segment rows. */
  force?: boolean;
};

function notConfigured() {
  return msg('请先在设置中填写对齐接口地址和 API Key');
}

function noReferenceText() {
  return msg('需要对照原稿才能对齐');
}

function missingMedia() {
  return msg('原声文件不存在');
}

function resolveSegmentReferenceText(
  segment: PracticeSegment,
  subtitleById: Map<string, string>,
): string | null {
  const snapshot = segment.text ? normalizeNewlines(segment.text).trim() : '';
  if (snapshot) {
    return snapshot;
  }
  const liveRaw = subtitleById.get(segment.id);
  const live = liveRaw ? normalizeNewlines(liveRaw).trim() : '';
  return live || null;
}

function toAbsoluteWords(words: WordTiming[], sourceStartTime: number): WordTiming[] {
  return words.map((word) => ({
    word: word.word,
    start: word.start + sourceStartTime,
    end: word.end + sourceStartTime,
  }));
}

function subtitleTextById(
  subtitleSegments: ReadonlyArray<Pick<SubtitleSegment, 'id' | 'text'>>,
): Map<string, string> {
  return new Map(subtitleSegments.map((segment) => [segment.id, segment.text]));
}

async function prepareSubtitleWindowAlignAudio(input: {
  mediaBlob: Blob;
  window: SubtitleAlignWindow;
}): Promise<{ ok: true; blob: Blob } | { ok: false; message: string }> {
  const durationSec = subtitleAlignWindowDurationSec(input.window);
  if (durationSec > ALIGN_MAX_DURATION_SEC) {
    return { ok: false, message: alignTooLongMessage() };
  }
  let clipped: { blob: Blob };
  try {
    clipped = await clipAudioBlob(
      input.mediaBlob,
      input.window.startTime,
      input.window.endTime,
    );
  } catch {
    return { ok: false, message: msg('无法裁剪原声片段') };
  }
  if (clipped.blob.size > ALIGN_MAX_BYTES) {
    return { ok: false, message: alignTooLargeMessage() };
  }
  return { ok: true, blob: clipped.blob };
}

function wholeMediaAlignFailureMessage(input: {
  referenceText: string;
  window: SubtitleAlignWindow | null;
}): string {
  if (!input.referenceText) {
    return noReferenceText();
  }
  if (!input.window) {
    return noReferenceText();
  }
  if (subtitleAlignWindowDurationSec(input.window) > ALIGN_MAX_DURATION_SEC) {
    return alignTooLongMessage();
  }
  return noReferenceText();
}

async function cachedSegmentAlignment(input: {
  mediaId: string;
  segment: PracticeSegment;
  subtitleTrack?: SubtitleTrack;
  subtitleById: Map<string, string>;
}): Promise<StoredSourceWordAlignment | null> {
  const existing = await getSourceWordAlignment(input.mediaId, input.segment.id);
  if (existing) {
    return existing;
  }

  const words = await resolveSegmentSourceWords({
    mediaId: input.mediaId,
    segment: input.segment,
    subtitleTrack: input.subtitleTrack,
  });
  if (words.length === 0) {
    return null;
  }

  const referenceText = resolveSegmentReferenceText(input.segment, input.subtitleById);
  if (!referenceText) {
    return null;
  }

  const mediaRow = await getMediaSourceWordAlignment(input.mediaId);
  const now = Date.now();
  return {
    id: sourceWordAlignmentId(input.mediaId, input.segment.id),
    mediaId: input.mediaId,
    segmentId: input.segment.id,
    words,
    referenceText,
    language: mediaRow?.language ?? (getAppSettings().speechScoreLanguage || 'auto'),
    source: 'batch',
    createdAt: now,
    updatedAt: now,
  };
}

async function materializeBatchSegmentRows(input: {
  mediaId: string;
  segments: PracticeSegment[];
  mediaWords: WordTiming[];
  language: string;
  subtitleById: Map<string, string>;
  overwriteExisting?: boolean;
}): Promise<void> {
  for (const segment of input.segments) {
    const existing = await getSourceWordAlignment(input.mediaId, segment.id);
    if (existing && !input.overwriteExisting) {
      continue;
    }
    const referenceText = resolveSegmentReferenceText(segment, input.subtitleById);
    if (!referenceText) {
      continue;
    }
    const words = projectWordsToSourceRange(
      input.mediaWords,
      segment.sourceStartTime,
      segment.sourceEndTime,
    );
    if (words.length === 0) {
      continue;
    }
    await putSourceWordAlignment({
      mediaId: input.mediaId,
      segmentId: segment.id,
      words,
      referenceText,
      language: input.language,
      source: 'batch',
    });
  }
}

/**
 * Forced-align subtitle-span of a Media file when within API limits; cache absolute Media timings.
 */
export async function alignMediaSource(input: {
  mediaId: string;
  signal?: AbortSignal;
}): Promise<AlignMediaOutcome> {
  const settings = getAppSettings();
  if (!isSpeechAlignConfigured(settings)) {
    return { ok: false, reason: 'not_configured', message: notConfigured() };
  }

  const subtitleTrack = await getSubtitle(input.mediaId);
  const referenceText = subtitleTrack ? buildSubtitleTrackReferenceText(subtitleTrack) : '';
  const window = subtitleTrack
    ? resolveSubtitleAlignWindow(subtitleTrack.segments)
    : null;
  if (
    !canAlignWholeMedia({
      alignDurationSec: window ? subtitleAlignWindowDurationSec(window) : 0,
      referenceText,
    })
  ) {
    return {
      ok: false,
      reason: 'validation',
      message: wholeMediaAlignFailureMessage({ referenceText, window }),
    };
  }

  const mediaBlob = await getMediaBlob(input.mediaId);
  if (!mediaBlob) {
    return { ok: false, reason: 'validation', message: missingMedia() };
  }

  const prepared = await prepareSubtitleWindowAlignAudio({ mediaBlob, window: window! });
  if (!prepared.ok) {
    return { ok: false, reason: 'validation', message: prepared.message };
  }

  try {
    const response = await alignPronunciation({
      url: settings.speechAlignApiUrl,
      apiKey: settings.speechScoreApiKey,
      audio: prepared.blob,
      referenceText,
      language: settings.speechScoreLanguage || 'auto',
      signal: input.signal,
    });

    const words = toAbsoluteWords(response.words ?? [], window!.startTime);
    const alignment = await putMediaSourceWordAlignment({
      mediaId: input.mediaId,
      words,
      referenceText,
      language: response.meta?.language || settings.speechScoreLanguage || 'auto',
      subtitleContentHash: subtitleTrack!.contentHash,
    });

    return { ok: true, alignment };
  } catch (error) {
    if (error instanceof PronunciationAlignHttpError) {
      return { ok: false, reason: 'api', message: error.message };
    }
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    return {
      ok: false,
      reason: 'api',
      message: aborted
        ? msg('对齐已取消')
        : error instanceof Error
          ? error.message
          : msg('对齐失败，请重试'),
    };
  }
}

/**
 * Forced-align one Practice Segment’s source clip; cache absolute Media timings.
 */
export async function alignPracticeSegment(input: {
  mediaId: string;
  segment: PracticeSegment;
  /** Live Subtitle Track texts (fallback when Practice Segment has no snapshot). */
  subtitleSegments?: ReadonlyArray<Pick<SubtitleSegment, 'id' | 'text'>>;
  options?: AlignSegmentOptions;
}): Promise<AlignSegmentOutcome> {
  const settings = getAppSettings();
  if (!isSpeechAlignConfigured(settings)) {
    return { ok: false, reason: 'not_configured', message: notConfigured() };
  }

  const source = input.options?.source ?? 'segment';
  const skipIfCached = input.options?.skipIfCached ?? false;
  const byId = subtitleTextById(input.subtitleSegments ?? []);
  const subtitleTrack = await getSubtitle(input.mediaId);

  if (skipIfCached) {
    const cached = await cachedSegmentAlignment({
      mediaId: input.mediaId,
      segment: input.segment,
      subtitleTrack,
      subtitleById: byId,
    });
    if (cached) {
      return { ok: true, alignment: cached };
    }
  }

  const referenceText = resolveSegmentReferenceText(input.segment, byId);
  if (!referenceText) {
    return { ok: false, reason: 'validation', message: noReferenceText() };
  }

  const duration = input.segment.sourceEndTime - input.segment.sourceStartTime;
  if (!(duration > 0)) {
    return { ok: false, reason: 'validation', message: msg('原声片段时长无效') };
  }
  if (duration > ALIGN_MAX_DURATION_SEC) {
    return { ok: false, reason: 'validation', message: alignTooLongMessage() };
  }

  const mediaBlob = await getMediaBlob(input.mediaId);
  if (!mediaBlob) {
    return { ok: false, reason: 'validation', message: missingMedia() };
  }

  let clipped: { blob: Blob };
  try {
    clipped = await clipAudioBlob(
      mediaBlob,
      input.segment.sourceStartTime,
      input.segment.sourceEndTime,
    );
  } catch {
    return { ok: false, reason: 'validation', message: msg('无法裁剪原声片段') };
  }

  if (clipped.blob.size > ALIGN_MAX_BYTES) {
    return { ok: false, reason: 'validation', message: alignTooLargeMessage() };
  }

  try {
    const response = await alignPronunciation({
      url: settings.speechAlignApiUrl,
      apiKey: settings.speechScoreApiKey,
      audio: clipped.blob,
      referenceText,
      language: settings.speechScoreLanguage || 'auto',
      signal: input.options?.signal,
    });

    const words = toAbsoluteWords(response.words ?? [], input.segment.sourceStartTime);
    const alignment = await putSourceWordAlignment({
      mediaId: input.mediaId,
      segmentId: input.segment.id,
      words,
      referenceText,
      language: response.meta?.language || settings.speechScoreLanguage || 'auto',
      source,
    });

    if (!alignment) {
      // Batch lost to a segment row that appeared concurrently — reload.
      const existing = await getSourceWordAlignment(input.mediaId, input.segment.id);
      if (existing) {
        return { ok: true, alignment: existing };
      }
      return { ok: false, reason: 'api', message: msg('对齐结果未能保存') };
    }

    return { ok: true, alignment };
  } catch (error) {
    if (error instanceof PronunciationAlignHttpError) {
      return { ok: false, reason: 'api', message: error.message };
    }
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    return {
      ok: false,
      reason: 'api',
      message: aborted
        ? msg('对齐已取消')
        : error instanceof Error
          ? error.message
          : msg('对齐失败，请重试'),
    };
  }
}

/**
 * Batch-align every Practice Segment with reference text via one whole-Media `/align`.
 * Over-limit Media is rejected locally (no HTTP), same as score.
 */
export async function alignAllPracticeSegments(input: {
  mediaId: string;
  segments: PracticeSegment[];
  subtitleSegments?: ReadonlyArray<Pick<SubtitleSegment, 'id' | 'text'>>;
  options?: AlignAllOptions;
}): Promise<{
  ok: boolean;
  succeeded: number;
  failed: number;
  skipped: number;
  message?: string;
}> {
  const settings = getAppSettings();
  if (!isSpeechAlignConfigured(settings)) {
    return { ok: false, succeeded: 0, failed: 0, skipped: 0, message: notConfigured() };
  }

  const byId = subtitleTextById(input.subtitleSegments ?? []);
  const targets = input.segments.filter((segment) => resolveSegmentReferenceText(segment, byId));
  const total = targets.length;
  if (total === 0) {
    return {
      ok: false,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      message: noReferenceText(),
    };
  }

  const subtitleTrack = await getSubtitle(input.mediaId);
  const referenceText = subtitleTrack
    ? buildSubtitleTrackReferenceText(subtitleTrack)
    : '';
  if (!referenceText) {
    return {
      ok: false,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      message: noReferenceText(),
    };
  }

  const mediaBlob = await getMediaBlob(input.mediaId);
  const alignWindow = subtitleTrack
    ? resolveSubtitleAlignWindow(subtitleTrack.segments)
    : null;
  const force = input.options?.force ?? false;
  let mediaRow = await getMediaSourceWordAlignment(input.mediaId);
  const mediaValid = isMediaSourceWordAlignmentCurrent(mediaRow, subtitleTrack);

  const eligible =
    Boolean(mediaBlob) &&
    canAlignWholeMedia({
      alignDurationSec: alignWindow ? subtitleAlignWindowDurationSec(alignWindow) : 0,
      referenceText,
    });

  if (!eligible && !mediaValid) {
    if (!mediaBlob) {
      return {
        ok: false,
        succeeded: 0,
        failed: total,
        skipped: 0,
        message: missingMedia(),
      };
    }
    return {
      ok: false,
      succeeded: 0,
      failed: total,
      skipped: 0,
      message: wholeMediaAlignFailureMessage({ referenceText, window: alignWindow }),
    };
  }

  const preExistingIds = new Set<string>();
  for (const segment of targets) {
    if (await getSourceWordAlignment(input.mediaId, segment.id)) {
      preExistingIds.add(segment.id);
    }
  }

  if (eligible && (force || !mediaValid)) {
    const aligned = await alignMediaSource({
      mediaId: input.mediaId,
      signal: input.options?.signal,
    });
    if (!aligned.ok) {
      return {
        ok: false,
        succeeded: 0,
        failed: total,
        skipped: 0,
        message: aligned.message,
      };
    }
    mediaRow = aligned.alignment;
  }

  await materializeBatchSegmentRows({
    mediaId: input.mediaId,
    segments: targets,
    mediaWords: mediaRow!.words,
    language: mediaRow!.language,
    subtitleById: byId,
    overwriteExisting: force,
  });

  let succeeded = 0;
  for (const segment of targets) {
    if (await getSourceWordAlignment(input.mediaId, segment.id)) {
      succeeded += 1;
    }
  }

  const failed = total - succeeded;
  const skipped = preExistingIds.size;
  return {
    ok: failed === 0,
    succeeded,
    failed,
    skipped,
    message: failed > 0 ? msg(str`${failed}/${total} 句对齐失败`) : undefined,
  };
}
