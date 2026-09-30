## [0.6.0](https://github.com/Jim-Elijah/fluent-any-lang/compare/v0.5.0...v0.6.0) (2026-09-30)

### Features

* **library:** add keep-only action for echo takes in record list ([1c55f1d](https://github.com/Jim-Elijah/fluent-any-lang/commit/1c55f1daeca204bf49b6e5375af2e8bbc68d1d9c))
* **library:** filter recordings by Echo or Shadowing ([69601fc](https://github.com/Jim-Elijah/fluent-any-lang/commit/69601fc2b51380f226be76df956c360d22fec783))
* **library:** name the echo takes that keep-only will delete ([2422fb3](https://github.com/Jim-Elijah/fluent-any-lang/commit/2422fb3b7b9839e9f5b40f7197035b5e49aa4521))
* **library:** search recordings by title and subtitle text ([062e07e](https://github.com/Jim-Elijah/fluent-any-lang/commit/062e07ea64070e3c0b49eb5e4276d0fd4150f670))
* **nav:** pin library pages onto the app nav ([3e4f192](https://github.com/Jim-Elijah/fluent-any-lang/commit/3e4f192629e52993b5a2f1b2b6c518b313460318))
* **practice:** add shadowing range selection from subtitle start ([f099328](https://github.com/Jim-Elijah/fluent-any-lang/commit/f0993286e12b6943eb9eea1fe1e28265d2f4463e))
* **practice:** add subtitle source mask on practice page ([c4df277](https://github.com/Jim-Elijah/fluent-any-lang/commit/c4df277f532e5acf75e8441f48df2d8fa7814c74))
* **practice:** pause shadowing playback at selected range end ([edb0276](https://github.com/Jim-Elijah/fluent-any-lang/commit/edb02769b67d4d58447747a0b1a9f1ada044773a))
* **practice:** show subtitle ordinals and recording sentence context ([dcab145](https://github.com/Jim-Elijah/fluent-any-lang/commit/dcab14567faa820d0cb916619f7153bddeeb703a)), references [#1](https://github.com/Jim-Elijah/fluent-any-lang/issues/1)
* **settings:** make recording countdown seconds configurable (3–10) ([8984e63](https://github.com/Jim-Elijah/fluent-any-lang/commit/8984e63c184dff778803f74b0e13c1d9aa4409b6))
* **subtitle:** cycle source-text mask and remember the default ([6c9573f](https://github.com/Jim-Elijah/fluent-any-lang/commit/6c9573f450037bb9f8f3e9e8c746eb46d6fcd74a))

### Bug Fixes

* **library:** hide word layout toggle when source words are not shown ([b263a12](https://github.com/Jim-Elijah/fluent-any-lang/commit/b263a125ee75965b87636dc4c02644f20de4df32))
* **library:** include seconds in displayed timestamps ([bc82dfd](https://github.com/Jim-Elijah/fluent-any-lang/commit/bc82dfdd20602aa998e400a45a3c4fd7dac04537))
* **library:** preserve trailing spaces in search while trimming filter input ([ba73213](https://github.com/Jim-Elijah/fluent-any-lang/commit/ba73213df0333ce246924562d058603dc0b6800e))
* **library:** show back-to-library only after a hub section link ([9be637a](https://github.com/Jim-Elijah/fluent-any-lang/commit/9be637aa1749e3c9afb7ce5889f599cf9902dfb6))
* **library:** show full practice record excerpt with hashed ordinals ([b612950](https://github.com/Jim-Elijah/fluent-any-lang/commit/b6129502b1cf06ab15f1c870acc45dca73d634f6))
* **practice:** keep shadowing range select on across track changes ([11b1f7d](https://github.com/Jim-Elijah/fluent-any-lang/commit/11b1f7dbf7e76cefd83457a3749cccbda9289038))
* **practice:** use error toast when source align batch fully fails ([ee5fb05](https://github.com/Jim-Elijah/fluent-any-lang/commit/ee5fb05afd2c082943af4ddcd2e7c0a98598213f))
* **subtitle:** keep Echo score colors in fullscreen subtitles ([7bcee4f](https://github.com/Jim-Elijah/fluent-any-lang/commit/7bcee4f204ee74aa79ee365edee5f798ac4b2e82))

## [0.5.0](https://github.com/Jim-Elijah/fluent-any-lang/compare/v0.4.3...v0.5.0) (2026-09-24)

### Features

* **library:** turn Library into a hub with collection sub-routes ([a712073](https://github.com/Jim-Elijah/fluent-any-lang/commit/a712073b9d254b69e5a2cd258c951f783da330f0))
* **library:** unify batch selection and batch actions ([7671d1f](https://github.com/Jim-Elijah/fluent-any-lang/commit/7671d1fe96a3374a84d1846d6e001584e19b57d0))
* **practice:** add duration and compact layouts for score word markers ([7dd16b7](https://github.com/Jim-Elijah/fluent-any-lang/commit/7dd16b71e77d761d7e36fddc9cbaab55ea81c1e2))
* **practice:** add Speaking source word rail and align-all toolbar ([8d5d37c](https://github.com/Jim-Elijah/fluent-any-lang/commit/8d5d37c77d01daa08334aa1265be75efb6c40bb0))
* **practice:** batch source word align via one subtitle-span clip ([d13d057](https://github.com/Jim-Elijah/fluent-any-lang/commit/d13d0572cb0fc3d0e7620c07794ac03a0f2f2554))
* **practice:** clarify Source Word Alignment and source waveform labels ([9f1d9f6](https://github.com/Jim-Elijah/fluent-any-lang/commit/9f1d9f6b34130603b618dd1aacd308ee7b1586ba))
* **practice:** keep compare mode for word-span playback ([f346be7](https://github.com/Jim-Elijah/fluent-any-lang/commit/f346be70758edd0018578ed18ebe1386fa32ed5c))
* **practice:** overlay Source Word Alignment on the source waveform ([7fc3034](https://github.com/Jim-Elijah/fluent-any-lang/commit/7fc30346eba6a125ae9df6c8b8d52f23c314a684))
* **practice:** play only the clicked word span then soft-pause ([3b6fd29](https://github.com/Jim-Elijah/fluent-any-lang/commit/3b6fd29b1831505f93373769d801c578a3d0348a))
* **practice:** show Source Word Alignment actions only in source mode ([9bc5ba5](https://github.com/Jim-Elijah/fluent-any-lang/commit/9bc5ba5c6fb7f481f07d7afa890d42afd5dae2a7))
* **pronunciation-align:** send reference_segments for multi-line source align ([51dcc7c](https://github.com/Jim-Elijah/fluent-any-lang/commit/51dcc7c4264a2c0d0916f2288bdb697669685a24))
* **settings:** split speech services settings and standardize 原音词条 copy ([909ed6f](https://github.com/Jim-Elijah/fluent-any-lang/commit/909ed6fe58cc6eaafd00f8319f67f9caf6799713))
* **ui:** add small, middle, and large sizes to ui-button ([40f8305](https://github.com/Jim-Elijah/fluent-any-lang/commit/40f8305f2c7a9cc2a933f71423c44ae8a59a2fae))

### Bug Fixes

* **playback:** drop segment loop when Media has no Subtitle Track ([5d73f09](https://github.com/Jim-Elijah/fluent-any-lang/commit/5d73f092304180060e0a7b717ae245e47e8830f5))
* **practice:** avoid stale take waveform and lock player while recording ([27bef92](https://github.com/Jim-Elijah/fluent-any-lang/commit/27bef929864b92812d49019c64c9172a1452320e))
* **practice:** fix recording preview last-segment playback truncation ([5c47534](https://github.com/Jim-Elijah/fluent-any-lang/commit/5c47534b4806da1a990df6d79fb0cf4257efad18))
* **practice:** honor segment tail playback and exclusive source word assignment ([5157f57](https://github.com/Jim-Elijah/fluent-any-lang/commit/5157f57cbb4fa755cd37c5ee4b29815e25d7ae07))
* **practice:** keep audio-only Shadowing takes by duration ([9cf96c3](https://github.com/Jim-Elijah/fluent-any-lang/commit/9cf96c366fbf79c8cddeee4e99e4f441880dac95))
* **practice:** zoom recording preview waveform to segment speech bounds ([e5b7348](https://github.com/Jim-Elijah/fluent-any-lang/commit/e5b7348ab21bbd6f5b7da10c08043c5c083f8755))
* **subtitle:** keep Media.hasSubtitles aligned with Subtitle Track ([cc9d7df](https://github.com/Jim-Elijah/fluent-any-lang/commit/cc9d7df18021b85e439ee1fb557b836b5782b895))
* **subtitle:** keep speaker dialogue in text instead of as translation ([be4d0f5](https://github.com/Jim-Elijah/fluent-any-lang/commit/be4d0f5ad0ce120552286e502df2df6359355f3b))

### Performance Improvements

* **library:** batch IndexedDB ops for multi-select delete and export ([8826bde](https://github.com/Jim-Elijah/fluent-any-lang/commit/8826bde81286a18427af076ec9c0e3a2f29aac27))

## [0.4.3](https://github.com/Jim-Elijah/fluent-any-lang/compare/v0.4.2...v0.4.3) (2026-09-05)

### Features

* **sentences:** export sentence-bank audio with pairable echo filenames ([7241e96](https://github.com/Jim-Elijah/fluent-any-lang/commit/7241e96d78fc0b7e54c717ce919d0316b30a2d4b))
* **settings:** add reduce-speaker-echo mic preference ([9268060](https://github.com/Jim-Elijah/fluent-any-lang/commit/926806073f53a0e010e833ab4d21d0acdc1e56b7))

### Bug Fixes

* **app:** keep route loading reactive under Vite Oxc class fields ([f6c2f15](https://github.com/Jim-Elijah/fluent-any-lang/commit/f6c2f15a9f895f89f9923ce2dcb387e999c305b1))
* **playback:** resume loops without waiting for seeked on lock screen ([f6b345e](https://github.com/Jim-Elijah/fluent-any-lang/commit/f6b345ee8b80ccbf7943134831e2eecbb990c549))
* **playback:** resume segment loop after pause without waiting for seeked ([f124a01](https://github.com/Jim-Elijah/fluent-any-lang/commit/f124a018dd25077785f5dc7f15ac0e0a6c8cc754))
* **practice:** open Echo mic after listen so AEC does not mute the clip ([6d626e0](https://github.com/Jim-Elijah/fluent-any-lang/commit/6d626e0a059a2d58e65eb74fc47ccd793277e069))

## [0.4.2](https://github.com/Jim-Elijah/fluent-any-lang/compare/v0.4.1...v0.4.2) (2026-08-29)

### Features

* **practice-view:** implement lock-screen loop behavior for discrimination mode ([9ff19a0](https://github.com/Jim-Elijah/fluent-any-lang/commit/9ff19a029755bc05fac91c429717f1dcb5fffaaf))
* **practice:** resume last-played media from library and playlists ([8bc65ba](https://github.com/Jim-Elijah/fluent-any-lang/commit/8bc65baa87c8a80d6e86cddf73dd1d8cacd43188))
* **pronunciation-score:** highlight missing, extra, and misread words in score text ([784b8f8](https://github.com/Jim-Elijah/fluent-any-lang/commit/784b8f85851b142412eacb57d5e292bbfb456cb0))
* **pronunciation-score:** share four score bands and gate score actions on settings ([c736bb2](https://github.com/Jim-Elijah/fluent-any-lang/commit/c736bb2e7e0f11f831668d5ad40859266ca36bf9))

### Bug Fixes

* **playback:** clear active segment on leading/trailing gap seeks ([fae71fb](https://github.com/Jim-Elijah/fluent-any-lang/commit/fae71fbd4919979da2110b59ac687eb1d50e6c4c))
* **playback:** keep progress after seek during segment loop ([09de780](https://github.com/Jim-Elijah/fluent-any-lang/commit/09de7801aca198bfd539149117683c0504a47c63))
* **pronunciation-score:** keep word highlights aligned when reference text has CRLF ([5304b70](https://github.com/Jim-Elijah/fluent-any-lang/commit/5304b705b46f2270441347c2c7a852d10aede520))
* **pronunciation-score:** map fetch failures to network and abort errors ([a4392d3](https://github.com/Jim-Elijah/fluent-any-lang/commit/a4392d3fb365daa5b6413bbb822c6126abd1651d))

## [0.4.1](https://github.com/Jim-Elijah/fluent-any-lang/compare/v0.4.0...v0.4.1) (2026-08-24)

### Features

* **backup:** enhance playlist import functionality ([3a71961](https://github.com/Jim-Elijah/fluent-any-lang/commit/3a71961093c8e01bb6b9db3abd9eb36e5f29dfca))
* **media-controller:** enhance pause mode functionality with playback resume logic ([e01a4f3](https://github.com/Jim-Elijah/fluent-any-lang/commit/e01a4f3c4f17a2149afa34a3e51cb3eb144802b6))
* **media-controller:** implement native loop behavior for single mode with sleep handling ([07affc3](https://github.com/Jim-Elijah/fluent-any-lang/commit/07affc3948888a7fbd2bc6e92c39ce381518e348))

## [0.4.0](https://github.com/Jim-Elijah/fluent-any-lang/compare/v0.3.3...v0.4.0) (2026-08-21)

### Features

* add batch selection and delete to library lists, and make scoring strings localizable ([23d2580](https://github.com/Jim-Elijah/fluent-any-lang/commit/23d2580d67c8c80f7beb53d6806101ef3fb0b337))
* **practice:** add on-demand Pronunciation Score for Practice Records ([3bd02e5](https://github.com/Jim-Elijah/fluent-any-lang/commit/3bd02e51908fd79f77d037b0ae5cd5b0fe95f1b4))
* **practice:** align Pronunciation Score client with full-URL API contract ([086c1f0](https://github.com/Jim-Elijah/fluent-any-lang/commit/086c1f0fc3209d850b650ba87608b07f33ea41ed))
* **practice:** overlay Pronunciation Score words on the recording waveform ([04c8f17](https://github.com/Jim-Elijah/fluent-any-lang/commit/04c8f176fefad722df4654d4721621533db89ee1))
* **practice:** support Echo match prosody scoring on v2 API ([095bf2c](https://github.com/Jim-Elijah/fluent-any-lang/commit/095bf2c6b232d7aef075724a7870c0bcda14085b))
* **settings:** group settings into navigable sections with sticky nav ([3133631](https://github.com/Jim-Elijah/fluent-any-lang/commit/31336319378effad6803c72d4e72c357ec1e9986))
* **subtitle:** add filename mismatch confirmation and overwrite support for subtitle import ([b1e81ba](https://github.com/Jim-Elijah/fluent-any-lang/commit/b1e81badecc2ba14ec12cee81c370ab934b3457f))

### Bug Fixes

* **build:** enable Oxc legacy decorators for Vite production ([4ffc89a](https://github.com/Jim-Elijah/fluent-any-lang/commit/4ffc89acf8ef9674d9d294ab16c9d32d6ab46a7f))
* **practice:** drop incomplete trailing segment on manual shadowing stop ([3262218](https://github.com/Jim-Elijah/fluent-any-lang/commit/3262218984f27d33913a1771d3d485b7e0eaeeea))
* **practice:** hide score word markers while idle and regroup volumes ([c931f51](https://github.com/Jim-Elijah/fluent-any-lang/commit/c931f51fc8d4fb9c08406d1e79e1c3ae61564c5e))
* **practice:** refresh Echo after subtitle import and stabilize dual-track seeks ([fdd72c7](https://github.com/Jim-Elijah/fluent-any-lang/commit/fdd72c734e0b359b7a70a70f5b125fcba8a68c9a))
* **practice:** refresh Echo badges after score and delete ([486a9fb](https://github.com/Jim-Elijah/fluent-any-lang/commit/486a9fbfc72d9533d39db22d943508d310b7bd5d))
* **pronunciation-score:** keep prior success when re-score fails ([d5f3db5](https://github.com/Jim-Elijah/fluent-any-lang/commit/d5f3db59d8099c1df9a3188db6271b14976149a9))
* **settings:** sync sticky nav active section from scroll position ([797d337](https://github.com/Jim-Elijah/fluent-any-lang/commit/797d3379d0f64ea94b368d3d847ddcf5415ddf61))

## [0.3.3](https://github.com/Jim-Elijah/fluent-any-lang/compare/v0.3.2...v0.3.3) (2026-08-08)

### Features

* **pwa:** enhance update banner with expandable release notes and async script inclusion ([c2d44b5](https://github.com/Jim-Elijah/fluent-any-lang/commit/c2d44b5aaaec9a8c87e60d4ee9b9638478a7488d))
* **release-notes:** strip bold markers from changelog entries for plain text output ([9a23718](https://github.com/Jim-Elijah/fluent-any-lang/commit/9a23718ab17fb6a7737715c463dfaf8a827f0fd8))

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
