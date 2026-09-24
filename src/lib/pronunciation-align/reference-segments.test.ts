import { describe, expect, it } from 'vitest';

import { buildSubtitleAlignRequestPayload } from './reference-segments.js';

describe('buildSubtitleAlignRequestPayload', () => {
  it('returns clip-relative segment times and LF reference_text for multi-line spans', () => {
    const payload = buildSubtitleAlignRequestPayload(
      [
        { id: 's1', startTime: 10, endTime: 12, text: 'Hello world' },
        { id: 's2', startTime: 14, endTime: 16, text: 'How are you' },
      ],
      10,
    );

    expect(payload?.referenceText).toBe('Hello world\nHow are you');
    expect(payload?.referenceSegments).toEqual([
      { id: 's1', startTime: 0, endTime: 2, text: 'Hello world' },
      { id: 's2', startTime: 4, endTime: 6, text: 'How are you' },
    ]);
  });

  it('skips empty lines and omits reference_segments for a single timed line', () => {
    const payload = buildSubtitleAlignRequestPayload(
      [
        { id: 'gap', startTime: 0, endTime: 1, text: '   ' },
        { id: 's1', startTime: 1, endTime: 3, text: 'Only line' },
      ],
      1,
    );

    expect(payload?.referenceText).toBe('Only line');
    expect(payload?.referenceSegments).toBeUndefined();
  });

  it('falls back to full align when a segment has invalid relative duration', () => {
    const payload = buildSubtitleAlignRequestPayload(
      [
        { id: 's1', startTime: 0, endTime: 2, text: 'A' },
        { id: 's2', startTime: 2, endTime: 2, text: 'B' },
      ],
      0,
    );

    expect(payload?.referenceText).toBe('A\nB');
    expect(payload?.referenceSegments).toBeUndefined();
  });
});
