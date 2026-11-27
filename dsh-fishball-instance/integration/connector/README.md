# @dsh-instance/integration-connector

The instance against the **real** `dsh-agent-connector` from the in-tree connector component.

## What it tests

- `tests/k3-locator.test.mjs`: the K3 contract the connector publishes for the instance
  (`packages/dsh-connector/host-services/child.d.ts`, types only, read as text): the
  `dshInstanceChild` members, `reconnect()`'s refusal codes, `agentEntry()`, the model-sync
  wording. Then the instance's real locator (`src/host/locator.js`, imported bound to each SDK)
  has every declared member. Cases `HOST-ST-01 K`, `AGENT-ENTRY K3`, `SYNC Q-G7`.
- `tests/succession.test.mjs` (`ISUCC-INT-01`): reinstall succession over the connector's real
  hosted service. A real host DSH (test-helpers `hostedSetup`: the connector, its library and
  this checkout's instance linked into a throwaway home) launches a real hosted child that pairs.
  A session is handed over to the child's agent. Then comes a reinstall (the instance's own
  `uninstall.js` with DSH down, then a start), and the case observes, through the connector's
  own routes (`/api/dsh-connector/settings/state`, `/api/dsh-connector/ui/state`), DSH's session
  API and `<home>/fishball/hosted.json`, that the session, the name and the entry move to the
  successor. A second case restarts with a pending succession whose successor has already paired.

## What it needs

- In-tree connector and Fishball sources, read only (`DSH_CONNECTOR_REPO` and `FISHBALL_REPO`
  can override them). A missing source registers the cases as skipped, with the reason.
- The installed DSH SDKs (0.2.1-rc.5 and 0.2.2-rc.1; `FBTEST_DSH_VERSIONS` moves their folder).
- No network.

## Run

From `dsh-fishball-instance/`:

```bash
node scripts/test-package.mjs integration/connector
```

There is one host per SDK for the succession file, and its two cases run in order.
