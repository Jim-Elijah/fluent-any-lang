import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PronunciationAlignResponse } from '../../types/models.js';
import {
  PronunciationAlignHttpError,
  alignPronunciation,
  mapAlignFetchFailure,
  mapAlignHttpStatus,
} from './client.js';
import { ALIGN_API_PATH } from './constants.js';

const successBody: PronunciationAlignResponse = {
  reference_text: 'Hello world',
  words: [
    { word: 'Hello', start: 0.12, end: 0.48 },
    { word: 'world', start: 0.58, end: 0.95 },
  ],
  duration_sec: 4.2,
  speech_span_sec: 0.83,
  reference_newline: 'lf',
  meta: {
    model: 'whisperx-base',
    device: 'cpu',
    latency_ms: 1200,
    language: 'en',
  },
};

describe('pronunciation-align client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts multipart fields and API key without scoring fields', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(successBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const audio = new Blob(['abc'], { type: 'audio/webm' });

    const result = await alignPronunciation({
      url: `http://localhost:8000${ALIGN_API_PATH}`,
      apiKey: 'test-key',
      audio,
      referenceText: 'Hello world',
      language: 'en',
    });

    expect(result.words).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://localhost:8000${ALIGN_API_PATH}`);
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-key');
    const form = init.body as FormData;
    expect(form.get('reference_text')).toBe('Hello world');
    expect(form.get('language')).toBe('en');
    expect(form.get('reference_duration')).toBeNull();
    expect(form.get('reference_segments')).toBeNull();
    expect(form.get('audio')).toBeInstanceOf(Blob);
  });

  it('JSON-stringifies reference_segments when provided', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(successBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const audio = new Blob(['abc'], { type: 'audio/webm' });

    await alignPronunciation({
      url: `http://localhost:8000${ALIGN_API_PATH}`,
      apiKey: 'test-key',
      audio,
      referenceText: 'Hello world\nHow are you',
      referenceSegments: [
        { id: 's1', startTime: 0, endTime: 1.2, text: 'Hello world' },
        { id: 's2', startTime: 2.5, endTime: 4, text: 'How are you' },
      ],
      language: 'en',
    });

    const form = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect(form.get('reference_segments')).toBe(
      JSON.stringify([
        { id: 's1', startTime: 0, endTime: 1.2, text: 'Hello world' },
        { id: 's2', startTime: 2.5, endTime: 4, text: 'How are you' },
      ]),
    );
  });

  it('maps 422 to invalid', () => {
    expect(mapAlignHttpStatus(422).code).toBe('invalid');
    expect(mapAlignFetchFailure(new DOMException('Aborted', 'AbortError'))).toBeInstanceOf(
      PronunciationAlignHttpError,
    );
  });
});
