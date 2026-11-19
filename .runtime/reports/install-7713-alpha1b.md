# Fishball 1.0.0-alpha.1 reinstall on test DSH :7713

**Result:** The three host plugins and both hosted child plugins are on build `652456bf`. The test DSH is running (`0.2.2-rc.1`, profile `fishball`); the child reached `READY` at `2026-11-19T02:11:19.124Z`. The runtime version label remained `1.0.0-alpha.1` throughout, so archive and payload comparisons, not version strings, establish which build is installed.

## Release checks

Verified eight `.tgz` files totaling **6,713,327 bytes**, using SHA-256 and the release's `SHA256SUMS`. The three host packages’ Node/DSH engines and peer ranges passed against Node `24.22.2`, the DSH `0.2.2-rc.1` runtime and the incoming host peers. The CLI emitted expected missing-peer notices for dependencies provided at runtime.

| Archive | Bytes | SHA-256 |
|---|---:|---|
| `dsh-agent-connector-1.0.0-alpha.1.tgz` | 355777 | `7c4e13237e7ca1b276c28104a49739853e8a50d1d5f2726f4f33287e0d67ee13` |
| `dsh-connector-adapter-1.0.0-alpha.1.tgz` | 26747 | `7a8b49306288d7fc401b2d6550048f05da4ec2799e9a5a04194d19d7c6bf47de` |
| `dsh-connector-shared-1.0.0-alpha.1.tgz` | 7697 | `a42e51d7a71115864cf36bdfbd478fe9c5931844fb0c1f4c4f22bc949de09ad7` |
| `dsh-connector-ui-1.0.0-alpha.1.tgz` | 49247 | `018915b446d30cf54817c55008dbd637ef23a778183a8891888f3f78d6557107` |
| `dsh-instance-1.0.0-alpha.1.tgz` | 3200650 | `876204e2a22ebc6a889e17427997abfd0ffb65b5efeb67d9f1aaed758e88b47c` |
| `fishball-core-1.0.0-alpha.1.tgz` | 2985297 | `9ee2818fb15ed0cba6a654cb71ad33d6b4bc14b529f1431a2961b893cd41ef41` |
| `fishball-shared-1.0.0-alpha.1.tgz` | 5678 | `d79907fa50063c26d2cd086c8cb6b57273b2efde875f7e1762c594b7594ad7a3` |
| `fishball-ui-1.0.0-alpha.1.tgz` | 82234 | `1b251fdc9e7dbbfb4c05a642dd8ff7a3e2592512c76e78ad7096b71ba01cb66d` |

## Backups

- `/private/tmp/fishball-7713-backup-pre-alpha1b-20261119T013953Z`: copy **without credential-like files**; not a full copy. The name filters can also exclude ordinary package files. Rsync transferred **3,305 files** and reported **41,215,167 transferred bytes**. The copy occupied **49,060 KiB**. The trailing permission command reported `chmod: --: No such file or directory`; the backup directory was independently confirmed mode `700`. The earlier backup was left alone.
- `/private/tmp/fishball-7713-child-stale-20261119T015711Z`: copy of the two old installed child package directories and the two old vendored archives, **1,019 regular files / 17,157,024 bytes**. The copied archive SHA-256 values matched the stale originals: core `d2ec2484857191a9ee90829d8b7f4e7f1c4dfe8fd9984c08d3e129f5008a14e9`; UI `399091710f5d1bb19c347d07182766f698acd4c480eaded8c12c08972ee33764`.

## Reinstall and stale child fix

1. Before changes, :7713 answered HTTP 401 without authentication; the existing host and child packages already reported `1.0.0-alpha.1`. The full instance uninstall script was deliberately not run: it would delete the child runtime, including its existing `.credentials.yaml`.
2. Stopped only the test launch via DSH-X :3780. Installed `dsh-agent-connector`, `dsh-connector-ui` and `dsh-instance` in place via `dsh plugin --profile fishball add`, using the documented offline store helper (SHA-256 pinned), an isolated HOME and cache, and scripts ignored. An approved exact retry resolved the sandbox denial on the profile lock. The optional adapter was not installed. After startup, all three host plugins were enabled and mounted; the selected package-file comparisons matched the new tarballs (142 connector, 18 connector UI, 47 instance files).
3. The child started but stayed on the old build. The installed instance checks the installed manifests’ versions, not the archive bytes, and skips the child install when both versions match. The instance's embedded archives matched the new release, but the child's vendored archives still matched the old build.
4. With the test instance stopped, replaced only the two backed-up child vendor archives and verified their new hashes. The first offline in-place child add at the same dependency paths did not refresh the stale payloads: all 15 differing core files matched the backup; 7 differing UI files matched the backup and the new `client.brand.js` was missing. No compared file differed from both builds. This establishes stale installed bytes, not the exact internal pnpm mechanism.
5. Stopped the test launch and targeted only its child `fishball` profile. Ran the documented `dsh plugin --profile fishball remove fishball-ui fishball-core`, then `dsh plugin --profile fishball add` with the two hash-checked vendored archives and the child's existing pnpm store. Both operations used an isolated environment, offline mode and ignored scripts. pnpm rejected explicit `--offline` and `--ignore-scripts` on `remove`; the approved retry kept both settings via environment variables. The approved `add` required the two bundle entries to be absent before installation and restored both entries and the original vendor dependency specs. DSH startup restored the original bundle order (UI before core). No config was edited by hand, no placement record was reset, and no credential file, browser profile, login URL, cookie or ticket was used in these commands.

## Final verification

| Check | Result |
|---|---|
| Test web listener | :7713 returned HTTP 401 without authentication after the final DSH-X start. |
| Host packages | `dsh-agent-connector`, `dsh-connector-ui`, `dsh-instance`: `1.0.0-alpha.1`, new build, enabled and mounted in the post-host-install check. |
| Hosted child lifecycle | Logged `CHILD_LISTEN`, `CHILD_READY` and fresh `READY` at `2026-11-19T02:11:19.124Z`; child stderr was empty. |
| `fishball-core` | `1.0.0-alpha.1`, enabled. Vendored SHA-256 matched the release; **984 checked files matched byte for byte**, 3 credential-like names skipped. |
| `fishball-ui` | `1.0.0-alpha.1`, enabled. Vendored SHA-256 matched the release; **31/31 files matched byte for byte**, including the new `client.brand.js`. |
| Connector boundary | Protected-resource metadata returned HTTP 200; unauthenticated `tools/list` received HTTP 401. |
| Deferred to e2e round 3 in the real browser | Authenticated web page, rendered Fishball sidebar entry, 20-tool enumeration, and `dsh-agent://identity` resource resolution. None were verified here. |

The child packages were reinstalled from the new vendored archives by the CLI before the final start; automatic installation at startup was not what refreshed them. No old-build content remained in the compared child payload files.
