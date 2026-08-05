#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ROOT_DIR,
  checkReleaseNotes,
  readExistingReleaseNotes,
  readLocales,
  readPackageVersion,
} from './release-notes-lib.mjs';

function main() {
  const version = readPackageVersion(ROOT_DIR);
  const { locales } = readLocales(ROOT_DIR);
  const notes = readExistingReleaseNotes(ROOT_DIR);
  const result = checkReleaseNotes(notes, { version, locales });

  if (!result.ok) {
    console.error('release:commit check failed:');
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const files = ['package.json', 'CHANGELOG.md', 'public/release-notes.json'];
  const lockfile = resolve(ROOT_DIR, 'pnpm-lock.yaml');
  if (existsSync(lockfile)) {
    files.push('pnpm-lock.yaml');
  }

  execSync(`git add ${files.join(' ')}`, { cwd: ROOT_DIR, stdio: 'inherit' });
  execSync(`git commit -m "chore(release): ${version}"`, { cwd: ROOT_DIR, stdio: 'inherit' });
  execSync(`git tag "v${version}"`, { cwd: ROOT_DIR, stdio: 'inherit' });

  console.log(`Committed and tagged v${version}. Push when ready (git push && git push --tags).`);
}

main();
