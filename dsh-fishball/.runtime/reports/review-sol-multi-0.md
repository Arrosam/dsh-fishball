# Independent MULTI-0 interface-freeze review

## Scope and disposition

- Reviewed `origin/dev/v3-multi-0` at `1249c517da7c88f899bcf9fd1ebdccb9d7966bb4` against merge base `e02ee05ec800f4fdd91436aedbc64ab92af84102` with `origin/integrate/v3-w2` (`6bae6635` when reviewed).
- Review branch: `review/v3-multi-0`. Only P1 contract corrections and their independent contract regression coverage are applied; P2/P3 remain findings. **No contract names, storage names, routes, model-tool scheme, or hosted handoff names are renamed.**
- Authority: [PLAN-MULTI](<../../docs/planning/v3-multi-dsh.md>), [DESIGN amendment](<../../DESIGN.md#L2203-L2230>), D01–D11/Q01–Q12, and the later direct user Q11/Q10 decisions: real sidebar CSS restyle scoped to Fishball/narrow; rc.1 below 768px uses its native drawer instead; other applicable narrow views retain the bar; fixed 44px horizontal overflow scrolling, no More menu or icon mirroring. These later decisions supersede the historical plan's separate tray/More proposal.
- These are **freeze** findings, not claims of reproduced runtime exploits. MULTI-1/MULTI-2/MULTI-3 product implementation and end-to-end rendering are not delivered by this branch. Two read-only reviewers separately checked SDK/protocol validity and contract completeness; an independent test author writes the security regression coverage. The implementation author did not read that new test code.

## P0 — 0

None found.

## P1 — 3 (all corrected additively)

### P1-01 — Fixed parent credential slots lack an explicit endpoint-epoch binding contract

**Locations:** [link.d.ts:33–39](<../../packages/core/contracts/link.d.ts#L33-L39>) and [fixed-parent reservation/amendment:56–85](<../../packages/core/contracts/link.d.ts#L56-L85>); [credential rules](<../../packages/core/contracts/constants.js#L550-L566>). The freeze retained an explicit origin-only saved-token reader and fixed pending-origin record while replacing the parent epoch on every canonical endpoint change.

**Failure case:** parent endpoint A → B on the same origin, possibly followed by restart or a late A token result. A fixed `hosted-agent`/pending reference lookup cannot distinguish those endpoints by name or origin. General retirement prose does not specify how the fixed-name exception must validate its stored payload; implementing the surviving origin-only reader can reuse A's credential at B or allow a late A completion to mutate B's handoff. This conflicts with PLAN-MULTI §3.1/§3.3/§5. Fixed hosted names themselves are required, valid, and must not be renamed.

**Concrete fix applied:** added [TargetCredentialBinding](<../../packages/core/contracts/targets.d.ts#L63-L77>) and the one `TARGETS.credentials.bindingField` constant. Core-private saved/pending payloads, including both fixed parent records, must validate `{targetId, endpointEpoch, origin, agentId}` and pending reference-value identity. The [hosted reader addendum](<../../packages/core/contracts/link.d.ts#L69-L87>) explicitly supersedes the origin-only reader: reconcile the durable epoch/instance URL before startup credential reads; retire/delete old binding material before new connection; reject cold-start stale binding and late generation save/unset/rebind. No instance wire/probe/name change. MULTI-1 must implement the binding and serialized/fenced credential lifecycle; contract checks alone do not prove that runtime behavior.

### P1-02 — Source-derived calls cannot express an expected epoch when creating a late bridge handle

**Location:** [target-bound selectors](<../../packages/core/contracts/targets.d.ts#L191-L219>) (original freeze lines 175–188 accepted only `{targetId}`).

**Failure case:** an interceptor receives source `(T,E1)`, awaits work, endpoint T is edited to E2, then it creates a new `bridge(...,{targetId:T})` and answers using E1's raw session/offer IDs. The creation-time capture silently chooses E2. Fencing handles created *before* retirement does not cover this race, and `ctl.commit(send)` accepts an arbitrary closure rather than validating its destination.

**Concrete fix applied:** additive `TargetSelector.endpointEpoch?`, exported with `TargetSelector`; `bridge` and `attention.signal` accept that selector. Event/history-derived callers **must** supply the source epoch. A mismatch at creation/dispatch fails closed (`supports:false`, `unknown-target`, no send), even when the handle is created after retirement. Intentional current-target `{targetId}` callers remain source-compatible. See the [normative source-bound example/rule](<../../packages/core/contracts/README.md#L163-L167>). MULTI-1 and same-side feature callers must adopt expected epochs for source-derived work.

### P1-03 — Inline JSON-quoted server names bypass the required untrusted-description boundary

**Locations:** [toolSource contract](<../../packages/core/contracts/constants.js#L587-L595>) and [description/persona example](<../../packages/core/contracts/README.md#L169-L193>) (the original example at lines 148–154 placed `toolSource(JSON.stringify(name))` directly beside trusted tool prose).

**Failure case:** a server name containing role-looking instructions or closing-tag text becomes part of a model-facing tool description. JSON quoting preserves the value, but is not the existing random-marker untrusted boundary required by PLAN-MULTI §4.1. The previous contract test checked a JSON round trip, which does not distinguish safe framing from unsafe inline assembly. This is a contract-level prompt-injection boundary violation, not a claim that random markers guarantee model immunity.

**Concrete fix applied:** preserve the formatter's existing signature/value; declare its result **INNER untrusted data only**. Require callers to wrap its entire result using the existing bridge `TEXT.untrustedOpen(marker)` / `untrustedClose(marker)` and a fresh locally generated `randomUUID()`, then append the trusted facade description. Reuse [the existing framing constants](<../../packages/core/src/bridge/constants.js#L111-L118>), rather than introduce another copy. The [normative assembly example](<../../packages/core/contracts/README.md#L177-L185>) keeps names out of trusted prose/persona. MULTI-1 must adopt this assembly at tool publication.

## P2 — 2 (reported, not changed)

### P2-01 — Target POST success shapes are contradictory and add's ID is optional in the shared result type

**Locations:** [shared route contract:85–98](<../../packages/shared/ui-seam.js#L85-L98>), [TargetActionResult and action requirements](<../../packages/core/contracts/targets.d.ts#L160-L188>), and [ConnectBegin:41–44](<../../packages/core/contracts/connect.d.ts#L41-L44>).

The shared comment says every POST returns `{ok:true,…}`/`{ok:false,code}`, then says Connect returns `ConnectBegin`, whose successful branches have `outcome` and no `ok`. It also says the rest return `{ok:true}`, while add is required to return its new target ID and `TargetActionResult` makes that ID optional. Parallel core/UI consumers can therefore choose incompatible bodies while satisfying different parts of the freeze.

**Concrete fix:** explicitly document the existing Connect exception (`ConnectBegin | refusal`, unwrapped), require add success `{ok:true,targetId}`, and give other actions `{ok:true}`/refusal. Add exact per-route response DTO/type and contract checks, preserving the existing 503 convention. Do not silently wrap Connect or rename any route. Not changed here because only P0/P1 fixes were requested.

### P2-02 — Historical Q10/Q11 prose still mandates the superseded More/tray design

**Locations:** [plan §6.2–§6.3](<../../docs/planning/v3-multi-dsh.md#L150-L156>), [resolved Q10/Q11](<../../docs/planning/v3-multi-dsh.md#L303-L305>), [DESIGN navigation row](<../../DESIGN.md#L2210>).

Those historical instructions conflict with the direct later user restyle/drawer/horizontal-scroll decisions. **There is no new navigation/icon/tray seam in the frozen constants or declarations that must be retained or renamed.** The issue is contradictory implementation instructions/documentation, not missing icon API.

**Concrete fix:** integrate MULTI-3's authoritative plan amendment, mark every earlier separate-tray/More requirement and checklist item superseded, and carry the real-sidebar, rc.1 <768px native drawer, and fixed-44px overflow-scroll rules into DESIGN and acceptance language. Remove obsolete tray/More/icon-mirroring requirements rather than add a seam. Left to the already-authorized MULTI-3 documentation/integration work; this review does not overwrite its concurrent amendment.

## P3 — 1 (reported, not changed)

### P3-01 — One targets storage domain is defined twice

**Location:** [TARGETS.store / bindingStore](<../../packages/core/contracts/constants.js#L605-L606>) (original lines 595–596).

`fishball_core_targets` is the same logical domain name for its two tables, but is independently written in both descriptors. It currently works on both SDKs; future edits can drift and violate the one-definition rule.

**Concrete fix:** define that domain name once in a feature-owned private constant and reference it from both descriptors. Keep independent table names and schema/version semantics; do not deduplicate unrelated state words merely because their present strings happen to match. No change made at P3.

## Checked and not findings

- **SDK validity:** both installed hosts accept domain `fishball_core_targets` and tables `targets`/`tool_bindings` under the real storage `^[a-z][a-z0-9_]*$` rule. Both credential-key/reference grammars accept the frozen fixed and per-target names. Exact `/api/fishball/targets` GET/POST paths are valid owner-only connection routes. No storage/route/tool rename is warranted.
- **Isolation/removal:** added-target token references and saved/grant record names include ID+epoch; origin/agent binding remains required; parent-only ownership is explicit. Target removal/endpoint retirement confirms, voids pending local cards, retains labeled read-only history, deletes retired token material, and sends no remote allow/reject/revocation. Unknown/voided handles fail closed. Actual crash/race safety is a MULTI-1 runtime obligation, not established by declarations.
- **Tool collisions:** readable pieces are internal only; final host names are bounded to 64 `[A-Za-z0-9_-]` characters, digest input includes target+epoch+resolved identity+local/remote origin+raw tool, and persisted tombstones/collision rejection prohibit rebinding retired names. Raw wire tool names/arguments and withheld tools remain unchanged; hash uniqueness is not assumed. No MCP `dsh` parameter is added.
- **Identity/name display:** raw MCP name and local duplicate alias remain separate from trusted ID/epoch; suffix allocation persists, checks complete-name collisions, and never renumbers existing targets. UI display is always plain text, including markup-looking/Unicode/long names. No title substitution or URL-derived name is allowed. The P1 fix closes the additional model-description framing gap.
- **MCP compliance:** [2026-07-28 Discovery](<https://modelcontextprotocol.io/specification/2026-07-28/server/discover.md>) carries identity at `_meta['io.modelcontextprotocol/serverInfo']`; [Resources](<https://modelcontextprotocol.io/specification/2026-07-28/server/resources.md>) permits the custom readable identity URI; [Subscriptions](<https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions.md>) uses `resourceSubscriptions`, acknowledgment and standard `notifications/resources/updated` with `uri` plus SDK-stamped `_meta` subscription ID. The freeze's real resource/list existence check, one stream, returned-discovery metadata, acknowledgment/reopen rediscovery, coalescing, generation fences and no metadata timer are coherent. Identity metadata is not authentication. No invented notification or misuse of tools-list changes found.
- **Package boundary:** new production modules are data/types only, with no Fishball↔DSH-side import. Each side's MCP copy is deliberately independently defined and drift-tested; this is not permission to share a package across sides. No new duplicate framing constants were introduced.
- **Completeness:** the collection/snapshot/actions, target-qualified event/card/manager identities, per-target Connect cancellation/callback rules, reserved hosted parent, global guards/manager/reminders and native UI target view are otherwise covered. Navigation remains UI-owned and requires no new freeze seam. P2 response DTO ambiguity remains the principal unresolved shape issue.

## Verification

- `npm install --ignore-scripts --legacy-peer-deps --registry=https://registry.npmjs.org` executed once, exit 0, using canonical `/private/var` TMPDIR, isolated temporary HOME/cache and `npm_config_userconfig=/dev/null`. npm reported 2 moderate/1 high dependency advisories; no dependency upgrade or registry publication was performed.
- Both SDK installations were selected through `FBTEST_DSH_VERSIONS`; `FBTEST_DSH_RUNTIME` points to rc.5's `node_modules`, the runner's required runtime root. No request for danger-full-access and no access to :7713.
- Initial full contract run: four package-boundary failures solely because local release tarballs had not yet been prepared. Ran the repository's local pack command (no publication); artifact integrity check passed. Repeated baseline: **2,111 tests; 1,655 passed, 0 failed, 92 skipped, 364 TODO** across both SDK entries.
- Independent security regression author added **62 passing cases** across both SDKs: declaration/value/normative-evidence coverage, bounded owning security sections/comment blocks, and execution of the published framing example with the actual existing formatter/framing constants and adversarial names. No product-runtime substitutes. The preceding revision was red against an isolated `git show 1249c517` contract snapshot (36 expected failures; compatible formatter cases stayed green); the final refinement was not rerun against that snapshot. Focused settled K3/K3a: **750 tests; 610 passed, 0 failed, 6 skipped, 134 existing TODO**. The implementation author did not inspect new test code; an independent reviewer checked it.
- **Final settled gate:** `node test/run-affected.mjs --suite=contract --sdk=both` — **2,173 tests; 1,717 passed, 0 failed, 92 skipped, 364 existing TODO**, exit 0. `npm run test:map` — missing/twice/v3Unowned/rootUnowned all **0**; `git diff --check` passed. Final local release pack/integrity check passed. Independent re-review of both production amendments and final test corrections found no remaining blocker. Full product/V3 suites and browser UI verification were not run for this interface-only review.

## Adoption summary

**No renames.** MULTI-1 must adopt credential `binding`, source selectors' expected epoch, and existing random-marker description framing; public fixed hosted handoff names, SDK names, MCP tool schemas and identity resource remain unchanged. P2/P3 are intentionally not fixed by this branch.
