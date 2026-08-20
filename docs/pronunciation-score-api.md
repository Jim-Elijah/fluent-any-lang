# Pronunciation scoring API

HTTP contract consumed by this app for an optional Pronunciation Score. Domain terms: [`CONTEXT.md`](../CONTEXT.md). Client: `src/lib/pronunciation-score/`.

The learner pastes the **full POST URL** in Settings (`speechScoreApiUrl`). The client POSTs to that URL as-is and does **not** append a path or call a health endpoint.

Canonical path on the reference server: `POST /api/v2/pronunciation/score`. Legacy installs may still use `POST /api/v1/pronunciation/score` (full URL stored as-is; this app does **not** rewrite saved v1 URLs to v2).

## POST `/api/v2/pronunciation/score`

v1 supersets with required `reference_duration`, optional reference audio / cached prosody profile for Echo match scoring.

**Headers**

- `X-API-Key: <key>` (required)
- `Content-Type: multipart/form-data`

**Form fields**

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| `audio` | file | yes | Learner recording: wav / webm / m4a / mp3, ≤ 60 s, ≤ 10 MB |
| `reference_duration` | float | **yes** | Reference **effective speech duration** (seconds); this app sends Practice Segment source-axis duration sum |
| `reference_text` | string | conditional | Subtitle Segment source text; preferred script source when present |
| `reference_audio` | file | conditional | Reference clip; roles via `reference_audio_roles` |
| `reference_audio_roles` | string | conditional | Comma-separated: `transcript`, `prosody`. Echo match uses `prosody` with text already present |
| `reference_prosody_profile` | string | conditional | JSON cache of a prior profile; **mutually exclusive** with `reference_audio` that includes a `prosody` role |
| `language` | string | no | BCP-47, e.g. `en`, `zh`, `ja`; default `auto` |

Local checks reject recordings over 60 s or 10 MB before the request. Never send both a profile and reference audio with a `prosody` role.

### Client behavior (this app)

| Practice Mode / setting | Request shape |
| ----------------------- | ------------- |
| **Echo** + `speechScoreProsodyBasis=naturalness` (default) | Text + duration only (no clip, no profile) |
| **Echo** + `speechScoreProsodyBasis=match` | Prefer a valid cached `reference_prosody_profile` for `mediaId` + `segmentId`; else clip source Media for that segment and send `reference_audio` + `reference_audio_roles=prosody`; if clip/media unavailable, **silent degrade** to text + duration only |
| **Shadowing** | Text + duration only (no clip, no profile); setting does not change this |

Profile cache validity (Echo, match basis only): reuse only when `|profile.reference_duration_sec − referenceDuration| ≤ 0.05` and `profile.reference_text` equals the resolved reference text. On **422** after sending a cached profile, delete that cache entry and do **not** retry in the same call (next tap can rebuild). Profiles are **not** included in backup export/import; `deleteMedia` clears profiles for that Media.

When `reference_duration` is provided, the server compares the learner's aligned word span (`speech_span_sec`) to compute `speed_ratio = reference_duration / speech_span_sec`. Ratios in [0.85, 1.15] do not reduce fluency; outside that band, fluency is penalized linearly (up to −30).

**Response 200**

```json
{
  "accuracy": 82.5,
  "fluency": 92.0,
  "completeness": 95.0,
  "prosody": 84.0,
  "prosody_naturalness": 81.0,
  "prosody_match": 87.0,
  "overall": 85.2,
  "details": {
    "transcript": "hello world",
    "word_scores": [
      { "word": "hello", "start": 0.12, "end": 0.48, "score": 90.0 },
      { "word": "world", "start": 0.58, "end": 0.95, "score": 88.5 }
    ],
    "missing_words": [],
    "extra_words": [],
    "misread_words": [],
    "speech_rate_wpm": 128.0,
    "pause_count": 1,
    "duration_sec": 4.2,
    "speech_span_sec": 3.8,
    "reference_duration_sec": 3.5,
    "speed_ratio": 0.921,
    "reference_transcript": null,
    "prosody_naturalness": 81.0,
    "prosody_match": 87.0,
    "prosody_breakdown": {
      "speed": 100.0,
      "rhythm": 85.0,
      "intonation": 78.0,
      "stress": 82.0,
      "naturalness": 81.0,
      "match": 87.0,
      "match_breakdown": { "duration": 90.0, "f0": 85.0, "energy": 86.0 }
    },
    "reference_prosody_profile": {
      "version": "1",
      "profile_hash": "a3f8c2d1e9b04761",
      "reference_duration_sec": 3.5,
      "language": "en",
      "reference_text": "hello world",
      "speech_span_sec": 1.85,
      "words": [],
      "f0_contour": [],
      "energy_contour": []
    }
  },
  "meta": {
    "model": "whisperx-base",
    "device": "cuda",
    "latency_ms": 3800,
    "reference_source": "text"
  }
}
```

- Top-level `prosody` is the main prosody score used in UI and in `overall`. With match: ≈ `0.5·naturalness + 0.5·match`; without match: equals naturalness.
- `prosody_naturalness` / `prosody_match` may be null when match was not computed.
- `details.reference_prosody_profile` is returned only when the server **newly built** a profile from `reference_audio`; when the client reused a cache, it is `null`. The client stores new profiles in IndexedDB for later Echo match requests.
- `meta.reference_source`: `text` | `audio` | `profile`.
- `details.missing_words`, `details.misread_words`, and `details.extra_words` are mutually exclusive word-level error buckets.

### Display rules (this app)

Prosody asks two different questions: **naturalness** (does the learner sound fluent in general?) vs **match** (how close to this reference clip?). Same four breakdown fields; meaning depends on whether match was computed (`prosody_match != null`, typically Echo with match basis and successful reference audio/profile).

**Must show**

| Field | Notes |
| ----- | ----- |
| Top-level `prosody` | Main prosody score beside accuracy / fluency / completeness / overall |
| `details.prosody_breakdown` **speed / rhythm / intonation / stress** | Same layout always. Labels: naturalness → 语速 / 节奏 / 语调 / 重音; match present → 语速贴近 / 节奏贴近 / 语调贴近 / 重音贴近 |

**This app does not show:** top-level `prosody_match` (API may suggest it as optional; we keep UI denser), `prosody_naturalness`, breakdown `naturalness` / `match` / `match_breakdown`, or `reference_prosody_profile`. Those fields are still typed and persisted on `PronunciationScore` when present.

**Error status codes**

| Status | Meaning |
| ------ | ------- |
| 401 | Invalid or expired API key |
| 413 | Audio too large or too long |
| 422 | Validation failed |
| 429 | Quota exceeded |
| 503 | Model not loaded / service unavailable |

## Settings

- `speechScoreApiUrl` — full scoring URL (legacy `speechScoreApiBaseUrl` is migrated by appending `/api/v2/pronunciation/score`)
- `speechScoreApiKey` — sent as `X-API-Key`
- `speechScoreLanguage` — form `language`; default `auto`
- `speechScoreProsodyBasis` — `naturalness` (default) or `match`. Only affects **Echo** scoring: `match` may upload reference audio or reuse a cached profile; `naturalness` stays text + duration. Shadowing is always text + duration.
- Optional env default: `VITE_SPEECH_SCORE_API_BASE_URL` (host or full URL; host is completed to the canonical v2 path)

Scores are stored on-device (`pronunciationScore`). The service must not persist learner audio.
