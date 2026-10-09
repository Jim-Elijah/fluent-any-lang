# Practice entry resolution

How the app decides whether a **Practice Session** snapshot can still open `/practice`, and how query params are normalized when **Media** or **Playlist** context goes stale. Domain terms: [`CONTEXT.md`](../CONTEXT.md).

## Rules

1. **Media available** → user can practice. Availability = media row + blob exist (same as `loadMediaForPlayback`).
2. **Stale playlist context** (playlist deleted, or media removed from playlist) → practice as **single media**; URLs and load plans use `mediaId` only (no `playlistId`).
3. **Media unavailable** → cannot practice. Home **继续练习** is hidden (or falls back to the next session with available media). Stats **练习最多的材料** keeps historical rows with a **已删除** state and no navigation.
4. **`practice-view`** still shows a message and redirects home when load fails (deep links, races after delete).

## Layers

| Layer | Location | Role |
| ----- | -------- | ---- |
| Shared logic | `src/lib/practice-launch.ts` | `resolvePracticeRouteQuery`, `resolveContinuePracticeTarget`, `resolvePracticeLoadPlan`, `practicePathFromQuery` |
| Display | `practice-stats-dashboard`, `practice-stats-page` | Resolve before navigate; hide or disable stale entries |
| Landing | `practice-view._loadPractice` | `resolvePracticeLoadPlan` then `media-loader`; redirect `/` on hard failure |

## Query scenarios

| Entry | Display | Load plan |
| ----- | ------- | --------- |
| `mediaId` only, media OK | Navigate | Single |
| `mediaId` only, media missing | No entry / 已删除 | Failure → toast + home |
| `playlistId` + `mediaId`, both valid | Navigate with both | Playlist at that track |
| `playlistId` + `mediaId`, media OK but not in list | Navigate `mediaId` only | Single |
| `playlistId` + `mediaId`, media missing | No entry / 已删除 | Failure (no playlist-first fallback) |
| `playlistId` only, list has loadable media | Navigate | Playlist from first loadable track |
| `playlistId` only, empty / missing | — | Failure → toast + home |

## Display differences

| Surface | Media missing | Media OK, stale `playlistId` |
| ------- | ------------- | ---------------------------- |
| Home **继续练习** | Hide CTA; use next session with available media | Show CTA; link uses `mediaId` only |
| Stats **练习最多的材料** | Keep row, **已删除**, not clickable | Click → `mediaId` only (ranking has no playlist context) |

## Related checks

See [`critical-paths.md`](./critical-paths.md): **Delete Media**, **`media-loader` / practice query params**, **`lib/practice-launch`**, **`practice-stats-aggregate`**.

## Automated anchors

- `src/lib/practice-launch.test.ts`
- `src/components/stats/practice-stats-dashboard.test.ts`
- `src/pages/practice-stats/index.test.ts`
