# Critical paths

Smoke and regression checklist. Domain terms: [`CONTEXT.md`](../CONTEXT.md). Couplings: [`architecture.md`](./architecture.md).

Prefer automated tests where they exist; use this list when changing the named areas.

## User paths (must keep working)

| #   | Path                                     | Entry                                             | Success signal                                                            |
| --- | ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Import Media (+ optional Subtitle Track) | Library / importer                                | Item in library; subtitles play in sync                                   |
| 2   | Free Listening                           | `/practice?mediaId=`                              | Play, rate, loop, segment nav, pause                                      |
| 3   | Discrimination                           | Practice → Discrimination                         | Noise overlay + optional rate ladder; main track still controllable       |
| 4   | Shadowing                                | Practice → Speaking → Shadowing                   | Record in sync; Practice Record saved; compare playback                   |
| 5   | Echo                                     | Practice → Speaking → Echo (needs subtitles)      | Listen clip → record; multiple takes per segment OK                       |
| 6   | Practice Session accounting              | Any Practice Mode with real practice              | Stats/home show active time (not mere page open)                          |
| 7   | Playlist practice                        | `/practice?playlistId=&mediaId=`                  | Track order / next; Favorites still works                                 |
| 8   | Sentence Bank save → isolated practice   | Subtitle panel → Sentences → `/sentence-practice` | Clip saved; practice from bank works if source available                  |
| 9   | Delete Media                             | Library                                           | Soft-delete playlist/sentence refs; no orphan main-track practice         |
| 10  | Backup export/import                     | Settings                                          | Round-trip keeps media/subtitles/records/scores; removed entries stay out |

## Change X → must verify Y

| If you change…                                            | Also verify…                                                                                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MediaController` seek / segment end / `navigationLocked` | Free Listening loop & segment nav; Shadowing stop-on-segment; Discrimination ladder still advances                                                                                 |
| `practice-view` mode switching                            | All 4 Practice Modes; tracker mode labels (`free` not legacy `listening`); tip/hotkey wiring                                                                                       |
| `PracticeTimeTracker` / session flush                     | Stats dashboard; background/tab hide; short sessions dropped; no side effects on playback                                                                                          |
| `EchoClipPlayer` / echo listen                            | Mic route change does not cut clip into recording; main element position stable                                                                                                    |
| `audio-recorder` / `saveRecording`                        | Shadowing multi-segment + Echo per-segment records; library preview dual-track; Practice Segment snapshot text present when recorded with subtitles                                |
| `deleteRecording` / Pronunciation Score                   | Score row is removed with the Practice Record; preview and Echo subtitle badge update                                                                                              |
| `lib/pronunciation-score` / speech score settings         | On-demand score only (no auto-score on save); full POST URL in settings (legacy base URL migrated); 60s/10MB rejection; Echo subtitle overall badge; snapshot scores after Subtitle Track delete; score action disabled without 对照原稿 |
| `microphone-access` / Speaking mic gate                   | `practice-view` Shadowing/Echo; sentence-practice Speaking recorder disabled + permission refresh                                                                                  |
| NoiseMixer / RateLadder / discrimination prefs            | Noise ≠ Media; play/pause sync with main; ladder on `ended`                                                                                                                        |
| `segment-id` / subtitle import / migrate                  | Existing Echo records & Sentence Bank still match segments                                                                                                                         |
| `db/schema` / `db/index` upgrade                          | Fresh open + upgrade from previous version; migrations idempotent                                                                                                                  |
| `db/media` delete cascade                                 | Playlists soft-remove; sentence bank unavailable flags                                                                                                                             |
| `app-settings` shape / defaults                           | Discrimination prefs, shadowing gap, limits; localStorage migrate/compat                                                                                                           |
| `lib/backup`                                              | Soft-deleted omitted; blob stores included; Pronunciation Scores with recordings (v5); import does not corrupt schema version assumptions                                          |
| `media-loader` / practice query params                    | Deep link `mediaId` / `playlistId` / `segmentId`                                                                                                                                   |

## Suggested automated anchors

Unit/integration coverage already clusters around:

- `controllers/media-controller*.ts`
- `analytics/practice-time-tracker*.ts`
- `db/*` (playlist, practice-session, sentence-bank, migrations)
- `lib/{dual-track-playback,echo-clip-player,noise-mixer,rate-ladder,import-*,backup}*`
- `components/player/{practice-view,media-player,discrimination-panel,audio-recorder}*.test.ts`

When adding a critical behavior, prefer a test here over only updating this doc.

## Release smoke (manual, ~10 min)

1. Import one audio + SRT
2. Free Listening: seek + loop one Subtitle Segment
3. Discrimination: enable one Noise track briefly
4. Shadowing: one take → appears in records
5. Echo: one segment listen + record
6. Confirm today’s Practice Session time moved on Stats/Home
7. Save one Sentence Bank Entry and open sentence practice

Skip steps only when the release clearly cannot touch that surface.
