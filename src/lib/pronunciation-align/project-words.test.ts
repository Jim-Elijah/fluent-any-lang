import { describe, expect, it } from 'vitest';

import { projectWordsToSourceRange } from './project-words.js';

describe('projectWordsToSourceRange', () => {
  const words = [
    { word: 'a', start: 0.5, end: 1 },
    { word: 'b', start: 1.5, end: 2 },
    { word: 'c', start: 2.5, end: 3 },
  ];

  it('keeps words whose midpoint is in [start, end)', () => {
    expect(projectWordsToSourceRange(words, 1, 2.6)).toEqual([words[1]]);
  });

  it('returns empty for invalid range', () => {
    expect(projectWordsToSourceRange(words, 2, 2)).toEqual([]);
  });

  it('excludes words straddling the end boundary by midpoint', () => {
    expect(projectWordsToSourceRange(words, 0, 1.5)).toEqual([words[0]]);
  });
});
