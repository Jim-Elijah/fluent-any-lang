# Pronunciation align API

HTTP contract for **word-level timestamps only** (no accuracy / fluency / prosody scoring). Use this when you have an audio clip and a known script (`reference_text`) and need `{ word, start, end }` on the audio timeline.

Canonical path: `POST /api/v1/pronunciation/align`.

For pronunciation scoring, use [`pronunciation-score-api.md`](./pronunciation-score-api.md) (`POST /api/v2/pronunciation/score` or legacy v1 score).

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
| `audio` | file | yes | Clip to align: wav / webm / m4a / mp3, ≤ 60 s, ≤ 10 MB (same limits as score) |
| `reference_text` | string | yes | Script to align (subtitle / segment text). Server normalizes `\r\n` / `\r` → `\n` before tokenization |
| `language` | string | no | BCP-47 language tag, e.g. `en`, `zh`, `ja`. Default `auto` (runs Whisper language detection via transcription). **Pass a fixed language when known** to avoid transcription and reduce cost |

**Not supported on this endpoint:** `reference_audio`, `reference_duration`, `reference_prosody_profile`, or any scoring-only fields.

### Client request example

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

**Response 200**

```json
{
  "reference_text": "Hello world",
  "words": [
    { "word": "Hello", "start": 0.12, "end": 0.48 },
    { "word": "world", "start": 0.58, "end": 0.95 }
  ],
  "duration_sec": 4.2,
  "speech_span_sec": 0.83,
  "reference_newline": "lf",
  "meta": {
    "model": "whisperx-base",
    "device": "cuda",
    "latency_ms": 1200,
    "language": "en"
  }
}
```

### Field semantics

| Field | Type | Description |
| ----- | ---- | ----------- |
| `reference_text` | string | LF-normalized script that was aligned (same normalization as score API) |
| `words` | array | One entry per **reference token** after server `tokenize(reference_text, language)` — same token stream as `details.word_scores` on score, but **without** `score` |
| `words[].word` | string | Token text (case/punctuation as in reference tokenization) |
| `words[].start` | number | Start time in **seconds** on the uploaded `audio` timeline |
| `words[].end` | number | End time in seconds (≥ `start`) |
| `duration_sec` | number | Total duration of the converted audio file |
| `speech_span_sec` | number \| null | `words[last].end - words[0].start` when `words` is non-empty; otherwise `null` |
| `reference_newline` | string | Always `"lf"`. Char-span APIs on score use the same rule; align returns tokens only |
| `meta.model` | string | WhisperX model id |
| `meta.device` | string | `cpu` or `cuda` |
| `meta.latency_ms` | integer | Server processing time for this request |
| `meta.language` | string | Language code used for alignment (detected or from `language` form field) |

### Relationship to score API

| Topic | Align | Score |
| ----- | ----- | ----- |
| Word timings | `words[]` | `details.word_scores[]` (+ required `score`) |
| Alignment failure | **422**, no synthetic timestamps | May fall back to estimated timings for scoring |
| ASR transcript | Not returned | `details.transcript` |
| Auth / rate limits | Same `X-API-Key` and quotas as score | Same |

### TypeScript-friendly types (for code generation)

```typescript
export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface PronunciationAlignMeta {
  model: string;
  device: string;
  latency_ms: number;
  language: string;
}

export interface PronunciationAlignResponse {
  reference_text: string;
  words: WordTiming[];
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
| 422 | Unprocessable | Empty `reference_text`, or alignment could not be produced |
| 429 | Too many requests | Per-key rate or daily quota exceeded |
| 503 | Service unavailable | WhisperX model not loaded |

On **422** alignment failure, do **not** invent word timings client-side; retry with different audio, script, or explicit `language`.

### Implementation notes for clients

1. Store the **full URL** including path (`…/api/v1/pronunciation/align`) in settings; do not rely on the server to redirect from score to align.
2. Reuse the same multipart upload helper as score (same `audio` validation).
3. Use `words[].start` / `end` for seek markers, waveform highlights, or subtitle timing preview.
4. Prefer `language=en` (or your track language) over `auto` when the locale is known.
5. The service does not persist uploaded audio.
