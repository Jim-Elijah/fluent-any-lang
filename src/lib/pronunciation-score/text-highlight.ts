import type {
  PronunciationExtraWord,
  PronunciationMisreadWord,
  PronunciationMissingWord,
} from '../../types/models.js';
import { normalizeNewlines } from './normalize.js';

export type ScoreTextHighlightKind = 'missing' | 'extra' | 'misread' | 'plain';

export type ScoreTextHighlightSpan = {
  start: number;
  end: number;
  kind: ScoreTextHighlightKind;
  text: string;
  /** Index into `misread_words` when `kind === 'misread'`. */
  misreadIndex?: number;
};

type Mark = {
  start: number;
  end: number;
  kind: Exclude<ScoreTextHighlightKind, 'plain'>;
  misreadIndex?: number;
};

function isFiniteInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clampMark(textLen: number, start: number, end: number): { start: number; end: number } | null {
  const s = Math.max(0, Math.min(textLen, Math.floor(start)));
  const e = Math.max(0, Math.min(textLen, Math.floor(end)));
  if (e <= s) return null;
  return { start: s, end: e };
}

function fillSpans(text: string, marks: Mark[]): ScoreTextHighlightSpan[] {
  const sorted = [...marks].sort((a, b) => a.start - b.start || a.end - b.end);
  const spans: ScoreTextHighlightSpan[] = [];
  let cursor = 0;

  for (const mark of sorted) {
    if (mark.start < cursor) {
      // Overlap / out-of-order — skip to keep rendering stable.
      continue;
    }
    if (mark.start > cursor) {
      spans.push({
        start: cursor,
        end: mark.start,
        kind: 'plain',
        text: text.slice(cursor, mark.start),
      });
    }
    spans.push({
      start: mark.start,
      end: mark.end,
      kind: mark.kind,
      text: text.slice(mark.start, mark.end),
      ...(mark.misreadIndex !== undefined ? { misreadIndex: mark.misreadIndex } : {}),
    });
    cursor = mark.end;
  }

  if (cursor < text.length) {
    spans.push({
      start: cursor,
      end: text.length,
      kind: 'plain',
      text: text.slice(cursor),
    });
  }

  return spans;
}

/**
 * Build highlight spans for reference text: missing + misread `expected`.
 * Char indices are relative to LF-normalized reference; local CR/LF is normalized first.
 * Keep a separate display copy if the UI must show original `\r\n` subtitles.
 */
export function buildReferenceHighlightSpans(
  text: string,
  missing: readonly PronunciationMissingWord[],
  misreads: readonly PronunciationMisreadWord[],
): ScoreTextHighlightSpan[] {
  const normalized = normalizeNewlines(text);
  if (!normalized) return [];
  const marks: Mark[] = [];

  for (const item of missing) {
    if (!isFiniteInt(item.char_start) || !isFiniteInt(item.char_end)) continue;
    const clamped = clampMark(normalized.length, item.char_start, item.char_end);
    if (!clamped) continue;
    marks.push({ ...clamped, kind: 'missing' });
  }

  misreads.forEach((item, misreadIndex) => {
    if (!isFiniteInt(item.ref_char_start) || !isFiniteInt(item.ref_char_end)) return;
    const clamped = clampMark(normalized.length, item.ref_char_start, item.ref_char_end);
    if (!clamped) return;
    marks.push({ ...clamped, kind: 'misread', misreadIndex });
  });

  return fillSpans(normalized, marks);
}

/**
 * Build highlight spans for recognition transcript: extra + misread `actual`.
 * Use `details.transcript` (already LF from the API); do not slice a local ASR copy.
 */
export function buildTranscriptHighlightSpans(
  text: string,
  extra: readonly PronunciationExtraWord[],
  misreads: readonly PronunciationMisreadWord[],
): ScoreTextHighlightSpan[] {
  // Defensive LF normalize; API transcript is already LF when `reference_newline === "lf"`.
  const normalized = normalizeNewlines(text);
  if (!normalized) return [];
  const marks: Mark[] = [];

  for (const item of extra) {
    if (!isFiniteInt(item.char_start) || !isFiniteInt(item.char_end)) continue;
    const clamped = clampMark(normalized.length, item.char_start, item.char_end);
    if (!clamped) continue;
    marks.push({ ...clamped, kind: 'extra' });
  }

  misreads.forEach((item, misreadIndex) => {
    if (!isFiniteInt(item.hyp_char_start) || !isFiniteInt(item.hyp_char_end)) return;
    const clamped = clampMark(normalized.length, item.hyp_char_start, item.hyp_char_end);
    if (!clamped) return;
    marks.push({ ...clamped, kind: 'misread', misreadIndex });
  });

  return fillSpans(normalized, marks);
}

export function misreadHasPlayableStart(misread: PronunciationMisreadWord): boolean {
  return typeof misread.start === 'number' && Number.isFinite(misread.start);
}
