# Package test inventory verification

Baseline: `66e460c7`. All 166 existing test entry files remain in the same workspaces. No existing tests were moved to integration, deleted, or re-timed. The two new root entry files exercise the test tooling. Entry-file counts below are static; the observed case totals are listed separately because cases can be generated at runtime and vary by SDK.

| Workspace | Entry files before → after | Release-only |
|---|---:|---|
| `dsh-fishball-bundle` | 0 → 2 | — |
| `fishball-core` | 17 → 17 | — |
| `fishball-board` | 1 → 1 | — |
| `fishball-heartbeat` | 2 → 2 | — |
| `fishball-taskboard` | 3 → 3 | — |
| `fishball-consultant` | 2 → 2 | — |
| `fishball-amenities` | 3 → 3 | — |
| `fishball-shared` | 2 → 2 | — |
| `fishball-test-helpers` | 11 → 11 | — |
| `fishball-integration-amenities` | 3 → 3 | Yes |
| `fishball-integration-core-ui` | 5 → 5 | Yes |
| `fishball-integration-page-stream` | 2 → 2 | Yes |
| `fishball-integration-page-ui` | 6 → 6 | Yes |
| `fishball-integration-release` | 2 → 2 | Yes |
| `fishball-ui` | 10 → 10 | — |
| `fishball-child-plugins` | 0 → 0 | — |
| `fishball-page` | 0 → 0 | — |
| `fishball-recommend-plugins` | 0 → 0 | — |
| `dsh-agent-connector` | 35 → 35 | — |
| `dsh-connector-adapter` | 3 → 3 | — |
| `dsh-connector-shared` | 2 → 2 | — |
| `dsh-connector-test-helpers` | 2 → 2 | — |
| `dsh-connector-integration-watchdog` | 1 → 1 | Yes |
| `dsh-connector-integration-package-icons` | 1 → 1 | Yes |
| `dsh-connector-amenities` | 1 → 1 | — |
| `dsh-connector-watchdog` | 3 → 3 | — |
| `dsh-instance` | 37 → 37 | — |
| `@dsh-instance/test-helpers` | 0 → 0 | — |
| `@dsh-instance/integration-connector` | 2 → 2 | Yes |
| `@dsh-instance/integration-fishball-core` | 3 → 3 | Yes |
| `@dsh-instance/integration-hosted-child` | 4 → 4 | Yes |
| `@dsh-instance/integration-release` | 3 → 3 | Yes |

## Observed case totals

| Package | At baseline | With the new runner |
|---|---|---|
| `dsh-agent-connector` | 4,312 reported; 11 failures; 561.13 s | Not run as a full package |
| `fishball-core` | Not measured | 1,743 reported; 1,740 passed, 2 failed, 1 skipped; 437.00 s |
| `fishball-ui` | Not measured | 655 passed; 56.12 s |
| `dsh-fishball-bundle` | No suites | 17 passed; 4.81 s |
| `fishball-test-helpers` | Not measured | 155 passed; 2.87 s |
| `dsh-connector-test-helpers` | Not measured | 19 passed; 19 JSONL records |

Focused checks also passed the connector pack-manifest case (1) and the Instance shipped-files suite (98 across the two existing SDK versions). All 32 packages passed static independence checks.

The baseline connector run reproduced the two known connector failures (K3-MULTI-BVA-04 reconnect and SUCC-EP-01 row 3) and also reported nine existing baseline pack/shipped-file assertions in the shipped UI. The baseline came from an isolated Git archive of the tracked files; the extra failures were not investigated as part of this split. Core reproduced the two known K3a failures (HostedImportNames and HOSTED_IMPORT). The two known Instance connector-integration failures and hosted-child stall were not rerun. None was fixed or suppressed.

The existing Connector behaviour inventory (4,900 historical rows), its checker and JSONL reporter remain. The Fishball inventory and release packaging assertions remain; a test-only dependency is now permitted in `devDependencies`, not in shipped imports or runtime/bundle dependency fields. The Instance inventory is unchanged. No whole-repository test or release matrix was run.
