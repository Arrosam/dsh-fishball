# Fishball release upgrade on test DSH :7713

**Result:** Test DSH :7713 (DSH `0.2.2-rc.1`, profile `fishball`) was upgraded to release build `5e3151a8` and left running. All five bundles stayed on version `1.0.0-alpha.1`; the archive and installed-file comparisons distinguish the new build from the previous one. The child reached `READY` at `2026-11-19T04:37:08.906Z` after the DSH-X start request at `04:37:05Z`.

## Release integrity

All eight archives passed `shasum -a 256 -c SHA256SUMS` and matched the pinned digests; total size was 6,963,480 bytes. Engine and peer checks passed against Node `24.22.2`, DSH `0.2.2-rc.1`, and the incoming host peers. The offline-store helper was byte-identical to the previous release helper (SHA-256 `f123c21639102753a0f58cf67fe80eb2b5959b40f73c800d77eac0dc51a46c17`).

| Archive (version `1.0.0-alpha.1`) | SHA-256 |
| --- | --- |
| `dsh-agent-connector` | `d9a54aede8121f8c5d4d27e73c39e03fbaefda1b5a7a7b02f66f3c4c16209847` |
| `dsh-connector-adapter` (not installed) | `92e82b222a0c6fcea8f2d526e03ec2deefc6d70ca1f6abe99805d1174b6e2607` |
| `dsh-connector-shared` | `a42e51d7a71115864cf36bdfbd478fe9c5931844fb0c1f4c4f22bc949de09ad7` |
| `dsh-connector-ui` | `018915b446d30cf54817c55008dbd637ef23a778183a8891888f3f78d6557107` |
| `dsh-instance` | `64c4352f6c7af6edbd2127e6c796a0bf2a310a7c688639813c99df0136b643f1` |
| `fishball-core` | `2a77413c538190b554bc5d1921cfc89026e2f02806d77b3eaff9690a7ce61f46` |
| `fishball-shared` | `d79907fa50063c26d2cd086c8cb6b57273b2efde875f7e1762c594b7594ad7a3` |
| `fishball-ui` | `6ef572f5775970910a469efc25e37b46dd45e49642089508ea0c524eadc843a2` |

## Changes and backups

- Before stopping, unauthenticated `GET /` returned HTTP 401 and all five bundles were enabled. The child lifecycle tail included `CHILD_LISTEN`, `CHILD_READY`, and `READY` events.
- Test-home backup: `/private/tmp/fishball-7713-backup-pre-alpha1c-20261119T041627Z` (3,269 regular files, 40,028,586 bytes). Child package and vendor backup: `/private/tmp/fishball-7713-child-stale-20261119T041627Z` (1,004 regular files, 17,109,889 bytes). Both copies excluded credential-like names and runtime logs and are not complete mirrors. Both top-level directories were verified `0700` after the test-home backup mode was corrected from `0755`; rsync had preserved the source directory mode. The backed-up old core/UI archives matched their source hashes (`9ee2818fb15ed0cba6a654cb71ad33d6b4bc14b529f1431a2961b893cd41ef41` and `1b251fdc9e7dbbfb4c05a642dd8ff7a3e2592512c76e78ad7096b71ba01cb66d`).
- DSH-X stopped only the test launch. The documented `dsh plugin` CLI added the three host archives to the existing profile in place, offline with scripts ignored. The helper filled missing entries in the existing host store. Before restart, only the two child vendor archives were replaced and the two child plugins were removed and re-added from those archives. The child reused its linked store without manual seeding: the standalone MCP client store index was absent, but the client was bundled in core and the offline add succeeded. Both bundle selections and vendor dependency specs were restored.
- The sandbox denied the first host add, vendor write, child remove and child add; each succeeded on its separately approved exact retry. pnpm reported expected warnings for runtime-provided peers. No instance uninstall script, browser, or authentication material was used; the launcher response was withheld.

## Verification after restart

| Bundle | Byte-equal payload files | Credential-like names skipped |
| --- | ---: | ---: |
| `dsh-agent-connector` | 146 | 8 |
| `dsh-connector-ui` | 21 | 0 |
| `dsh-instance` | 50 | 2 |
| `fishball-core` | 1,016 | 3 |
| `fishball-ui` | 31 | 0 |

All five bundles were enabled at `1.0.0-alpha.1`, and both child vendor SHA-256 values matched the release. The core contained MCP client `2.4.0`; the UI contained the matching `client.brand.js`. Child stderr was empty (0 bytes). Unauthenticated checks on :7713 returned HTTP 401 for the web root, HTTP 200 for protected-resource metadata, and HTTP 401 for `tools/list`. Authenticated tool enumeration, identity resource resolution, and browser rendering were deferred to the separate e2e session.
