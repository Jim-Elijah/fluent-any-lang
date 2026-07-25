import { describe, expect, it } from 'vitest';

import {
  detectSubtitleFormat,
  formatSubtitleParseWarning,
  parseLrc,
  parseSrt,
  parseSubtitle,
  validateLrcContent,
  validateSrtContent,
  validateSubtitleContent,
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

  it('returns null for unrecognized content', () => {
    expect(detectSubtitleFormat('plain text without timestamps')).toBeNull();
  });

  it('prefers SRT when both SRT and LRC-like patterns appear', () => {
    const mixed = `1
00:00:01,000 --> 00:00:02,000
Hello
[00:03.00]Also here`;
    expect(detectSubtitleFormat(mixed)).toBe('srt');
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

  it('normalizes CRLF and bare CR line endings', () => {
    const content =
      '1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n\r\n2\r00:00:03,000 --> 00:00:04,000\rWorld';
    const { segments, warnings } = parseSrt(content);
    expect(warnings).toEqual([]);
    expect(segments.map((s) => s.text)).toEqual(['Hello', 'World']);
  });

  it('strips HTML tags from cue text', () => {
    const content = `1
00:00:01,000 --> 00:00:02,000
<i>Hello</i> <b>world</b>`;
    const { segments } = parseSrt(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Hello world');
  });

  it('parses pipe-separated bilingual text', () => {
    const content = `1
00:00:01,000 --> 00:00:02,000
Hello | 你好`;
    const { segments } = parseSrt(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Hello');
    expect(segments[0].translation).toBe('你好');
  });

  it('keeps text only when pipe has no translation', () => {
    const content = `1
00:00:01,000 --> 00:00:02,000
Hello |`;
    const { segments } = parseSrt(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Hello');
    expect(segments[0].translation).toBeUndefined();
  });

  it('joins multi-line translations after the first text line', () => {
    const content = `1
00:00:01,000 --> 00:00:02,000
Hello
Line two
Line three`;
    const { segments } = parseSrt(content);
    expect(segments[0].text).toBe('Hello');
    expect(segments[0].translation).toBe('Line two\nLine three');
  });

  it('sorts segments by start time when cues are out of order', () => {
    const content = `1
00:00:05,000 --> 00:00:06,000
Second

2
00:00:01,000 --> 00:00:02,000
First`;
    const { segments } = parseSrt(content);
    expect(segments.map((s) => s.text)).toEqual(['First', 'Second']);
  });

  it('skips orphan single-line blocks', () => {
    const content = `orphan

1
00:00:01,000 --> 00:00:02,000
Ok`;
    const { segments, warnings } = parseSrt(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Ok');
    expect(warnings).toEqual([]);
  });

  it('skips multi-line blocks without timestamp or lookalike', () => {
    const content = `1
Just some text

2
00:00:01,000 --> 00:00:02,000
Ok`;
    const { segments, warnings } = parseSrt(content);
    expect(segments).toHaveLength(1);
    expect(warnings).toEqual([]);
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

  it('warns and skips cues whose end time is not after start time', () => {
    const content = `1
00:00:05,000 --> 00:00:04,000
Backwards

2
00:00:01,000 --> 00:00:01,000
Equal

3
00:00:02,000 --> 00:00:03,000
Ok`;
    const { segments, warnings } = parseSrt(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Ok');
    expect(warnings).toHaveLength(2);
    expect(warnings.every((w) => w.reason.includes('时间轴'))).toBe(true);
  });

  it('skips cues with empty text after stripping tags', () => {
    const content = `1
00:00:01,000 --> 00:00:02,000
<br/>

2
00:00:03,000 --> 00:00:04,000
Ok`;
    const { segments, warnings } = parseSrt(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Ok');
    expect(warnings).toEqual([]);
  });

  it('handles trailing blank lines after the last cue', () => {
    const content = `1
00:00:01,000 --> 00:00:02,000
Hello

`;
    const { segments } = parseSrt(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Hello');
  });

  it('returns empty array for blank input', () => {
    expect(parseSrt('')).toEqual({ segments: [], warnings: [] });
    expect(parseSrt('   \n\n  ')).toEqual({ segments: [], warnings: [] });
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

  it('accepts timestamps without fractional seconds', () => {
    const { segments, warnings } = parseLrc('[00:01]No fraction\n[1:02]Also ok');
    expect(warnings).toEqual([]);
    expect(segments).toHaveLength(2);
    expect(segments[0].startTime).toBe(1);
    expect(segments[1].startTime).toBe(62);
  });

  it('skips metadata and blank lines', () => {
    const content = `[ti:Song]
[ar:Artist]

[00:01.00]Lyric`;
    const { segments, warnings } = parseLrc(content);
    expect(warnings).toEqual([]);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Lyric');
  });

  it('skips empty lyric text and non-lookalike noise', () => {
    const content = `[00:01.00]
[00:02.00]   
plain noise
[00:03.00]Ok`;
    const { segments, warnings } = parseLrc(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Ok');
    expect(warnings).toEqual([]);
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

  it('merges same-timestamp lines into bilingual text', () => {
    const content = `[00:01.00]Hello
[00:01.00]你好
[00:05.00]Next`;
    const { segments } = parseLrc(content);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe('Hello');
    expect(segments[0].translation).toBe('你好');
    expect(segments[0].endTime).toBe(5);
  });

  it('parses pipe bilingual lyrics and strips HTML', () => {
    const content = `[00:01.00]<i>Hello</i> | 你好`;
    const { segments } = parseLrc(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Hello');
    expect(segments[0].translation).toBe('你好');
    expect(segments[0].endTime).toBe(4);
  });

  it('skips lyrics that become empty after HTML stripping', () => {
    const content = `[00:01.00]<br/>
[00:02.00]Ok`;
    const { segments } = parseLrc(content);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Ok');
  });

  it('returns empty result for blank input', () => {
    expect(parseLrc('')).toEqual({ segments: [], warnings: [] });
    expect(parseLrc('  \n  ')).toEqual({ segments: [], warnings: [] });
  });
});

describe('parseSubtitle', () => {
  it('auto-detects format when not specified', () => {
    expect(parseSubtitle(SAMPLE_SRT).segments).toHaveLength(2);
    expect(parseSubtitle(SAMPLE_LRC).segments).toHaveLength(2);
  });

  it('uses an explicit format when provided', () => {
    expect(parseSubtitle(SAMPLE_SRT, 'srt').segments).toHaveLength(2);
    expect(parseSubtitle(SAMPLE_LRC, 'lrc').segments).toHaveLength(2);
  });

  it('returns empty array for unrecognized content', () => {
    expect(parseSubtitle('not a subtitle file')).toEqual({ segments: [], warnings: [] });
  });
});

describe('formatSubtitleParseWarning', () => {
  it('formats line, reason, and text', () => {
    const message = formatSubtitleParseWarning({
      line: 3,
      text: 'bad --> line',
      reason: '时间戳格式无效',
    });
    expect(message).toContain('第 3 行');
    expect(message).toContain('时间戳格式无效');
    expect(message).toContain('bad --> line');
  });

  it('truncates long warning text with an ellipsis', () => {
    const longText = 'x'.repeat(100);
    const message = formatSubtitleParseWarning({
      line: 1,
      text: longText,
      reason: '时间戳格式无效',
    });
    expect(message).toContain(`${'x'.repeat(80)}…`);
    expect(message).not.toContain('x'.repeat(81));
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
    expect(empty.error).toBe('未找到有效的字幕条目');

    const broken = validateSrtContent(`1
00:00:01 --> 00:00:02
Nope`);
    expect(broken.segments).toBeNull();
    expect(broken.error).toContain('第 2 行');
    expect(broken.warnings).toHaveLength(1);
  });

  it('rejects SRT that only yields invalid timelines', () => {
    const result = validateSrtContent(`1
00:00:05,000 --> 00:00:04,000
Backwards`);
    expect(result.segments).toBeNull();
    expect(result.error).toContain('第 2 行');
    expect(result.warnings).toHaveLength(1);
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

  it('rejects blank LRC without line context', () => {
    const result = validateLrcContent('');
    expect(result.segments).toBeNull();
    expect(result.error).toBe('未找到有效的字幕条目');
    expect(result.warnings).toEqual([]);
  });
});

describe('validateSubtitleContent', () => {
  it('validates auto-detected SRT and LRC', () => {
    expect(validateSubtitleContent(SAMPLE_SRT).segments).toHaveLength(2);
    expect(validateSubtitleContent(SAMPLE_LRC).segments).toHaveLength(2);
  });

  it('validates with an explicit format', () => {
    expect(validateSubtitleContent(SAMPLE_SRT, 'srt').error).toBeUndefined();
    expect(validateSubtitleContent(SAMPLE_LRC, 'lrc').error).toBeUndefined();
  });

  it('rejects unrecognized content', () => {
    const result = validateSubtitleContent('not a subtitle');
    expect(result.segments).toBeNull();
    expect(result.error).toBe('未找到有效的字幕条目');
  });
});
