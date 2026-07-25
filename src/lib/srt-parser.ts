import { msg, str } from '@lit/localize';
import type { SubtitleType, SubtitleSegment } from '../types/models.js';

/** 宽松匹配：小时 1–2 位，毫秒 1–3 位，逗号或点分隔 */
const SRT_TIMESTAMP =
  /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

/** 疑似 SRT 时间轴但未通过宽松正则（用于告警） */
const SRT_TIMESTAMP_LOOKALIKE = /\d{1,2}:\d{2}:\d{2}|-->/;

/** LRC：小数秒 1 位及以上均可；元数据行另判 */
const LRC_TIMESTAMP = /^\[(\d{1,2}):(\d{2})(?:\.(\d+))?\](.*)$/;
const LRC_TIMESTAMP_LOOKALIKE = /^\[\d/;
const LRC_METADATA = /^\[[a-zA-Z]+:.+\]$/;

/** LRC 末行无下一句时，默认展示时长（秒） */
const LRC_DEFAULT_DURATION = 3;

const WARNING_LINE_MAX_CHARS = 80;

export type SubtitleParseWarning = {
  /** 1-based 行号 */
  line: number;
  text: string;
  reason: string;
};

export type SubtitleParseResult = {
  segments: SubtitleSegment[];
  warnings: SubtitleParseWarning[];
};

export type SubtitleValidateResult = {
  segments: SubtitleSegment[] | null;
  error?: string;
  warnings: SubtitleParseWarning[];
};

function truncateWarningText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= WARNING_LINE_MAX_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, WARNING_LINE_MAX_CHARS)}…`;
}

/** 将小数秒字段按字面量解析（宽入：.5 / .50 / .500 均为 0.5s） */
function parseFractionalSeconds(fraction?: string): number {
  if (fraction === undefined || fraction === '') {
    return 0;
  }
  return Number(`0.${fraction}`);
}

function parseSrtTimestamp(h: string, m: string, s: string, fraction: string): number {
  return Number(
    (Number(h) * 3600 + Number(m) * 60 + Number(s) + parseFractionalSeconds(fraction)).toFixed(5),
  );
}

function parseLrcTimestamp(minutes: string, seconds: string, fraction?: string): number {
  return Number(
    (Number(minutes) * 60 + Number(seconds) + parseFractionalSeconds(fraction)).toFixed(5),
  );
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

function formatEmptySubtitleError(warnings: SubtitleParseWarning[]): string {
  const first = warnings[0];
  if (!first) {
    return msg('未找到有效的字幕条目');
  }
  return msg(str`未找到有效的字幕条目（第 ${first.line} 行：${truncateWarningText(first.text)}）`);
}

function validateSegments(
  segments: SubtitleSegment[],
  warnings: SubtitleParseWarning[],
): SubtitleValidateResult {
  if (segments.length === 0) {
    return { segments: null, error: formatEmptySubtitleError(warnings), warnings };
  }

  for (const segment of segments) {
    if (segment.endTime <= segment.startTime) {
      return { segments: null, error: msg('字幕时间轴无效'), warnings };
    }
  }

  return { segments, warnings };
}

export function detectSubtitleFormat(content: string): SubtitleType | null {
  const normalized = normalizeLineEndings(content.trim());
  if (!normalized) {
    return null;
  }

  if (SRT_TIMESTAMP.test(normalized)) {
    return 'srt';
  }

  if (/^\[\d{1,2}:\d{2}(?:\.\d+)?\]/m.test(normalized)) {
    return 'lrc';
  }

  return null;
}

export function parseSrt(content: string): SubtitleParseResult {
  const normalized = normalizeLineEndings(content.trim());
  if (!normalized) {
    return { segments: [], warnings: [] };
  }

  const rawLines = normalized.split('\n');
  const warnings: SubtitleParseWarning[] = [];
  const segments: SubtitleSegment[] = [];

  let index = 0;
  while (index < rawLines.length) {
    while (index < rawLines.length && !rawLines[index]!.trim()) {
      index += 1;
    }
    if (index >= rawLines.length) {
      break;
    }

    const blockLines: Array<{ line: number; text: string }> = [];
    while (index < rawLines.length && rawLines[index]!.trim()) {
      blockLines.push({ line: index + 1, text: rawLines[index]!.trim() });
      index += 1;
    }

    if (blockLines.length < 2) {
      continue;
    }

    const timestampEntry = blockLines.find((entry) => SRT_TIMESTAMP.test(entry.text));
    if (!timestampEntry) {
      const lookalike = blockLines.find((entry) => SRT_TIMESTAMP_LOOKALIKE.test(entry.text));
      if (lookalike) {
        warnings.push({
          line: lookalike.line,
          text: lookalike.text,
          reason: msg('时间戳格式无效'),
        });
      }
      continue;
    }

    const match = SRT_TIMESTAMP.exec(timestampEntry.text);
    if (!match) {
      warnings.push({
        line: timestampEntry.line,
        text: timestampEntry.text,
        reason: msg('时间戳格式无效'),
      });
      continue;
    }

    const timestampIndex = blockLines.indexOf(timestampEntry);
    const textLines = blockLines.slice(timestampIndex + 1).map((entry) => entry.text);
    const { text, translation } = parseBilingualText(textLines.join('\n'));

    if (!text) {
      continue;
    }

    const startTime = parseSrtTimestamp(match[1]!, match[2]!, match[3]!, match[4]!);
    const endTime = parseSrtTimestamp(match[5]!, match[6]!, match[7]!, match[8]!);

    if (endTime <= startTime) {
      warnings.push({
        line: timestampEntry.line,
        text: timestampEntry.text,
        reason: msg('字幕时间轴无效'),
      });
      continue;
    }

    segments.push({
      id: '',
      startTime,
      endTime,
      text,
      ...(translation ? { translation } : {}),
    });
  }

  return {
    segments: segments.sort((a, b) => a.startTime - b.startTime),
    warnings,
  };
}

export function parseLrc(content: string): SubtitleParseResult {
  const normalized = normalizeLineEndings(content.trim());
  if (!normalized) {
    return { segments: [], warnings: [] };
  }

  const groupedByTime = new Map<number, string[]>();
  const warnings: SubtitleParseWarning[] = [];

  const rawLines = normalized.split('\n');
  for (let index = 0; index < rawLines.length; index += 1) {
    const trimmed = rawLines[index]!.trim();
    if (!trimmed || LRC_METADATA.test(trimmed)) {
      continue;
    }

    const match = LRC_TIMESTAMP.exec(trimmed);
    if (!match) {
      if (LRC_TIMESTAMP_LOOKALIKE.test(trimmed)) {
        warnings.push({
          line: index + 1,
          text: trimmed,
          reason: msg('时间戳格式无效'),
        });
      }
      continue;
    }

    const startTime = parseLrcTimestamp(match[1]!, match[2]!, match[3]);
    const lyricText = match[4]!.trim();
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
      id: '',
      startTime,
      endTime: startTime,
      text,
      ...(translation ? { translation } : {}),
    });
  }

  segments.sort((a, b) => a.startTime - b.startTime);
  assignLrcEndTimes(segments);

  return { segments, warnings };
}

export function parseSubtitle(content: string, format?: SubtitleType): SubtitleParseResult {
  const resolvedFormat = format ?? detectSubtitleFormat(content);
  if (resolvedFormat === 'lrc') {
    return parseLrc(content);
  }
  if (resolvedFormat === 'srt') {
    return parseSrt(content);
  }
  return { segments: [], warnings: [] };
}

export function formatSubtitleParseWarning(warning: SubtitleParseWarning): string {
  return msg(str`第 ${warning.line} 行：${warning.reason}（${truncateWarningText(warning.text)}）`);
}

export function validateSrtContent(content: string): SubtitleValidateResult {
  const parsed = parseSrt(content);
  return validateSegments(parsed.segments, parsed.warnings);
}

export function validateLrcContent(content: string): SubtitleValidateResult {
  const parsed = parseLrc(content);
  return validateSegments(parsed.segments, parsed.warnings);
}

export function validateSubtitleContent(
  content: string,
  format?: SubtitleType,
): SubtitleValidateResult {
  const parsed = parseSubtitle(content, format);
  return validateSegments(parsed.segments, parsed.warnings);
}
