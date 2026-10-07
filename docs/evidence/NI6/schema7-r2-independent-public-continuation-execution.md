# Schema7 r2 public continuation: actual stopped run

The finite root-owned continuation completed two migration cases and stopped at
PREP01's first failed assertion. **MIG02 and MIG03 PASS; PREP01 FAIL; the remaining
22 cases were not run.** Previously passed MIG01 was excluded. This is execution
evidence, not ticket acceptance. All87 and final CODE remain HOLD/BLOCKED.

Root executed the reviewed 25-ID wrapper once on 2026-10-07 at07:22UTC using the
pinned Node22.22.2. Its syntax command exited0 in0.063726s; the functional command
exited1 in0.462313s. The wrapper stopped on the first unexpected failure. The
bounded runner's successful completion means it captured the command results;
it does not mean the functional command passed. Raw results are retained in
[the command record](schema7-r2-independent-public-continuation-execution/command-results.json)
and [TAP output](schema7-r2-independent-public-continuation-execution/command-02.stdout.txt).

MIG02 used the actual original schema6 warm duplicate receipt before migration
and required full exact historical equality after migration. MIG03 observed
fresh schema7 status without allocating a public task or memory. No private
registry count was measured. PREP01 failed at leaf line13: ordinary snapshot
data length was3 while the fixture expected4. Its later typed-check getter was
not reached, so this run establishes no executed check-persistence conclusion.

Independent SOURCE review subsequently established the oracle error: ordinary
snapshot excludes native data kinds, including `context_check`. Preparation
adds one visible context; its paired check is read through the genuine typed
getter. The proposed PREP01/PREP04/PREP12 corrections retain39 other assertions
and add public receipt/envelope/check associations. They are NOT_RUN here.
See [the root-cause report](preparation-PREP01-public-snapshot-rootcause.md) and
[independent affected review](preparation-public-snapshot-oracle-r1-independent-source-review.md).

All132 frozen input hashes/sizes remained unchanged before and after this run.
The ordinary isolated scratch core fixture used no host graph, model/provider,
browser, webhook/chat account or listener. This does not verify native worker,
physical cold recovery, UI, protected crypto/SQL faults or final CODE.

The sealed inert correction manifest remains historical evidence. Its external
Node `absolutePath` is malformed even though canonical Node bytes match; a
separate metadata correction and coherent 23-ID freeze are required. A new
reviewed continuation must exclude all three passed migration cases, copy the
exact corrected bodies and unchanged remaining fixtures, and receive a fresh
bounded root GO before execution. No failure was removed or relabelled PASS.

The staged evidence whitespace check exited2: raw TAP assertion output contains
indented blank lines, preserved literal patches contain blank context lines, and
the sealed independent review retains its final blank line. Their exact bytes
remain hash-pinned and were not normalized. This is a recorded whitespace
warning, not a passing check or an application test result. The earlier NI5
lifetime evidence commit71a87d6 likewise preserved a literal patch context-space
warning; its recorded functional result remains1PASS, distinct from that check.
