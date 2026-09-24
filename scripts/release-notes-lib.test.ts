import { describe, expect, it } from 'vitest';

import {
  buildReleaseNotes,
  checkReleaseNotes,
  cleanChangelogBullet,
  localeHighlightsFilled,
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
  it('strips markdown commit links, bare hashes, and bold markers', () => {
    expect(
      cleanChangelogBullet('* **pwa:** show notes ([abc1234](https://example.com/commit/abc1234))'),
    ).toBe('pwa: show notes');
    expect(cleanChangelogBullet('* fix locale fallback (aabbccd)')).toBe('fix locale fallback');
  });
});

describe('parseLatestChangelogSection', () => {
  it('parses the latest section into Features / Bug Fixes groups', () => {
    const { version, sections } = parseLatestChangelogSection(SAMPLE_CHANGELOG);
    expect(version).toBe('0.4.0');
    expect(sections).toEqual([
      {
        category: 'features',
        label: 'Features',
        items: ['pwa: show release notes on update', 'settings: add player defaults'],
      },
      {
        category: 'bugFixes',
        label: 'Bug Fixes',
        items: ['fix locale fallback'],
      },
    ]);
    expect(JSON.stringify(sections)).not.toContain('old feature');
  });

  it('supports unbracketed headings without ### groups', () => {
    const { version, sections } = parseLatestChangelogSection(
      '## 0.1.0 (2026-07-12)\n\n* add router ([97a7f5d](https://x/97a7f5d))\n',
    );
    expect(version).toBe('0.1.0');
    expect(sections).toEqual([]);
  });
});

describe('localeHighlightsFilled', () => {
  it('is true when any section has items', () => {
    expect(
      localeHighlightsFilled([
        { category: 'features', label: 'Features', items: ['pwa: one'] },
      ]),
    ).toBe(true);
    expect(localeHighlightsFilled([])).toBe(false);
    expect(localeHighlightsFilled([{ category: 'features', label: 'Features', items: [] }])).toBe(
      false,
    );
  });
});

describe('buildReleaseNotes', () => {
  const locales = ['zh-CN', 'en', 'ja', 'zh-TW'];
  const sourceSections = [
    {
      category: 'features',
      label: 'Features',
      items: ['Highlight A', 'Highlight B'],
    },
  ];

  it('overwrites changelog locale (en) and keeps same-version translations', () => {
    const notes = buildReleaseNotes({
      version: '0.4.0',
      changelogLocale: 'en',
      locales,
      sourceSections,
      existing: {
        version: '0.4.0',
        highlights: {
          'zh-CN': [{ category: 'features', label: '新功能', items: ['既有简中'] }],
          en: [{ category: 'features', label: 'Features', items: ['Old EN'] }],
          ja: [],
          'zh-TW': [{ category: 'features', label: '新功能', items: ['既有繁中'] }],
        },
      },
    });

    expect(notes.highlights.en).toEqual(sourceSections);
    expect(notes.highlights['zh-CN']).toEqual([
      { category: 'features', label: '新功能', items: ['既有简中'] },
    ]);
    expect(notes.highlights.ja).toEqual([]);
    expect(notes.highlights['zh-TW']).toEqual([
      { category: 'features', label: '新功能', items: ['既有繁中'] },
    ]);
  });

  it('drops other-locale text when version changes', () => {
    const notes = buildReleaseNotes({
      version: '0.5.0',
      changelogLocale: 'en',
      locales,
      sourceSections: [{ category: 'features', label: 'Features', items: ['Next release'] }],
      existing: {
        version: '0.4.0',
        highlights: {
          'zh-CN': [{ category: 'features', label: '新功能', items: ['旧'] }],
          en: [{ category: 'features', label: 'Features', items: ['Old EN'] }],
          ja: [{ category: 'features', label: '新機能', items: ['旧日'] }],
          'zh-TW': [{ category: 'features', label: '新功能', items: ['舊繁'] }],
        },
      },
    });

    expect(notes.highlights.en).toEqual([
      { category: 'features', label: 'Features', items: ['Next release'] },
    ]);
    expect(notes.highlights['zh-CN']).toEqual([]);
    expect(notes.highlights.ja).toEqual([]);
    expect(notes.highlights['zh-TW']).toEqual([]);
  });
});

describe('checkReleaseNotes', () => {
  const expected = { version: '0.4.0', locales: ['zh-CN', 'en', 'ja', 'zh-TW'] };
  const filledSection = {
    category: 'features',
    label: 'Features',
    items: ['one'],
  };

  it('passes when version matches and every locale is non-empty', () => {
    const result = checkReleaseNotes(
      {
        version: '0.4.0',
        highlights: {
          'zh-CN': [{ ...filledSection, label: '新功能', items: ['一'] }],
          en: [filledSection],
          ja: [{ ...filledSection, label: '新機能', items: ['いち'] }],
          'zh-TW': [{ ...filledSection, label: '新功能', items: ['一'] }],
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
          'zh-CN': [filledSection],
          en: [filledSection],
          ja: [filledSection],
          'zh-TW': [filledSection],
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
          'zh-CN': [filledSection],
          en: [],
          ja: [filledSection],
          'zh-TW': [filledSection],
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
