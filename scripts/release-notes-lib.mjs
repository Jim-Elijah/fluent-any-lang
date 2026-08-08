import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(__dirname, '..');

/** CHANGELOG.md is English; release-notes highlights are keyed by this locale first. */
export const CHANGELOG_LOCALE = 'en';

/**
 * @param {string} [rootDir]
 * @returns {{ locales: string[] }}
 */
export function readLocales(rootDir = ROOT_DIR) {
  const config = JSON.parse(readFileSync(resolve(rootDir, 'lit-localize.json'), 'utf8'));
  const sourceLocale = config.sourceLocale;
  const targetLocales = Array.isArray(config.targetLocales) ? config.targetLocales : [];
  if (typeof sourceLocale !== 'string' || !sourceLocale) {
    throw new Error('lit-localize.json: missing sourceLocale');
  }
  const locales = [sourceLocale, ...targetLocales.filter((l) => l !== sourceLocale)];
  if (!locales.includes(CHANGELOG_LOCALE)) {
    throw new Error(
      `lit-localize.json must include changelog locale "${CHANGELOG_LOCALE}" (source or target)`,
    );
  }
  return { locales };
}

/**
 * @param {string} [rootDir]
 * @returns {string}
 */
export function readPackageVersion(rootDir = ROOT_DIR) {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
  if (typeof pkg.version !== 'string' || !pkg.version) {
    throw new Error('package.json: missing version');
  }
  return pkg.version;
}

/**
 * Strip trailing commit hash / markdown link from a changelog bullet.
 * @param {string} line
 * @returns {string}
 */
export function cleanChangelogBullet(line) {
  let text = line.replace(/^\s*[-*]\s+/, '').trim();
  // "… ([abc1234](url))" or "… (abc1234)"
  text = text.replace(/\s+\(\[[0-9a-f]{7,40}\]\([^)]+\)\)\s*$/i, '');
  text = text.replace(/\s+\([0-9a-f]{7,40}\)\s*$/i, '');
  // "**app:** …" → "app: …" (plain text UI, not markdown)
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  return text.trim();
}

/**
 * Parse the latest `## [x.y.z]` / `## x.y.z` section into bullet highlights.
 * @param {string} markdown
 * @returns {{ version: string | null, highlights: string[] }}
 */
export function parseLatestChangelogSection(markdown) {
  const headingRe = /^##\s+(?:\[([^\]]+)\]|([0-9]+\.[0-9]+\.[0-9][^\s]*))/gm;
  const matches = [...markdown.matchAll(headingRe)];
  if (matches.length === 0) {
    return { version: null, highlights: [] };
  }

  const first = matches[0];
  const version = (first[1] ?? first[2] ?? '').trim() || null;
  const start = first.index + first[0].length;
  const end = matches[1]?.index ?? markdown.length;
  const body = markdown.slice(start, end);

  const highlights = [];
  for (const line of body.split('\n')) {
    if (!/^\s*[-*]\s+/.test(line)) continue;
    const cleaned = cleanChangelogBullet(line);
    if (cleaned) highlights.push(cleaned);
  }

  return { version, highlights };
}

/**
 * @typedef {{ version: string, highlights: Record<string, string[]> }} ReleaseNotesFile
 */

/**
 * @param {object} opts
 * @param {string} opts.version
 * @param {string} [opts.changelogLocale]
 * @param {string[]} opts.locales
 * @param {string[]} opts.sourceHighlights
 * @param {ReleaseNotesFile | null} [opts.existing]
 * @returns {ReleaseNotesFile}
 */
export function buildReleaseNotes({
  version,
  changelogLocale = CHANGELOG_LOCALE,
  locales,
  sourceHighlights,
  existing = null,
}) {
  /** @type {Record<string, string[]>} */
  const highlights = {};
  const sameVersion = existing?.version === version;

  for (const locale of locales) {
    if (locale === changelogLocale) {
      highlights[locale] = [...sourceHighlights];
      continue;
    }
    const prev = sameVersion ? existing?.highlights?.[locale] : undefined;
    highlights[locale] = Array.isArray(prev) && prev.length > 0 ? [...prev] : [];
  }

  return { version, highlights };
}

/**
 * @param {unknown} notes
 * @param {{ version: string, locales: string[] }} expected
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function checkReleaseNotes(notes, expected) {
  /** @type {string[]} */
  const errors = [];

  if (!notes || typeof notes !== 'object') {
    return { ok: false, errors: ['release-notes.json is missing or not an object'] };
  }

  const data = /** @type {Record<string, unknown>} */ (notes);
  if (data.version !== expected.version) {
    errors.push(
      `version mismatch: release-notes has "${String(data.version)}" but package.json has "${expected.version}"`,
    );
  }

  const highlights = data.highlights;
  if (!highlights || typeof highlights !== 'object') {
    errors.push('highlights must be an object keyed by locale');
    return { ok: false, errors };
  }

  const map = /** @type {Record<string, unknown>} */ (highlights);
  for (const locale of expected.locales) {
    const items = map[locale];
    if (!Array.isArray(items)) {
      errors.push(`highlights["${locale}"] must be an array`);
      continue;
    }
    if (items.length === 0) {
      errors.push(`highlights["${locale}"] is empty — fill translations before release:commit`);
      continue;
    }
    if (!items.every((item) => typeof item === 'string' && item.trim().length > 0)) {
      errors.push(`highlights["${locale}"] must contain non-empty strings`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * @param {string} [rootDir]
 * @returns {ReleaseNotesFile | null}
 */
export function readExistingReleaseNotes(rootDir = ROOT_DIR) {
  const path = resolve(rootDir, 'public/release-notes.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {ReleaseNotesFile} notes
 * @param {string} [rootDir]
 */
export function writeReleaseNotes(notes, rootDir = ROOT_DIR) {
  const path = resolve(rootDir, 'public/release-notes.json');
  writeFileSync(path, `${JSON.stringify(notes, null, 2)}\n`, 'utf8');
  return path;
}

/**
 * @param {string} [rootDir]
 * @returns {ReleaseNotesFile}
 */
export function generateReleaseNotes(rootDir = ROOT_DIR) {
  const { locales } = readLocales(rootDir);
  const version = readPackageVersion(rootDir);
  const changelog = readFileSync(resolve(rootDir, 'CHANGELOG.md'), 'utf8');
  const { highlights: sourceHighlights } = parseLatestChangelogSection(changelog);
  const existing = readExistingReleaseNotes(rootDir);

  return buildReleaseNotes({
    version,
    changelogLocale: CHANGELOG_LOCALE,
    locales,
    sourceHighlights,
    existing,
  });
}
