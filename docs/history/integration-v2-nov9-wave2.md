# Wave 2 integration — 2026-11-09

## Scope and provenance

Branch: `integrate/v2-nov9-wave2`, isolated worktree created from wave 1 `6c75abdde18f478a26c941691d1c10463ba4ea22`.

All requested changes were applied with `git cherry-pick -x`, in order, without squashing:

| Source | Integrated commit |
| --- | --- |
| `8e49a51cbe6a5a923f2872530e12e3c0f6e3d208` session route | `e2b2120351007eead12e16182e01c1fadfdc954a` |
| `a4a41a1614a25984f3f550301eb21effdc63e7f4` PG-1 | `c5b0f85977b2148f4d1ab1c42953ea3cc2174275` |
| `cbfc4b65766e183e39dc595ad7a7f8ac211eb46f` FN2 | `7e8473b7829ec46aae2e12d34bed694236ae2673` |
| `6ab2aa49b51c0b02b429893c4565b871aa8bc0d4` B4 | `530369f172fc18960b358a03500bcdc68e992bc5` |
| `214569ac741ce1242878f54b9407d7eb9953c440` B4 | `5180f80a8f245e01eca3ceae75dc697266041168` |
| `2de34aed20d39c5c9bf986155acf57104a30dc8b` B4 | `3a1fcffac5c05f305a66e797afbad4d7c3552c15` |
| `2b3df062dcd87c088a8b019dc55540c4703a2775` B4 | `a2a7cdebc27c43c6643edec434fc643c217ebfbc` |
| `bf4d0fde2205e06d61588a32023c862e9f84abfd` board search | `134e44e7e5d9387d96a42cb1417fe182ed462024` |

Conflicts: **none**. No manual source resolutions or additional behaviour changes.

`git log` and `git cherry 6c75abd dev/v2-board-tools` showed only the four requested B4 commits as new. B4 already descends from wave-1 B2 `784e1e5` (source `b168d907b364fe889e3248be0b7924b52d422c87`) and B3 `df672f7` (source `35a38c9968f467328438956a88bab47f19981292`). Those ancestors were intentionally excluded, not double-applied; no requested B4 commit was skipped.

## Contract and composition review

The [session route](../packages/instance/src/native-runtime/session-route.js) and [PG-1 lookup](../packages/instance/child-web/fishball-page/client.js#L117-L129) agree: document-relative `api/fishball/session`, default GET, same-origin credentials, no-store; 200 `{sessionId:string|null}`; 405 `METHOD_NOT_ALLOWED`; 503 `MANAGER_UNAVAILABLE`. PG-1 accepts a nonblank ID, treats null/503 as unavailable, and rejects other non-success/malformed responses without guessing an ID. This is code review, not browser end-to-end verification.

> Superseded on `dev/v2-page-open-session` (user decision 7.A, 2026-11-09): the route also accepts `POST`, which ensures the manager through `manager.ensureSession()` (X1a) and returns 200 `{sessionId}`; PG-1 calls it once on page open or Retry when GET reads null. GET is unchanged; 405 now advertises `Allow: GET, POST`. This addresses gap 2 below.

The [board index](../packages/board/index.js) registers board_write, board_read and board_search through the same manager X2 setup and lazy store. The [fold index](../packages/fold-notify/index.js) registers notify_user through reactive service injection and X2, not globally. No registration-name conflicts were found.

Independent read-only review identified these unresolved gaps; none was repaired because this task permits integration only, not new behaviour:

1. **Missing bundled placement (pre-existing prerequisite):** [initializeProfile](../packages/instance/src/native-runtime/installation.js#L140-L158) has no X0-B placement between nativeProfileBundles and loadProfileDirectory. The instance has no bundledPlugins list or exact-version bundled dependencies. Clean children therefore do not automatically load board/fold-notify/watchdog as required by [design §2.2](plugins/instance-extension-points.md#L131-L159). PG-1's bundle-name list merely hides Remove controls.
2. **Missing native-page manager activation owner:** the route is deliberately read-only, PG-1 only looks up identity, and chat.start does not itself activate/resume the manager. A child without pending/wake work or another activation source can remain at `{sessionId:null}`; Retry repeats lookup. Do not change the route into a creation API to hide this gap.
3. **Conditional board load-order/replacement risk:** the board index reads the optional instance once and returns if absent; the app publishes that service after asynchronous chat.start. If board loads first, it does not retry when the service appears. It also captures the old service on replacement. This is a code-path risk, not a demonstrated live startup failure.
4. **Fold compatibility guard gap:** registerManagerNotify consumes manager.registerSetup without checking apiVersion, unlike board and the route. Current own producer is v1, so this does not trigger on that producer; an incompatible service is not safely treated as an older instance.

## Existing tests — workspace-write, offline

Node `v24.22.2`. Each suite was run separately and sequentially for each SDK, using the existing fixture's runtime resolver (no install, custom preloader, assertion edits, or sandbox escalation):

```sh
FBTEST_DSH_RUNTIME="/Users/samuel/Library/Application Support/DSH/data/versions/<ver>/node_modules" \
  node --test --test-concurrency=1 --test-timeout=60000 \
  packages/<package>/test/instance-ext/*.test.mjs
```

| SDK | Package / suite | Pass | Fail | TODO | Exit |
| --- | --- | ---: | ---: | ---: | ---: |
| 0.2.1-rc.5 | instance / X0-C | 67 | 28 | 9 | 1 |
| 0.2.2-rc.1 | instance / X0-C | 67 | 28 | 9 | 1 |
| 0.2.1-rc.5 | board / B1 | 10 | 0 | 10 | 0 |
| 0.2.2-rc.1 | board / B1 | 10 | 0 | 10 | 0 |
| 0.2.1-rc.5 | fold-notify / FN-1 | 8 | 2 | 3 | 1 |
| 0.2.2-rc.1 | fold-notify / FN-1 | 8 | 2 | 3 | 1 |

X0-C counts are **unchanged** from the supplied wave-1 baseline. Output still shows the persistence failure at extensions.js:81 and the stale bridge-stub expectation. No attempt was made to fix that separately owned work.

Fold-notify's two failures are FN1-UC-LOAD-M and FN1-UC-LOAD-A: `ctx.inject is not a function` at index.js:11 in existing loading fixtures. A detached scratch checkout of exact wave 1 was run with the same plain command on both SDKs: **10 pass / 0 fail / 3 TODO** each. Thus wave 2 introduces two existing-suite failures (fixture/API mismatch), not a green regression result. Assertions and fixtures were left untouched.

These are the three existing package-local suites; they do not establish complete FN2, B4/search or native-browser coverage. No new tests were invented. Raw run outputs are retained locally under `.runtime/wave2-verification/` (ignored, not committed), along with the detached wave-1 comparison checkout.

Additional checks: every changed JavaScript file passed `node --check`; `git diff --check` passed; all existing test/fixture files are unchanged against wave 1. Independent review was completed before this report commit. No network, model invocation by product code, credentials, .npmrc, live profile/home modification, install, deploy or push was performed. SDK packages were used read-only.

## Disposition

Requested commits are integrated with provenance, but verification is **not all green** and clean-child composition remains incomplete. Only this report is added after the eight source commits. The final report commit SHA is supplied in the delivery response (a commit cannot embed its own SHA).
