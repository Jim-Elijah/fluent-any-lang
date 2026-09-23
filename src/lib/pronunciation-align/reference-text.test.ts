import { describe, expect, it } from 'vitest';

import { buildSubtitleTrackReferenceText } from './reference-text.js';

describe('buildSubtitleTrackReferenceText', () => {
  it('orders segments by startTime and joins with LF', () => {
    const text = buildSubtitleTrackReferenceText({
      segments: [
        { id: 'b', startTime: 2, endTime: 3, text: 'Second' },
        { id: 'a', startTime: 0, endTime: 1, text: 'First' },
      ],
    });
    expect(text).toBe('First\nSecond');
  });

  it('skips empty lines after trim', () => {
    const text = buildSubtitleTrackReferenceText({
      segments: [{ id: 'a', startTime: 0, endTime: 1, text: '  Hi  ' }],
    });
    expect(text).toBe('Hi');
  });

  it('normalizes CRLF in segment text', () => {
    const text = buildSubtitleTrackReferenceText({
      segments: [{ id: 'a', startTime: 0, endTime: 1, text: 'Line1\r\nLine2' }],
    });
    expect(text).toBe('Line1\nLine2');
  });
});
