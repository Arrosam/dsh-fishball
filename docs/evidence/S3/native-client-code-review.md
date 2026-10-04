# BUB014 native client independent code review

Reviewer: `/root/code_audit`, Sol6.1 max, independent of the host/client author and separate ISTQB lane. Owned evidence only; no author code/test/Git, dependency install, real host/browser/model/provider or credential action.

Status: **IN PROGRESS; corrected pure/native-library module unit has no unresolved observed finding. Exact integration freeze and actual rendered UI remain pending.**

Reviewed `src/client-entry.cjs`, `scripts/build-client.mjs`, generated `lib/client.js`, dedicated client/build tests and genuine public Connection/SlotCore/Cordis fixture composition. Host React is resolved only when the native lazy module factory materializes. Slots are additive, owned by lifecycle and disposed without disturbing root registrations. Build output is reproducible with `--check`; no downloaded bundler or alternate launcher exists.

RPC is the native operator-admitted channel for list/status/explicit scoped detail/control/intake. Content renders through React text nodes, without HTML execution. The view captures current task version/auth epoch and distinguishes cancellation request from confirmed stop. It has no approval button: hashes alone do not give informed consent; concrete target/data preview remains a required missing product capability. Stale/offline/terminal/unknown controls are disabled, errors use fixed public labels, and async reads use revision/disposal fences. No raw authority handle/key/store is exposed to client payloads.

| ID / severity | Reproduction and impact | Disposition |
| --- | --- | --- |
| UI-CR01 / Medium | Current detail captured; `control('pause')` awaits a deferred command digest; `disconnected()` advances connection epoch; resolving digest sends one stale-context mutation because call captures only the new epoch, then paints ready/stale:false. Intake has the same pre-digest boundary. | Captured original epoch before digest and revalidated active/current epoch/current control snapshot before send. Original independent reproduction now sends0 mutations and retains offline/stale:true. Author two-mutation digest regression independently passes. Final-tree repetition pending. |

An ancillary suggestion to add explicit reference length64 was adopted. It is not a separately reproduced defect: the actual Node22 regex helper rejected trailing newline in the independent probe. No newline authorization bypass is claimed.

Working command `node --test test/client.test.mjs test/client-build.test.mjs`: **11/11 PASS**, fail0/skip0, Node22.22.2. Includes real public Connection framing into encrypted RuntimeStore and owner CAS controls through synthetic streams/auth, real Cordis/SlotCore registrations with mocked renderer binding, deterministic generated-bundle verification, no listener/browser/network or external model. This proves module wiring, not rendered native UI, resizing, keyboard/focus/accessibility or real logout/window-close acceptance.

Pending: root package/name integration and exact reviewed hashes/tree; genuine native Web module load/render/control/visual consolidated regression; current identity/disconnect/logout handling under actual browser auth; full task detail/action preview/recipient result presentation and informed consent source AC. All deferred debt remains explicit. No full BUB014 acceptance follows from a JSON-tree renderer or native-library fixture.
