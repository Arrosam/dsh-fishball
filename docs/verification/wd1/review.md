# Independent WD-1 scope/code review

Date: 2026-11-09. Independent reviewer: separate-context read-only agent; parent verified the primary source references. No product changes.

## Conclusion

No concrete defect was found in the five-file WD-1 package/config skeleton. Acceptance is limited to W0 package/config/schema/load behavior. The settings delivery assumption is a real, still-open integration/ownership gap, not a passed user journey and not permission to drop the requirement.

## Aggregate Config versus automatic Settings

[Config](<../../../packages/watchdog/src/config.js#L27-L41>) is deliberately a nonvolatile root transform so the complete candidate is validated together. Adding `Config.dict` preserves field introspection but does not change the transform into an editable object or add volatile metadata.

Both installed SDKs expose only volatile forms:

- [rc.5 Settings filter](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-settings/lib/index.js#L118-L131>), [describe](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-settings/lib/index.js#L413-L419>), [write refusal](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-settings/lib/index.js#L501-L507>).
- [rc.1 Settings filter](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-settings/lib/index.js#L118-L131>), [describe](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-settings/lib/index.js#L413-L419>), [write refusal](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-settings/lib/index.js#L501-L507>).

Consequently this Config supplies no automatic native Settings form/update path on either SDK. This is SDK source evidence, not browser evidence; no real Settings service/profile was started.

## What can legitimately be deferred?

**Yes, persisted save behavior can remain later-task work for this expressly scoped W0 skeleton.** The approved [test](<../../../packages/watchdog/test/instance-ext/wd-1.test.mjs#L212-L230>) and [story](<../../test-design/instance-ext-w0-skeleton-use-cases.md#L64-L82>) explicitly leave `WD1-ST-BUDGET-SAVE` with **WD-1/WD-12**: saved growth 10000 → reject 9984 atomically while retaining 10000 → accept/persist 9985. Native parsing/validation cannot prove this transition. The model-window save/refusal obligation remains **WD-1/WD-8/WD-12** (window 27023/27024/27025 gives R15999/16000/16001), not implemented by this skeleton.

**No, missing Settings UI is not established as automatically solved by a named later task.** The original [watchdog §9 assumption](</Volumes/SSD1/GitHub/dsh-fishball/.agents/worktrees/design-watchdog/docs/plugins/watchdog-design.md#L792-L805>) says the existing settings page draws the schema. Canonical [§11.8](<../../plugins/instance-extension-points.md#L1427-L1447>) moves plugin forms to native Plugins slots; [PG-1/SET](<../../plugins/instance-extension-points.md#L615-L617>) owns navigation/moving/linking, not a nonvolatile aggregate editor. These documents do not establish that the assumed automatic native form supports this schema.

Record as a **delivery/task-ownership gap**: explicitly assign a native-compatible editor and whole-candidate atomic persistence to the **WD-1/WD-12 continuation**, coordinating **SET/PG-1** presentation, or obtain a clarified split from the requirement owner. This is a recommended allocation, not a claim that the task table already assigns all that work. Do not mark WD-1/WD-12 save TODO or the full settings journey passed/complete until there is an accessible native form, a declared save route, validation before write, invalid-candidate retention, valid persistence and reopen/reload evidence on both SDKs.

The official config editor offers a reuse seam: [rc.5 edit](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-config-editor/lib/index.js#L69-L83>) and [atomic-write/rollback](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-config-editor/lib/index.js#L123-L129>); [rc.1 edit](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-config-editor/lib/index.js#L69-L82>) and [atomic-write/rollback](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-config-editor/lib/index.js#L122-L128>). This package connects no editor/save API. Source inspection is not persistence verification.

## Supplemental test/safety review

The separate-context author derived the native SDK checks from supplied requirements without reading product or approved WD test implementations. Parent and the independent reviewer inspected the authored checks before execution. Review caught two authoring/API assumptions before the initial test commit: rejection must not require an unspecified TypeError (aggregate validation may throw RangeError), and Cordis 4.1 exposes normalized config through `effectiveConfig`, whereas Cordis 4.0 uses `config`. These were corrected before execution, without changing any product or WD44 case. The native suite must use a version-compatible normalized-config observation.

The initial preload was independently reviewed as passive and safe for WD44. Review recommended blocking local server creation in addition to outbound network/process launches. The final preload also blocks TCP server `listen` and UDP `bind`; final WD44/native runs use this hardened preload. It is a bounded JS tripwire, not an OS security boundary; it does not claim to cover arbitrary native code, DNS or Worker entry points. Reviewed imports do not invoke those APIs.

## Other non-claims

The skeleton deliberately registers no readiness, claims or side agents. It cannot prove supervision, failure hand-over, recovery, model checks, canonical runtime byte measurement, card routing, rollover, output accounting, MCP or UI. The 24 approved owner TODOs remain obligations, never passes.
