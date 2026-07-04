import { msg, str } from '@lit/localize';
import type { SubtitleFormat, SubtitleSegment } from '../types/models.js';

const SRT_TIMESTAMP =
  /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;

const LRC_TIMESTAMP = /^\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)$/;
const LRC_METADATA = /^\[[a-zA-Z]+:.+\]$/;

/** LRC 末行无下一句时，默认展示时长（秒） */
const LRC_DEFAULT_DURATION = 3;

function parseSrtTimestamp(h: string, m: string, s: string, ms: string): number {
  return Number((Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000).toFixed(5));
}

function parseLrcTimestamp(minutes: string, seconds: string, fraction?: string): number {
  const ms =
    fraction === undefined ? 0 : fraction.length === 2 ? Number(fraction) * 10 : Number(fraction);
  return Number((Number(minutes) * 60 + Number(seconds) + ms / 1000).toFixed(5));
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

function parseBilingualText(raw: string): Pick<SubtitleSegment, 'text' | 'translation'> {
  const stripped = stripHtmlTags(raw);
  if (!stripped) {
    return { text: '' };
  }

  const pipeIndex = stripped.indexOf('|');
  if (pipeIndex !== -1) {
    const text = stripped.slice(0, pipeIndex).trim();
    const translation = stripped.slice(pipeIndex + 1).trim();
    return translation ? { text, translation } : { text };
  }

  const lines = stripped
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 2) {
    return { text: lines[0], translation: lines.slice(1).join('\n') };
  }

  return { text: stripped };
}

function assignLrcEndTimes(segments: SubtitleSegment[]): void {
  for (let index = 0; index < segments.length; index += 1) {
    const next = segments[index + 1];
    segments[index].endTime = next
      ? next.startTime
      : segments[index].startTime + LRC_DEFAULT_DURATION;
  }
}

function validateSegments(segments: SubtitleSegment[]): {
  segments: SubtitleSegment[] | null;
  error?: string;
} {
  console.log('validateSegments', segments);
  if (segments.length === 0) {
    return { segments: null, error: msg(str`No valid subtitle cues found`) };
  }

  for (const segment of segments) {
    if (segment.endTime <= segment.startTime) {
      return { segments: null, error: msg(str`Invalid subtitle timing`) };
    }
  }

  return { segments };
}

export function detectSubtitleFormat(content: string): SubtitleFormat | null {
  const normalized = normalizeLineEndings(content.trim());
  if (!normalized) {
    return null;
  }

  if (SRT_TIMESTAMP.test(normalized)) {
    return 'srt';
  }

  if (/^\[\d{1,2}:\d{2}(?:\.\d{2,3})?\]/m.test(normalized)) {
    return 'lrc';
  }

  return null;
}

export function parseSrt(content: string): SubtitleSegment[] {
  const normalized = normalizeLineEndings(content.trim());
  if (!normalized) {
    return [];
  }

  const blocks = normalized.split(/\n\n+/);
  const segments: SubtitleSegment[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      continue;
    }

    const timestampLine = lines.find((line) => SRT_TIMESTAMP.test(line));
    if (!timestampLine) {
      continue;
    }

    const match = SRT_TIMESTAMP.exec(timestampLine);
    if (!match) {
      continue;
    }

    const timestampIndex = lines.indexOf(timestampLine);
    const textLines = lines.slice(timestampIndex + 1);
    const { text, translation } = parseBilingualText(textLines.join('\n'));

    if (!text) {
      continue;
    }

    segments.push({
      id: crypto.randomUUID(),
      startTime: parseSrtTimestamp(match[1], match[2], match[3], match[4]),
      endTime: parseSrtTimestamp(match[5], match[6], match[7], match[8]),
      text,
      ...(translation ? { translation } : {}),
    });
  }

  return segments.sort((a, b) => a.startTime - b.startTime);
}

export function parseLrc(content: string): SubtitleSegment[] {
  const normalized = normalizeLineEndings(content.trim());
  if (!normalized) {
    return [];
  }

  const groupedByTime = new Map<number, string[]>();

  for (const line of normalized.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || LRC_METADATA.test(trimmed)) {
      continue;
    }

    const match = LRC_TIMESTAMP.exec(trimmed);
    if (!match) {
      continue;
    }

    const startTime = parseLrcTimestamp(match[1], match[2], match[3]);
    const lyricText = match[4].trim();
    if (!lyricText) {
      continue;
    }

    const lines = groupedByTime.get(startTime) ?? [];
    lines.push(lyricText);
    groupedByTime.set(startTime, lines);
  }

  const segments: SubtitleSegment[] = [];

  for (const [startTime, lines] of groupedByTime) {
    const { text, translation } = parseBilingualText(lines.join('\n'));
    if (!text) {
      continue;
    }

    segments.push({
      id: crypto.randomUUID(),
      startTime,
      endTime: startTime,
      text,
      ...(translation ? { translation } : {}),
    });
  }

  segments.sort((a, b) => a.startTime - b.startTime);
  assignLrcEndTimes(segments);

  return segments;
}

export function parseSubtitle(content: string, format?: SubtitleFormat): SubtitleSegment[] {
  const resolvedFormat = format ?? detectSubtitleFormat(content);
  if (resolvedFormat === 'lrc') {
    return parseLrc(content);
  }
  if (resolvedFormat === 'srt') {
    return parseSrt(content);
  }
  return [];
}

export function validateSrtContent(content: string): {
  segments: SubtitleSegment[] | null;
  error?: string;
} {
  return validateSegments(parseSrt(content));
}

export function validateLrcContent(content: string): {
  segments: SubtitleSegment[] | null;
  error?: string;
} {
  return validateSegments(parseLrc(content));
}

export function validateSubtitleContent(
  content: string,
  format?: SubtitleFormat,
): {
  segments: SubtitleSegment[] | null;
  error?: string;
} {
  return validateSegments(parseSubtitle(content, format));
}
