# Private frozen-package transfer for Linux testing

The owner explicitly requested a private Mac-to-cloud transfer while development and manual Web QA continue. The supported Library upload succeeded; this is a test handoff, with no GitHub repository, remote, push or publication.

| Item | Confirmed value |
| --- | --- |
| Frozen product revision | `a58c522f32dd2be2ec29a697ec32ed295e154614` |
| Library file | `libfile_3f9bd1022db081919b212c4159c18f83` |
| Consumer file ID | `file_00000000348c820baa44fd74d2652c7f` |
| Filename | `dsh-fishball-a58c522-private-linux-test-bundle.tgz` |
| Library path | `/dsh-fishball-a58c522-private-linux-test-bundle.tgz` |
| Library version | `0`, returned by the successful upload |
| SHA-256 | `095a91ed84f8cb29d350b64aec62a5f6ae11a9def75ba5146361af912dedb344` |
| Size | 866,094 bytes; 153 regular UTF-8 text members |
| Product files | 146 files, each identical to the original frozen Mac package |
| Original Mac package hash | `fa3fb398d901a5c3d04d1f6f949878eb190f1d1fb737b16210347963d0afb5c0` |
| Original official host lock | `68d3847884edf5b2c21d9d254bc059c3beb8105baec50c6d637c3328bbf187a3` |

The current [Library skill](skill://plugin_connector_1p_1b8ff8edfc1481918b252c8277e23125/library/SKILL.md) was read for this transfer. `create_library_file` received the local final archive and returned `status: succeeded`. The current official `library_file_transfer.py apply-xattrs` then completed with exit 0 using the returned metadata. There was one upload, no failed-helper fallback, no guessed URL or third-party destination. The companion records the sanitized tool result, artifact and recipe pins, structural verification and local metadata persistence.

The archive includes the portable package source, compiled text client, synthetic tests, MIT and provenance notices, eight portable documents, exact official host package/lock, a new synthetic-profile recipe, an original-CLI launch recipe, manifest and Linux handoff. It excludes `node_modules`, platform binaries, Git history, private runtime state, owner data, credentials, keys, cookies, sessions, databases, logs and historical owner/review/evidence documents. No owner fishball personal data was inspected or transferred. The original package, installed Mac package and QA fixture were unchanged.

The bundled handoff names only existing bounded checks (`scripts/check.mjs`, `test/memory.test.mjs`, `test/context.test.mjs`). The fresh profile defaults to worker disabled; its optional Mac worker configuration uses the unchanged deterministic local model and empty tools. The launch recipe uses the original pinned CLI on `127.0.0.1:3080`, a minimal environment and byte-counted logs. It creates no credentials and requires a new consumer-owned fixture and supported original authentication/setup decisions. Dependencies are not bundled or installed by this transfer; consumer runtime policy and an unchanged lock govern any `npm ci --ignore-scripts --no-audit --no-fund`.

Two local pre-upload drafts named a nonexistent test in the handoff: first `foundation.test.mjs`, then `ledger.test.mjs`. Both original drafts are retained privately, neither was uploaded, and no product source changed. The final recipe asserts the existence of each named check and the final archive was checked against its manifest and original package. These are transfer-instruction corrections and structural checks, not product test results.

Linux execution, host installation, package syntax and Linux/browser tests were **not performed** on Mac for the transfer. The frozen native worker still checks `darwin/arm64`; Linux native-worker support is unverified and currently refuses through that guard. Do not relax source, class, platform, permission or hash gates. This transfer does not resolve the previously blocked cloud loopback browser access, the earlier approved DOCX/PDF materialization failures or the original independent final CODE session failure. Consumer-local materialization and Linux test results are pending with the parent.

All 87 criteria remain unaccepted. Current schema6/NI3 candidates are separate from this frozen revision. External models remain deferred; no live model, account, chat, webhook, credential change or publication is authorized. Root retains logical local Git history and the independent QA child retains exclusive ownership of its profile/listener.
