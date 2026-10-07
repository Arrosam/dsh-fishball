# ER08 affected wire correction execution

Root ran one filtered ER08 group on October7 after reviewing and applying the exact omitted-field fixture correction. The current fixture is `c4ce6833…`; client `a281011d…` is unchanged. The first 11PASS/1FAIL run and its undefined-valued synthetic JSON reply remain preserved in [the original execution](native-runtime-ui05-execution.md).

The corrected reply omits the absent bindingDigest key instead of carrying JavaScript undefined. The genuine client still refuses missing/malformed recovery joins; the assertions and permitted recovery operations are retained. [Independent source review](native-runtime-fixture-corrections-source-review.md) approved the transport representation correction without weakening the client.

The single command passed its one selected group, with no failures or skips reported, in0.213218s. Node's name filter reported only that group; the other eleven groups were not rerun. All12 root inputs remained unchanged. No native host, database, provider, listener or model invocation occurred. The unchanged23-group model-composition pass is separately attributed to its earlier command.

The [raw command results](native-runtime-ER08-omitted-field-execution/command-results.json), [TAP](native-runtime-ER08-omitted-field-execution/command-01.stdout.txt), exact frozen source and before/after verification are retained. All87 acceptance criteria, finalCODE and actual UI/quality remain held.
