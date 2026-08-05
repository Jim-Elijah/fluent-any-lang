import { getLocale } from '../i18n/localization.js';
import { sourceLocale } from '../locales/locale-codes.js';

export type ReleaseNotes = {
  version: string;
  highlights: Record<string, string[]>;
};

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

export function highlightsForLocale(notes: ReleaseNotes, locale?: string): string[] {
  const resolved = locale ?? getLocale();
  const direct = notes.highlights[resolved];
  if (Array.isArray(direct) && direct.length > 0) return direct;

  const fallback = notes.highlights[sourceLocale];
  if (Array.isArray(fallback) && fallback.length > 0) return fallback;

  return [];
}

function isReleaseNotes(value: unknown): value is ReleaseNotes {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (typeof record.version !== 'string' || !record.version) return false;
  if (!record.highlights || typeof record.highlights !== 'object') return false;
  return true;
}
