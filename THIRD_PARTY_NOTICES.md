# Source and host notices

The project [MIT license](LICENSE) was expressly selected by the owner. Attribution uses the verified local Git owner name, Arrosin. The local history and future public preview retain this grant; publication is still conditional on full agreed acceptance.

## fishball memory subset

The owner-authored ESM memory module translates algorithms and data/persistence semantics from these exact fishball revisions: `f4a887d37b4c60a65ccc7c22fd87b19639287a0a` and cached release `32ac8236bdb8d93c0a895b81557c4d915cf5e80c`. Both pinned READMEs declare MIT. The exhaustive bounded histories of the five incorporated memory/similarity paths identify only authors/committers privately matching the owner identity and AI trailers; no separate human contributor or conflicting notice was identified. No full upstream root LICENSE/copyright text exists at those inspected pins, and no guessed upstream notice is supplied. [Provenance](docs/fishball-provenance.md) records exact paths, source-byte hashes, history bounds, semantic changes and the limited reuse boundary.

The whole Kotlin core, Android application, HTTP gateway, original provider/retrieval integration and original third-party dependencies are not incorporated. No personal fishball files are inspected or automatically imported. New source incorporation requires its own provenance and notice review.

## DSH host dependencies

The plugin uses installed public DSH services and loads native React through the host's module loader. It does not bundle DSH, Cordis or React source into the plugin client. Host packages live in ignored project-local development isolation. Their own package license files remain present; no declaration here relicenses those packages.

| Inspected host package | Pinned version | Declared license and actual notice |
| --- | --- | --- |
| `@deepseek-ai/dsh` | 0.2.1-alpha.1 | MIT; Copyright (c) 2026 DeepSeek |
| `@deepseek-ai/cordis` | 4.0.5-alpha.1 | MIT; Copyright (c) 2021-present Shigma |
| `@deepseek-ai/dsh-session`, `dsh-user-approval`, `dsh-agent-loop` | 0.2.1-alpha.1 each | MIT; Copyright (c) 2026 DeepSeek |
| `@deepseek-ai/dsh-client-connection`, `dsh-client-ui-renderer`, `dsh-client-ui-layout`, `dsh-client-ui-sidebar` | 0.2.1-alpha.1 each | MIT; Copyright (c) 2026 DeepSeek |

Inspected actual LICENSE SHA256: DeepSeek packages `ebb4f09972aee8608be255debaf78451a68e95c290f55c240dec2ecfa16ea6be`; Cordis `034fb52b1d57360ecbae6cb1632a88f86fd7c3d3f5631a5f082710203dda0be7`. The exact host dependency lock is tracked. Development installs disable lifecycle scripts. No Kotlin/Ktor/Android or added build dependency is downloaded or linked by this project.

This is an audit of the incorporated subset and directly used host boundaries, not a claim that every unincorporated fishball or DSH transitive dependency has been redistributed or cleared. Packaging must keep ignored runtime/profile/database files out and retain this notice and LICENSE. Any future bundled third-party bytes require their original complete applicable notice.
