import { describe, expect, it } from 'vitest';

import {
  detectSubtitleFormat,
  parseLrc,
  parseSrt,
  parseSubtitle,
  validateLrcContent,
  validateSrtContent,
} from './srt-parser.js';

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:08,500
Second line
Translation here`;

const SAMPLE_LRC = `[ti:Test]
[00:01.00]First line
[00:05.50]Second line`;

describe('detectSubtitleFormat', () => {
  it('detects SRT by timestamp pattern', () => {
    expect(detectSubtitleFormat(SAMPLE_SRT)).toBe('srt');
  });

  it('detects LRC by bracket timestamp', () => {
    expect(detectSubtitleFormat(SAMPLE_LRC)).toBe('lrc');
  });

  it('returns null for empty content', () => {
    expect(detectSubtitleFormat('')).toBeNull();
    expect(detectSubtitleFormat('   ')).toBeNull();
  });
});

describe('parseSrt', () => {
  it('parses valid SRT blocks', () => {
    const segments = parseSrt(SAMPLE_SRT);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe('Hello world');
    expect(segments[0].startTime).toBe(1);
    expect(segments[0].endTime).toBe(4);
    expect(segments[1].text).toBe('Second line');
    expect(segments[1].translation).toBe('Translation here');
  });

  it('returns empty array for blank input', () => {
    expect(parseSrt('')).toEqual([]);
  });
});

describe('parseLrc', () => {
  it('parses LRC lines and assigns end times', () => {
    const segments = parseLrc(SAMPLE_LRC);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe('First line');
    expect(segments[0].startTime).toBe(1);
    expect(segments[0].endTime).toBe(5.5);
    expect(segments[1].text).toBe('Second line');
    expect(segments[1].endTime).toBe(segments[1].startTime + 3);
  });
});

describe('parseSubtitle', () => {
  it('auto-detects format when not specified', () => {
    expect(parseSubtitle(SAMPLE_SRT)).toHaveLength(2);
    expect(parseSubtitle(SAMPLE_LRC)).toHaveLength(2);
  });

  it('returns empty array for unrecognized content', () => {
    expect(parseSubtitle('not a subtitle file')).toEqual([]);
  });
});

describe('validateSrtContent', () => {
  it('accepts valid SRT', () => {
    const result = validateSrtContent(SAMPLE_SRT);
    expect(result.segments).toHaveLength(2);
    expect(result.error).toBeUndefined();
  });

  it('rejects empty SRT', () => {
    const result = validateSrtContent('');
    expect(result.segments).toBeNull();
    expect(result.error).toBeTruthy();
  });
});

describe('validateLrcContent', () => {
  it('accepts valid LRC', () => {
    const result = validateLrcContent(SAMPLE_LRC);
    expect(result.segments).toHaveLength(2);
    expect(result.error).toBeUndefined();
  });
});
