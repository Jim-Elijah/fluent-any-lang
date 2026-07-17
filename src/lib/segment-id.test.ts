import { describe, expect, it } from 'vitest';

import {
  assignSegmentIds,
  computeSegmentId,
  computeSentenceBankContentHash,
  normalizeSegmentText,
} from './segment-id.js';

describe('segment-id', () => {
  it('normalizes whitespace and case', () => {
    expect(normalizeSegmentText('  Hello   WORLD  ')).toBe('hello world');
  });

  it('computes deterministic segment ids for the same media + content', async () => {
    const segment = {
      startTime: 1.5,
      endTime: 3.25,
      text: 'Hello',
      translation: '你好',
    };
    const a = await computeSegmentId('media-1', segment);
    const b = await computeSegmentId('media-1', segment);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('changes segment id when media or timing differs', async () => {
    const base = { startTime: 1, endTime: 2, text: 'Same' };
    const a = await computeSegmentId('m1', base);
    const b = await computeSegmentId('m2', base);
    const c = await computeSegmentId('m1', { ...base, startTime: 1.1 });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('assigns ids onto parsed segments', async () => {
    const segments = await assignSegmentIds('media-x', [
      { id: '', startTime: 0, endTime: 1, text: 'One' },
      { id: 'legacy', startTime: 2, endTime: 3, text: 'Two' },
    ]);
    expect(segments[0].id).toHaveLength(64);
    expect(segments[1].id).toHaveLength(64);
    expect(segments[0].id).not.toBe(segments[1].id);
  });

  it('sentence bank content hash includes mediaId and startTime', async () => {
    const segment = { startTime: 4, text: 'Hello', translation: '你好' };
    const a = await computeSentenceBankContentHash('m1', segment);
    const b = await computeSentenceBankContentHash('m2', segment);
    const c = await computeSentenceBankContentHash('m1', { ...segment, startTime: 5 });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
