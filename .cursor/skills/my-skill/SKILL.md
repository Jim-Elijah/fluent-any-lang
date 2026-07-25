---
name: my-skill
description: Guidelines for Lit Components, IndexedDB (idb), and Audio/Video Playback/Recording Practice Web App
---

# my-skill

# Project Context
This is an online audio/video listening and speaking practice web platform.
- **Frontend Framework**: Lit (Web Components)
- **Database**: IndexedDB using the promise-based `idb` library for client-side storage (storing media blobs, subtitles, practice logs, pronunciation records).
- **Language**: TypeScript (Strict Mode)
- **Key Features**: Content import (video/audio + subtitles/SRT), pronunciation recording and export, interactive audio/video playback (segment repeating, speed control, play/pause syncing with subtitles), speaking practice with microphone recording.


## 1. Lit & Web Components Guidelines

### Styling & DOM
- Use Shadow DOM encapsulation. Apply styles using the `css` tag helper in `static styles`.
- Leverage CSS Custom Properties (`--theme-color`, etc.) for themeability.
- Use host selectors (`:host`) for component-level styling.
- Do not manipulate the DOM directly. Use Lit's reactive rendering lifecycle and dynamic templates. Use `@query` and `@queryAll` decorators when referencing elements inside the Shadow DOM is absolutely necessary.

### Reactive Properties & Lifecycle
- Use `@property()` for public properties/attributes (inputs to the component).
- Use `@state()` for internal reactive state that doesn't reflect to attributes.
- Set property types explicitly (e.g., `@property({ type: Boolean })`).
- Handle cleanups (removing event listeners, canceling timers) in `disconnectedCallback()`.
- Use `shouldUpdate()` or `willUpdate()` to guard expensive renders.

### Event Handling
- Use declarative event binding in templates (e.g., `@click="${this._handleClick}"`).
- Dispatch Custom Events for parent communication. Set `bubbles: true` and `composed: true` if events need to cross the Shadow DOM boundary:
  ```typescript
  this.dispatchEvent(new CustomEvent('practice-complete', {
    detail: { score, duration },
    bubbles: true,
    composed: true
  }));
  ```

---

## 2. TypeScript Standards
- **Strict Mode**: Enable strict null checks. Avoid `any`. Use custom interfaces or types for complex domain models.
- **Decorators**: Use standard TC39/experimental decorators required by Lit.
- **Event Typing**: Explicitly type event targets when handling DOM events:
  ```typescript
  const target = event.target as HTMLMediaElement;
  ```
- **Interfaces**: Define explicit interfaces for major entities:
  ```typescript
  interface SubtitleSegment {
    id: string;
    startTime: number; // in seconds
    endTime: number;
    text: string;
    translation?: string;
  }

  interface PracticeRecord {
    id: string;
    mediaId: string;
    segmentId: string;
    timestamp: number;
    blob: Blob;
    score?: number;
  }
  ```

---

## 3. IndexedDB & `idb` Best Practices
- **DB Instantiation**: Use a single promise-based DB helper. Initialize databases using `openDB` from the `idb` library.
- **Versioning**: Manage database upgrades robustly inside the `upgrade(db, oldVersion, newVersion, transaction)` callback. Never change schemas without increasing the version number.
- **Transaction Scope**: Keep transactions read-only whenever possible (`'readonly'`) for better concurrency. Use `'readwrite'` only when modifying data.
- **Large File Storage**: Store audio/video files directly as `Blob` or `ArrayBuffer` in IndexedDB. Use chunking if dealing with very large files to avoid browser quota warnings or crashes.
- **Keys**: Use auto-incrementing keys or unique string UUIDs for practice history and imported content.

---

## 4. Audio/Video Playback & Subtitle Synchronization
- **Media Controller**: Use a controller pattern or central state manager to sync audio/video playback state (current time, play/pause, playback rate) with subtitle rendering.
- **Subtitle Highlighting**: Match `currentTime` of the `HTMLMediaElement` with subtitle segment `startTime` and `endTime`.
- **A-B Looping**: Implement segment-based playback looping. Listen to the `timeupdate` event and reset `currentTime` to the segment start time if it exceeds the end time:
  ```typescript
  if (this.looping && this.mediaElement.currentTime >= currentSegment.endTime) {
    this.mediaElement.currentTime = currentSegment.startTime;
  }
  ```
- **Performance**: Throttle or debouncing rendering calculations on `timeupdate` to avoid lag during playback.

---

## 5. Speaking & Recording (Microphone)
- **Audio Capture**: Use `navigator.mediaDevices.getUserMedia({ audio: true })` to capture audio.
- **Recording**: Use `MediaRecorder` to capture speaking practice. Use standard formats (e.g., `audio/webm` or `audio/ogg`) based on browser support.
- **Resource Management**: Always stop all audio tracks of the `MediaStream` when recording ends or the component is destroyed to turn off the user's microphone indicator:
  ```typescript
  stream.getTracks().forEach(track => track.stop());
  ```
- **Exporting**: Export recordings as standard audio files (e.g. WAV/MP3 wrapper or WebM). Use `URL.createObjectURL(blob)` for playback preview and download linking.

---

## 6. Content Import & Export
- **File Parsing**: Implement client-side parsers for common formats (e.g., WebVTT/SRT for subtitles, JSON/CSV for bulk exercises).
- **Import Validation**: Validate media formats and schema structures before writing to IndexedDB.
- **Export Formats**: Support packaging subtitles and audio practice records into a single downloadable zip or custom JSON bundle containing meta metadata and audio Base64 strings or Blobs.
- **Memory Management**: Revoke object URLs using `URL.revokeObjectURL()` once download triggers or component changes to prevent memory leaks with large audio/video blobs.
