# rev11d hand checks (test session)

Branch `claude/test-rev11d-9f993c` = rev11d tests (`6c8b955`) + `claude/rev11d-3e302c` (`06e65e4`) + `rebuild/managed-sessions` (`19b068a`), merged cleanly, merge head `ab29e98`. Not pushed.

## Result: FAIL, one code bug that stops Fishball from loading

**Code bug (blocks everything).** With the rev11d build, the `fishball` plugin does not start in DSH (0.2.1-rc.2). Boot output:

```
dsh: warning: 1 entry did not activate
fishball (dsh-fishball): JsonSchemaError: unsupported JSON schema: parameters.grant.additionalProperties must be explicitly true or false
    at defineTool (…/dsh-tools/lib/index.js:848)
    at ApprovalBroker.registerTools (src/approvals.js:276)
    at Object.apply (index.js:331)
```

Cause: the `answer_approval` tool's `grant` parameter (`src/approvals.js:286-290`) is an `object` with `properties` but no `additionalProperties`; DSH's tool compiler requires it to be explicitly `true` or `false` for a nested object. To reproduce: boot any host from this branch (`/opt/homebrew/bin/node --test test/rev11d-regress.test.mjs`), or read the output of `bootHost(newHome('x'))`. `GET /api/fishball/state` answers 404 because the plugin is not mounted.

Effect: Fishball never goes live, so every test that boots a host fails (the first full-suite run showed CMP-08, CMP-09, ISO-01, ISO-02 and more failing before I stopped it), and no hand check can run.

## Suite
Started `/opt/homebrew/bin/node test/run.mjs` and stopped it after the first failures because of the bug above: **no counts**. Not re-run.

## Done-when items (rev11d row)
All **NOT RUN**: blocked by the load failure above. They are the items for: five `npm test*` runs waking Fishball zero times and the revoke; `npm test && git push` covered; refusals (prefix on a non-shell tool, no / past end time); each way a grant ends; restart; pause and resume; audit and `decisions` rows; one tag per covered call; prefix tools accepted or refused; a year-long grant and many grants.

## Next
Fix the schema (set `additionalProperties: false` on `grant`, and check any other nested object in the new tool schemas), then send stage 2 again. The hand-check server script was `test/hand-checks/rev11c-serve.mjs` with `FBTEST_ASKING_TOOLS` added to the host env; I removed my copy, so it needs recreating.
