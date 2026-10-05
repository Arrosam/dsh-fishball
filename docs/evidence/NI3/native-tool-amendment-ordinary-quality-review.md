# NI3 native tool amendment: ordinary quality review

Status: independent static review of the authorized interface and fixture subset. This is not a CODE verdict, runtime result, source-origin proof, native integration result, or acceptance decision.

## Reviewed pins and scope

The source amendment Markdown and its companion JSON matched their requested SHA-256 pins. The candidate and focused fixture also matched their supplied full-file pins. The comparison used only the amendment's literal diff and semantics, the candidate's constructor validation and `toolCurrent`/`hostToolGuard` region, the listed `NativeAdapter` slices, the descriptor helpers in `runtime-security.mjs`, and the new six-group fixture.

| File | SHA-256 | Reviewed lines or fields |
|---|---|---|
| `docs/evidence/NI3/native-tool-source-api-amendment.md` | `a3248cc1715f96e1ff9b8e86a79e7caa96ee8f19607f52ce8dfd32971534d8ce` | Exact amendment |
| `docs/evidence/NI3/native-tool-source-api-amendment.json` | `aa58cd0f58aab788b9265f91dd61e18d0e94a6d88a5fce2e6a04164838ba15de` | `semantics`, `literalMinimalDiff`, and pins |
| Original `src/installed-audit.mjs` baseline | `80ed193a8f4dc6f395ff8372b4a8045ccd834d63c84ef386c3e6988ef5a3930d` | Baseline pin stated by amendment |
| `.runtime/ni3-native-tools-amendment/src/installed-audit.mjs` | `24dd8048135fc61f79a719288dbc00ea93f61a6a6dcbaffdb0a49db648764f1f` | 77–82, 290–321 |
| `.runtime/ni3-native-tools-amendment/test/native-tool-amendment.test.mjs` | `0546e78cf62b337b75d5330e9bb328db1642fc06c2d62271b49bbaa96b18cb54` | Six test groups, 122–207 |
| `src/native-adapter.mjs` | `caba6d841cc4db6825e5b5aebce95c7b83dab3a501a6602bfea91efb00b7c49e` | 101–109, 229–258 |
| `src/runtime-security.mjs` | `66fd91b6042eadf7de89c22d18e12a68ed27aec67a87aa4aaf7e5c6df0eda820` | `exact` and `canonical`, 9–32 |

No code, syntax, test, database, native, profile, provider, model, tool, network, browser, or Git command was run. No source was edited.

## Finding

**The candidate does not explicitly enforce the documented async-generator callback rejection.** At `installed-audit.mjs:80–81`, validation rejects proxy functions, async functions, and generator functions, but has no explicit async-generator-function check. The amendment semantics say async-generator functions are invalid, and fixture NT02 includes an async-generator callback as a rejection case (`native-tool-amendment.test.mjs:137–149`). Since execution was out of scope, this review cannot establish that the existing predicates happen to reject that distinct function category. Add an explicit async-generator predicate or revise the contract and fixture to match a proven classifier. This is a static contract/coverage discrepancy, not a claim that a runtime test failed.

No other finding arose within the reviewed subset.

## Interface and control-flow review

The candidate makes `nativeToolGuard` an optional eighteenth installer property: `exact(api, [...API, 'nativeToolGuard'], API)` keeps the prior API keys required, while the validation loop still requires every prior function except `ctx` (`installed-audit.mjs:78–82`). With the property omitted, `hostToolGuard` denies before callback invocation (`:312–315`). The fixture covers old-shape disabled construction and enabled omission/supplied-false denial in NT01 (`test/native-tool-amendment.test.mjs:122–135`). This is consistent with the amendment's additive compatibility intent.

The candidate's record checks align with the authorized adapter shape. `NativeAdapter#tools` supplies a frozen record containing `agent`, task/generation/claim references, tool and permission digests, and a frozen schemas array, then requires `this.#toolGuard(...) === true` (`src/native-adapter.mjs:101–109`). The setup path calls the tools check before installing the scoped `agentCtx.tools.guard`, then checks tools again during commit (`:241–255`). The candidate validates the plain record via `exact`, checks refs and an empty frozen schemas array, performs a WeakMap identity lookup for the opaque agent, and passes the same `record` object directly to the optional callback (`installed-audit.mjs:296–319`). Strict `=== true` handling at both candidate and adapter seams preserves literal false and denies other return values. Reentry sets a poison flag; the outer call rejects after callback reentry, and the guard repeats currentness checks after the callback (`:312–321`).

The fixture asserts original record and agent identity across the pending and recorded-claim phases for review and repair roles (NT03, lines 152–164). Whole-record identity also entails that its `schemas` property remains the same object at the callback. NT04 covers false, truthy non-booleans, promise/thenable/proxy values, and thrown callbacks; NT06 covers callback reentry and several currentness/lifetime withdrawals. NT05 covers malformed records, unsafe/foreign identities, invalid schemas, and denial before callback. These are fixture assertions only; none were executed in this review.

The focused fixture does not instantiate `NativeAdapter` or an actual host ToolRegistry/service. Its `composeNativeAudit` double calls the candidate's worker guard with a manually assembled frozen record (`test/native-tool-amendment.test.mjs:85–100`). Consequently, the actual adapter invocation shape/order was compared statically against the candidate seam, not exercised end to end. The amendment itself marks the real source-private callback as future/unimplemented; typed fixture callbacks cannot establish that actual source or native gates work.

## Disposition boundary

No runtime PASS is recorded. No receipt/envelope integrity review, original blocked CODE session, source/native proof, whole-suite or ticket/MVP acceptance, or browser/native acceptance was performed. The pre-existing final CODE gap remains blocked and unchanged; this ordinary static review does not close or replace it.
