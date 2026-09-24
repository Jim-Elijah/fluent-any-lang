# Pronunciation align API

HTTP contract for **word-level timestamps only** (no accuracy / fluency / prosody scoring). Use this when you have an audio clip and a known script (`reference_text`) and need `{ word, start, end }` on the audio timeline.

Canonical path: `POST /api/v1/pronunciation/align` (**backward-compatible extension**; no new path version required).

For pronunciation scoring, use [`pronunciation-score-api.md`](./pronunciation-score-api.md) (`POST /api/v2/pronunciation/score` or legacy v1 score). The score pipeline **reuses the same segment-aware forced-alignment implementation** internally (see [Relationship to score API](#relationship-to-score-api)).

## POST `/api/v1/pronunciation/align`

Forced-aligns the reference script to the uploaded audio via WhisperX. Does **not** run the scoring pipeline (no prosody analysis, no lexical error buckets, no composite scores). When `language` is not `auto`, the server **skips full ASR transcription** and only loads audio + align (lower latency and compute than `/score`).

**Headers**

| Header | Required | Value |
| ------ | -------- | ----- |
| `X-API-Key` | yes | API key issued by this service |
| `Content-Type` | yes | `multipart/form-data` |

**Form fields**

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `audio` | file | yes | Clip to align: wav / webm / m4a / mp3, **≤ 60 s**, **≤ 10 MB** (same limits as score). **No server-side chunking** — over limit → **413**. |
| `reference_text` | string | yes | Script to align. Server normalizes `\r\n` / `\r` → `\n` before tokenization. When using `reference_segments`, MUST be the LF-joined texts of those segments in **timeline order** (same string the client would send without segments). |
| `reference_segments` | string (JSON) | no | Optional array of timed lines (Subtitle Segment shape). When present and non-empty, server uses **segment-aware align** (see below). |
| `language` | string | no | BCP-47 language tag, e.g. `en`, `zh`, `ja`. Default `auto`. **Pass a fixed language when known** to avoid transcription and reduce cost |

**Not supported on this endpoint:** `reference_audio`, `reference_duration`, `reference_prosody_profile`, or any scoring-only fields.

### `reference_segments` JSON shape

Each element matches a **Subtitle Segment** (timed line on the source clip):

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id` | string | yes | Opaque segment id (echoes client Subtitle Segment id) |
| `startTime` | number | yes | Start **seconds on the uploaded `audio` timeline** (0 = first sample of this file) |
| `endTime` | number | yes | End seconds on the same timeline (`endTime` > `startTime`) |
| `text` | string | yes | Source line text; server LF-normalizes and trims like `reference_text` lines |

**Client convention (FluentAnyLang):** upload a clip from the first subtitle line with text through the last (Media absolute times → subtract clip offset so `startTime`/`endTime` are relative to the uploaded file). Skip empty lines when building `reference_text` and omit them from `reference_segments`.

**Server validation (recommended):** segments sorted by `startTime`; no overlap; each segment’s trimmed text appears as one LF line in `reference_text` in the same order; reject **422** on mismatch.

### Segment-aware align (when `reference_segments` is set)

1. For each segment, crop audio to `[startTime, endTime]` (half-open or closed-end per server convention; document in server logs; times must stay on the **clip** axis).
2. Run forced-align on that crop with **only** that segment’s `text`.
3. Offset each word’s `start`/`end` by `segment.startTime` back onto the **uploaded clip** timeline.
4. Concatenate segment word lists in segment order into response `words[]` so token order matches `tokenize(reference_text, language)`.
5. Populate response `segments[]` with per-id `words` (same timings as in step 3, clip axis).

When `reference_segments` is **omitted**, behavior is unchanged: **single-pass** forced-align of full `audio` against full `reference_text`.

### Client request example (legacy single-pass)

```http
POST /api/v1/pronunciation/align HTTP/1.1
Host: speech.example.com
X-API-Key: YOUR_API_KEY
Content-Type: multipart/form-data; boundary=----boundary

------boundary
Content-Disposition: form-data; name="audio"; filename="clip.wav"
Content-Type: audio/wav

(binary)
------boundary
Content-Disposition: form-data; name="reference_text"

Hello world
------boundary
Content-Disposition: form-data; name="language"

en
------boundary--
```

### Client request example (segment-aware)

```http
------boundary
Content-Disposition: form-data; name="reference_text"

Hello world
How are you
------boundary
Content-Disposition: form-data; name="reference_segments"

[{"id":"s1","startTime":0.0,"endTime":1.2,"text":"Hello world"},{"id":"s2","startTime":2.5,"endTime":4.0,"text":"How are you"}]
------boundary--
```

**Response 200**

```json
{
  "reference_text": "Hello world\nHow are you",
  "words": [
    { "word": "Hello", "start": 0.12, "end": 0.48 },
    { "word": "world", "start": 0.58, "end": 0.95 },
    { "word": "How", "start": 2.62, "end": 2.78 },
    { "word": "are", "start": 2.80, "end": 2.92 },
    { "word": "you", "start": 2.94, "end": 3.18 }
  ],
  "segments": [
    {
      "id": "s1",
      "words": [
        { "word": "Hello", "start": 0.12, "end": 0.48 },
        { "word": "world", "start": 0.58, "end": 0.95 }
      ]
    },
    {
      "id": "s2",
      "words": [
        { "word": "How", "start": 2.62, "end": 2.78 },
        { "word": "are", "start": 2.80, "end": 2.92 },
        { "word": "you", "start": 2.94, "end": 3.18 }
      ]
    }
  ],
  "duration_sec": 4.2,
  "speech_span_sec": 3.06,
  "reference_newline": "lf",
  "meta": {
    "model": "whisperx-base",
    "device": "cuda",
    "latency_ms": 1200,
    "language": "en",
    "align_mode": "segments"
  }
}
```

When `reference_segments` was not sent, `segments` may be `null` or omitted and `meta.align_mode` is `"full"` (or omitted).

### Field semantics

| Field | Type | Description |
| ----- | ---- | ----------- |
| `reference_text` | string | LF-normalized script that was aligned (same normalization as score API) |
| `words` | array | One entry per **reference token** after server `tokenize(reference_text, language)` — same token stream as `details.word_scores` on score, but **without** `score` |
| `words[].word` | string | Token text (case/punctuation as in reference tokenization) |
| `words[].start` | number | Start time in **seconds** on the uploaded `audio` timeline |
| `words[].end` | number | End time in seconds (≥ `start`) |
| `segments` | array \| null | Present when segment-aware align ran: one object per input segment `id` with that line’s `words` (clip timeline) |
| `segments[].id` | string | Same as input `reference_segments[].id` |
| `segments[].words` | array | Subset of global token timings for that line |
| `duration_sec` | number | Total duration of the converted audio file |
| `speech_span_sec` | number \| null | `words[last].end - words[0].start` when `words` is non-empty; otherwise `null` |
| `reference_newline` | string | Always `"lf"`. Char-span APIs on score use the same rule; align returns tokens only |
| `meta.model` | string | WhisperX model id |
| `meta.device` | string | `cpu` or `cuda` |
| `meta.latency_ms` | integer | Server processing time for this request |
| `meta.language` | string | Language code used for alignment (detected or from `language` form field) |
| `meta.align_mode` | string | optional `"full"` \| `"segments"` |

### Relationship to score API

| Topic | Align | Score |
| ----- | ----- | ----- |
| HTTP path | `POST /api/v1/pronunciation/align` | `POST /api/v2/pronunciation/score` |
| Word timings | `words[]`, optional `segments[]` | `details.word_scores[]` (+ required `score`) |
| Segment-aware align | Optional via `reference_segments` on **this** request | **Not** a form field; server calls shared align module internally |
| Alignment failure | **422**, no synthetic timestamps | Learner align may fall back to estimated timings for scoring only where documented; reference-side align for prosody follows align rules |
| ASR transcript | Not returned | `details.transcript` |
| Auth / rate limits | Same `X-API-Key` and quotas as score | Same |

**Server implementation:** expose one internal module (e.g. `segment_aware_forced_align(audio, reference_text, language, reference_segments?)`) used by `/align` and by `/score` when producing word-level timings. See [`pronunciation-score-api.md`](./pronunciation-score-api.md#alignment-pipeline-server-side).

### TypeScript-friendly types (for code generation)

```typescript
export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface ReferenceSegmentInput {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

export interface AlignSegmentOutput {
  id: string;
  words: WordTiming[];
}

export interface PronunciationAlignMeta {
  model: string;
  device: string;
  latency_ms: number;
  language: string;
  align_mode?: "full" | "segments";
}

export interface PronunciationAlignResponse {
  reference_text: string;
  words: WordTiming[];
  segments?: AlignSegmentOutput[] | null;
  duration_sec: number;
  speech_span_sec: number | null;
  reference_newline: "lf";
  meta: PronunciationAlignMeta;
}
```

### Error status codes

| Status | Meaning | Typical cause |
| ------ | ------- | ------------- |
| 401 | Unauthorized | Missing or invalid `X-API-Key` |
| 413 | Payload too large | Audio over 10 MB or over 60 s |
| 422 | Unprocessable | Empty `reference_text`, invalid `reference_segments` JSON, segment/text mismatch, or alignment could not be produced |
| 429 | Too many requests | Per-key rate or daily quota exceeded |
| 503 | Service unavailable | WhisperX model not loaded |

On **422** alignment failure, do **not** invent word timings client-side; retry with different audio, script, explicit `language`, or corrected segment times.

### Implementation notes for clients

1. Store the **full URL** including path (`…/api/v1/pronunciation/align`) in settings; do not rely on the server to redirect from score to align.
2. Reuse the same multipart upload helper as score (same `audio` validation).
3. Prefer **segment-aware** requests when you have Subtitle Segment times on the clip (better accuracy across inter-line silence).
4. Use `segments[].words` or `words[]` plus client offset (e.g. add clip start on Media timeline) for seek markers and waveform labels.
5. Prefer `language=en` (or your track language) over `auto` when the locale is known.
6. The service does not persist uploaded audio.
