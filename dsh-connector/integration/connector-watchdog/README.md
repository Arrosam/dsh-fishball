# dsh-connector-integration-watchdog

The real `dsh-connector-watchdog` bundle running beside `dsh-agent-connector` in one booted DSH.
Fishball is played by a stock MCP client; the supervised session and Watchdog's judge answer from
the scripted fake model.

## Why it needs more than one package

Watchdog acts only through the connector: its tools are contributed to the connector's MCP
surface, it decides permission requests through the connector's `dshConnectorSessions` delegate,
it stops sessions with the connector's Stop, and the manager sees its decisions as the connector's
settlements and offers. Watchdog's own suites run its core over fake connector services; this
package checks the same rules on the real path: delegate → grant → offer.

## What it checks

[`tests/live/`](<tests/live/USE-CASES.md>), cases WD-L01…13:

- the bundle loads `dsh-connector-watchdog` and `preset-watchdog`, and its tools are listed;
- only the manager may brief or refine; refusals for an empty purpose, a second brief, an unbriefed refine;
- in scope → allowed, beyond purpose and dangerous → rejected, otherwise passed to the manager with
  `delegate {watchdog, passed | failed, reason}`;
- drift → request rejected, turn stopped, `contributed:dsh-connector-watchdog.drift` to the manager;
- pause and resume; Take back ends supervision; a brief survives a DSH restart;
- `watchdog_session_start`: its input schema, the first request judged by Watchdog, and the
  contrast with `session_start` followed by `watchdog_brief`; its refusals over MCP.

Patrol timing stays in Watchdog's own `tests/core.test.mjs` over fake timers. A real model's
judgement is not tested here: `tests/live/real-model.manual.mjs` is a manual run that spends
tokens; it is not a `*.test.mjs` suite, so no runner picks it up.

## Run

Before a release it runs with everything else:

```bash
npm run test:release
```

To run it alone (current DSH):

```bash
npm test --workspace dsh-connector-integration-watchdog
```

It boots a real DSH per version through `dsh-connector-test-helpers/connector-world`. See
[the testing guide](<../../docs/testing/README.md>) and [the integration packages](<../README.md>).
