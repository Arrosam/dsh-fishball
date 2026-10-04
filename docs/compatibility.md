# Current host compatibility baseline

The newest owner instruction selects **official DSH Web**, installed in a new project-controlled environment and tested through a loopback browser. Desktop/Electron/native-shell validation and compatibility shims for the old Desktop installation are excluded. Other existing DSH installations remain untouched. The owner's descriptions of old Desktop maintenance and Electron architecture are recorded as owner context, not independent findings.

## Exact wave pin and provenance

- Canonical distribution: `@deepseek-ai/dsh`, linked by the [official README](https://github.com/deepseek-ai/deepseek-harness#readme) with `dsh web` as the Web launch mode. This is the native host launcher, not an SDK runtime.
- Verified registry on 2026-10-04: `alpha = 0.2.1-alpha.1`, published 2026-10-03T04:53:22.343Z. The `latest` and `next` tags still name `0.2.0-rc.2`, published September 29. The newer official published preview is selected deliberately to honor the owner's latest-only requirement; dependencies will not float with any tag.
- Pinned wave target: **0.2.1-alpha.1**. Registry repository provenance is `deepseek-ai/deepseek-harness`, directory `apps/cli`; license metadata is MIT. This is host dependency provenance, not a selected dsh-fishball copyright license.
- Registry tarball: `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.1-alpha.1.tgz`; integrity `sha512-DJ8pwG/XqzwDrYQTgJXuIga6ku153Z4vJI/B3MzNtudVCkDaOf4O2pUQh1ToroLHPPe4mxhhFeNJ7ttNculqMw==`.
- Official Web defaults to loopback `127.0.0.1:3080` and supports `--no-open`; official home-paths provides `DSH_HOME` for isolated state. Execution must use reviewed project-local config, sanitized environment and the tested loopback binding.
- Initial normal-sandbox registry lookup failed with `ENOTFOUND registry.npmjs.org`; a narrow managed-approved registry metadata read succeeded using project-local npm config/cache and no personal npm credentials. Installation, exact dependency lock, source hashes and API smoke are recorded separately in [host evidence](evidence/M1/host-interface.md). Metadata verification alone is not installation/acceptance.

## Acceptance interpretation retained by ticket ID

All original source AC remain verbatim in the ticket cards and approved Chinese source. The later explicit owner decision supersedes older host-selection advice. This applies across all tickets and milestones:

| Source AC / boundary | Current interpretation |
|---|---|
| BUB001-01..03 | Install/load/reload/unload and capability denial on the exact pinned official Web host; fixture and actual Web-profile evidence are distinguished |
| BUB001-04 | Closing the browser does not imply host exit; verify Web process/plugin state, full host stop and safe restart/reconciliation |
| BUB001-05 | Report the Web baseline explicitly; Desktop/Electron are owner-excluded and their old results historical. Interactive CLI/non-Web modes remain undeclared/unverified rather than inferred from Web success |
| BUB004/005/006/008/009/011/012 | Verify native session, scoped events, permissions, model/tool/environment and scheduling interfaces on the pinned release; no assumptions from old Desktop or SDK APIs |
| BUB013/014 | Use supported native Web UI/artifact/control extension points and real browser functional/visual evidence when implemented; no Electron shell dependency |
| BUB016 | Release compatibility metadata must state the exact tested official Web version, runtime and limits. Reassess future breaking updates explicitly; no silent dependency upgrades mid-test |

## Current versus historical evidence

The prior installed-library checks on Desktop 0.9.1 / Harness 0.1.5-rc.2 are retained only as historical diagnostics. They do not satisfy the new Web acceptance baseline, and no backward shim is being developed. The host-neutral ledger and synthetic tests are preserved and revalidated under the new host. [Current M1 acceptance](milestones/M1-foundation.md) and [wave gates](waves.md) remain bounded foundation scope, not full MVP acceptance.
