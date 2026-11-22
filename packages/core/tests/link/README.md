# fishball-core tests: link

Core's MCP link to a target connector (`createLink`, core's `./link` export; F-LINK, design §4.1,
§6.3, §9.1; requirements R-FB-03, R-FB-04, R-REM-04, R-CON-04, R-CON-05).

| ids | technique | what |
|---|---|---|
| REM-UC-02 | use case | the link drops and returns: no settlement on its own, `disconnected` while down, re-listen and one poll on return, no stopping tool |
| REM-EP-01 | EP | target classes: blank, the three loopback names, https remote, refused plain http / private / ftp / malformed (no request at all) |
| REM-DT-01 | decision table | unset, unreachable, no token, token refused, connected, V2 connector |
| F-LINK done 1–7 | EP | where the secret may go (token endpoint only, never a redirect or a foreign issuer), modern-only pin, no connector import, core's own pinned client, no generated schema |
| LNK-FIX3-* | EP / DT / BVA / ST | F-FIX-3: a failed import of core's MCP client logs one code-only warning per attempt and the link retries with K3's backoff (regression rows, 1dd184cc) |
| RFIX-F02/F03/F04-* | ST / BVA / DT / EP | R-FIX-CORE: re-list after the gate admits, the paged mailbox drain, a runtime authentication refusal |

Techniques and observation: the real `createLink`, imported bound to the current DSH
(fishball-test-helpers/bind), against a loopback fake connector (`fake-connector.mjs`: the helpers'
`FakeConnector` plus the link rows' modes and hooks), with every outbound attempt of the process
recorded on Node's diagnostics channels (`net-probe.mjs`, also used by the status area). The F-FIX-3
rows fail core's own lazy client import with a resolve hook (`import-fault.mjs`, shared with
link-save) and hold the link's retry timers (`link-driver.mjs openRawLink`). The secret-free log
oracle is `log-privacy.mjs` (shared with link-save). Values are K1's (the vendored connector
contract) and core's published `./contracts` / `./link` constants.

The MCP client handed to the link as `sdk` is the current DSH's own copy; only the F-FIX-3 rows give
none, so the link loads core's packaged `@modelcontextprotocol/client` (it must resolve from the
repository's node_modules).

REM-UC-02 "main 4 (delivery)" and "A1" were `todo` placeholders for F-INTERCEPT; that landed and
the events area owns delivery and settlement, so they are not ported.
