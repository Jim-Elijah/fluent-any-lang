import { describe, expect, it } from 'vitest';

import {
  assignTimedWordToSegmentIndex,
  projectWordsToSourceRange,
  wordsAssignedToSegmentIndex,
} from './project-words.js';

describe('assignTimedWordToSegmentIndex', () => {
  const bounds = [
    { start: 0, end: 5 },
    { start: 5, end: 10 },
  ];

  it('assigns by word.start in [segmentStart, nextSegmentStart)', () => {
    const onBoundary = { word: 'join', start: 4.4, end: 5.6 };
    expect(assignTimedWordToSegmentIndex(onBoundary, bounds)).toBe(0);
    expect(assignTimedWordToSegmentIndex({ word: 'b', start: 5, end: 5.2 }, bounds)).toBe(1);
  });

  it('assigns a word fully inside one segment to that segment', () => {
    expect(assignTimedWordToSegmentIndex({ word: 'a', start: 1, end: 2 }, bounds)).toBe(0);
    expect(assignTimedWordToSegmentIndex({ word: 'b', start: 6, end: 7 }, bounds)).toBe(1);
  });

  it('returns -1 when word.start is before the first segment', () => {
    expect(assignTimedWordToSegmentIndex({ word: 'x', start: -0.1, end: 0.2 }, bounds)).toBe(-1);
  });
});

describe('wordsAssignedToSegmentIndex', () => {
  const bounds = [
    { start: 0, end: 5 },
    { start: 5, end: 10 },
  ];
  const onBoundary = { word: 'join', start: 4.4, end: 5.6 };

  it('includes a boundary word in only one segment list', () => {
    expect(wordsAssignedToSegmentIndex([onBoundary], bounds, 0)).toEqual([onBoundary]);
    expect(wordsAssignedToSegmentIndex([onBoundary], bounds, 1)).toEqual([]);
  });

  it('keeps trailing align tails on the segment where the word starts (subtitle gap)', () => {
    const subtitleBounds = [
      { start: 20.352, end: 21.21 },
      { start: 21.49, end: 22.47 },
      { start: 22.76, end: 24.32 },
    ];
    const right = { word: 'right', start: 21.052, end: 21.952 };
    const heres = { word: "here's", start: 21.952, end: 22.152 };
    const idea = { word: 'idea', start: 22.262, end: 23.002 };
    const all = [right, heres, idea];

    expect(wordsAssignedToSegmentIndex(all, subtitleBounds, 0)).toEqual([right]);
    expect(wordsAssignedToSegmentIndex(all, subtitleBounds, 1)).toEqual([heres, idea]);
    expect(wordsAssignedToSegmentIndex(all, subtitleBounds, 2)).toEqual([]);
  });
});

describe('projectWordsToSourceRange', () => {
  const words = [
    { word: 'a', start: 0.5, end: 1 },
    { word: 'b', start: 1.5, end: 2 },
    { word: 'c', start: 2.5, end: 3 },
  ];

  it('keeps words that start inside the single window', () => {
    expect(projectWordsToSourceRange(words, 1, 2.5)).toEqual([words[1]]);
  });

  it('returns empty for invalid range', () => {
    expect(projectWordsToSourceRange(words, 2, 2)).toEqual([]);
  });

  it('includes words that straddle the end boundary when they start in-window', () => {
    const straddle = { word: 'tail', start: 1, end: 1.8 };
    expect(projectWordsToSourceRange([words[0], straddle], 0, 1.5)).toEqual([words[0], straddle]);
  });

  it('includes a trailing word whose end extends past segment end', () => {
    const trailing = { word: 'last', start: 1.2, end: 1.7 };
    expect(projectWordsToSourceRange([trailing], 0, 1.5)).toEqual([trailing]);
  });
});
