import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PronunciationScoreApiResponse, ReferenceProsodyProfile } from '../../types/models.js';
import { PronunciationScoreHttpError, mapScoreHttpStatus, scorePronunciation } from './client.js';
import { SCORE_API_PATH } from './constants.js';

const sampleProfile: ReferenceProsodyProfile = {
  version: '1',
  profile_hash: 'abc123',
  reference_duration_sec: 2,
  language: 'en',
  reference_text: 'hello world',
  speech_span_sec: 1.8,
  words: [{ word: 'hello', start: 0, end: 0.5, duration_ratio: 0.5 }],
  f0_contour: [0.5, 1],
  energy_contour: [0.4, 0.9],
};

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
    misread_words: [],
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
      url: `http://localhost:8000${SCORE_API_PATH}`,
      apiKey: 'test-key',
      audio,
      referenceText: 'hello world',
      referenceDuration: 3.5,
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
    expect(form.get('reference_duration')).toBe('3.5');
    expect(form.get('language')).toBe('en');
    expect(form.get('reference_audio')).toBeNull();
    expect(form.get('reference_prosody_profile')).toBeNull();
    const audioPart = form.get('audio');
    expect(audioPart).toBeInstanceOf(Blob);
  });

  it('sends reference_prosody_profile and omits reference_audio', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(successBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await scorePronunciation({
      url: `http://localhost:8000${SCORE_API_PATH}`,
      apiKey: 'key',
      audio: new Blob(['x'], { type: 'audio/webm' }),
      referenceText: 'hello world',
      referenceDuration: 2,
      language: 'en',
      referenceProsodyProfile: sampleProfile,
      referenceAudio: new Blob(['ref'], { type: 'audio/wav' }),
      referenceAudioRoles: 'prosody',
    });

    const form = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect(form.get('reference_prosody_profile')).toBe(JSON.stringify(sampleProfile));
    expect(form.get('reference_audio')).toBeNull();
    expect(form.get('reference_audio_roles')).toBeNull();
  });

  it('sends reference_audio with roles when no profile is provided', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(successBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const refAudio = new Blob(['ref'], { type: 'audio/wav' });

    await scorePronunciation({
      url: `http://localhost:8000${SCORE_API_PATH}`,
      apiKey: 'key',
      audio: new Blob(['x'], { type: 'audio/webm' }),
      referenceText: 'hello world',
      referenceDuration: 2,
      language: 'en',
      referenceAudio: refAudio,
      referenceAudioRoles: 'prosody',
    });

    const form = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect(form.get('reference_audio')).toBeInstanceOf(Blob);
    expect(form.get('reference_audio_roles')).toBe('prosody');
    expect(form.get('reference_prosody_profile')).toBeNull();
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
        url: 'http://api.example/api/v1/pronunciation/score',
        apiKey: 'bad',
        audio: new Blob(['x'], { type: 'audio/webm' }),
        referenceText: 'hi',
        referenceDuration: 1,
        language: 'auto',
      }),
    ).rejects.toMatchObject({
      name: 'PronunciationScoreHttpError',
      status: 401,
      code: 'unauthorized',
    } satisfies Partial<PronunciationScoreHttpError>);
  });
});
