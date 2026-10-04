# Independent rename compatibility code review

Reviewer: `/root/code_audit`, Sol6.1 max, independent of root/author and separate from ISTQB. Ownership is this evidence file only. No executable/test/Git edits, host/Web/browser launch, live/external inference, dependency installation, credential/personal-data or remote action.

Status: **PASS for the bounded committed rename and physical move.** Both findings, including the concrete orphan-sidecar follow-on, pass independent original-probe and module retests against `dd07d1bfba090bfa5a65be973191b544807eaa10`. The moved owned fixture preserves its prior settings and database. No confirmed rename finding remains open. Root preserved logical commit `05f5bddd5c797da366035667a24126c5d76ce6ec` and issued a separate correction; no history is rewritten. Owner amendment authorizes dsh-fishball/df, project MIT, eventual Arrosam/dsh-fishball and provider-neutral chat in this phase. This is bounded rename/development compatibility review, not Stage3 or full cross-stage acceptance. Historical BUB AC/aliases and frozen S2 evidence remain intact.

Initial review base: `c9856377c0edf8f662aa20a3dac7d00ab252a5d6`, with root's dirty rename source/scripts/tests/package/bundle diff. Initial review and remediation ran in `/Users/samuel/Documents/Codex/2026-10-04/task-6/bubbles` while authors were paused. Root subsequently moved the directory to `/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball`; the old directory is absent. The reviewed S2 security base is `88a25f0a6f12cf1371a40f1860052231b9fe2687`. Stage3 authors resumed after the move; their subsequent changes are excluded from this verdict.

Final immutable source: `dd07d1bfba090bfa5a65be973191b544807eaa10`. The final35-file manifest, [freeze-final.json](rename/freeze-final.json), has SHA256 `6fd9d26bdfe0303c508248e8ad9ca084745cf48fb2051275dcf07dd8a9877c52`. All35 entries match exact Git blob bytes. The initial [freeze.json](rename/freeze.json) and failed/intermediate runs remain historical evidence. Independent final tests use a disposable `git archive` snapshot of the exact final commit, with only a link to the existing pinned project runtime. No checkout, Git or author source is mutated. All35 snapshot hashes match before and after tests and the final probes.

| Final Git object | Identity |
| --- | --- |
| src tree | `ebbfd77497debf43d05f1cf93c6bd029eef26160` |
| test tree | `754e9c327d888938a752333f2f4841272021adb9` |
| scripts tree | `ffbec828a7d3a157282bf55e2f02f7547ef83c62` |
| lib tree | `dfcdb4f5f77d9f724cc529ee46c03d120828a405` |
| package.json blob | `a3d5d52df1cdec4e280a284a3f193819c56b703e` |

## Findings

| ID / severity | Exact reproduction and impact | Required disposition |
| --- | --- | --- |
| RENAME-CR01 / Low | Default native create ID changes `bubbles-${generationRef}` to `df-${generationRef}`, changing its SHA256 sessionRef. A valid unchanged create spec explicitly prebinds SHA256 of the original raw ID. The exact HEAD NativeAdapter accepts preparation; the first dirty renamed adapter throws `SESSION_MISMATCH`. Public pinned classes plus mock provider are used; creates0/streams0. Previously approved pending creation can no longer use its exact original binding. | Closed in the corrected working unit: exact matching legacy preallocated sessionRef selects the original raw ID; unbound new creates use df; resume still needs its trusted resolver. Independent original comparison now accepts both adapters; corrected create returns exact legacy sessionRef/raw ID with unchanged spec, creates1/streams0. No approved digest/spec is rewritten. |
| RENAME-CR02 / Medium | Initial `fixtureDatabasePath` uses `existsSync`. In a disposable directory, `bubbles.sqlite` is a dangling symlink. `lstat` confirms an existing entry, but the resolver treats it absent and returns `dsh-fishball.sqlite`. Subsequent opening can create a blank second store instead of exposing the missing legacy state. Follow-on actual probe: legacy main absent but `bubbles.sqlite-wal` present; direct legacy RuntimeStore correctly refuses `SCHEMA_UNSUPPORTED`, while the resolver selects the new name and creates empty schema3 beside the unchanged legacy WAL. | Closed after separate follow-on correction. Namespace decision lstat-checks main/journal/WAL/SHM for both names. Both namespaces are ambiguous; nonregular entries reject unsupported before orphan handling; regular sidecars without main reject orphaned. Genuine empty requires all eight absent. Independent eight main-entry plus30 sidecar/mixed/own-namespace partitions preserve exact bytes/entries/mtime. No cleanup/fallback occurs; regular same-name sidecars remain for the core's validity/recovery gates. |

The move dependency is satisfied by independent readback. Before the move, this reviewer captured the parsed project-controlled YAML and its legacy database hash without opening SQLite. After the move, the parsed YAML equals that baseline with exactly three substitutions: fixture ID `df-m1-fixture`, fixture module path prefix, and database path prefix. All seven rows, generation11, disabled account/model plugins, Web settings and existing UI setting are unchanged. The retained `cordis.patch.yml.before-rename` backup matches original SHA256 `6e2b607f8c5972a908267c8ed8f9dbfa1ef93b584f6b59df1b20f10d60c20cb3`; the rebased patch SHA256 is `6c3d96d7c2a80c8672cfdf038b91b3ba644a64a8075a70e1dada3a6b099bfa4e`.

The actual stopped synthetic `bubbles.sqlite` remains53248 bytes, SHA256 `0144f7f05bd4e12fd9ecde786509437f3274d16b82d3184e7642d477c48bc7a1`. There is no `dsh-fishball.sqlite` beside it. Read-only evaluation of the exact runner confirms its home, workspace, agents, evidence and private roots derive from the moved project; its fixed environment binds the moved DSH_HOME and DSH_AGENTS_HOME; default database resolution selects the retained legacy file. Neither `prepareWeb` nor `startWeb` is invoked. This is path/configuration proof, not actual Web/browser acceptance.

## Persistent identity and encryption proof

Byte comparison with the frozen S2 commit confirms11 authoritative modules unchanged: `ledger`, `runtime-store`, `runtime-security`, `foundation`, `coordinator`, `context`, `messages`, `results`, `control`, `environment`, `worker`. Thus schema3, canonical raw-ID/command/action hash derivation, consent/version/epoch, one-store authority and explicit unbranded `runtime-data/v2` AAD are unchanged by this rename. No automatic legacy reseal/quarantine path is introduced.

A closed verified-v2 synthetic fixture was created before branding at the reviewed S2 security base. It has schema3/cryptoVersion2, task version3/authEpoch1, encrypted context and a real held SQL reservation/claim. Original131072 bytes SHA256: `88dd55015b5fb01fd0b162df2464bcd9128d602300d04ba950978d1cbb6b5357`.

Independent renamed-reader execution uses separate copies named `bubbles.sqlite` and `dsh-fishball.sqlite`, with the same synthetic host key and exact trusted owner/workspace binding. Both resolve the intended file and return identical acknowledged facts:

| Preserved fact | Value/oracle |
| --- | --- |
| Context digest | `d9686a85df65c02990e161fc49401403cb5ef521100195b671fc87b0c72cf11b` |
| Approved action digest | `4e1071fe58c83b83e3147cd193615959ea6b9d835bb2803814fd5bee6ef2ea99` |
| Original claim | `ebb89bb28cac76451b3e79bea06a35432a3bb0d326f2cdaee6b752385ac31bb2` |
| Original reservation | `a55ca348a02b870946834c80eb5f41f63209cf4e0e658c7f851391830d511132` |
| Original generation | `e661f4c935e8a5a83349afb5e347695c2e972e967b50efcd618f93b0b7b4c24b` |
| Ciphertext integrity | Ciphertext, nonce, tag, metadata, digest, id, kind, owner/workspace/task all byte-identical before/after reopen; exact plaintext checked privately. |
| Expected reconciliation | Task3→4/recovery_required, action unknown, authEpoch1, held reservations1; actual internal claim UUID still hashes to the same public claim. No recreated effect or newly granted authority. |

The original fixture stays byte-identical and closed. Both disposable copies are removed. The two-copy parity probe passes again against the exact frozen final code after the directory move. This proves branding/file-basename parity of supported crypto2 data; it does not assert that startup recovery leaves the whole database unchanged.

Separately, the genuine prior-v1 pre-brand fixture repeats `CRYPTO_LEGACY_UNVERIFIED` refusal before and after the move, exact131072 bytes and directory entries unchanged (SHA256 `6ba315f73f694e08eedf07b540d8c0ad1955f36c585543dcf56e04840e1add51`). This is the security-driven provenance gate, not a branding incompatibility or successful migration.

## Interface, labels and dependency inspection

New active package/ModuleLoader ID `dsh-fishball`, Cordis service `df`, client main key/sidebar id `df`, and client/operator/facade channel `/df-rpc` align. Standard Schema vendors and lifecycle labels use `df`. RPC remains the native carrier with exact admitted operator; the rename adds no independent transport or authority endpoint. Generated bundle derives from the same own lazy factory and imports host React only; no new dependency/runtime is added.

The only memory aliases are exact `bubbles.fishball-memory/v1` and `bubbles.memory-projection/v1`. Scoped reads translate those labels in memory to the new exact versions without writing content or changing revision/source facts; unsupported future labels and foreign scope reject. These are pure/typed-store compatibility tests: actual schema4 memory storage remains pending and its explicit skipped cases are not passed. Existing durable memory command request hashes do not include the display/version labels; typed replay occurs before rederiving state.

Runtime lock629 package entries are semantically byte-identical after excluding only the two root-package name fields. Installed and tracked root-name-only manifest/lock bytes already match: lock SHA256 `68d3847884edf5b2c21d9d254bc059c3beb8105baec50c6d637c3328bbf187a3`; package SHA256 `eb5f3a7d6051aa5a3b267ad89cd9d3c24106590cdd7cef2367eed8fc2973a2d3`. Main peer dependencies/pins remain unchanged. No download, install or lifecycle execution is performed by this reviewer.

MIT is the explicit owner decision recorded in the amendment and project license/notices. This review does not infer whole upstream application/dependency rights or authorize publication. Actual live chat/accounts/provider delivery remain out of this phase; generic contract validation remains required.

## Executed checks and remaining gate

Initial command `node --test test/rename-compatibility.test.mjs test/client.test.mjs test/client-build.test.mjs test/memory.test.mjs test/operator-bridge.test.mjs test/runtime-plugin.test.mjs` passes34, skips3 explicit future schema4 memory tests, fail0, exit0,612.4ms, Node22.22.2. Independent raw TAP `/tmp/df-rename-code-targeted.tap`. This includes newest UUID fault cleanup, disconnect/digest races, exact native RPC/private-content/lifecycle and reproducible bundle checks. It did not cover CR01/02 and did not override the initial HOLD.

First corrected working command adds `test/native-adapter.test.mjs` to the same selection:48 PASS/3 explicit future schema4 memory SKIP, fail0, exit0,611.7ms. Raw independent TAP `/tmp/df-rename-code-corrected.tap`. `node scripts/build-client.mjs --check` passes. Own original native-identity retest and eight filesystem-entry partitions independently pass. Readiness was then explicitly withdrawn on the orphan-WAL reproduction; passing the earlier selection does not override that concrete finding. The corrected namespace decision, final committed identities and owned profile rebase remain required before completing this bounded review.

After the sidecar correction, `node --test test/rename-compatibility.test.mjs test/rename-adversarial.test.mjs`17/17 PASS, fail0/skip0, exit0,299.6ms. Raw independent TAP `/tmp/df-rename-code-sidecar-retest.tap`. The last independent test was added during preparation; actual TAP17 corrects the initially relayed provisional16 count. Own30 sidecar partitions also pass:18 orphan kinds across both names and each suffix,6 mixed namespaces,6 regular same-name sidecars. Sole nonregular sidecars return unsupported before orphan status; the retest follows that documented validation order while retaining zero-write assertions. Pre-move readiness is restored with no confirmed code finding outstanding.

Own independent probes: supported encrypted basename parity2/2; genuine old-v1 preservation1/1; actual legacy session before/after difference confirmed; dangling legacy filesystem-entry blank fallback confirmed. `git diff --check` passes. Initial probe setup failures from module URL/import handling and the distinction between ordinary SHA256 session IDs and workerDigest were corrected before the asserted native comparison; they are not production defects.

Final exact-snapshot command:

```text
node --test test/rename-compatibility.test.mjs test/rename-adversarial.test.mjs test/client.test.mjs test/client-build.test.mjs test/memory.test.mjs test/operator-bridge.test.mjs test/runtime-plugin.test.mjs test/native-adapter.test.mjs
node scripts/build-client.mjs --check
```

Node22.22.2:65 cases,62 PASS, fail0, three explicitly deferred schema4 memory SKIP, exit0; TAP duration609.356375ms. Raw independent TAP: `/tmp/df-rename-code-final.tap`. The reproducible bundle check exits0. This includes the actual public Cordis/Slot/native carrier fixtures and deterministic local AgentLoop test, with no external model/provider invocation or Web process. After testing, the final manifest remains35/35 exact. No W1 or complete cross-stage regression is rerun or credited.

Final own original-oracle retests against the same archived code: eight main filesystem partitions PASS;30 orphan/mixed/regular-sidecar partitions PASS with no writes; exact legacy preallocated native session before/after PASS, spec unchanged, creates1/streams0; two verified-v2 basename copies PASS; genuine old-v1 byte-preservation refusal PASS. Independent moved-profile/read-only runner checks also PASS. Local probe-output JSON parsing was adjusted for Node's SQLite warning after the probe itself returned exit0; no assertion or production behavior is relaxed.

Bounded conclusion: rename and physical move are ready for local development integration. Frozen S2 evidence is historical and unchanged. The skipped actual schema4 memory cases, further Stage3 code audits, and consolidated functional/visual/native/provider-neutral contract regression remain explicit later gates. Actual live chat/accounts/provider delivery remain outside this phase. This review does not accept any complete Stage3/full ticket/MVP/visual/provider/release criterion.
