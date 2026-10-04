# Consolidated development regression and remaining acceptance gates

Outcome: authorized local development has reached Stage3, and all currently runnable consolidated tests pass. **The complete source tickets, Stage3 acceptance, MVP and publication remain HOLD.** Independent final CODE, actual rendered Web validation and portable production installation are incomplete; tests do not waive them.

Repository: `/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball`, current feature branch `feat/S3-integrations`. The owner renamed bubbles to dsh-fishball/df and chose MIT2026Arrosin/no email. Eventual public target is Arrosam/dsh-fishball, with no remote/push/publication now. Main retains reviewed Stage2 local development integration `3b136e1`; granular foundation/preparation/Stage2/Stage3 branches remain intact. Stage3 is not squashed into main without its required final code review.

The repository, tracked AGENTS, six-stage workflow, local ticket register and acceptance criteria preceded implementation. [Three-stage mapping](../../three-stage-development.md) retains BUB001–016 including007A/B and current DF aliases. [Traceability](../../acceptance-traceability.md) preserves82 original AC plus5 provider-neutral chat criteria. Actual chat software/accounts/providers and mobile/Hydrogen remote control are explicitly out of this phase; no other scope is silently removed.

## Exact tested source and environment

Application correction commit `6c830caef7d5748e4bc2afda0168cdca1a933b3c`; independent test-only React hook fixture amendment `ed17a70a26f74e97852043d1752f0e26cd214e4e2d540984d1a1578250b7687c`. [88-file executable/config/API/notice freeze](executable-freeze.sha256) SHA256 `29c53e4e76b26cdc9b9f841346b6279f6b60c85a691c08207aaad34f9dc55041`; [all88 after-run checks](executable-freeze-after.txt) match. Production source did not change for the final regression correction.

Actual environment: Node22.22.2, npm10.9.7, macOS27.0 build26A428 arm64; pinned official DSH Web0.2.1-alpha.1, Cordis4.0.5-alpha.1 and separately installed project-local public peer packages. [Public host readback](public-host-smoke.txt) records exact versions/source hashes/runtime-lock digest and supported capability checks. Old installed Desktop was not modified. No dependency download/install/lifecycle script, SDK harness, daemon, live model/provider/account or personal fishball inspection occurred during this regression.

| Check | Result and exact scope |
| --- | --- |
| Consolidated Node suite | **751/751 PASS**,0fail/skip/cancelled,30.329830291s,exit0; [raw TAP](consolidated.tap), SHA256 `5fea35bc468803cabe0651368fabf0a939d1a9042dd6ac1caaa4ef170a26174a`. |
| Final syntax |78ESM files,exit0; [output](syntax-final.txt). |
| Generated client bundle |`node scripts/build-client.mjs --check`,exit0; [captured output](client-bundle.txt) is empty on success. Existing bundle bytes are frozen. |
| Public installed-host smoke |11foundation loads/10reloads/11deduplicated entries, native permission rejection,0inference calls, no profile access; exit0. This is public-library execution, separate from the actual runtime profile. |
| Minimal native Connection reproducer |3/3PASS,0skip,exit0; [raw](native-connection.tap). Default-provider missing dependency, supported original-profile injection, and native API ownership boundaries are separate cases. |
| Independent runtime profile/backing correction |77/77PASS,0skip at stable22-file author manifest; original19/35 bodies and compiler1 preserved. Public compiled-layer selection and provider/backing identity cannot be inferred from literal patch tests. [Independent review](../S3/native-client-test-review.md). |
| Actual owned native Web |Original native303/401/401/403/200; one protected task/context/source, full quit and same-key/database/auth restart; exact state retained, no duplicate work,0model/tool/recipient attempts, final host stopped. [Lifecycle report](native-web-lifecycle.md). |
| Retained AC/source |529Chinese source lines byte-identical toabb28b7,82original+5current rows,0duplicates/omissions/missing local links; [check](traceability-check.json). |

The consolidated command was:

```sh
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin DF_FISHBALL_CORDIS_REVIEWED=1 /opt/homebrew/bin/node --test --test-concurrency=4 test/*.test.mjs
```

The review flag enables the same already-authorized disposable installed-public-Cordis memory fixture; it does not authorize profile, personal data, model or provider work. File-level test concurrency is bounded at4. Real process/SQLite migration/crash/revoke/admission tests and public DSH local deterministic AgentLoop fixtures are included; model output remains mocked, and arbitrary external side effects are not exercised.

## Preserved first failures and correction

The [first consolidated TAP](consolidated-first.tap) had751tests/749pass/1fail/1skip,exit1,33.515118917s. [First metadata](consolidated-first-run.json) and [original88-file freeze](executable-freeze-first.sha256) are immutable. The legacy rename identity React stub lacked useEffect now used by the panel. The independent ISTQB owner reproduced it, added only deferred hook registration/comment, retained every original identity assertion and scenario, and passed focused1/1 plus complete rename13/13. Separately, root used the historical BUBBLES fixture flag after its explicit rename to DF, causing the single skip; the final command uses the current flag. [Freeze delta](fixture-correction-freeze.json) confirms only that test file changed. No failure/assertion was removed and no product source changed.

Actual native dependency/compiler/credential/path-binding first failures and the corrected public original-provider solution remain in [native lifecycle](native-web-lifecycle.md) and the linked Stage3 reports. Root never substitutes a wrapper, alternate transport, private host register, global patch, reset or raw credential import for the public configured-profile oracle.

## Local packaging and source evidence

The package remains `dsh-fishball@0.1.0-preview.1`, private/MIT, with no lifecycle scripts. Offline `npm pack --dry-run --json --ignore-scripts` uses project-local empty user/global configs and ignored cache. The [first dry-run](package-dry-run-first.json) excludes runtime/profile/key/auth/access/database/backup/cache paths and includes source/exports, license/notices and exact runtime lock. Final dry-run/source-archive evidence is recorded separately after evidence closure. The existing historical blocked-browser JPEG was visually inspected only for packaging privacy: it shows the loopback client error, without a token/profile/personal page. This is not a new product render or visual acceptance pass.

Capability imports still require the colocated ignored development host; source archive/package success does not prove portable installed-host resolution. Production trusted identity/key composition, installed-host resolution and actual native install/uninstall need implementation/acceptance. DSH/Cordis/React source/runtime/credentials are not bundled in the plugin archive; exact peer pins and incorporated fishball subset provenance/notices remain tracked.

## Remaining gates

- **Independent final CODE blocked:** [exact reviewer interruption](../S3/review-session-blocker.md). The service twice reported a possible cybersecurity flag without a denied tool/operation. Root stopped retries and did not reroute the blocked experiment. Supported session recovery is required; no invented permission or OAuth expansion. Current final code/receipt/migration/native/adapters/notifications/UI verdict remains absent.
- **Actual browser/visual blocked:** no callable supported browser observation/control/Node REPL/CUA in current inventory. Earlier browser loopback returned ERR_BLOCKED_BY_CLIENT with unknown cause. No alias/proxy/CDP/AppleScript/security bypass or manual owner QA substitute. Native list/detail/control/navigation, keyboard/focus/resize/long Chinese/window-close/logout remain unpassed.
- **Portable production install unresolved:** current probe depends on the ignored pinned development host, and runtime default lacks trusted identity/key/adapters. The smallest supported Connection setup is established; that does not complete production install/uninstall.
- **Production policy inputs and real worker/audit acceptance pending:** grouped in [decisions](../../decisions.md): model/catalog/provider/preset/tokenizer/pricing/limits, retention, pairing/secrets, environment, source/schedule/timezone/quiet, recipient/access and audit categories/rounds. Synthetic technical caps are not owner-selected production defaults. No real inference is authorized; a concrete model/request/limits/cost/effects proposal is required before any actual invocation.
- **Library binary transfer unresolved:** supported consumer-local DOCX materialization returned exactly `library file transfer failed: download failed`, with no specific cause. Neither local DOCX nor PDF bytes are claimed. Supported Library text supplied the preserved529-line approved source; no guessed cloud path/URL or transfer bypass.

All remaining source AC are retained in [acceptance debt](../acceptance-debt.md); actual chat platforms are out of this phase, not a failed prerequisite. The next work is supported CODE/session and browser capability recovery, then portable production composition and owner-selected bounded real native-worker/audit acceptance. No remote repository, push, publication or stable designation occurs before full agreed MVP acceptance.
