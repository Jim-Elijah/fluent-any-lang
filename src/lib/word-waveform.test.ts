import { describe, expect, it } from 'vitest';

import type { PracticeSegment, PronunciationWordScore } from '../types/models.js';
import {
  layoutWordMarkers,
  wordMarkersForPreview,
  wordMarkersForSourcePreview,
  wordsInPracticeSegment,
} from './word-waveform.js';

const segments: PracticeSegment[] = [
  {
    id: 'p0',
    sourceStartTime: 0,
    sourceEndTime: 5,
    recordingStartTime: 0,
    recordingEndTime: 4.5,
  },
  {
    id: 'p1',
    sourceStartTime: 5,
    sourceEndTime: 10,
    recordingStartTime: 4.5,
    recordingEndTime: 9,
  },
];

const hello: PronunciationWordScore = { word: 'hello', start: 0.12, end: 0.45, score: 90 };
const world: PronunciationWordScore = { word: 'world', start: 1, end: 1.5, score: 70 };
const foo: PronunciationWordScore = { word: 'foo', start: 5, end: 5.4, score: 40 };
const gapWord: PronunciationWordScore = { word: 'uh', start: 9.2, end: 9.4, score: 50 };

describe('wordsInPracticeSegment', () => {
  it('keeps words whose midpoint falls in the Practice Segment recording window', () => {
    expect(wordsInPracticeSegment([hello, world, foo], segments, 0)).toEqual([hello, world]);
    expect(wordsInPracticeSegment([hello, world, foo], segments, 1)).toEqual([foo]);
  });

  it('assigns a word on the shared recording boundary to the later Practice Segment', () => {
    const onBoundary: PronunciationWordScore = { word: 'join', start: 4.4, end: 4.6, score: 80 };
    expect(wordsInPracticeSegment([onBoundary], segments, 0)).toEqual([]);
    expect(wordsInPracticeSegment([onBoundary], segments, 1)).toEqual([onBoundary]);
  });

  it('returns no words for an out-of-range Practice Segment index', () => {
    expect(wordsInPracticeSegment([hello], segments, -1)).toEqual([]);
    expect(wordsInPracticeSegment([hello], segments, 9)).toEqual([]);
  });
});

describe('layoutWordMarkers', () => {
  it('places a word at its start with width matching pronunciation duration', () => {
    expect(layoutWordMarkers([world], { start: 0, end: 4 })).toEqual([
      { word: 'world', start: 1, end: 1.5, score: 70, leftPct: 25, widthPct: 12.5 },
    ]);
  });

  it('clips a word that straddles the view start and omits words fully outside', () => {
    const early: PronunciationWordScore = { word: 'a', start: 0.5, end: 1.5, score: 80 };
    const late: PronunciationWordScore = { word: 'z', start: 8, end: 9, score: 80 };
    expect(layoutWordMarkers([early, late], { start: 1, end: 3 })).toEqual([
      { word: 'a', start: 0.5, end: 1.5, score: 80, leftPct: 0, widthPct: 25 },
    ]);
  });

  it('shrinks a word that overlaps the next marker start', () => {
    const a: PronunciationWordScore = { word: 'a', start: 0, end: 2, score: 80 };
    const b: PronunciationWordScore = { word: 'b', start: 1, end: 1.5, score: 70 };
    expect(layoutWordMarkers([a, b], { start: 0, end: 4 })).toEqual([
      { word: 'a', start: 0, end: 2, score: 80, leftPct: 0, widthPct: 25 },
      { word: 'b', start: 1, end: 1.5, score: 70, leftPct: 25, widthPct: 12.5 },
    ]);
  });

  it('uses gap-to-next as width in compact layout', () => {
    expect(layoutWordMarkers([hello, world], { start: 0, end: 4 }, 'compact')).toEqual([
      { word: 'hello', start: 0.12, end: 0.45, score: 90, leftPct: 3, widthPct: 22 },
      { word: 'world', start: 1, end: 1.5, score: 70, leftPct: 25, widthPct: 100 },
    ]);
  });

  it('returns no markers when the view range has no duration', () => {
    expect(layoutWordMarkers([world], { start: 2, end: 2 })).toEqual([]);
  });
});

describe('wordMarkersForPreview', () => {
  it('layouts the current Practice Segment words on the recording view range', () => {
    expect(
      wordMarkersForPreview({
        words: [hello, world, foo, gapWord],
        segments,
        segmentIndex: 0,
        recordingViewRange: { start: 0, end: 4 },
      }),
    ).toEqual([
      { word: 'hello', start: 0.12, end: 0.45, score: 90, leftPct: 3, widthPct: 8.25 },
      { word: 'world', start: 1, end: 1.5, score: 70, leftPct: 25, widthPct: 12.5 },
    ]);
  });

  it('falls back to the Practice Segment recording span when no view range is set', () => {
    const markers = wordMarkersForPreview({
      words: [foo],
      segments,
      segmentIndex: 1,
      recordingViewRange: null,
    });
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ word: 'foo', start: 5, end: 5.4, score: 40 });
    expect(markers[0].leftPct).toBeCloseTo(11.11, 2);
    expect(markers[0].widthPct).toBeCloseTo(8.89, 2);
  });
});

describe('wordMarkersForSourcePreview', () => {
  it('layouts align words on the source view range without scores', () => {
    const markers = wordMarkersForSourcePreview({
      words: [
        { word: 'hello', start: 0.12, end: 0.45 },
        { word: 'world', start: 1, end: 1.5 },
        { word: 'foo', start: 5, end: 5.4 },
      ],
      segments,
      segmentIndex: 0,
      sourceViewRange: { start: 0, end: 4 },
    });
    expect(markers).toEqual([
      { word: 'hello', start: 0.12, end: 0.45, score: undefined, leftPct: 3, widthPct: 8.25 },
      { word: 'world', start: 1, end: 1.5, score: undefined, leftPct: 25, widthPct: 12.5 },
    ]);
  });
});
