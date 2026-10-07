# Root UI composite packaging operator — independent SOURCE safety review

Date: 2026-10-07 UTC. Independent Sol 6.1 max source reviewer, separate from root executor.

Disposition: **No SOURCE blocker identified for the exact pinned, one-time packaging operation.** Root must preserve the operator's assert guards by invoking unoptimized Python, for example `python3 -E .runtime/root-ui-composite-package.py` without -O/-OO. The destination must still be absent and the fixed inputs must still match. This report does not invoke or authorize installation, a listener, a profile change or runtime acceptance.

The reviewed operator is6087B, SHA256 `d5a1e3b6b813e034f4dc728d12a365a1637e6e6d1fd4d39282f115bfc32fd1ba`. Its entire source was read as text; it was not parsed, imported or executed. Public archive/owned package checks below used a separate read-only Python metadata checker, not the operator.

## Fixed reads, writes and archive safety

Reads are the exact original archive `.runtime/ni2-install/artifact/dsh-fishball-0.1.0-preview.1.tgz`, the owned old installed public package only at `.runtime/ui-qa-a58c522/home/profiles/web/node_modules/dsh-fishball`, and the two pinned current client files. No sibling profile, personal file, credential or storage state is inspected. Builtins are pathlib/copy/gzip/hashlib/io/json/os/tarfile; there is no application import, subprocess, network or model call.

The operator verifies canonical root/base/installed/destination paths, the original archive hash and replacement hashes before writing. For each archived entry it checks the package prefix, canonical components, no absolute/dot/parent path, uniqueness, regular file or directory type, per-entry32MiB and aggregate file128MiB limits. Links and special archive entries are refused. Every regular member must match the old installed file byte-for-byte, stay within that package and satisfy the complete1114-file inventory. The final installed scan rejects links and matches its file set.

Independent read-only checks found exactly1114 regular archive files, no archive directory/link/special entries, and exact installed byte/file-set equality. The observed installed package has36 ordinary directories and no links or special entries. The operator's installed scan is a file inventory rather than a generic rejection of every possible extra special node; the actual immutable owned input was independently checked to contain none. The disposition covers these pinned inputs.

Writes are exclusively beneath the previously absent `.runtime/ui-qa-client-cb75`: a new0700 destination, new0700 package directory, new exclusive archive, new exclusive package files and a new exclusive final manifest. No original archive/installation, shared product source, listener, profile lifecycle, storage/auth fact, native runtime or Git state is written. Canonical member names, resolved output containment, fresh owner-only directory creation and exclusive file opens prevent reuse of an existing destination within this owned operation. Files receive only the original permission bits masked to0777.

The source assembles a new archive from validated original members; it does not call extract/extractall. It copies member metadata and corrects each changed size, including a retained PAX size field. Gzip has fixed header timestamp0 and no source filename. The re-opened archive must have the expected file set; each archived and unpacked package file must hash to its record. These are future operator postconditions, not a produced artifact claim.

## Exact bytes and npm consumer

The base archive is4114465B, SHA256 `fa3fb398d901a5c3d04d1f6f949878eb190f1d1fb737b16210347963d0afb5c0`. Original unpacked file bytes total21338906; the largest entry is2428635B. The two replacements are:

| Path | Bytes | SHA256 |
| --- | ---: | --- |
| src/client-entry.cjs | 106631 | `4ba377f9973eddd6d1aebe66e014370f9f8ff7b1392b95528a51790040fd9e82` |
| lib/client.js | 106599 | `9ba97b8397153dc29f87f1bcd6018cce856decdd485517399ea255cbf90792d8` |

Both differ from their original archived bytes. No other path is selected for replacement. Expected new unpacked file bytes are21349740, within the aggregate limit; both replacements are within the entry limit. Complete1114-file equality and exactly-two-change assertions preserve all other package bytes.

The original package.json remains private dsh-fishball0.1.0-preview.1 and exports ./client to ./lib/client.js. The current lib/client.js exactly equals the published emitter's fixed ModuleLoader wrapper plus the complete new source factory text, checked by literal byte comparison without JavaScript parsing/import or a build. The1166B emitter source SHA256 `f5c98d5daabcfea01ef8829284fd589085e47dae95d9a72ec652283366a65702` is itself unchanged from the archive. Thus the correct npm consumer path receives the reviewed client bytes; no broader backend or dependency update is introduced.

The manifest truthfully labels an a58 native package base with cb75 reviewed client replacements and sets wholeGitRevisionClaim false. Revision labels are root-provided attribution; this lane performs no Git verification. Output fingerprints, file count, changed paths and composite identity are reported. No raw provider input, credential or personal content is emitted.

## Root execution obligations and retained limits

Use the exact reviewed operator under unoptimized Python with the same fixed inputs and fresh exclusive destination. Root owns the once-invocation and must inspect its completed archive/package/manifest checks before any later installation. If writing fails, partial output can remain only in the new destination; the operator does not overwrite/resume or delete it, and no failed artifact should be treated as complete.

No packaging artifact was produced here. Source review does not prove installation, rendering, reconnect behavior, native worker execution or cancellation. Root's separate lifecycle plan and actual QA remain required. All87 accepted0/HOLD and the protected final CODE block are unchanged.

The companion JSON records exact public pins, bounded inventory summaries/digests and the evidence-only replay command. Only new independent evidence and temporary metadata were written. No operator or application parsing/import/execution, build, fixture/test, listener/profile lifecycle, native/model/network/database/Git action or protected security experiment occurred.

