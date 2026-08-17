import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PronunciationScoreApiResponse } from '../../types/models.js';
import {
  PronunciationScoreHttpError,
  checkSpeechScoreHealth,
  mapScoreHttpStatus,
  scorePronunciation,
} from './client.js';
import { SCORE_API_PATH, SCORE_HEALTH_PATH } from './constants.js';

const successBody: PronunciationScoreApiResponse = {
  accuracy: 82.5,
  fluency: 76,
  completeness: 95,
  prosody: 81,
  overall: 84.2,
  details: {
    transcript: 'hello',
    word_scores: [{ word: 'hello', start: 0.1, end: 0.4, score: 90 }],
    missing_words: [],
    extra_words: [],
    prosody_breakdown: {
      speed: 100,
      rhythm: 85,
      intonation: 78,
      stress: 82,
    },
  },
  meta: {
    model: 'whisperx-base',
    device: 'cpu',
    latency_ms: 1200,
    reference_source: 'text',
  },
};

describe('pronunciation-score client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts multipart fields and API key', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(successBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const audio = new Blob(['abc'], { type: 'audio/webm' });

    const result = await scorePronunciation({
      baseUrl: 'http://localhost:8000/',
      apiKey: 'test-key',
      audio,
      referenceText: 'hello world',
      language: 'en',
    });

    expect(result.overall).toBe(84.2);
    expect(result.prosody).toBe(81);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://localhost:8000${SCORE_API_PATH}`);
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-key');
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('reference_text')).toBe('hello world');
    expect(form.get('language')).toBe('en');
    const audioPart = form.get('audio');
    expect(audioPart).toBeInstanceOf(Blob);
  });

  it('maps HTTP error codes to user-facing messages', async () => {
    expect(mapScoreHttpStatus(401)).toEqual({
      code: 'unauthorized',
      message: 'API Key 无效或已过期，请检查设置',
    });
    expect(mapScoreHttpStatus(429).code).toBe('quota');

    fetchMock.mockResolvedValue(new Response('nope', { status: 401 }));

    await expect(
      scorePronunciation({
        baseUrl: 'http://api.example',
        apiKey: 'bad',
        audio: new Blob(['x'], { type: 'audio/webm' }),
        referenceText: 'hi',
        language: 'auto',
      }),
    ).rejects.toMatchObject({
      name: 'PronunciationScoreHttpError',
      status: 401,
      code: 'unauthorized',
    } satisfies Partial<PronunciationScoreHttpError>);
  });

  it('calls GET /health without an API key', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', device: 'cpu', model_loaded: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const health = await checkSpeechScoreHealth('http://localhost:8000');
    expect(health.device).toBe('cpu');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://localhost:8000${SCORE_HEALTH_PATH}`);
    expect(init?.headers).toBeUndefined();
  });
});
