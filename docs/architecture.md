# Architecture

On-device listening and speaking practice. Domain terms: [`CONTEXT.md`](../CONTEXT.md).

## Layout

| Area                                              | Role                                                       |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `src/app/`                                        | Shell, routes, locale                                      |
| `src/pages/`                                      | Thin route pages                                           |
| `src/components/player/`                          | Practice hub (`practice-view`, media/subtitle/recorder UI) |
| `src/components/{library,import,settings,stats}/` | Feature UI                                                 |
| `src/controllers/`                                | `MediaController` (playback truth), waveform               |
| `src/db/`                                         | IndexedDB schema + entity CRUD                             |
| `src/lib/`                                        | Import, playback helpers, settings, backup                 |
| `src/analytics/`                                  | Practice Session timing + stats rollups                    |
| `src/types/models.ts`                             | Domain types                                               |

## Data ownership

| Entity              | Module                      | Store                                           |
| ------------------- | --------------------------- | ----------------------------------------------- |
| Media               | `db/media.ts`               | `media` + `mediaBlob`                           |
| Subtitle Track      | `db/subtitle.ts`            | `subtitle` (1:1 `mediaId`)                      |
| Practice Session    | `db/practice-session.ts`    | `practiceSession` (written by tracker only)     |
| Practice Record     | `db/record.ts`              | `record` + `recordBlob`                         |
| Pronunciation Score | `db/pronunciation-score.ts` | `pronunciationScore` (1:1 with Practice Record) |
| Reference Prosody Profile | `db/reference-prosody-profile.ts` | `referenceProsodyProfile` (Echo cache by mediaId+segmentId; **not** in backup) |
| Playlist            | `db/playlist.ts`            | `playlist`                                      |
| Sentence Bank Entry | `db/sentence-bank.ts`       | `sentenceBank` + `sentenceBankBlob`             |
| Noise               | `db/noise.ts`               | `noise` + `noiseBlob`                           |
| App Settings        | `lib/app-settings.ts`       | **localStorage** (not IDB)                      |

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

| Practice Mode  | Extra pieces                                                       |
| -------------- | ------------------------------------------------------------------ |
| Free Listening | Controller loop / segment nav / pause                              |
| Discrimination | `NoiseMixer`, `RateLadder`, `discrimination-panel`                 |
| Shadowing      | `audio-recorder` synced to source; gap policy on controller        |
| Echo           | `EchoClipPlayer` (private media element clip) + per-segment record |

Sentence practice (`/sentence-practice`) is a lighter path on clipped Sentence Bank audio — not the full four-mode stack. Speaking still guards the recorder with `microphone-access` (same status/permission refresh pattern as `practice-view`).

## Critical couplings

- **`practice-view` ↔ `MediaController`** — mode profiles, seek/lock, segment alignment
- **`PracticeTimeTracker` ↔ controller + `practice-session`** — observational only; active duration, not wall-clock
- **`practice-view` ↔ NoiseMixer / RateLadder`** — Discrimination play/pause and ladder on track `ended`
- **`practice-view` ↔ EchoClipPlayer`** — Echo listen must not seek the main media element
- **`recording-preview` ↔ DualTrackPlayback / waveform** — compare & single-track preview; segment `viewRange` includes the trailing gap to the next Subtitle Segment (`getPracticeSegmentViewRange`); current-line text prefers the live Subtitle Track, then the Practice Segment snapshot; Pronunciation Score `word_scores` overlay the current Practice Segment on the recording waveform (HTML lane above the canvas; click seeks/plays that word; hidden while playing source). Score heatmap chips stay visible in every play mode and jump to the same recording time; words also listed as missing are not playable.
- **`pronunciation-score` ↔ Practice Record** — on-demand scoring only; `deleteRecording` must cascade; scores export with recordings in backup v5; reference text prefers the Practice Segment snapshot, live Subtitle Track is legacy fallback; HTTP contract in [`pronunciation-score-api.md`](./pronunciation-score-api.md) (full POST URL in settings, no health probe). Echo match scoring (`speechScoreProsodyBasis=match`) may send clipped reference audio or a cached prosody profile; default `naturalness` and Shadowing stay text+duration; profiles are not backed up. Re-score API failure/cancel restores the prior `success` row (does not persist `failed` over it)
- **`import-content` ↔ media + subtitle`** — import writes both
- **`deleteMedia` → playlist + sentence-bank + reference prosody profiles`** — soft-delete / unavailable cascade; clear profile cache for that Media

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
10. Practice Record may snapshot Subtitle Segment text (and optional translation) onto `PracticeSegment` at save. Scoring and preview current-line use that snapshot when the live Subtitle Track is missing; records without a snapshot fall back to the live track.

## Settings vs data

- **Preferences / limits / Discrimination defaults / speech score API URL + key + Echo prosody basis** → `app-settings` (localStorage)
- **Learner content, sessions, and Pronunciation Scores** → IndexedDB
- **Backup** → `lib/backup/` (export/import IDB content; respect soft-delete rules; scores travel with recordings; reference prosody profiles are omitted)
