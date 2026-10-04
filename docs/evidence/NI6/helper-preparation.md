# NI2→NI6 physical helper preparation

Status: **PREPARATION ONLY; no source GO, package emission/installation, profile mutation, native launch, HTTP/authentication, provider/backend initialization or acceptance.** Root granted this separate preparation lease after local NI2 contract/design freeze `3bee1c0` and NI4 freeze `8e89475`, while product authors are actively changing source. This document is authored infrastructure planning, not independent CODE/ISTQB execution or an actual native run.

Bound inputs are [NI2 contract](../../normal-worker-contract.md) SHA256 `c3c55af46f5ec2dc2f23a045b45129e70201024029fc33a28cc976abdeaa198b`, [independent design](../NI2/test-design.md) `f37f4b66e2c5f69a818afd83c52c7040cc3cf5c00c47b5d5de5336bd954efaea`, [public findings](../NI2/host-interface-findings.md) `c14b6171214c4535fc3809d0cb8240f37ebd57f8ba94bfd87bf3835e7e81b7f8`, and frozen flat host lock `68d3847884edf5b2c21d9d254bc059c3beb8105baec50c6d637c3328bbf187a3`. Existing NI1 native proof is a reference with its own bounds, not NI2 PASS.

New files exist only in ignored `.runtime/ni2-install/preparation`:

- `preflight.mjs`: Node builtins-only readonly metadata helper. No spawn/fetch/product import/write or credential/key reader. It checks exact held contract/lock, root-provided archive/manifest hashes, canonical current-UID safe owned paths, fixed five-key environment,17 original public package source/version pins, and physical installed public files/normal+testing-provider exports. Its output excludes paths/auth/key values and explicitly says launchAuthorizedfalse/nativeAuthorityVerifiedfalse/classIdentityVerifiedfalse.
- `root-input.example.json`: placeholder-only root input shape; zero hashes and `$NI2` placeholders are deliberately not usable native artifact/config values. Root selects actual canonical fresh fixture paths and held artifact/manifests after separate GO. It supplies no factory/auth/persistence substitute or model/cost proof.
- `recipe.md`: root-controlled original CLI/Loader/profile/auth/preset/JSONL setup and later smoke ordering. Numeric worker/memory/policy/TTL/charges/compression choices remain explicit pending fixture selections; no production default is inferred.

The helper's metadata PASS cannot authorize a process, prove native class identity, actual compiled profile selection, current OperatorPeer, captured factory backend or model/request/outcome. It deliberately remains insufficient until root holds product source, prepares a separate physical package and authorizes/refines actual observation/authenticated smoke. It accepts canonical inputs under the NI2 owned fixture scope; source manifests can originate in root's tracked evidence. It rejects symlinked/unowned/writable selected entries and mismatching byte pins. It is a bounded setup check, not confinement against malicious same-UID filesystem races.

Reference files read, without running them:

| NI1 helper | SHA256 |
| --- | --- |
| `.runtime/ni1-install/launch.mjs` | `6e569f8ec809a50a75d5c68b23ee825c176b922125604c6dc6a916f7089e93f1` |
| `.runtime/ni1-install/observer.mjs` | `51d9502f0ad2f81911f678017c146e868239d576e5798eb9edcdadf86c560bec` |
| `.runtime/ni1-install/smoke.mjs` | `75e7f91e33755c37af84e1a4e391067cb7ae9bf148ec9ce4c960ee4442a6fd7f` |
| `.runtime/ni1-install/stop.mjs` | `1feec1de33744e176f9a91767d14bfdd6ec7454135b0c0f54ac02ba53de0ae21` |

NI1's blanket request-denial observer cannot be copied into NI2 as a successful worker observer: it would prevent the one explicitly authorized local stream. Future observation must measure original actual events and the source-owned deterministic provider without replacing request/factory/auth/backend behavior or accepting JSON proof. NI1's memory-only capability assumptions and zero-provider count also do not apply to an explicitly added NI2 testing provider. Root must refine those allowlisted assertions against final source before any process run. No existing helper, actual profile, auth backing, key, database or evidence was edited during this preparation.

The future sequence is explicit setup/storage and plaintext persistence disclosure/consent; source/catalog refresh; concrete policy prepare/accept; native intake/current goal+constraints/protected context; derived worker action; concrete action preview; explicit owner expiry+grant; original idle create0streams; explicit execute1; duplicate0additionalstreams; exact-live scoped SessionStore.flush participationtrue plus original public persisted owned read; source-bound capture/result; explicit factual finish/stopped/settled distinction. Configuration, consent, grant, create or injection alone starts no stream. Current normal resume is not implemented by NI2; original BUB004/BUB008 resume/continuity stays later pending. Quit/restart preserves original key/vault/backend/claims and unknown obligations without auto wake/recreate/replay.

NI3 later expands total attempts through separate explicit accepted policy while maxActive1 remains fixed; independently charged reviewer/repair incarnations are sequential and source/material/round bound. NI4 uses separately chosen private event/schedule registration and owner-approved missed plans, no chat provider/anonymous ingress or automatic grant. NI5 requires exact reviewed result/manifest, explicit notification policy and current supported local recipient facts; sent, consumed/delivered and current access remain separate. Their protocol helper implementation is pending until corresponding product APIs and held schemas are ready. No fake endpoint, synthetic report/output flag, provider-name price claim or substituted persistence can close those oracles.

Only syntax and preparation self-checks are permitted in this lease. Root will separately approve packing/installing/compiled profile/public original CLI/auth/native smoke from the final held source. Raw token/cookie/key/access URL remain ignored private0600, never console/YAML/evidence; only bounded status/count/digest/PID/source facts may be captured. The fixed loopback remains127.0.0.1:3080/no-open. No browser alternate route, blocked CODE rerun, core-corruption experiment, personal data/account/credential access, external model/tool/recipient action is authorized. Final CODE/browser/model-quality/full source-AC/MVP/publication gates remain HOLD.

## Preparation checks and unused inputs

Executed only these new helper checks from the repository, exit0 each:

```text
node --check .runtime/ni2-install/preparation/preflight.mjs
node .runtime/ni2-install/preparation/preflight.mjs --self-check
```

Self-check reports10 lexical/closed-input/manifest refusal checks,0filesWritten,0productImports,0hostProcesses,0HTTPRequests,0credentialReads and nativeAcceptancefalse. It reads only its placeholder template and does not exercise metadata preflight against an actual host/profile/artifact. No actual owned NI2 profile/key/auth/database/session state has been prepared or inspected by this lane. No runtime-policy denial occurred. Helper/source/doc hashes are recorded in ignored `.runtime/ni2-install/preparation/preparation-held.sha256`; this is a preparation snapshot, not an executable product freeze.

Still unused/unselected: final product tarball/manifest/hash and fifth export; actual physical host/profile/installed origins; reviewed selected empty preset/id and final compiled layers; original JSONL host-row root/compression and separate consent; worker/memory/request/result bounds and charge/policy/TTL selections; actual auth/provider/backend/class/lifetime/flush participation; dedicated observer and supported authenticated smoke implementations; concrete NI3–NI5 operations/source holds and later resume. The helper refuses missing/mismatched metadata rather than filling choices, mounting services, replacing an adapter/factory or treating0cost/idle as evidence. Root's later refined helper must preserve actual request input, committed result/usage/capture/stop/settlement oracles and stable unknown retention.
