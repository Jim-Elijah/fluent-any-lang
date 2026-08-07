# Architecture

On-device listening and speaking practice. Domain terms: [`CONTEXT.md`](../CONTEXT.md).

## Layout

| Area | Role |
|------|------|
| `src/app/` | Shell, routes, locale |
| `src/pages/` | Thin route pages |
| `src/components/player/` | Practice hub (`practice-view`, media/subtitle/recorder UI) |
| `src/components/{library,import,settings,stats}/` | Feature UI |
| `src/controllers/` | `MediaController` (playback truth), waveform |
| `src/db/` | IndexedDB schema + entity CRUD |
| `src/lib/` | Import, playback helpers, settings, backup |
| `src/analytics/` | Practice Session timing + stats rollups |
| `src/types/models.ts` | Domain types |

## Data ownership

| Entity | Module | Store |
|--------|--------|-------|
| Media | `db/media.ts` | `media` + `mediaBlob` |
| Subtitle Track | `db/subtitle.ts` | `subtitle` (1:1 `mediaId`) |
| Practice Session | `db/practice-session.ts` | `practiceSession` (written by tracker only) |
| Practice Record | `db/record.ts` | `record` + `recordBlob` |
| Playlist | `db/playlist.ts` | `playlist` |
| Sentence Bank Entry | `db/sentence-bank.ts` | `sentenceBank` + `sentenceBankBlob` |
| Noise | `db/noise.ts` | `noise` + `noiseBlob` |
| App Settings | `lib/app-settings.ts` | **localStorage** (not IDB) |

Runtime playback state is owned by a per-view `MediaController` — not persisted.

IndexedDB: `fluent-any-lang`, version in `db/schema.ts`. Open/upgrade: `db/index.ts`.

## Practice stack

```
/practice → practice-page → practice-view
                │
                ├─ MediaController ← media-loader ← IndexedDB
                ├─ media-player / subtitle-panel
                ├─ Free Listening | Discrimination | Shadowing | Echo
                ├─ PracticeTimeTracker → practiceSession
                └─ audio-recorder → Practice Record
```

| Practice Mode | Extra pieces |
|---------------|--------------|
| Free Listening | Controller loop / segment nav / pause |
| Discrimination | `NoiseMixer`, `RateLadder`, `discrimination-panel` |
| Shadowing | `audio-recorder` synced to source; gap policy on controller |
| Echo | `EchoClipPlayer` (private media element clip) + per-segment record |

Sentence practice (`/sentence-practice`) is a lighter path on clipped Sentence Bank audio — not the full four-mode stack. Speaking still guards the recorder with `microphone-access` (same status/permission refresh pattern as `practice-view`).

## Critical couplings

- **`practice-view` ↔ `MediaController`** — mode profiles, seek/lock, segment alignment
- **`PracticeTimeTracker` ↔ controller + `practice-session`** — observational only; active duration, not wall-clock
- **`practice-view` ↔ NoiseMixer / RateLadder`** — Discrimination play/pause and ladder on track `ended`
- **`practice-view` ↔ EchoClipPlayer`** — Echo listen must not seek the main media element
- **`recording-preview` ↔ DualTrackPlayback / waveform** — compare & single-track preview; segment `viewRange` includes the trailing gap to the next Subtitle Segment (`getPracticeSegmentViewRange`)
- **`import-content` ↔ media + subtitle`** — import writes both
- **`deleteMedia` → playlist + sentence-bank`** — soft-delete / unavailable cascade

## Invariants

1. Subtitle Track is **1:1** with Media (`byMediaId`).
2. Subtitle Segment IDs are **deterministic** (`lib/segment-id.ts`); Echo records and Sentence Bank depend on stability.
3. **Noise ≠ Media** — separate stores; never a playlist or main practice track.
4. Practice Session = **active** practice time; drop sessions under `MIN_ACTIVE_MS`; tracker must not change playback/recording logic.
5. Echo listen uses **EchoClipPlayer**; do not seek/shared-play the main element for the listen phase ([ADR-0001](./adr/0001-echo-independent-web-audio-clip.md)).
6. `navigationLocked` blocks seek/segment nav unless `{ force: true }`.
7. Playlist entries and Sentence Bank use **soft-delete** (`removed`); omitted from backup export when removed.
8. Shadowing gap policy (`compress` / `preserve`) is mutually exclusive with normal pause mode during Speaking sessions.
9. Schema changes require bumping `DB_VERSION` and an upgrade path in `db/index.ts`.

## Settings vs data

- **Preferences / limits / Discrimination defaults** → `app-settings` (localStorage)
- **Learner content & sessions** → IndexedDB
- **Backup** → `lib/backup/` (export/import IDB content; respect soft-delete rules)
