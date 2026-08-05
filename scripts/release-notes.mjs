#!/usr/bin/env node
import { execSync } from 'node:child_process';

import {
  CHANGELOG_LOCALE,
  ROOT_DIR,
  generateReleaseNotes,
  readLocales,
  writeReleaseNotes,
} from './release-notes-lib.mjs';

function main() {
  console.log('Running changelog…');
  execSync('pnpm run changelog', { cwd: ROOT_DIR, stdio: 'inherit' });

  const notes = generateReleaseNotes(ROOT_DIR);
  const path = writeReleaseNotes(notes, ROOT_DIR);
  const { locales } = readLocales(ROOT_DIR);

  const pending = locales.filter(
    (locale) => locale !== CHANGELOG_LOCALE && (notes.highlights[locale]?.length ?? 0) === 0,
  );

  console.log(`Wrote ${path} (version ${notes.version})`);
  console.log(
    `Changelog locale "${CHANGELOG_LOCALE}": ${notes.highlights[CHANGELOG_LOCALE]?.length ?? 0} highlight(s)`,
  );

  if (pending.length > 0) {
    console.log(
      `\nPlease fill highlights for: ${pending.join(', ')} (Agent/manual), then run: pnpm run release:commit`,
    );
  } else {
    console.log('\nAll locales have highlights. Next: pnpm run release:commit');
  }
}

main();
