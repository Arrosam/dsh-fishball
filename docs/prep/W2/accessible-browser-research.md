# Official accessible browser handoff research

Status: **official native handoff launched on explicit follow-up authorization; loopback listener and local connections verified**. W1/M1 remains HOLD. This establishes startup/handoff observations, not rendering, controls, visual usability, browser-close behavior or acceptance. See [raw outcome](browser-handoff-result.json).

The owner reported limited mobility and excessive effort in the proposed hidden-file/token-copy workflow. That [manual handoff](manual-browser-handoff.md) and full owner QA checklist are withdrawn. Do not ask the owner to find files, copy authentication values, transmit credentials or perform the full acceptance review.

## Supported mechanism and smallest owner action

The pinned official DSH Web0.2.1-alpha.1 already owns an automatic default-browser opener. Enable its native `web-runtime` configuration `openBrowser: true`, retain `printUrl: false`, and launch the official CLI without `--no-open`. DSH obtains the process-authenticated URL internally after startup settles and supplies it directly to its maintained `open` dependency. On macOS that dependency invokes the operating system's `open` command. No custom opener, token-reading script, copied URL or private-file step is needed.

**Owner action: none for authentication/handoff; at most select the browser tab DSH opens.** The executor has arranged this supported startup. If the new tab does not appear, the only useful follow-up is to report that fact. This reduces handoff effort; it does not transfer the full QA burden to the owner or claim the tab renders until observed.

The existing W1 runner deliberately hardcodes `--no-open` and `openBrowser: false`. Its frozen source stays unchanged. For a later native handoff, use the official CLI's documented `--patch <path>` layer after the existing isolated profile, with this launch-only configuration data:

```json
[
  {
    "id": "web-runtime",
    "config": {
      "openBrowser": true,
      "printUrl": false,
      "surfaceContext": true,
      "trustedHosts": []
    }
  }
]
```

Native CLI arguments are `--profile web --patch <project-local-overlay> --host 127.0.0.1 --port 3080`, omitting `--no-open`. On explicit follow-up authorization, this configuration data was written to the ignored isolated profile's `browser-handoff.patch.yml` with mode0600, and the official CLI was launched with that overlay. The same isolated project `DSH_HOME`, `DSH_AGENTS_HOME`, workspace, sanitized environment, read-only permission mode, disabled account/title-LLM rows and synthetic fixture were retained. No custom opener was created. Personal installations, browser security, allowed hosts, bind address, accounts, model usage and credentials were not changed.

Keep `printUrl: false`: official defaults otherwise print the authenticated URL. No token values were read, copied or exposed in chat, terminal evidence or screenshots. The URL travels inside the official launcher/OS/browser flow; it is not secret-free data. Installed connection code exchanges a valid root launch token for an authority-bound cookie and returns a `303` redirect to clean `./`, with `no-store` and `no-referrer`. These exchange details are source findings; no request headers, cookie or token values were inspected in this session.

## Exact installed-source evidence

Paths are relative to the repository's `.runtime/dsh-web/node_modules/` and refer to the already pinned official dependency installation; no fetch, install or downloaded helper was used for this research.

| Installed source | Finding |
| --- | --- |
| `@deepseek-ai/dsh-web-app/lib/startup.js:24,52` | Official `--no-open` option and `webStartup.openBrowser` value; default native opening is enabled. |
| `@deepseek-ai/dsh-web-app/lib/index.js:36-37,48-53,124-151,182,206-219` | Native opener, scrubbed inherited environment, separate opening/printing flags and internal authenticated URL handoff. SSH launches suppress browser opening; do not circumvent that rule. |
| `@deepseek-ai/dsh-web-app/cordis.patch.yml:199-207` | Official web-runtime row reads startup open option; bundle default prints URL, so retain explicit `printUrl: false`. |
| `@deepseek-ai/dsh/lib/bin.js:105` and `profile-boot-BZ2ZjNWi.js:197-203` | Native repeatable `--patch` overlays follow the profile's own layer. |
| `open/index.js:152-153` | Maintained dependency uses macOS `open` without a browser-specific security override. |
| `@deepseek-ai/dsh-client-connection/lib/index.js:374-378,380-412,600-601` | Native authenticated URL construction and token-to-cookie/clean-redirect exchange. |

Documented Codex panel/browser entry points take URLs and do not expose a private-authentication-file handoff. They were not invoked with the token, and blocked Browser Use navigation was not retried. Existing IAB/Chrome `net::ERR_BLOCKED_BY_CLIENT` evidence remains intact. Native startup/local connections were observed, but rendering here is **unverified**; this handoff must not be described as having solved that automation block. Stop on a native launch/browser denial or error rather than retrying aliases, proxies, changed bindings, tunnels or protection changes.

## Current fixture state after executor disconnect

The successful readiness observation at07:34:40UTC is historical. At07:51:04UTC, `lsof` returned exit1/empty/no diagnostic for port3080 and the previously owned childPID16359 and runnerPID16352. Resuming exec session72871 failed because the executor key changed during transport recovery. The observer still claimed active16/15 and the private access file existed, so neither saved file proves live readiness. A process-list check reported unavailable system service, not a supplied policy rejection.

At07:53:00.820UTC, the executor removed only the stale synthetic ephemeral access file without reading its contents, preserving the synthetic ledger/profile and raw stale observer evidence. This cleanup is not graceful native disposal.

## Authorized native handoff outcome

The follow-up instruction explicitly authorized the verified native flow with URL printing disabled and no custom bypass or Browser Use retry. The existing isolated profile's disabled account/title-LLM rows were checked before launch. Managed review approved this exact official launch; no unexpected permission request or rejection was returned.

The official CLI launched as **PID17906**, managed exec session9620, using Node22.22.2. It emitted the generic native message `dsh web: opening the default browser; pass --no-open to disable`; subsequent output contained no opener error or authenticated URL. At **2026-10-04 07:55:15.232UTC**, `lsof` verified its listener on **127.0.0.1:3080 only**, plus two established loopback connections. Its cwd was the existing isolated fixture workspace. Observer metadata reports supported host, active generation11, sessions0 and inferenceAttempts0. The new private access file was mode0600; only metadata was checked.

The observer's loads17/unloads15 include the earlier disconnected instance's missing disposal observation and this active instance. Do not infer balanced graceful lifecycle from those totals. The current native handoff does not close browser lifecycle/visual/control acceptance, start a daemon or authorize model inference. Leave the approved fixture available for the owner while it is needed; a later stop must target this owned instance and verify actual disposal/listener state. The owner should see DSH Web in their default browser and need only select that tab; no file/token steps or full QA checklist are requested.
