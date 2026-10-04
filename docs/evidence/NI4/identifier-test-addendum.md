# NI4 independent trusted-identifier ISTQB test addendum

Status: **independent design frozen against the exact identifier correction; documentation only, executable work NOT RUN.** Author [identifier addendum](identifier-addendum.md) SHA256: `eb45f5a54b7d7773154b189dd7e9268828e63b993d496f56c82b0010f2e6f837`. Independent owner is `normal_integrations_istqb`, separate from module author `prep_messages_results`, core owner and held CODE lane. Root requested this separate design and remains sole Git writer. No source/library/original-test edit, product test, native process, provider/tool/browser action, account work, CODE retry or Git mutation occurs.

The held [NI4 original design](test-design.md), [clock design](clock-status-test-addendum.md), [pair design](source-pair-test-addendum.md) and NI3/NI5 contracts/designs remain unchanged. This addendum records an explicit correction to the original NI4 fixed-label derivation, without relabeling the original held bytes as correct. Final CODE/browser/model/full-ticket/MVP acceptance stays HOLD; no fixture or author test result substitutes for those gates. All82 original criteria and five DF010 contract criteria remain retained.

## Source observation and independent intended digests

The actual existing `runtime-security.reference()` validates caller IDs against `[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}` and then hashes their raw bytes. Its refusal of a slash is correct. The original NI4 contract's four product-owned slash/version labels cannot pass that caller validator. The existing `hash()` is SHA256 over the supplied raw bytes; `canonicalDigest()` additionally canonicalizes JSON and therefore produces a different digest for the same text literal.

The correction uses `hash()` only for the four fixed provider/adapter literals, preserving their exact intended bytes and digest. It does not change the helper, broaden raw caller syntax, normalize/escape/remove the slash, trim text, alter case or choose a new version. Owner eventId/taskId still use the original `reference()` validator. Native-scoped namespace/source/subscription/origin/recipe digests remain `canonicalDigest()` under their existing formulas and scope predicates. A public digest is an identifier, never trusted origin or permission by itself.

These golden values were independently calculated for this document with Python standard-library hashlib over literal UTF-8 bytes, without importing or executing product code. This is documentation arithmetic, not a product test. Later independent assertions use these complete literal hex strings as expected values; computing expectations with the product helper under test would fail to distinguish the intended raw-byte hash from accidental canonicalization.

| Product-owned field / slot | Exact raw literal | UTF-8 bytes | Intended SHA256 |
| --- | --- | --- | --- |
| providerRef / owner | df.native-owner-ingress/v1 | 26 | `b960e0b40a240752061358f4c0fd41f539a9f6617be51817828d218d917938eb` |
| providerRef / schedule | df.native-schedule/v1 | 21 | `eccfcc2ce7a2c5037bc87d284bb90ecce80b170861192474aa4d167cd3c9010c` |
| adapterRef / owner | df.native-owner-adapter/v1 | 26 | `0ec951d014497ba9434e9ca998b7f24fe0180e8f11d00c0ab600e1bb5519dadd` |
| adapterRef / schedule | df.native-schedule-adapter/v1 | 29 | `d69ec23f51766004a74305c805798a03f7f4661e77fff730c2e45ec4e621adb5` |

## Independent planned assertions

All families below are planned/not run. T means closed typed module/captured-argument assertions; D means actual encrypted same-ledger retention/currentness under a later lease; N/P means the original public native and physical installed package oracles under separate root GO. T cannot satisfy D/N/P or actual rendered/model/CODE acceptance. Synthetic closure arguments are explicitly fixture evidence.

| ID / priority | Independent assertion and required observation | Level |
| --- | --- | --- |
| N4I-01 P0 exact owner constants | Construct the selected owner ingress factory without invoking any mutable API. After separate explicit configure/ingest, captured source spec.adapterRef equals the exact owner-adapter golden hex and typed ingress providerRef/adapterRef equal the exact owner pair. All four labels remain product constants; configuration/RPC cannot supply them. Factory/status alone creates0 source/subscription/pair/clock/task/grant/timer/session/tool/send. | T/D/N/P |
| N4I-02 P0 exact schedule constants | After explicit scoped source/pair configuration and schedule start, captured spec/register providerRef/adapterRef equal the exact schedule golden hex strings. Owner and schedule pairs never swap. Stopped/cold status requires no registration. Each reference remains lowercase hex64; hashing a JSON string/array, removing slash, changing case/version or adding whitespace must fail these exact expected-value assertions. | T/D/N/P |
| N4I-03 P0 caller-ID boundary unchanged | Existing reference() still refuses all four slash literals when used as raw caller IDs, and owner eventId/taskId containing slash, spaces, empty text, leading punctuation, Unicode, controls or length129. Test total lengths127/128/129, accepted alphanumeric starts and existing interior _.:-. Accepted caller IDs retain exact case/bytes and original digest; no trim, slash substitution or canonical JSON conversion. Invalid/hidden/accessor/Proxy inputs reject before source reads/ingress/getter effects. | T/D |
| N4I-04 P0 canonical scoped identity unchanged | Independently preserve the original canonical namespace/source/subscription/origin/recipe formulas and complete native owner/workspace/profile/slot bindings. Correct fixed literal hashes do not rewrite any retained source/event/clock/pair/receipt identity or refresh old configuration authority. Current replay returns original association; wrong owner/workspace/profile/key/spec/recipe remains refused. No migration/normalization of caller IDs or old ciphertext/receipts is introduced by this correction. | T/D/N/P |
| N4I-05 P0 digest is not authority | Caller-echoed golden hash, copied label/ref, guessed source/provider/adapter digest or foreign/retired callback never satisfies current native peer/lifetime, exact signed pair or final core predicates. Existing source/pair revision, missed-plan approval, rate/dedup, task/auth and disposed-lifetime gates remain intact. No hash equality grants/dispatches/starts or substitutes for provider/currentness proof. | T/D/N |
| N4I-06 P1 bounded correction/evidence | Keep the author-reported first2/12 PASS and10 factory failures as first evidence, separate from its fix/retest and this independent design. Verify correction is confined to trusted literals in the newly authorized module and preserves existing helper/export/raw-ID meaning; source freeze is required for later executable verdict. Original assertions and held documents remain unchanged. Native/store/package/browser/CODE acceptance is not inferred from an author12/12 run or from this digest table. | T/D |

## Individual retained AC contribution

These focused contributions remain NOT RUN. The complete [NI4 mapping](test-design.md) still applies; no source AC or ticket is accepted by a fixed-label hash or factory success.

| Retained AC | Additional identifier oracle / residual |
| --- | --- |
| BUB001-01 | N4I-01/02 bounded correct normal factory composition; actual native/package proof remains separate. |
| BUB001-02 | N4I-01/02/05 private current registration/reload/disposal, zero implicit timer creation. |
| BUB003-02 | N4I-04 preserves immutable scoped source/event/clock/pair/receipt identity. |
| BUB006-01 | N4I-04/05 hashes remain identifiers under actual native scope/current authority. |
| BUB006-02 | N4I-05 unchanged pair/grant/revision/approval predicates; digest echo cannot authorize. |
| BUB006-03 | N4I-03 closed caller-ID/hostile-input bounds and unchanged validator. |
| BUB006-05 | N4I-05 unavailable/foreign/disposed native facts stop intake without hash fallback. |
| BUB009-01 | N4I-03/04 fixed literal identity and original durable dedup/caller-ID meaning. |
| BUB009-03 | N4I-02/04 restart shows retained clock without normalization/re-registration. |
| BUB012-05 | N4I-01/03 bounded raw IDs/refs and zero factory/status resource work. |
| BUB016-01 | N4I-06 exact independent golden values, original failure/fix/source hold and separate evidence levels. |
| BUB016-02 | N/P later normal installed ingress/schedule contribution only; rendered/model/aggregate acceptance HOLD. |
| BUB016-04 | P exact held package/private constants/original native reproduction, preview only and no release claim. |

## Inspection pins and later execution

| Read-only source/evidence | SHA256 / meaning |
| --- | --- |
| src/runtime-security.mjs | `6edf9f8a544444169f9190fc5e24230ab3a0928ea8d7c295f1b085824c91ac07`; unchanged actual hash/reference/canonicalDigest helpers |
| src/installed-events.mjs | `1722ca6ba6aa49cb7326d875a64ede6af0f79ec22134b48e1f9d315d8ca9e874`; unheld author source inspected for fixed-label call sites, not an independent executable or CODE verdict |
| docs/evidence/NI4/identifier-addendum.md | `eb45f5a54b7d7773154b189dd7e9268828e63b993d496f56c82b0010f2e6f837`; exact held correction |
| docs/evidence/NI4/test-design.md | `4d61064d6c05ba72dd23fd6b3502eb5b3d84b20490e067bb9f9b8693af8f69e0`; unchanged original design |
| docs/evidence/NI4/clock-status-test-addendum.md | `21cd49ae5db448ca81393d66be11fb5f92fa6c0287271bff61aa8450cff54325`; unchanged clock design |
| docs/evidence/NI4/source-pair-test-addendum.md | `9989ee93c1875c2c583d5db46d3c38e88c2b1f290f3fb96eb17a9fbbdd694451`; unchanged final pair design |

After root holds the author source/test manifests and gives a separate independent execution lease, assertions belong only in the new independently owned `test/installed-automation-adversarial.test.mjs`. Use the four literal expected digests above and preserve first test/failure/fix/retest/source manifests. Do not edit original helper/source/tests or reuse the author's passing count as independent evidence. No unresolved identifier semantic challenge remains in the eb45f5a5 correction; source hold and separate D/N/P/execution commands remain required. This document passes no executable case or full acceptance gate.
