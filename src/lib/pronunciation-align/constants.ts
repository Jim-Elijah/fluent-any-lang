import { msg, str } from '@lit/localize';

import { joinApiUrl, SCORE_API_PATH } from '../pronunciation-score/constants.js';

/** Max audio duration accepted by the pronunciation align API (seconds). */
export const ALIGN_MAX_DURATION_SEC = 60;

/** Max audio payload accepted by the pronunciation align API (bytes). */
export const ALIGN_MAX_BYTES = 10 * 1024 * 1024;

/** Canonical align path (store the full POST URL in settings). */
export const ALIGN_API_PATH = '/api/v1/pronunciation/align';

const LEGACY_SCORE_API_PATH = '/api/v1/pronunciation/score';

function formatAlignMaxMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
}

export function alignTooLongMessage(): string {
  return msg(str`原声片段超过 ${ALIGN_MAX_DURATION_SEC} 秒，无法对齐`);
}

export function alignTooLargeMessage(): string {
  return msg(str`原声文件超过 ${formatAlignMaxMb(ALIGN_MAX_BYTES)} MB，无法对齐`);
}

/**
 * Settings store the full POST URL. Bare host/base values resolve to
 * `ALIGN_API_PATH`. Already-complete align paths are left unchanged.
 */
export function toAlignApiUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith(ALIGN_API_PATH)) {
    return trimmed;
  }
  return joinApiUrl(trimmed, ALIGN_API_PATH);
}

/** Derive a suggested align URL from a configured score URL (path swap). */
export function suggestAlignApiUrlFromScoreUrl(scoreUrl: string): string {
  const trimmed = scoreUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  for (const scorePath of [SCORE_API_PATH, LEGACY_SCORE_API_PATH]) {
    if (trimmed.endsWith(scorePath)) {
      return `${trimmed.slice(0, -scorePath.length)}${ALIGN_API_PATH}`;
    }
  }
  return toAlignApiUrl(trimmed);
}

export function isSpeechAlignConfigured(settings: {
  speechAlignApiUrl: string;
  speechScoreApiKey: string;
}): boolean {
  return (
    settings.speechAlignApiUrl.trim().length > 0 && settings.speechScoreApiKey.trim().length > 0
  );
}
