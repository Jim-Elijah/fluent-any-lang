import { describe, expect, it } from 'vitest';

import { SCORE_API_PATH, joinApiUrl, toScoreApiUrl } from './constants.js';

describe('pronunciation-score constants', () => {
  it('uses the v2 score path as the default canonical path', () => {
    expect(SCORE_API_PATH).toBe('/api/v2/pronunciation/score');
  });

  it('completes a host to the v2 path', () => {
    expect(toScoreApiUrl('https://speech.example.com')).toBe(
      'https://speech.example.com/api/v2/pronunciation/score',
    );
    expect(toScoreApiUrl('https://speech.example.com/')).toBe(
      'https://speech.example.com/api/v2/pronunciation/score',
    );
  });

  it('leaves complete v1 and v2 URLs unchanged', () => {
    expect(toScoreApiUrl('https://speech.example.com/api/v2/pronunciation/score')).toBe(
      'https://speech.example.com/api/v2/pronunciation/score',
    );
    expect(toScoreApiUrl('https://speech.example.com/api/v1/pronunciation/score')).toBe(
      'https://speech.example.com/api/v1/pronunciation/score',
    );
  });

  it('joins base and path without double slashes', () => {
    expect(joinApiUrl('https://host/', '/api/v2/pronunciation/score')).toBe(
      'https://host/api/v2/pronunciation/score',
    );
  });
});
