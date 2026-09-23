# Critical paths

Smoke and regression checklist. Domain terms: [`CONTEXT.md`](../CONTEXT.md). Couplings: [`architecture.md`](./architecture.md).

Prefer automated tests where they exist; use this list when changing the named areas.

## User paths (must keep working)

| #   | Path                                     | Entry                                             | Success signal                                                            |
| --- | ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Import Media (+ optional Subtitle Track) | Library → 媒体库 / importer                   | Item in library; subtitles play in sync                                   |
| 2   | Free Listening                           | `/practice?mediaId=`                              | Play, rate, loop, segment nav, pause                                      |
| 3   | Discrimination                           | Practice → Discrimination                         | Noise overlay + optional rate ladder; main track still controllable       |
| 4   | Shadowing                                | Practice → Speaking → Shadowing                   | Record in sync; Practice Record saved; compare playback                   |
| 5   | Echo                                     | Practice → Speaking → Echo (needs subtitles)      | Listen clip → record; multiple takes per segment OK                       |
| 6   | Practice Session accounting              | Any Practice Mode with real practice              | Stats/home show active time (not mere page open)                          |
| 7   | Playlist practice                        | `/library/playlists` → `/practice?playlistId=&mediaId=` | Track order / next; Favorites still works                                 |
| 8   | Sentence Bank save → isolated practice   | Subtitle panel → `/library/sentences` → `/sentence-practice` | Clip saved; practice from bank works if source available                  |
| 9   | Delete Media                             | Library → 媒体库                              | Soft-delete playlist/sentence refs; no orphan main-track practice         |
| 10  | Backup export/import                     | Settings                                          | Round-trip keeps media/subtitles/records/scores; removed entries stay out |

## Change X → must verify Y

| If you change…                                            | Also verify…                                                                                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MediaController` seek / segment end / `navigationLocked` | Free Listening loop & segment nav; **single** uses native `loop` except when sleep is until-end; Discrimination may set `lockScreenLoop` while hidden (not last ladder step); Shadowing stop-on-segment; Discrimination ladder still advances in foreground |
| `practice-view` mode switching                            | All 4 Practice Modes; tracker mode labels (`free` not legacy `listening`); tip/hotkey wiring; Discrimination enter/exit clears `lockScreenLoop`                                                                                       |
| `PracticeTimeTracker` / session flush                     | Stats dashboard; background/tab hide; short sessions dropped; no side effects on playback                                                                                                                                          |
| `EchoClipPlayer` / echo listen                            | Listen without mic; drain then warmUp/record (AEC must not mute clip); main element position stable                                                                                                                                |
| `audio-recorder` / `saveRecording`                        | Shadowing multi-segment + Echo per-segment records; library preview dual-track; Practice Segment snapshot text present when recorded with subtitles                                                                                |
| `deleteRecording` / Pronunciation Score                   | Score row is removed with the Practice Record; `record-list` emits `recordings-changed` (score / delete / batch-delete) so practice-view refreshes Echo subtitle badge + counts                                                   |
| `lib/pronunciation-score` / speech score settings         | On-demand score only (no auto-score on save); full POST URL in settings (legacy base URL → v2 path; saved v1 URLs left alone); score / re-score actions hidden until URL+key set (existing badges still shown); 60s/10MB rejection; Echo and Shadowing match when `speechScoreProsodyBasis=match` (profile cache or clipped reference audio, silent degrade); default naturalness text-only for both modes; Shadowing match uses composite segment id suffix as cache key, canonical clip bounds from subtitle; Echo subtitle overall badge; snapshot scores after Subtitle Track delete; score action disabled without 对照原稿; re-score API fail keeps prior success |
| `lib/pronunciation-align` / speech align settings         | On-demand Source Word Alignment only; full POST URL in `speechAlignApiUrl` (shared key/language); one clipped subtitle-span `/align` per Media when within 60s/10MB on the clip (local reject otherwise, same as score; blocks 全部原音 only); per-segment align clips the current segment (60s/10MB on the clip, not the full Media file); `mediaSourceWordAlignment` + segment projection/batch rows; cache `mediaId:segmentId` (resolve prefers segment row, else valid Media canonical); skip HTTP when cached/projected; confirmed re-align overwrites segment row; segment write wins over batch; subtitle replace/delete clears Media canonical + batch rows; recording-preview source word rail; practice-view Speaking source word rail (batch align + read-only rail during session); cleared on `deleteMedia`; not in backup |
| `practice-view` Speaking source word rail                 | Toolbar only when Speaking + subtitles; align-all + rail toggle; idle waveform seek via `MediaController`; word markers via private `EchoClipPlayer` + `audio-focus-request` (main loop/pause unchanged); rail non-interactive while session active (same lock as disabled media-player / subtitle seek)                                                                 |
| `microphone-access` / Speaking mic gate                   | `practice-view` Shadowing/Echo; sentence-practice Speaking recorder disabled + permission refresh                                                                                                                                  |
| NoiseMixer / RateLadder / discrimination prefs            | Noise ≠ Media; play/pause sync with main; Noise uses native `loop`; ladder advances on `ended` when visible; lock-screen risks below                                                                                               |
| `segment-id` / subtitle import / migrate                  | Existing Echo records & Sentence Bank still match segments; Media.hasSubtitles matches Subtitle Track after import/delete/open                                                                                                                         |
| `db/schema` / `db/index` upgrade                          | Fresh open + upgrade from previous version; migrations idempotent; `migrateMediaHasSubtitles` heals stale list badges                                                                                                                  |
| `db/media` delete cascade                                 | Playlists soft-remove; sentence bank unavailable flags; reference prosody profiles + source word alignments cleared by mediaId                                                                              |
| `app-settings` shape / defaults                           | Discrimination prefs, shadowing gap, reduceSpeakerEcho → practice mic echoCancellation, speechScoreProsodyBasis, speechAlignApiUrl, lastPlayedPlaylistId / lastPlayedMediaId, limits; localStorage migrate/compat |
| `lib/backup`                                              | Soft-deleted omitted; blob stores included; Pronunciation Scores with recordings (v5); reference prosody profiles + source word alignments excluded; import does not corrupt schema version assumptions     |
| `media-loader` / practice query params                    | Deep link `mediaId` / `playlistId` / `segmentId`                                                                                                                                   |

## Suggested automated anchors

Unit/integration coverage already clusters around:

- `controllers/media-controller*.ts`
- `analytics/practice-time-tracker*.ts`
- `db/*` (playlist, practice-session, sentence-bank, migrations)
- `lib/{dual-track-playback,echo-clip-player,noise-mixer,rate-ladder,import-*,backup}*`
- `components/player/{practice-view,media-player,discrimination-panel,audio-recorder}*.test.ts`

When adding a critical behavior, prefer a test here over only updating this doc.

## Discrimination lock-screen risks

See [`architecture.md`](./architecture.md#discrimination-lock-screen-risks). Short checklist:

- Hidden + more ladder steps → main `lockScreenLoop` on; visible / last step / leave Discrimination → off
- Ladder does not advance while locked; unlock stays on the same step until the next foreground `ended`
- Noise uses native `loop` but may still stop on some devices (secondary `Audio()`)

## Release smoke (manual, ~10 min)

1. Import one audio + SRT
2. Free Listening: seek + loop one Subtitle Segment
3. Discrimination: enable one Noise track briefly; with 2+ ladder steps, lock screen mid-play then unlock (main should keep looping at the same rate; ladder advances only after a visible `ended`)
4. Shadowing: one take → appears in records
5. Echo: one segment listen + record
6. Confirm today’s Practice Session time moved on Stats/Home
7. Save one Sentence Bank Entry and open sentence practice

Skip steps only when the release clearly cannot touch that surface.
