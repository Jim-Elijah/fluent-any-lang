# UI patterns

Overlay and confirmation conventions for `ui-tooltip`, `ui-popconfirm`, and destructive or overwrite actions. Domain terms: [`CONTEXT.md`](../CONTEXT.md).

## Do not nest tooltip and popconfirm on the same trigger

Hovering shows a **tooltip**; clicking opens a **popconfirm**. Nesting `ui-tooltip` around `ui-popconfirm` on the same button causes both overlays at the same placement — titles stack and readability suffers.

**Rule:** one trigger, one overlay purpose.

| Need | Pattern |
| ---- | ------- |
| Hover explanation only | `ui-tooltip` → button |
| Click confirmation only | `ui-popconfirm` → button (+ `aria-label` when the button is icon-only) |
| Explanation when blocked/disabled | `ui-tooltip` → disabled button (no popconfirm) |

Icon-only actions that confirm on click rely on **`aria-label`** instead of a hover tooltip (see mobile bottom nav: icon-only, full label as accessible name, no tooltip — [`architecture.md`](./architecture.md#library-hub)).

## Overwrite confirmations (popconfirm)

Use **`ui-popconfirm`** when the user is about to **replace existing computed or cached data** and the action is costly or hard to undo by accident.

| Action | Popconfirm? | Notes |
| ------ | ----------- | ----- |
| Regenerate Source Word Alignment (segment or whole, when cache exists) | Yes | Button label + popconfirm title; no outer tooltip on regenerate path |
| First-time align (no cache) | No | Tooltip explains; direct click |
| Re-score (`重新评分`) | No | Overwrites a derived Pronunciation Score only; cheap to repeat; first score still uses privacy ack |
| Delete recording / batch delete | Yes | Popconfirm only; no nested delete tooltip |

Align buttons split render paths in `source-segment-align-button` and `source-word-align-all-button`:

1. **Blocked** — tooltip with `blockedTip`, disabled button  
2. **Has cache (regenerate)** — popconfirm only  
3. **First run** — tooltip + click  

Popconfirm copy for align: `source-word-align-labels.ts` (`sourceWordAlignPopconfirmTitle`).

## Reference implementations

| Surface | File | Pattern |
| ------- | ---- | ------- |
| Regenerate segment / all align | `src/components/shared/source-segment-align-button.ts`, `source-word-align-all-button.ts` | Scenario split above |
| Single recording delete | `src/components/library/record-list.ts` | `ui-popconfirm` + icon button + `aria-label` |
| Batch delete (records, media, noise, sentences) | `record-list.ts`, `media-list.ts`, `noise-list.ts`, `pages/sentences/index.ts` | Same — no nested delete tooltip |
| Re-score | `recording-preview.ts`, `record-list.ts` | Tooltip only when explaining block reason; no popconfirm |

## Adding a new confirm action

1. Decide whether overwrite is **costly / easy to mis-click** — if not, prefer direct action (like re-score).  
2. If confirming: **`ui-popconfirm` only** on the trigger; put the question in popconfirm `title`.  
3. Icon button → set **`aria-label`** to the action name (localized).  
4. Long hover help for **first-time or blocked** states only — not on the regenerate + confirm path.
