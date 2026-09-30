# Release notes

User-facing highlights for PWA update UI and settings. Product flow: [`README.md`](../README.md#releasing) (English) / [`README.zh-CN.md`](../README.zh-CN.md#发版流程) (中文). Translation rules for agents: [`.cursor/rules/release-notes-translate.mdc`](../.cursor/rules/release-notes-translate.mdc).

## Artifacts

| Piece | Role |
| --- | --- |
| `CHANGELOG.md` | English conventional-changelog source (`en` locale) |
| `public/release-notes.json` | Shipped static JSON: `version` + `highlights` keyed by locale |
| `scripts/release-notes-lib.mjs` | Parse changelog, generate JSON, **`release:commit` validation** |
| `scripts/release-notes.mjs` | `pnpm release:notes` |
| `scripts/release-commit.mjs` | `pnpm release:commit` |
| `src/lib/release-notes.ts` | Runtime fetch + locale fallback for PWA/settings UI |

Runtime load: `fetch('/release-notes.json', { cache: 'no-store' })` (file excluded from Workbox precache).

## Duplicate validation (known)

Section shape and “locale has usable bullets” are implemented **twice**:

| Helper | Release / CI (`scripts/release-notes-lib.mjs`) | App runtime (`src/lib/release-notes.ts`) |
| --- | --- | --- |
| `isReleaseNotesSection` | Used in `checkReleaseNotes` before tag | Used in `isReleaseNotes` inside `fetchReleaseNotes` |
| `localeHighlightsFilled` | Empty-locale detection + commit gate | Locale pick + English fallback |

Logic is intentionally aligned but **not shared** today: scripts are plain Node `.mjs`; app code lives under `src/` (TypeScript, browser bundle) and `tsconfig` `rootDir` is `src`.

**When changing validation rules**, update both implementations (or unify first — see below) and extend **`scripts/release-notes-lib.test.ts`** and **`src/lib/release-notes.test.ts`** so behavior does not drift. Minor differences already exist (e.g. `localeHighlightsFilled` in the script is more defensive about malformed section objects; `category` trimming may differ).

### Unifying later (not planned yet)

Possible directions if duplication becomes painful:

1. **Shared pure JS module** (e.g. under `scripts/`) imported by `release-notes-lib.mjs`; app either duplicates a thin layer or imports via build/tsconfig exception.
2. **Shared TypeScript module** under `src/lib/` (no DOM/i18n), with release scripts run via `tsx` / similar.
3. **Keep dual copies** but share the same fixture cases across both test files.

No ADR unless we pick option 2 and commit to TS in the release toolchain.
