import { describe, expect, it, vi } from 'vitest';

import { fetchReleaseNotes, highlightsForLocale, type ReleaseNotes } from './release-notes.js';
import { sourceLocale } from '../locales/locale-codes.js';

const sample: ReleaseNotes = {
  version: '0.4.0',
  highlights: {
    'zh-CN': ['中文要点'],
    en: ['English tip'],
    ja: [],
    'zh-TW': [],
  },
};

describe('highlightsForLocale', () => {
  it('returns the requested locale when present', () => {
    expect(highlightsForLocale(sample, 'en')).toEqual(['English tip']);
  });

  it('falls back to sourceLocale when locale is missing or empty', () => {
    expect(highlightsForLocale(sample, 'ja')).toEqual(['中文要点']);
    expect(highlightsForLocale(sample, 'fr')).toEqual(['中文要点']);
    expect(sourceLocale).toBe('zh-CN');
  });
});

describe('fetchReleaseNotes', () => {
  it('fetches with cache no-store and returns parsed notes', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(sample, { status: 200 }),
    ) as unknown as typeof fetch;

    const notes = await fetchReleaseNotes(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('/release-notes.json', { cache: 'no-store' });
    expect(notes).toEqual(sample);
  });

  it('returns null on HTTP or parse failure', async () => {
    const notFound = vi.fn(
      async () => new Response('', { status: 404 }),
    ) as unknown as typeof fetch;
    expect(await fetchReleaseNotes(notFound)).toBeNull();

    const badJson = vi.fn(
      async () => new Response('not-json', { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await fetchReleaseNotes(badJson)).toBeNull();

    const network = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchReleaseNotes(network)).toBeNull();
  });
});
