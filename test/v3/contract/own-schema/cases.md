# F-OWN-SCHEMA use cases (written before executable cases)

Sources: design 9a531192 §1.0/§1.0b rows 1–2/§1.0c, R-ARCH-10; K3a core-owned MCP and LINK. The direct task supersedes the historical shared-library location: these values belong to core/contracts/constants.js.

## Use cases
- OWN-UC-01: install core independently: neither generated vendor tree, generator, export nor packed vendor entry remains.
- OWN-UC-02: load non-V2 Fishball modules without any DSH-side package; V2 imports remain only the connector's contract until REMOVE-V2.
- OWN-UC-03: validate targets, ids, names, tools and event headers through public core modules. Compare verdicts with the connector's published oracle, not copied implementation.
- OWN-UC-04: discover the real connector in-process over HTTP: tools/list and resources/list match core's own MCP surface.
- OWN-UC-05: fetch both metadata documents over HTTP and check each field independently against core's constants.

## Derived cases
| ID | Technique | Partitions/boundaries / expected result |
|---|---|---|
| OWN-ARCH | Decision table, EP | vendor directory, generator, package export, packed files absent; non-V2 import edges to DSH side or another package folder forbidden; V2 only dsh-connector/contract; peer removal TODO REMOVE-V2 |
| OWN-LINK | EP | loopback IPv4, hostname, IPv6 and HTTPS remote: issuer equals oauthUrls(origin); version and event URI match connector; status matches own LINK |
| OWN-ID | BVA, EP | lengths 0/1/64/65, dot, space, null, number: acceptId.ok equals isAgentId |
| OWN-NAME | EP | whitespace runs, tabs/newlines, NFC/NFD: normalized-equivalent settings send no second set_name after reconnect (observable private sameName effect); controls and all-whitespace refused, empty raw setting clears name |
| OWN-TOOLS | Decision table, EP | all published tools plus unknown and contributed tool: core classification iff TOOL_NAMES; inbox_poll/inbox_ack/pair/set_name withheld; session_message/session_redirect retain X19 dotted names |
| OWN-EVENT | EP, BVA | all fixed event types; valid contributed type; reserved namespace; uppercase; missing dot; public name lengths 128/129; trailing local dot; non-string: header names type iff isEventType |
| OWN-HTTP | EP | real tools/list core names set and event resource name/URI/mimeType equal MCP; unresolved installed SDK runtime alone permits explicit skip |
| OWN-APPROVAL | EP | real tools/list `approval_answer` `answer.decision` and `answer.risk` enums equal core's `APPROVAL.decision` / `APPROVAL.risk` as sets; `APPROVAL.refusal.unknownSession` equals K1 `REFUSAL.unknownSession` (Fishball's decision 2026-11-16, F-ASKCARD × F-OWN-SCHEMA) |
| OWN-META | Decision table | separate row per resource, authorization_servers, scopes_supported, issuer, token_endpoint, authorization_endpoint, grant_types_supported, token_endpoint_auth_methods_supported, response_types_supported, code_challenge_methods_supported |

State transitions are already covered by the existing link/identity/events drivers' suites; this task changes ownership, not lifecycle rules. Existing static K3a comparisons remain unchanged, not duplicated here. No child DSH or browser is launched.
