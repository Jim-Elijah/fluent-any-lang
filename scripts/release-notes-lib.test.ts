import { describe, expect, it } from 'vitest';

import {
  buildReleaseNotes,
  checkReleaseNotes,
  cleanChangelogBullet,
  parseLatestChangelogSection,
} from './release-notes-lib.mjs';

const SAMPLE_CHANGELOG = `## [0.4.0](https://example.com/compare/v0.3.0...v0.4.0) (2026-08-05)

### Features

* **pwa:** show release notes on update ([abc1234](https://example.com/commit/abc1234))
* **settings:** add player defaults ([def5678](https://example.com/commit/def5678))

### Bug Fixes

* fix locale fallback (aabbccd)

## [0.3.0](https://example.com/compare/v0.2.0...v0.3.0) (2026-07-26)

### Features

* old feature ([1111111](https://example.com/commit/1111111))
`;

describe('cleanChangelogBullet', () => {
  it('strips markdown commit links and bare hashes', () => {
    expect(
      cleanChangelogBullet('* **pwa:** show notes ([abc1234](https://example.com/commit/abc1234))'),
    ).toBe('**pwa:** show notes');
    expect(cleanChangelogBullet('* fix locale fallback (aabbccd)')).toBe('fix locale fallback');
  });
});

describe('parseLatestChangelogSection', () => {
  it('parses the latest section only and cleans bullets', () => {
    const { version, highlights } = parseLatestChangelogSection(SAMPLE_CHANGELOG);
    expect(version).toBe('0.4.0');
    expect(highlights).toEqual([
      '**pwa:** show release notes on update',
      '**settings:** add player defaults',
      'fix locale fallback',
    ]);
    expect(highlights.join('')).not.toContain('old feature');
  });

  it('supports unbracketed headings', () => {
    const { version, highlights } = parseLatestChangelogSection(
      '## 0.1.0 (2026-07-12)\n\n* add router ([97a7f5d](https://x/97a7f5d))\n',
    );
    expect(version).toBe('0.1.0');
    expect(highlights).toEqual(['add router']);
  });
});

describe('buildReleaseNotes', () => {
  const locales = ['zh-CN', 'en', 'ja', 'zh-TW'];

  it('overwrites source locale and keeps same-version translations', () => {
    const notes = buildReleaseNotes({
      version: '0.4.0',
      sourceLocale: 'zh-CN',
      locales,
      sourceHighlights: ['新要点 A', '新要点 B'],
      existing: {
        version: '0.4.0',
        highlights: {
          'zh-CN': ['旧草稿'],
          en: ['Existing EN'],
          ja: [],
          'zh-TW': ['既有繁中'],
        },
      },
    });

    expect(notes.highlights['zh-CN']).toEqual(['新要点 A', '新要点 B']);
    expect(notes.highlights.en).toEqual(['Existing EN']);
    expect(notes.highlights.ja).toEqual([]);
    expect(notes.highlights['zh-TW']).toEqual(['既有繁中']);
  });

  it('drops other-locale text when version changes', () => {
    const notes = buildReleaseNotes({
      version: '0.5.0',
      sourceLocale: 'zh-CN',
      locales,
      sourceHighlights: ['下一版'],
      existing: {
        version: '0.4.0',
        highlights: {
          'zh-CN': ['旧'],
          en: ['Old EN'],
          ja: ['旧日'],
          'zh-TW': ['舊繁'],
        },
      },
    });

    expect(notes.highlights['zh-CN']).toEqual(['下一版']);
    expect(notes.highlights.en).toEqual([]);
    expect(notes.highlights.ja).toEqual([]);
    expect(notes.highlights['zh-TW']).toEqual([]);
  });
});

describe('checkReleaseNotes', () => {
  const expected = { version: '0.4.0', locales: ['zh-CN', 'en', 'ja', 'zh-TW'] };

  it('passes when version matches and every locale is non-empty', () => {
    const result = checkReleaseNotes(
      {
        version: '0.4.0',
        highlights: {
          'zh-CN': ['一'],
          en: ['one'],
          ja: ['いち'],
          'zh-TW': ['一'],
        },
      },
      expected,
    );
    expect(result).toEqual({ ok: true });
  });

  it('fails on version mismatch', () => {
    const result = checkReleaseNotes(
      {
        version: '0.3.0',
        highlights: {
          'zh-CN': ['一'],
          en: ['one'],
          ja: ['いち'],
          'zh-TW': ['一'],
        },
      },
      expected,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('version mismatch'))).toBe(true);
    }
  });

  it('fails when a locale is empty', () => {
    const result = checkReleaseNotes(
      {
        version: '0.4.0',
        highlights: {
          'zh-CN': ['一'],
          en: [],
          ja: ['いち'],
          'zh-TW': ['一'],
        },
      },
      expected,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('en'))).toBe(true);
    }
  });
});
