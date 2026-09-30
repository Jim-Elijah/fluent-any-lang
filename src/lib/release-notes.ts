import { getLocale } from '../i18n/localization.js';

export type ReleaseNotesCategory = 'features' | 'bugFixes';

export type ReleaseNotesSection = {
  category: ReleaseNotesCategory;
  label: string;
  items: string[];
};

export type ReleaseNotes = {
  version: string;
  highlights: Record<string, ReleaseNotesSection[]>;
};

/** Matches scripts/release-notes-lib.mjs CHANGELOG_LOCALE — CHANGELOG.md is English. */
export const RELEASE_NOTES_FALLBACK_LOCALE = 'en';

const RELEASE_NOTES_URL = '/release-notes.json';

export async function fetchReleaseNotes(
  fetchImpl: typeof fetch = fetch,
): Promise<ReleaseNotes | null> {
  try {
    const response = await fetchImpl(RELEASE_NOTES_URL, { cache: 'no-store' });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!isReleaseNotes(data)) return null;
    return data;
  } catch {
    return null;
  }
}

export function highlightSectionsForLocale(
  notes: ReleaseNotes,
  locale?: string,
): ReleaseNotesSection[] {
  const resolved = locale ?? getLocale();
  const direct = notes.highlights[resolved];
  if (localeHighlightsFilled(direct)) return direct;

  const fallback = notes.highlights[RELEASE_NOTES_FALLBACK_LOCALE];
  if (localeHighlightsFilled(fallback)) return fallback;

  return [];
}

export function hasReleaseHighlights(notes: ReleaseNotes, locale?: string): boolean {
  return highlightSectionsForLocale(notes, locale).length > 0;
}

function localeHighlightsFilled(
  sections: ReleaseNotesSection[] | undefined,
): sections is ReleaseNotesSection[] {
  if (!Array.isArray(sections) || sections.length === 0) return false;
  return sections.some(
    (section) =>
      section.items.length > 0 &&
      section.items.every((item) => typeof item === 'string' && item.trim().length > 0),
  );
}

function isReleaseNotesSection(value: unknown): value is ReleaseNotesSection {
  if (!value || typeof value !== 'object') return false;
  const section = value as Record<string, unknown>;
  if (typeof section.category !== 'string' || !section.category) return false;
  if (typeof section.label !== 'string' || !section.label.trim()) return false;
  const items = section.items;
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function isReleaseNotes(value: unknown): value is ReleaseNotes {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (typeof record.version !== 'string' || !record.version) return false;
  if (
    !record.highlights ||
    typeof record.highlights !== 'object' ||
    Array.isArray(record.highlights)
  ) {
    return false;
  }
  return Object.values(record.highlights as Record<string, unknown>).every(
    (sections) => Array.isArray(sections) && sections.every(isReleaseNotesSection),
  );
}
