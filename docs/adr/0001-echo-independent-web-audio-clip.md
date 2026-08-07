---
status: accepted
---

# Echo listen uses an independent media element

Echo needs a listen-then-record flow on one Subtitle Segment. Seeking/playing that slice on the shared HTMLMediaElement races mic open and recording start, and can leak the clip tail into the take. We play the listen phase with `EchoClipPlayer` on a **private** `HTMLMediaElement` (not the `MediaController` element) while the main player stays paused/frozen at the segment start; recording still uses the normal mic path afterward.

`HTMLMediaElement.playbackRate` preserves pitch (unlike `AudioBufferSourceNode.playbackRate`), so Echo listen rate matches Free Listening / Shadowing.

## Considered Options

- **Reuse main media element** — seek to the segment, play, then record. Simpler, but mic route changes and shared clock make the listen/record handoff unreliable.
- **Independent Web Audio `AudioBufferSourceNode`** — isolates listen audio, but rate changes pitch (chipmunk / mud) and diverges from other Practice Modes.
- **Independent HTMLMediaElement** (chosen) — isolates listen audio from the main element and from MediaRecorder setup, with browser pitch-preserving rate.

## Consequences

- Do not “simplify” Echo by calling `MediaController.play()` / seek for the listen phase.
- Object-URL prepare cost, segment end watch, and output-drain wait before mic open are intentional (`waitForOutputDrain`).
- See `src/lib/echo-clip-player.ts` and `docs/critical-paths.md` (Echo / EchoClipPlayer rows).
