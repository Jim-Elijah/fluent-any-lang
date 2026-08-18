# Pronunciation scoring API

HTTP contract consumed by this app for an optional Pronunciation Score. Domain terms: [`CONTEXT.md`](../CONTEXT.md). Client: `src/lib/pronunciation-score/`.

The learner pastes the **full POST URL** in Settings (`speechScoreApiUrl`). The client POSTs to that URL as-is and does **not** append a path or call a health endpoint.

Canonical path on the reference server: `POST /api/v1/pronunciation/score`.

## POST `/api/v1/pronunciation/score`

**Headers**

- `X-API-Key: <key>` (required)
- `Content-Type: multipart/form-data`

**Form fields**

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `audio` | file | yes | Learner recording: wav / webm / m4a / mp3, ≤ 60 s, ≤ 10 MB |
| `reference_text` | string | one of two | Subtitle Segment source text; preferred if `reference_audio` is also sent |
| `reference_audio` | file | one of two | Reference audio; ASR’d to text only when `reference_text` is absent |
| `reference_duration` | float | no | Reference **effective speech duration** (seconds), i.e. speech span after trimming leading/trailing silence; used for shadowing speed comparison. Recommended: pre-compute from reference audio via VAD |
| `language` | string | no | BCP-47, e.g. `en`, `zh`, `ja`; default `auto` |

This app always sends `audio` + `reference_text` + `reference_duration` + `language`. `reference_duration` is the sum of each Practice Segment's source-axis duration (excludes inter-segment gaps in shadowing). It does not send `reference_audio`. Local checks reject recordings over 60 s or 10 MB before the request.

When `reference_duration` is provided, the server compares the learner's aligned word span (`speech_span_sec`) to compute `speed_ratio = reference_duration / speech_span_sec`. Ratios in [0.85, 1.15] do not reduce fluency; outside that band, fluency is penalized linearly (up to −30).

**Response 200**

```json
{
  "accuracy": 82.5,
  "fluency": 92.0,
  "completeness": 95.0,
  "prosody": 81.0,
  "overall": 84.6,
  "details": {
    "transcript": "识别出的文本",
    "word_scores": [
      { "word": "hello", "start": 0.12, "end": 0.45, "score": 90 }
    ],
    "missing_words": ["the"],
    "extra_words": [],
    "misread_words": [{ "expected": "world", "actual": "help" }],
    "speech_rate_wpm": 128,
    "pause_count": 1,
    "duration_sec": 4.2,
    "speech_span_sec": 3.8,
    "reference_duration_sec": 3.5,
    "speed_ratio": 0.921,
    "reference_transcript": null,
    "prosody_breakdown": {
      "speed": 100.0,
      "rhythm": 85.0,
      "intonation": 78.0,
      "stress": 82.0
    }
  },
  "meta": {
    "model": "whisperx-base",
    "device": "cuda",
    "latency_ms": 3200,
    "reference_source": "text"
  }
}
```

`details.missing_words`, `details.misread_words`, and `details.extra_words` are mutually exclusive word-level error buckets (a token appears in at most one list).

**Error status codes**

| Status | Meaning |
| ------ | ------- |
| 401 | Invalid or expired API key |
| 413 | Audio too large or too long |
| 422 | Validation failed |
| 429 | Quota exceeded |
| 503 | Model not loaded / service unavailable |

## Settings

- `speechScoreApiUrl` — full scoring URL (legacy `speechScoreApiBaseUrl` is migrated by appending `/api/v1/pronunciation/score`)
- `speechScoreApiKey` — sent as `X-API-Key`
- `speechScoreLanguage` — form `language`; default `auto`
- Optional env default: `VITE_SPEECH_SCORE_API_BASE_URL` (host or full URL; host is completed to the canonical path)

Scores are stored on-device (`pronunciationScore`). The service must not persist learner audio.
