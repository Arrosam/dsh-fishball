# Owner manual browser handoff for the held M1 gate

This is M1 evidence preparation while W2 contract artifacts remain mock-only. It does not accept either milestone, change frozen AC, or route automated browsing around a block.

## Verified readiness

At **2026-10-04 07:34:40 UTC**, the existing approved fixture was freshly launched with `node scripts/dsh-web.mjs`; managed review approved the isolated loopback launch. Before launch, lsof found no port3080 listener and the observer was disposed15/15. After launch, lsof identifies **PID16359** listening only on **127.0.0.1:3080**. Runner PID16352 owns it. Official host pin remains **DSH Web0.2.1-alpha.1**.

Clean URL: **http://127.0.0.1:3080**. Observer state is active, loads16/unloads15, one retained/deduplicated synthetic entry, supported host, zero sessions and zero inference attempts. These are startup/readiness observations, not a browser-rendering pass. W1 production source/scripts/package and acceptance criteria remain unchanged. The owner uses their own browser; automated IAB/Chrome routes are not retried.

## Native private access handoff

The existing observer uses the actual native `ctx.connection.authenticatedUrl()` to write the authenticated URL to this project-local file:

`/Users/samuel/Documents/Codex/2026-10-04/task-6/bubbles/.runtime/dsh-web-private/access.json`

Metadata only was checked: present, **mode0600**,82bytes. Its contents/token were not read or printed by the agent. This is ephemeral test-host access, not a personal/provider credential. Do not paste that file, its URL query or token into chat or screenshots.

In Finder, use **Go → Go to Folder** (Cmd-Shift-G), open that file locally, then copy its `url` value into a **new browser window** containing only this test page. Keep any token-bearing address private. Before saving a screenshot, confirm the address is clean, or omit the token-bearing address from the image. If authentication does not complete, report the visible error without the token. Do not change browser protections or sign into/configure any provider.

## Minimal checks and evidence

| Step | Owner action and evidence to return | Missing criterion |
| --- | --- | --- |
| 1 | Confirm the actual DSH shell renders. Send one page/window screenshot at normal desktop width, the clean URL, approximate window size, local time and any visible error. | M1-09 actual shell/rendering; applicable BUB001 integration observation |
| 2 | Narrow this test window. Check readable text, reachable controls and clipping/overflow; press Tab to inspect visible keyboard focus. Send a second screenshot and brief observations. | M1-09 visual/keyboard/control usability |
| 3 | Exercise a harmless native navigation control visible in the shell, then return. Record what responded and any persistent loading/error. Do not send a model prompt, enter keys, grant permissions or start a worker. There is no bubbles task panel in M1, so do not test invented pause/cancel UI. | M1-09 applicable native controls; no BUB014 acceptance |
| 4 | Close **only this newly opened test window** and tell the parent “test window closed,” with the approximate time. The executor will then read observer/listener state before stopping the host. | M1-01 / BUB001-04 browser-window-close versus full host exit |
| 5 | After the close readback, the executor gracefully stops only this owned fixture and verifies disposal/listener/access-file removal. The existing prior restart evidence remains separate. | M1-01 full-stop distinction; preserve native lifecycle evidence |

Capture the test page/window only, keeping other apps/tabs/private content outside evidence. Provide screenshots plus observations; a screenshot alone cannot prove callbacks, termination or scope. If the owner's browser blocks or warns on access, report its literal error and stop rather than changing protections. The earlier automation failure screenshot remains preserved.

## Preserve and reset state

No data reset is needed. Keep the isolated profile and `.runtime/dsh-web-home/bubbles.sqlite`; the one synthetic ingress entry is intentionally retained to prove deduplication. Do not delete profiles, reset settings, create a second server or edit the fixture. Reloading the test page can reset its view without changing the ledger. Graceful host stop removes the ephemeral private access file; a later approved launch regenerates the access handoff and reuses the synthetic ledger. Any future clean-store reset requires a stopped host and preserved backup, performed by the executor in project-local test state.

Manual evidence still requires independent review and exact runtime/source linkage before closing M1 HOLD. W2 schemas/test designs are preparation only, and no local main merge or publication is performed.
