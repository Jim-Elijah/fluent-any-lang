#!/usr/bin/env node
/**
 * List lit-localize XLIFF units that have <source> but no <target>.
 * Usage:
 *   node scripts/xliff-missing.mjs
 *   node scripts/xliff-missing.mjs --json
 *   node scripts/xliff-missing.mjs xliff/ja.xlf
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const XLIFF_DIR = resolve(ROOT_DIR, 'xliff');

const UNIT_RE = /<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/gi;
const ATTR_RE = /\bid\s*=\s*(["'])(.*?)\1/i;
const FILE_ATTR_RE = /<(?:file)\b([^>]*)>/i;
const LANG_ATTR_RE = /\b(source-language|target-language)\s*=\s*(["'])(.*?)\2/gi;
const SOURCE_RE = /<source\b[^>]*>([\s\S]*?)<\/source>/i;
const TARGET_RE = /<target\b/i;

/**
 * @param {string} attrs
 * @returns {{ sourceLanguage: string, targetLanguage: string }}
 */
function parseFileLangs(attrs) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const m of attrs.matchAll(LANG_ATTR_RE)) {
    out[m[1]] = m[3];
  }
  return {
    sourceLanguage: out['source-language'] ?? '',
    targetLanguage: out['target-language'] ?? '',
  };
}

/**
 * @param {string} filePath
 * @returns {{ file: string, sourceLanguage: string, targetLanguage: string, units: { id: string, source: string }[] }}
 */
function findMissingInFile(filePath) {
  const xml = readFileSync(filePath, 'utf8');
  const fileMatch = xml.match(FILE_ATTR_RE);
  const { sourceLanguage, targetLanguage } = parseFileLangs(fileMatch?.[1] ?? '');

  /** @type {{ id: string, source: string }[]} */
  const units = [];
  for (const m of xml.matchAll(UNIT_RE)) {
    const attrs = m[1];
    const body = m[2];
    const idMatch = attrs.match(ATTR_RE);
    const id = idMatch?.[2] ?? '';
    const sourceMatch = body.match(SOURCE_RE);
    if (!sourceMatch) continue;
    if (TARGET_RE.test(body)) continue;
    units.push({ id, source: sourceMatch[1] });
  }

  return {
    file: relative(ROOT_DIR, filePath).replace(/\\/g, '/'),
    sourceLanguage,
    targetLanguage,
    units,
  };
}

/**
 * @param {string[]} args
 * @returns {{ json: boolean, paths: string[] }}
 */
function parseArgs(args) {
  const json = args.includes('--json');
  const paths = args.filter((a) => a !== '--json');
  return { json, paths };
}

function defaultXliffPaths() {
  return readdirSync(XLIFF_DIR)
    .filter((name) => name.endsWith('.xlf'))
    .sort()
    .map((name) => resolve(XLIFF_DIR, name));
}

function main() {
  const { json, paths } = parseArgs(process.argv.slice(2));
  const files = (paths.length > 0 ? paths : defaultXliffPaths()).map((p) =>
    resolve(ROOT_DIR, p),
  );

  const results = files.map(findMissingInFile);
  const total = results.reduce((n, r) => n + r.units.length, 0);

  if (json) {
    console.log(JSON.stringify({ total, files: results }, null, 2));
    return;
  }

  if (total === 0) {
    console.log('No missing targets.');
    return;
  }

  for (const r of results) {
    if (r.units.length === 0) continue;
    console.log(
      `## ${r.file} (${r.sourceLanguage} → ${r.targetLanguage}) — ${r.units.length} missing`,
    );
    for (const u of r.units) {
      console.log(`- id=${u.id}`);
      console.log(`  source: ${u.source}`);
    }
    console.log('');
  }
  console.log(`Total missing: ${total}`);
}

main();
