import { describe, expect, it, vi } from 'vitest';

import {
  fetchReleaseNotes,
  hasReleaseHighlights,
  highlightSectionsForLocale,
  RELEASE_NOTES_FALLBACK_LOCALE,
  type ReleaseNotes,
} from './release-notes.js';

const sample: ReleaseNotes = {
  version: '0.4.0',
  highlights: {
    'zh-CN': [
      {
        category: 'features',
        label: '新功能',
        items: ['中文要点'],
      },
    ],
    en: [
      {
        category: 'features',
        label: 'Features',
        items: ['English tip'],
      },
    ],
    ja: [],
    'zh-TW': [],
  },
};

describe('highlightSectionsForLocale', () => {
  it('returns the requested locale when present', () => {
    expect(highlightSectionsForLocale(sample, 'en')).toEqual(sample.highlights.en);
  });

  it('falls back to English when locale is missing or empty', () => {
    expect(highlightSectionsForLocale(sample, 'ja')).toEqual(sample.highlights.en);
    expect(highlightSectionsForLocale(sample, 'fr')).toEqual(sample.highlights.en);
    expect(RELEASE_NOTES_FALLBACK_LOCALE).toBe('en');
  });
});

describe('hasReleaseHighlights', () => {
  it('reflects whether a locale has section items', () => {
    expect(hasReleaseHighlights(sample, 'en')).toBe(true);
    expect(hasReleaseHighlights(sample, 'ja')).toBe(true);
    expect(
      hasReleaseHighlights({
        version: '0.0.0',
        highlights: { en: [] },
      }),
    ).toBe(false);
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

    const invalidShape = vi.fn(async () =>
      Response.json({ version: '1.0.0', highlights: { en: 'not-sections' } }, { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await fetchReleaseNotes(invalidShape)).toBeNull();
  });
});
