import { describe, expect, it } from 'vitest';

import {
  ALIGN_API_PATH,
  isSpeechAlignConfigured,
  suggestAlignApiUrlFromScoreUrl,
  toAlignApiUrl,
} from './constants.js';
import { SCORE_API_PATH } from '../pronunciation-score/constants.js';

describe('pronunciation-align constants', () => {
  it('joins bare hosts to the align path', () => {
    expect(toAlignApiUrl('https://speech.example.com')).toBe(
      `https://speech.example.com${ALIGN_API_PATH}`,
    );
  });

  it('leaves a complete align URL unchanged', () => {
    expect(toAlignApiUrl(`https://speech.example.com${ALIGN_API_PATH}`)).toBe(
      `https://speech.example.com${ALIGN_API_PATH}`,
    );
  });

  it('suggests align URL by swapping the score path', () => {
    expect(suggestAlignApiUrlFromScoreUrl(`https://speech.example.com${SCORE_API_PATH}`)).toBe(
      `https://speech.example.com${ALIGN_API_PATH}`,
    );
    expect(
      suggestAlignApiUrlFromScoreUrl('https://speech.example.com/api/v1/pronunciation/score'),
    ).toBe(`https://speech.example.com${ALIGN_API_PATH}`);
  });

  it('requires align URL and API key', () => {
    expect(
      isSpeechAlignConfigured({
        speechAlignApiUrl: `https://speech.example.com${ALIGN_API_PATH}`,
        speechScoreApiKey: 'k',
      }),
    ).toBe(true);
    expect(
      isSpeechAlignConfigured({
        speechAlignApiUrl: '',
        speechScoreApiKey: 'k',
      }),
    ).toBe(false);
  });
});
