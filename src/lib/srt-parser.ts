import type { SubtitleSegment } from '../types/models.js';

const SRT_TIMESTAMP =
  /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;

function parseTimestamp(h: string, m: string, s: string, ms: string): number {
  return Number((Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000).toFixed(5));
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
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
    const text = stripHtmlTags(textLines.join('\n'));

    if (!text) {
      continue;
    }

    segments.push({
      id: crypto.randomUUID(),
      startTime: parseTimestamp(match[1], match[2], match[3], match[4]),
      endTime: parseTimestamp(match[5], match[6], match[7], match[8]),
      text,
    });
  }

  return segments.sort((a, b) => a.startTime - b.startTime);
}

export function validateSrtContent(content: string): {
  segments: SubtitleSegment[] | null;
  error?: string;
} {
  const segments = parseSrt(content);
  if (segments.length === 0) {
    return { segments: null, error: 'No valid subtitle cues found' };
  }

  for (const segment of segments) {
    if (segment.endTime <= segment.startTime) {
      return { segments: null, error: 'Invalid subtitle timing' };
    }
  }

  return { segments };
}
