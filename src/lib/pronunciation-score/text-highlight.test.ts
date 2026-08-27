import { describe, expect, it } from 'vitest';

import { normalizeNewlines } from './normalize.js';
import {
  buildReferenceHighlightSpans,
  buildTranscriptHighlightSpans,
  misreadHasPlayableStart,
} from './text-highlight.js';

describe('normalizeNewlines', () => {
  it('maps CRLF and CR to LF', () => {
    expect(normalizeNewlines('a\r\nb\rc')).toBe('a\nb\nc');
  });
});

describe('pronunciation-score text-highlight', () => {
  it('highlights missing and misread on reference text by char spans', () => {
    const text = 'he was were gone';
    const spans = buildReferenceHighlightSpans(
      text,
      [{ word: 'were', ref_index: 2, char_start: 7, char_end: 11 }],
      [
        {
          expected: 'was',
          actual: 'is',
          ref_index: 1,
          hyp_index: 1,
          ref_char_start: 3,
          ref_char_end: 6,
          hyp_char_start: 3,
          hyp_char_end: 5,
          start: 1.2,
          end: 1.5,
        },
      ],
    );

    expect(
      spans.map((s) => ({ kind: s.kind, text: s.text, misreadIndex: s.misreadIndex })),
    ).toEqual([
      { kind: 'plain', text: 'he ', misreadIndex: undefined },
      { kind: 'misread', text: 'was', misreadIndex: 0 },
      { kind: 'plain', text: ' ', misreadIndex: undefined },
      { kind: 'missing', text: 'were', misreadIndex: undefined },
      { kind: 'plain', text: ' gone', misreadIndex: undefined },
    ]);
  });

  it('LF-normalizes local reference before applying API char spans', () => {
    // API indices assume LF: "line1\nwas gone" → "was" at [6, 9)
    const localRef = 'line1\r\nwas gone';
    const misread = {
      expected: 'was',
      actual: 'is',
      ref_index: 1,
      hyp_index: 1,
      ref_char_start: 6,
      ref_char_end: 9,
      hyp_char_start: 6,
      hyp_char_end: 8,
    };
    const transcript = 'line1\nis gone';

    expect(
      normalizeNewlines(localRef).slice(misread.ref_char_start, misread.ref_char_end).toLowerCase(),
    ).toBe(misread.expected);
    expect(transcript.slice(misread.hyp_char_start, misread.hyp_char_end).toLowerCase()).toBe(
      misread.actual,
    );

    const spans = buildReferenceHighlightSpans(localRef, [], [misread]);
    expect(spans.map((s) => ({ kind: s.kind, text: s.text }))).toEqual([
      { kind: 'plain', text: 'line1\n' },
      { kind: 'misread', text: 'was' },
      { kind: 'plain', text: ' gone' },
    ]);
  });

  it('highlights extra and misread on transcript by char spans', () => {
    const text = 'he is her gone';
    const spans = buildTranscriptHighlightSpans(
      text,
      [{ word: 'her', hyp_index: 2, char_start: 6, char_end: 9 }],
      [
        {
          expected: 'was',
          actual: 'is',
          ref_index: 1,
          hyp_index: 1,
          ref_char_start: 3,
          ref_char_end: 6,
          hyp_char_start: 3,
          hyp_char_end: 5,
        },
      ],
    );

    expect(spans.map((s) => ({ kind: s.kind, text: s.text }))).toEqual([
      { kind: 'plain', text: 'he ' },
      { kind: 'misread', text: 'is' },
      { kind: 'plain', text: ' ' },
      { kind: 'extra', text: 'her' },
      { kind: 'plain', text: ' gone' },
    ]);
  });

  it('skips invalid spans and reports playable misread start', () => {
    expect(
      buildReferenceHighlightSpans(
        'abc',
        [{ word: 'x', ref_index: 0, char_start: 5, char_end: 2 }],
        [],
      ).map((s) => s.kind),
    ).toEqual(['plain']);

    expect(
      misreadHasPlayableStart({
        expected: 'a',
        actual: 'b',
        ref_index: 0,
        hyp_index: 0,
        ref_char_start: 0,
        ref_char_end: 1,
        hyp_char_start: 0,
        hyp_char_end: 1,
        start: 1.5,
      }),
    ).toBe(true);
    expect(
      misreadHasPlayableStart({
        expected: 'a',
        actual: 'b',
        ref_index: 0,
        hyp_index: 0,
        ref_char_start: 0,
        ref_char_end: 1,
        hyp_char_start: 0,
        hyp_char_end: 1,
        start: null,
      }),
    ).toBe(false);
  });
});
