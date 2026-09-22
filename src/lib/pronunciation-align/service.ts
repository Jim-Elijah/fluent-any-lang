import { msg, str } from '@lit/localize';
import { getAppSettings } from '../app-settings.js';
import { clipAudioBlob } from '../audio-clip.js';
import { getMediaBlob } from '../../db/media.js';
import {
  getSourceWordAlignment,
  putSourceWordAlignment,
} from '../../db/source-word-alignment.js';
import type {
  PracticeSegment,
  SourceWordAlignmentSource,
  StoredSourceWordAlignment,
  SubtitleSegment,
  WordTiming,
} from '../../types/models.js';
import { normalizeNewlines } from '../pronunciation-score/normalize.js';
import { PronunciationAlignHttpError, alignPronunciation } from './client.js';
import {
  ALIGN_MAX_BYTES,
  ALIGN_MAX_DURATION_SEC,
  alignTooLargeMessage,
  alignTooLongMessage,
  isSpeechAlignConfigured,
} from './constants.js';

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

export type AlignAllProgress = {
  done: number;
  total: number;
  segmentId: string;
};

export type AlignAllOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: AlignAllProgress) => void;
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

  if (skipIfCached) {
    const existing = await getSourceWordAlignment(input.mediaId, input.segment.id);
    if (existing) {
      return { ok: true, alignment: existing };
    }
  }

  const byId = subtitleTextById(input.subtitleSegments ?? []);
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
 * Batch-align every Practice Segment with reference text (sequential HTTP).
 * Skips segments that already have a cache row; does not overwrite `segment` rows.
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

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < targets.length; i += 1) {
    if (input.options?.signal?.aborted) {
      return {
        ok: false,
        succeeded,
        failed,
        skipped,
        message: msg('对齐已取消'),
      };
    }

    const segment = targets[i]!;
    input.options?.onProgress?.({ done: i, total, segmentId: segment.id });

    const existing = await getSourceWordAlignment(input.mediaId, segment.id);
    if (existing) {
      skipped += 1;
      succeeded += 1;
      continue;
    }

    const result = await alignPracticeSegment({
      mediaId: input.mediaId,
      segment,
      subtitleSegments: input.subtitleSegments,
      options: {
        signal: input.options?.signal,
        source: 'batch',
        skipIfCached: true,
      },
    });

    if (result.ok) {
      succeeded += 1;
    } else if (result.reason === 'skipped') {
      skipped += 1;
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  input.options?.onProgress?.({
    done: total,
    total,
    segmentId: targets[targets.length - 1]?.id ?? '',
  });

  return {
    ok: failed === 0,
    succeeded,
    failed,
    skipped,
    message: failed > 0 ? msg(str`${failed}/${total} 句对齐失败`) : undefined,
  };
}
