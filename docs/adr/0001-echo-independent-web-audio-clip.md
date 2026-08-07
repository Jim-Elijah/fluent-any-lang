---
status: accepted
---

# Echo listen uses an independent Web Audio clip

Echo needs a listen-then-record flow on one Subtitle Segment. Seeking/playing that slice on the shared HTMLMediaElement races mic open and recording start, and can leak the clip tail into the take. We play the listen phase with `EchoClipPlayer` (Web Audio `AudioBufferSourceNode`) while the main player stays paused/frozen at the segment start; recording still uses the normal mic path afterward.

## Considered Options

- **Reuse main media element** — seek to the segment, play, then record. Simpler, but mic route changes and shared clock make the listen/record handoff unreliable.
- **Independent Web Audio clip** (chosen) — isolate listen audio from the main element and from MediaRecorder setup.

## Consequences

- Do not “simplify” Echo by calling `MediaController.play()` / seek for the listen phase.
- Clip decode/prepare cost and output-drain wait before mic open are intentional (`waitForOutputDrain`).
- See `src/lib/echo-clip-player.ts` and `docs/critical-paths.md` (Echo / EchoClipPlayer rows).
