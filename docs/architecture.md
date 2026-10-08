# Architecture

On-device listening and speaking practice. Domain terms: [`CONTEXT.md`](../CONTEXT.md).

## Layout

| Area                                              | Role                                                       |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `src/app/`                                        | Shell, routes, locale                                      |
| `src/pages/`                                      | Thin route pages                                           |
| `src/components/player/`                          | Practice hub (`practice-view`, media/subtitle/recorder UI) |
| `src/components/{library,import,settings,stats}/` | Feature UI (library hub + collection lists)        |
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
| Reference Prosody Profile | `db/reference-prosody-profile.ts` | `referenceProsodyProfile` (Echo or Shadowing cache by mediaId + cache suffix; **not** in backup) |
| Source Word Alignment | `db/source-word-alignment.ts` | `sourceWordAlignment` (align cache by mediaId+segmentId; **not** in backup) |
| Media Source Word Alignment | `db/media-source-word-alignment.ts` | `mediaSourceWordAlignment` (full-track canonical by `mediaId`; **not** in backup) |
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

Sentence practice (`/sentence-practice`) is a lighter path on clipped Sentence Bank audio — not the full four-mode stack. Speaking still guards the recorder with `microphone-access` (same status/permission refresh pattern as `practice-view`). While recording, `media-player` is disabled (playback already paused via `beforeRecordingStart`).

## Library hub

`/library` is an index of collection pages (not a stacked multi-list). Sub-routes:

| Path | Page |
| ---- | ---- |
| `/library` | Hub links |
| `/library/media` | Media list |
| `/library/records` | Practice Record list |
| `/library/noise` | Noise list |
| `/library/playlists` | Playlist management |
| `/library/sentences` | Sentence Bank list |

Legacy `/playlists` and `/sentences` redirect into the hub. Sentence practice returns to `/library/sentences`.

Media, Playlists, the Sentence Bank, and Practice Records can be pinned into the app nav from Settings (off by default, hub order, no count cap). Noise stays hub-only. The hub still lists every collection.

Highlight the most specific item. A pinned route highlights that pin. The hub and unpinned library routes, including Noise, highlight 库. Sentence practice highlights 句库 only while that route is pinned.

The mobile bottom nav is icon-only so long labels fit in every locale. The full label is the item's accessible name and is not shown in a tooltip. The side nav keeps the icon and the label.

Overlay composition (`ui-tooltip` vs `ui-popconfirm`, regenerate vs re-score confirmation): [`ui-patterns.md`](./ui-patterns.md).

## Critical couplings

- **`practice-view` ↔ `MediaController`** — mode profiles, seek/lock, segment alignment; Shadowing record prep (countdown start / `beforeRecordingStart`) pauses main playback so sentence alignment does not drift, and restores playback when prep is cancelled; Discrimination may set `setLockScreenLoop` while the document is hidden. Segment loop: scrub into a mid-track gap adopts the following Subtitle Segment; leading/trailing gaps clear `currentSegmentIndex` (−1, no highlight / replay) until playback or seek lands inside a segment again. Loading Media with no Subtitle Track (or clearing subtitles) downgrades `segment` loop to `none` and turns pause-between-segments off. All auto-resume paths (segment pause, segment/single loop `ended`, shadowing gap compress) assign `currentTime` directly then `play()` via `_seekDirectAndPlay` — never `seek()` + `play()` which awaits `seeked`. Mobile lock-screen swallows `seeked`; `visibilitychange → visible` force-settles any stranded seek.
- **`PracticeTimeTracker` ↔ controller + `practice-session`** — observational only; active duration, not wall-clock
- **`practice-view` ↔ NoiseMixer / RateLadder`** — Discrimination play/pause and ladder on track `ended` (foreground); lock-screen uses native `loop` on the main element + Noise elements (see risks below). `discrimination-panel` ladder progress: current step while idle or running; completion copy after a full round; play after completion seeks to 0 and restarts step 1.
- **`practice-view` ↔ EchoClipPlayer`** — Echo listen must not seek the main media element
- **`practice-view` ↔ Source Word Alignment (Speaking toolbar)** — Shadowing/Echo share `speaking-source-align-toolbar` above the main layout when subtitles exist: batch「生成全部词条」via `alignAllPracticeSegments`, optional collapsible source word rail on a dedicated `WaveformController` (peaks only); seek/word-click when idle goes through `MediaController`; `sessionLocked` makes the rail read-only while the playhead still follows main media time
- **`recording-preview` ↔ DualTrackPlayback / waveform** — compare & single-track preview; segment `viewRange` includes the trailing gap to the next Subtitle Segment (`getPracticeSegmentViewRange`); current-line text prefers the live Subtitle Track, then the Practice Segment snapshot; Pronunciation Score `word_scores` overlay the current Practice Segment on the recording waveform (HTML lane above the canvas; marker width defaults to pronunciation duration, with an in-preview word-marker layout toggle for compact chips; preference persisted as `wordMarkerLayout` without a settings-page control; click plays that word's `[start, end]` span then soft-pauses; hidden while idle). Source Word Alignment timings overlay the source waveform while playing source (neutral markers, no score colors; on-demand align current segment or batch-align all segments; cache key `mediaId:segmentId`; single-segment skips HTTP when cached, confirmed「重新生成」re-requests; batch skips existing; single-segment writes win over batch). Score heatmap chips stay visible in every play mode and jump to the same recording word span (score bands only — not error-type colors); in sync/continuous compare, word/chip/misread clicks keep the compare mode and play both tracks for that span (soft-pause at word end). Positioned error buckets use a shared error-type legend on reference then transcript (expected→actual reading order) and on 漏读/读错/多读 summary lists (missing = gray strikethrough, extra = purple wavy underline, misread = red tint); playable misreads (`start` present) are clickable in-text and in the 读错 list (play that word's span when `end` is available + brief expected↔actual pair emphasis).
- **`pronunciation-score` ↔ Practice Record** — on-demand scoring only; score / re-score UI hidden until settings have URL+key (stored scores remain visible); `deleteRecording` must cascade; scores export with recordings in backup v5; reference text prefers the Practice Segment snapshot, live Subtitle Track is legacy fallback; HTTP contract in [`pronunciation-score-api.md`](./pronunciation-score-api.md) (full POST URL in settings, no health probe; char spans are LF-normalized — client `normalizeNewlines` before upload/highlight). Match scoring (`speechScoreProsodyBasis=match`) may send clipped reference audio or a cached prosody profile for both Echo and Shadowing; Echo keys by `mediaId:segmentId`, Shadowing by composite suffix (`mediaId:<ordered segment ids joined with |>`); default `naturalness` stays text+duration for both modes; profiles are not backed up. Re-score API failure/cancel restores the prior `success` row (does not persist `failed` over it)
- **`pronunciation-align` ↔ Media + Subtitle Segment** — on-demand Source Word Alignment only; full POST URL in `speechAlignApiUrl` (shared API key / language with score); HTTP contract in [`pronunciation-align-api.md`](./pronunciation-align-api.md); subtitle-span clip `/align` only when the clip is within 60s/10MB (local reject otherwise, like score; full Media may exceed limits); per-segment align clips that Subtitle Segment and applies 60s/10MB to the clip; results in `mediaSourceWordAlignment` with segment rows projected or batch-materialized; `segment` source rows override batch/projection; subtitle `contentHash` change clears Media canonical + batch rows; not in backup
- **`import-content` ↔ media + subtitle`** — import writes both
- **`deleteMedia` → playlist + sentence-bank + reference prosody profiles + source word alignments + media source word alignments`** — soft-delete / unavailable cascade; clear profile + align caches for that Media
- **`deleteNoise` → Discrimination prefs** — single and batch delete drop those Noise ids from `discrimination.selected`. Practice reloads the Noise list and drops any selected id that is no longer stored.

### Discrimination lock-screen (risks)

Native `HTMLMediaElement.loop` keeps the main Media (and Noise) wrapping when the document is hidden, because JS `ended` → seek/play is unreliable on mobile lock screens. Trade-offs:

1. **Ladder does not advance while hidden** — RateLadder stays on the current step; unlock does not catch up. The next step applies only after a foreground `ended`.
2. **Last ladder step** — lock-screen loop is off so the main element can end natively; Noise may keep playing until `ended`/visibility handlers run `setPlaying(false)`.
3. **Secondary Noise `Audio()` elements** — some platforms only keep the primary media session alive; Noise may still stop under lock screen even with native `loop`.
4. **Mode switch must clear `lockScreenLoop`** — leaking the override into Free Listening would force unwanted native loop.

## Invariants

1. Subtitle Track is **1:1** with Media (`byMediaId`). `Media.hasSubtitles` is a denormalized list cache for library/playlist badges; Subtitle Track (segments) is the source of truth. `addSubtitle` / `deleteSubtitle` keep the flag in sync; open-time migration and `loadMediaForPlayback` heal stale rows.
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

- **Preferences / limits / Discrimination defaults / last-played resume ids / speech score API URL + key + align API URL + Echo prosody basis / reduceSpeakerEcho (mic AEC) / source-mask default (`sourceMaskMode`) / pinned library nav routes (`pinnedLibraryRoutes`, Noise excluded)** → `app-settings` (localStorage). Practice subtitle mask cycles in the session and does not write this default back.
- **Learner content, sessions, and Pronunciation Scores** → IndexedDB
- **Backup** → `lib/backup/` (export/import IDB content; respect soft-delete rules; scores travel with recordings; reference prosody profiles and source word alignments are omitted)
