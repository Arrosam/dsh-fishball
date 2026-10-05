# NI3 native tool amendment: ordinary quality disposition

This follow-up preserves the original review and its finding history in [the first review](native-tool-amendment-ordinary-quality-review.md) and its JSON companion. It adds a disposition for `ordinary-quality-01` using the narrowly supplied Node classifier evidence and the original predicate/test slices only.

## Disposition of ordinary-quality-01

**Closed as no source finding on the pinned Node 22.22.2 target.** The recorded builtin-only classification reports that an `async function*` callback makes both `types.isAsyncFunction(callback)` and `types.isGeneratorFunction(callback)` true on Node v22.22.2. The existing predicate at `installed-audit.mjs:81` therefore rejects that callback through its current branches; a specialized async-generator predicate or source change is not required for this target.

The classifier record also states that the first author fixture's NT02 async-generator rejection case passed before any subscription or trap. That is supporting author fixture evidence. This follow-up did not rerun the fixture or independently execute Node. It establishes no new product, native, source-origin, full-suite, acceptance, or CODE PASS.

## Over-read record

In the first review turn, my read command displayed `src/runtime-security.mjs` beyond the authorized descriptor helper range 9–32, including later definitions. I did not rely on those later definitions for either review or this disposition. No ledger/core, receipt, or envelope investigation was performed, and no result from the unreviewed portion was counted. The original review files remain unchanged; this note records the over-read rather than rewriting their history.

## Boundary

The original final CODE gap remains blocked and unchanged. This ordinary API disposition closes only the async-generator concern for the recorded Node 22.22.2 classifier behavior. It does not provide a whole-code verdict, native-source proof, runtime acceptance, or broader security conclusion.
