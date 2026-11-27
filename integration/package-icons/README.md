# dsh-connector-integration-package-icons

The plugin icons of every package of this repository, checked together.

## Why it needs more than one package

Each rule compares packages with each other: every icon must differ from every other package's,
keep the family's shared base (the connector's icon is the reference), and the libraries must
declare none. No single package can check that alone.

## What it checks

[`tests/`](<tests/cases.mjs>), cases PI-*:

| Cases | Rule |
| --- | --- |
| PI-EP-01…06 | Each subject package (`dsh-connector-amenities`, `dsh-connector-adapter`, `dsh-connector-watchdog`) declares a manifest icon that DSH's own reader accepts, that ships, and is a valid self-contained SVG that differs from every other package's icon (including `dsh-connector-ui`'s shipped icon); the reference `dsh-agent-connector` passes the same rules. |
| PI-DT-01…03 | Package kind × icon: a plugin declares one, a library (`dsh-connector-shared`) declares none and DSH reads none; the self-contained rule over synthetic SVGs; the visibility measure over control drawings. |
| PI-BVA-01 | DSH's 256 KiB icon limit through DSH's reader (max − 1, max, max + 1). |
| PI-RENDER-01 | Each icon is visible in an `<img>` under the light and the dark scheme, in a real Chromium. |
| PI-CONSIST | Each subject keeps the reference icon's base. |

The render rows need a headless Chromium (`DSH_TEST_CHROME`, else the newest Playwright headless
shell); without one they are skipped and say so.

## Run

Before a release it runs with everything else:

```bash
npm run test:release
```

To run it alone (current DSH):

```bash
npm test --workspace dsh-connector-integration-package-icons
```

See [the testing guide](<../../docs/testing/README.md>) and [the integration packages](<../README.md>).
