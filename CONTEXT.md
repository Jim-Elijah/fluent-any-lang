# FluentAnyLang Practice

Domain language for self-imported audio/video listening and speaking practice. Learners practice with their own materials, driven by subtitle timing, with data kept on-device.

## Language

### Materials

**Media**:
A single audio or video item the learner imports for practice. It may or may not yet have subtitles.
_Avoid_: Track, file, content, asset

**Subtitle Track**:
The set of timed subtitles or lyrics attached to one Media item.
_Avoid_: Captions file, lyrics file

**Subtitle Segment**:
One timed unit on a Subtitle Track (source text, optional translation). In product language, “按句练习” means practicing by Subtitle Segment.
_Avoid_: Sentence (alone), line, cue

**Noise**:
An ambient audio item used only as overlay during Discrimination. It is not Media and is not a playlist or practice main track.
_Avoid_: Background media, noise media

### Practice classification

**Practice Type**:
The top-level kind of practice: Listening or Speaking.
_Avoid_: Practice Mode (for this concept)

**Listening**:
The Practice Type for listen-only practice (no learner recording). Its subtypes are Free Listening and Discrimination. Product phrase 听力模式 means this Practice Type.
_Avoid_: Listening Mode (when meaning Free Listening or Discrimination)

**Speaking**:
The Practice Type for spoken practice with recording. Its subtypes are Shadowing and Echo. Product phrase 口语模式 means this Practice Type.
_Avoid_: Speaking Mode (when meaning Shadowing or Echo alone), Practice Mode (legacy name for Speaking subtypes)

**Free Listening**:
The Listening subtype for ordinary playback practice (rate, segment navigation, loop, pause) without Noise overlay or speed ladder.
_Avoid_: Free, normal listening, ordinary listen

**Discrimination**:
The Listening subtype that overlays Noise (up to three tracks) and may use a stepped playback-rate ladder.
_Avoid_: Anti-noise listening, 抗噪听 (as the canonical English term)

**Shadowing**:
The Speaking subtype where the learner records in sync with the source audio.
_Avoid_: Sync shadowing, 同步跟读 (as the canonical English term), 跟读 (alone)

**Echo**:
The Speaking subtype where the learner hears a Subtitle Segment first, then records; multiple takes may be kept per segment.
_Avoid_: Echo shadowing, 回声跟读 (as the canonical English term)

**Practice Mode**:
One of the four countable practice kinds used for sessions and analytics: Listening (meaning Free Listening), Discrimination, Shadowing, or Echo.
_Avoid_: Practice Type, Listening Mode, Speaking Mode

### Practice outcomes

**Practice Session**:
A measurable stretch of effective practice on one Media (and optional Playlist), with a Practice Mode, start/end, and active duration—not wall-clock time in the app alone.
_Avoid_: Visit, page open, wall-clock duration

**Practice Record**:
A saved speaking recording produced in Shadowing or Echo, aligned in time to the source for comparison playback. It may keep the Subtitle Segment text practiced, so scoring and compare preview still have a script if the Subtitle Track is later removed.
_Avoid_: Take (in formal language), recording (alone when the saved artifact is meant)

**Pronunciation Score**:
An optional evaluation of a Practice Record (accuracy, fluency, completeness, prosody, overall). Stored on-device; computed by an external scoring service only when the learner requests it.
_Avoid_: Practice Session, grade, assessment (as the canonical term)

### Organization

**Playlist**:
An ordered collection of Media references, including the system Favorites list and user-created lists.
_Avoid_: Queue, album, folder

**Sentence Bank Entry**:
A Subtitle Segment the learner saved for later isolated practice, optionally with clipped audio from the source Media.
_Avoid_: Sentence, saved sentence, 收藏句 (as the canonical English term)
