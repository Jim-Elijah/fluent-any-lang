## [0.3.2](https://github.com/Jim-Elijah/fluent-any-lang/compare/v0.3.1...v0.3.2) (2026-08-07)

### Features

* **app:** lazy-load route pages with loading overlay ([33edaae](https://github.com/Jim-Elijah/fluent-any-lang/commit/33edaae3f2ffb1e7806a8d94527759a42ec18a53))
* **dev:** enable local HTTPS with basic ssl plugin ([beb8a86](https://github.com/Jim-Elijah/fluent-any-lang/commit/beb8a868082f6b3e06004ac3fc735966ed12a7ab))
* harden playlists sort, backup playlists, and discrimination restore ([eaaf678](https://github.com/Jim-Elijah/fluent-any-lang/commit/eaaf678fd039bc3350fc0273526895477fee3b6b))
* **practice:** gate recording on mic status and surface clearer errors ([baddd41](https://github.com/Jim-Elijah/fluent-any-lang/commit/baddd418d9576dcf3bfa8c5c640024139e8e151c))
* **practice:** gate sentence-practice mic and zoom preview through segment gaps ([5d977a6](https://github.com/Jim-Elijah/fluent-any-lang/commit/5d977a691f1815056537812755f46df469f4c030))
* **practice:** isolate echo listen via Web Audio and warm up mic ([7b98a4d](https://github.com/Jim-Elijah/fluent-any-lang/commit/7b98a4d67bc00f39163c478dc8aa3d83883eb830))
* **practice:** keep dual-track mode after end and keep active cue always visible ([4a03cb6](https://github.com/Jim-Elijah/fluent-any-lang/commit/4a03cb61d4aa31b5eb9fe13ea71c758d04a98fd8))

### Bug Fixes

* **practice:** play Echo listen on private media element to preserve pitch ([c6c2240](https://github.com/Jim-Elijah/fluent-any-lang/commit/c6c224005248219a5991621d4ef498dd1a90bc2d))
* **practice:** preserve mid-stop segments and dual-track waveform focus ([4148685](https://github.com/Jim-Elijah/fluent-any-lang/commit/414868587712a30c6186c03f28abe7d2c38d7f73))
* **test:** normalize Vitest mock importers and harden related checks ([a681f5e](https://github.com/Jim-Elijah/fluent-any-lang/commit/a681f5e269c2fc20a4004e0d2d129de9c0d43955))

## [0.3.1](https://github.com/Jim-Elijah/fluent-any-lang/compare/v0.3.0...v0.3.1) (2026-08-05)

### Features

* **practice:** add shadowing gap policy for compress vs preserve playback ([356e913](https://github.com/Jim-Elijah/fluent-any-lang/commit/356e913ccb033f74460b2034e300e000e0e2534a))
* **practice:** harden recording capture and unify echo manage flow ([e199bbe](https://github.com/Jim-Elijah/fluent-any-lang/commit/e199bbe577fab428203c6b79a4dd69f7fe058c85))
* **practice:** stabilize speaking sessions with live waveform and settings restore ([8c6e9ac](https://github.com/Jim-Elijah/fluent-any-lang/commit/8c6e9acd531202b8222282d988907728748ceabd))
* **pwa:** show multilingual release notes on update ([98eb02b](https://github.com/Jim-Elijah/fluent-any-lang/commit/98eb02b49f18029089a198df0d65fd03872b220a))
* **ui:** center subtitle text and tighten segment loop epsilon ([f60af92](https://github.com/Jim-Elijah/fluent-any-lang/commit/f60af92ecd2434d4164845eee67e76f23b5cc7fc))

## [0.3.0](https://github.com/Jim-Elijah/fluent-any-lang/compare/v0.2.0...v0.3.0) (2026-07-26)

### Features

* **media:** integrate DeadlineScheduler for sleep and segment pause management ([1b129db](https://github.com/Jim-Elijah/fluent-any-lang/commit/1b129db97d12a92148665875d3b88a0e34b54f57))
* **playback:** add video hide toggle and harden practice playback edges ([69c07df](https://github.com/Jim-Elijah/fluent-any-lang/commit/69c07df93727794286219db86dd2da1a5443b673))
* **playback:** add volume boost and configurable rate/volume ceilings ([28f5791](https://github.com/Jim-Elijah/fluent-any-lang/commit/28f5791dedf2d729eafc62e578b19268e8bd6a44))
* **playback:** seek and play from waveform click via absolute-time APIs ([a1cc92a](https://github.com/Jim-Elijah/fluent-any-lang/commit/a1cc92a721305cefa7223242f09f46ac692de97e))
* **practice:** add segment replay and subtitle toggle hotkeys ([e0f533f](https://github.com/Jim-Elijah/fluent-any-lang/commit/e0f533f6a2e8f6120d027da32ec96f949202d3e7))
* **settings:** add clear local learning data with confirmation ([21bb76e](https://github.com/Jim-Elijah/fluent-any-lang/commit/21bb76e9b061a67499c88185dbbd7cf3f9a4c4f2))
* **settings:** introduce player defaults settings component ([8068f19](https://github.com/Jim-Elijah/fluent-any-lang/commit/8068f199acf9f78b18e34d2af72f675010124905))

## [0.2.0](https://github.com/Jim-Elijah/fluent-any-lang/compare/v0.1.0...v0.2.0) (2026-07-19)

### Features

* add a new ui-drawer component ([84f0570](https://github.com/Jim-Elijah/fluent-any-lang/commit/84f0570119d73f865df9e8476f8a3039da605cec))
* add auto-close functionality to tooltip component ([608dfcf](https://github.com/Jim-Elijah/fluent-any-lang/commit/608dfcf945a31d4935662e107bd1de270709131a))
* add recording session dock for echo and shadowing ([0659253](https://github.com/Jim-Elijah/fluent-any-lang/commit/0659253673ffd981012d124e1faa3dcfcae73fd4))
* enhance media player setting layout ([53b20c7](https://github.com/Jim-Elijah/fluent-any-lang/commit/53b20c7ebba858bd57fd7f9e62208e47babde55a))
* enhance UI and error messages with localized strings ([d32d6a1](https://github.com/Jim-Elijah/fluent-any-lang/commit/d32d6a12d73598ea598ec757d9fd5b3d4f1058e3))
* **hotkeys:** add keyboard shortcuts for practice and recording preview ([0456439](https://github.com/Jim-Elijah/fluent-any-lang/commit/04564393be026ff2421fe6a623f5812629290003))
* **playlists:** add playlist management with favorites and practice integration ([3df08f0](https://github.com/Jim-Elijah/fluent-any-lang/commit/3df08f0459812941066eb0f2c7b41094c3004011))
* **practice:** add discrimination mode with noise library and rate ladder ([561d26d](https://github.com/Jim-Elijah/fluent-any-lang/commit/561d26d9682c82d430d28f245a6d77dc49c30339))
* **practice:** enhance media tracking with playlist integration ([6479dd0](https://github.com/Jim-Elijah/fluent-any-lang/commit/6479dd0ed719ee39745f0c54d41c2e6a69e2eb33))
* **practice:** lock navigation during speaking sessions ([46e2aa5](https://github.com/Jim-Elijah/fluent-any-lang/commit/46e2aa5142bffaf9f2acbe2e2a39c6132d31c6d5))
* **preview:** enhance recording review with audio focus and volume controls ([7bf7a55](https://github.com/Jim-Elijah/fluent-any-lang/commit/7bf7a555d03815fcd7ff3ee976f0cad2c822303b))
* **pwa:** add installable PWA with offline shell and update prompts ([da38040](https://github.com/Jim-Elijah/fluent-any-lang/commit/da38040cbf7abbf6ee33fd8e76dae944dafa3513))
* **sentences:** add sentence bank with clip storage and dedicated practice ([b77a9a4](https://github.com/Jim-Elijah/fluent-any-lang/commit/b77a9a4074ef1120fdd00991f16626819da59105))
* **settings:** add local error logging and diagnostics export ([1532654](https://github.com/Jim-Elijah/fluent-any-lang/commit/153265409c84adebb35da9df57772dcbf51fce58))
* **settings:** add preferences, practice limits, and data backup ([96ca784](https://github.com/Jim-Elijah/fluent-any-lang/commit/96ca784f4241867d1bb0c07a4a92dac8e211b7af))

## 0.1.0 (2026-07-12)

### Features

* add dual track preview of recording and extend subtitle format ([a3f60d0](https://github.com/Jim-Elijah/fluent-any-lang/commit/a3f60d07b02ae3a4c7353d29170eb04965c342b5))
* add fullscreen support to subtitle panel ([c398cc5](https://github.com/Jim-Elijah/fluent-any-lang/commit/c398cc5dcf3f8a07ffafe190bbb80366cd6c5546))
* add iconfont ([6dbef22](https://github.com/Jim-Elijah/fluent-any-lang/commit/6dbef221926bb636386aa71baa2511d74d61e110))
* add responsive navigation and adopt ui-icon across components ([dcf60c4](https://github.com/Jim-Elijah/fluent-any-lang/commit/dcf60c4ff10e1429756ae55728d3094f26be690e))
* add router ([97a7f5d](https://github.com/Jim-Elijah/fluent-any-lang/commit/97a7f5dc4bd526937129a907ce1ca1e72c8c2a86))
* allow per-media subtitle import and improve library layout ([6ee77cc](https://github.com/Jim-Elijah/fluent-any-lang/commit/6ee77ccaf7b5f3a151ded4dbfd023a6161bd7a10))
* change ui and optimize for shadowing ([d7b4872](https://github.com/Jim-Elijah/fluent-any-lang/commit/d7b487290c8a08065689227cd45cf88e262fe63d))
* enhance layout and responsiveness for media and record lists ([b569b1c](https://github.com/Jim-Elijah/fluent-any-lang/commit/b569b1c4fa7c7e7ed9c377919a21b47a174e1ac4))
* enhance UI components and extract recording related parts into component ([6e9ef7e](https://github.com/Jim-Elijah/fluent-any-lang/commit/6e9ef7e11360bc284dab9ac2e1e1583afc1892a2))
* implement countdown before recording and enhance UX in echo mode ([a3cab92](https://github.com/Jim-Elijah/fluent-any-lang/commit/a3cab92bb85869a438a5ce7698af9315ba3de9de))
* init repo; add lint husky so on; finish basic functions ([3c55b1a](https://github.com/Jim-Elijah/fluent-any-lang/commit/3c55b1afc97c8b8cf22f1e316d28ba554aa44114))
* integrate waveform player and enhance audio recording features ([057fa5e](https://github.com/Jim-Elijah/fluent-any-lang/commit/057fa5e12343e57f643bfac457f427488e7c0ead))
* optimize find segment ([2fa8404](https://github.com/Jim-Elijah/fluent-any-lang/commit/2fa8404a65f5f2d4675cc28a48c2b91b24f0dbe3))
* player supports fixed/mini mode like APlayer and change click handler of ui-icon ([804aae2](https://github.com/Jim-Elijah/fluent-any-lang/commit/804aae2f900ceb0bf1191bd3cf0a22322b8e9de1))
* **practice:** add echo practice and optimize dual-track playback ([bac2a97](https://github.com/Jim-Elijah/fluent-any-lang/commit/bac2a97fa3d17e9f6b2b7d7cccb9c8c63aac25dc))
* remove repeat mode and move pauseMode to shadowing ([0347d21](https://github.com/Jim-Elijah/fluent-any-lang/commit/0347d21b536bd8ce42de431a67c202806ff413f8))
* separate player from subtitle; forward native events; add player control config ([a5e4520](https://github.com/Jim-Elijah/fluent-any-lang/commit/a5e45201fd3eb323589d250f39dd3a1576516a33))
* **stats:** add practice time tracking and stats dashboard ([08bcd4c](https://github.com/Jim-Elijah/fluent-any-lang/commit/08bcd4c21e89546c483597fa93177dc9ffbcedbf))
* support video import, conflict overwrite, and media-bound subtitles ([19fe3b3](https://github.com/Jim-Elijah/fluent-any-lang/commit/19fe3b333f3d9fb3dd91beb42ba35353026afd93))

### Bug Fixes

* add custom event to solve segment mode not working ([25e4f92](https://github.com/Jim-Elijah/fluent-any-lang/commit/25e4f92453466abc9262720ed0b91c05799a4dd0))
* fix playlist not start at params.id; only render active page instead of hiding inactive pages ([dabf7c8](https://github.com/Jim-Elijah/fluent-any-lang/commit/dabf7c877270df761db6a399f0accdcc87775c04))
* locale should get from localStorage or fallback to sourceLocale; local-switch use ui-select; optimize formatDate ([ecda2b6](https://github.com/Jim-Elijah/fluent-any-lang/commit/ecda2b6d1f3fae74e76b020aa704e3aa03417373))
* **playback:** keep sync seek on zoomed segment and wait for longer track ([d4c9ce3](https://github.com/Jim-Elijah/fluent-any-lang/commit/d4c9ce328b29a72a71ea8d102cc9bb8358977bec))
