# Exact local browser blocker

Reported to the parent on 2026-10-04. Official isolated DSH Web is pinned to `@deepseek-ai/dsh@0.2.1-alpha.1`; attempted clean URL: `http://127.0.0.1:3080`. No authentication token was read or placed in a browser URL by the validator.

## Surfaces and literal results

| Surface | Documented operation | Literal result |
| --- | --- | --- |
| Visible in-app browser (IAB) in the delegated thread | `createBrowserTab("iab", "http://127.0.0.1:3080", { visible: true })` | `IAB visibility is not supported in a subagent thread` |
| Hidden IAB | Same URL, documented `visible: false` | `Browser Use cannot open http://127.0.0.1:3080 in tab 1. Browser reported: net::ERR_BLOCKED_BY_CLIENT` |
| Native Chrome | Same URL, new labeled test tab | `Browser Use cannot open http://127.0.0.1:3080 in tab 239481685. Browser reported: net::ERR_BLOCKED_BY_CLIENT` |

Binding the failed Chrome tab for cleanup showed `chrome-error://chromewebdata/`, title `127.0.0.1`, and a browser rejection page. Its [unaltered screenshot](web/chrome-blocked-loopback.jpg) shows only the client error. The failed test tab was closed; no DSH UI was rendered.

## What the error establishes

The browser reports a client block. It supplies no explicit policy rule or administrative cause, so an explicit policy denial cannot be asserted from this result alone. This was not an automatic-approval rejection. Independently observed `lsof` showed the owned official process listening at `127.0.0.1:3080` during the attempted validation; rendered HTTP reachability was never established. Neither a server fault nor the precise source of the client restriction is diagnosed by the screenshot.

Both blocked browser routes stopped. No proxy, alternative port, tunnel, network exposure change, guard alteration, token-bearing retry or native-app workaround was used. A separately denied `ps` inspection also stopped; it is not the browser error.

## Acceptance still unverified

- **M1-01 / BUB001-04 bounded Web interpretation:** closing the actual DSH browser window/tab and inspecting whether the host/plugin continues running. Full process stop/restart has independent passing evidence, but failed-tab cleanup cannot establish this browser-close behavior.
- **M1-09:** actual rendered DSH Web shell and applicable native-plugin integration; desktop and narrower viewport visual review, reachable controls, overflow/focus and visible diagnostics. All remain blocked before rendering.
- **BUB001 broader source acceptance:** browser diagnostics, supported synthetic logout and actual negative-profile behavior are unrun in the independent browser matrix. BUB014 task UI is later scope and was not implemented.
- **M1-10:** the local squash into main is held until aggregate acceptance. No full-ticket, MVP or release acceptance follows from backend tests.

Exact test design, expected/actual rows and limitations are in [the independent Web report](web-validation.md). Independent code and ISTQB reviewers pass the frozen executable subset at `10723812a1f3a85425a5428212ee5febffa62e3d`. Root's [evidence commit](validation.md) is `ab58e2d`, preserving that executable tree and all granular history.

## Smallest needed user action

No already-permitted route has been verified to reach this host. The minimal missing capability is a documented, explicitly permitted local browser surface/session that can reach this exact loopback URL. The owner/parent can identify or arrange that surface; no external listener is needed. A parent-thread visible IAB was not tested here and must not be claimed as a working alternative. No settings toggle or root cause is known, so none is prescribed. The pending capability question does not authorize a retry or bypass.

The host will need a fresh bounded launch for those checks. It is currently stopped: final state disposed `15/15`, one durable synthetic entry, zero sessions/inference attempts, no port3080 listener and no ephemeral browser access file. Existing source/runtime linkage, raw logs, independent reviews and failure screenshot are committed; none is discarded while awaiting the permitted surface.
