import { describe, expect, it } from 'vitest';

import {
  detectSubtitleFormat,
  formatSubtitleParseWarning,
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

  it('detects LRC with 1-digit fractional seconds', () => {
    expect(detectSubtitleFormat('[00:01.5]Hello')).toBe('lrc');
  });

  it('returns null for empty content', () => {
    expect(detectSubtitleFormat('')).toBeNull();
    expect(detectSubtitleFormat('   ')).toBeNull();
  });
});

describe('parseSrt', () => {
  it('parses valid SRT blocks', () => {
    const { segments, warnings } = parseSrt(SAMPLE_SRT);
    expect(segments).toHaveLength(2);
    expect(warnings).toEqual([]);
    expect(segments[0].text).toBe('Hello world');
    expect(segments[0].startTime).toBe(1);
    expect(segments[0].endTime).toBe(4);
    expect(segments[1].text).toBe('Second line');
    expect(segments[1].translation).toBe('Translation here');
  });

  it('accepts 1–2 digit millisecond fractions as fractional seconds', () => {
    const content = `1
00:00:01,5 --> 00:00:02,50
One

2
0:00:03.05 --> 0:00:04.500
Two`;
    const { segments, warnings } = parseSrt(content);
    expect(warnings).toEqual([]);
    expect(segments).toHaveLength(2);
    expect(segments[0].startTime).toBe(1.5);
    expect(segments[0].endTime).toBe(2.5);
    expect(segments[1].startTime).toBe(3.05);
    expect(segments[1].endTime).toBe(4.5);
  });

  it('warns on lookalike timestamp lines that fail to parse', () => {
    const content = `1
00:00:01 --> 00:00:02
Broken

2
00:00:03,000 --> 00:00:04,000
Ok`;
    const { segments, warnings } = parseSrt(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Ok');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe(2);
    expect(warnings[0].text).toContain('-->');
  });

  it('returns empty array for blank input', () => {
    expect(parseSrt('')).toEqual({ segments: [], warnings: [] });
  });
});

describe('parseLrc', () => {
  it('parses LRC lines and assigns end times', () => {
    const { segments, warnings } = parseLrc(SAMPLE_LRC);
    expect(warnings).toEqual([]);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe('First line');
    expect(segments[0].startTime).toBe(1);
    expect(segments[0].endTime).toBe(5.5);
    expect(segments[1].text).toBe('Second line');
    expect(segments[1].endTime).toBe(segments[1].startTime + 3);
  });

  it('accepts 1-digit and 3-digit fractional seconds', () => {
    const content = `[00:01.5]Tenths
[00:02.500]Millis
[00:03.05]Centis`;
    const { segments, warnings } = parseLrc(content);
    expect(warnings).toEqual([]);
    expect(segments.map((s) => s.startTime)).toEqual([1.5, 2.5, 3.05]);
  });

  it('warns on lookalike bracket lines that fail to parse', () => {
    const content = `[00:01.00]Ok
[99:xx]Bad
[00:02.0]Also ok`;
    const { segments, warnings } = parseLrc(content);
    expect(segments).toHaveLength(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe(2);
    expect(warnings[0].text).toBe('[99:xx]Bad');
    expect(formatSubtitleParseWarning(warnings[0])).toContain('第 2 行');
    expect(formatSubtitleParseWarning(warnings[0])).toContain('[99:xx]Bad');
  });
});

describe('parseSubtitle', () => {
  it('auto-detects format when not specified', () => {
    expect(parseSubtitle(SAMPLE_SRT).segments).toHaveLength(2);
    expect(parseSubtitle(SAMPLE_LRC).segments).toHaveLength(2);
  });

  it('returns empty array for unrecognized content', () => {
    expect(parseSubtitle('not a subtitle file')).toEqual({ segments: [], warnings: [] });
  });
});

describe('validateSrtContent', () => {
  it('accepts valid SRT', () => {
    const result = validateSrtContent(SAMPLE_SRT);
    expect(result.segments).toHaveLength(2);
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it('rejects empty SRT and surfaces line context when available', () => {
    const empty = validateSrtContent('');
    expect(empty.segments).toBeNull();
    expect(empty.error).toBeTruthy();

    const broken = validateSrtContent(`1
00:00:01 --> 00:00:02
Nope`);
    expect(broken.segments).toBeNull();
    expect(broken.error).toContain('第 2 行');
    expect(broken.warnings).toHaveLength(1);
  });
});

describe('validateLrcContent', () => {
  it('accepts valid LRC', () => {
    const result = validateLrcContent(SAMPLE_LRC);
    expect(result.segments).toHaveLength(2);
    expect(result.error).toBeUndefined();
  });

  it('rejects LRC with only invalid timestamps and includes the bad line', () => {
    const result = validateLrcContent('[99:xx]Bad lyric');
    expect(result.segments).toBeNull();
    expect(result.error).toContain('第 1 行');
    expect(result.error).toContain('[99:xx]Bad lyric');
  });
});
