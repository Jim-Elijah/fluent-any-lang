# FluentAnyLang

**English** | [中文](./README.zh-CN.md)

A listening and speaking practice web app for any language. Import your own audio or video, practice sentence by sentence, and keep everything on your device.

**[Live Demo](https://fal.jimelijah.com/)** · [GitHub](https://github.com/Jim-Elijah/fluent-any-lang)

## Features

- **Any language, your materials** — Import audio/video (optionally with matching `.srt` / `.lrc` subtitles). Subtitles can be added later.
- **Listening practice** — Playback speed, single-sentence pause, sentence loop, sleep timer, and more.
- **Speaking practice**
  - **Shadowing** — Synchronized shadowing with recording and countdown cues.
  - **Echo** — Hear the original line first, then record; keep multiple takes per sentence.
- **Subtitle-driven workflow** — Jump by sentence, compare original audio with your recordings (including sync play).
- **Media & recording libraries** — Search, sort, filter, and export.
- **Practice statistics** — Effective practice time, streaks, mode mix, and trends (not wall-clock time).
- **Local-first & private** — Media, subtitles, and recordings stay in your browser via IndexedDB; nothing is uploaded to a server.
- **UI locales** — Simplified Chinese, English, Japanese, and Traditional Chinese (`@lit/localize`).

## Screenshots

![home](./docs/screenshots/home.png)
![practice](./docs/screenshots/practice.png)
![library](./docs/screenshots/library.png)
![statistics](./docs/screenshots/statistics.png)


![home-import-listen](./docs/screenshots/import-and-listen.gif)
![practice-listen-advanced-setting](./docs/screenshots/listen-advanced-setting.gif)
![practice-speak-shadowing](./docs/screenshots/shadowing.gif)
![practice-speak-echo](./docs/screenshots/echo.gif)


## How to use

1. Open the [live app](https://fal.jimelijah.com/).
2. Import audio or video (and optional subtitles).
3. Start **Listening** or **Speaking** practice from a media item.
4. Review progress on the statistics page.

No install required for everyday use. Prefer headphones for speaking practice, and grant microphone permission when prompted.

## Privacy

FluentAnyLang is a client-side app. Practice content and recordings are stored locally in IndexedDB. Clearing site data in the browser removes them; export recordings if you need a backup.

## Tech stack

Lit · Vite · TypeScript · IndexedDB (`idb`) · `@lit/localize`

## Development

Prerequisites: **Node.js 22+** and **pnpm 11+**.

```bash
pnpm install
pnpm dev
```

Useful scripts:

| Command | Description |
| --- | --- |
| `pnpm build` | Localize, typecheck, and production build |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm lint` | ESLint |
| `pnpm localize:extract` / `pnpm localize:build` | i18n extract / build |

## License

[MIT](./package.json)
