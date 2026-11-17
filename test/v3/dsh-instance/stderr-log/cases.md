# R-FIX-REDACT: the child-stderr log (`captureChildStderr`)

Source: the R-FIX-REDACT requirements relayed with the task (2026-11-18), including fix F4's report.
Expected outputs come from them only, never from `stderr-log.js`. The rows are data in
[rows.mjs](<rows.mjs>) with the vocabulary in [constants.mjs](<constants.mjs>); [cases.mjs](<cases.mjs>)
drives `captureChildStderr(stream, { root }, limitBytes)` with a synthetic `PassThrough` (no child
process) into a scratch directory under the OS temp dir.

A row feeds its chunks one at a time. After each chunk, and again after `end()`, it waits for the log
(`child-stderr.log.1` then `child-stderr.log`) to hold exactly the expected text and to stay unchanged
for 10 polls. It then checks that every planted secret is absent from both files.

## Requirements under test

| # | Rule |
| --- | --- |
| S1 | `child-stderr.log` is created empty at once. A null or undefined stream is a no-op. Errors are swallowed. |
| S2 | Text is buffered to a newline. Each newline-terminated block goes through `redact` and is appended. |
| S3 | Before a write would push the file past `limitBytes`, the file is renamed to `child-stderr.log.1`. There is one rotation. |
| S4 (F4) | When the unterminated buffer exceeds `limitBytes` UTF-8 bytes, the log gets the redacted prefix up to and including the last whitespace, then `[truncated]\n`. Everything after that, up to and including the next real `\n`, is discarded. With no whitespace, only `[truncated]\n` is written. At or below the cap nothing is force-flushed. |
| S5 | At the end, a remaining buffer is written redacted with `\n`. If the stream ends while discarding, nothing more is written. |

## Case list (cap 64 unless stated)

| Id | Row | Technique | Input | Expected |
| --- | --- | --- | --- | --- |
| STDERR-UC-01 | F4 report | Use case (fix F4, cap 65536) | `'x '×32756 + ' ' + token[0,24]`, then `token[24..] + '\n'` | the prefix to the last space + `[truncated]\n`; neither token half in either file |
| STDERR-UC-01 | F4 report, then a line | Use case / ST | the same, then `next line\n` | `next line\n` written normally |
| STDERR-EP-01 | 5 rows | EP (buffering) | one line; a line over 3 chunks; `password=hunter2` split over chunks; several lines plus a rest; an Authorization line | written only at a newline, redacted whole |
| STDERR-EP-02 | 4 rows | EP (end of stream) | a remainder; a remainder with a secret; nothing buffered; no data | remainder + `\n` (redacted); nothing more; an empty file |
| STDERR-EP-03 | null, undefined | EP (stream argument) | `null`, `undefined` | no throw, no file |
| STDERR-EP-03 | missing root | EP (errors swallowed) | a root that does not exist | no throw on call, write or end; nothing created |
| STDERR-BVA-01 | cap-1, cap | BVA | 63 / 64 buffered bytes | nothing before the end; 63 → written whole at the end; 64 → written at the end and not cut (what a 65-byte write does to a 64-byte file is not specified, so only "not cut" is asserted) |
| STDERR-BVA-01 | cap+1 and variants | BVA | 65 bytes; 64 over two chunks then one more; no whitespace; whitespace first; a tab | prefix to the last whitespace + `[truncated]\n`; only `[truncated]\n` when there is no whitespace; nothing at the end |
| STDERR-BVA-02 | 4 rows | BVA (UTF-8 bytes, not characters) | 32 × é (64 bytes); 33 × é (66 bytes); 5 é + space + 26 ü (63 bytes) then one ü; 21 then 22 × € | at the cap: not cut; over it: cut by bytes |
| STDERR-DT-01 | 2 rows | Decision table (where the secret is relative to the last whitespace) | `password: hunter2 …` before the cut; `token=aaa…` after the last space, then `lmn\n` | the prefix redacted; the after-part never written in any form, the mask included |
| STDERR-ST-01 | 5 rows | State transition (normal → discarding → newline → normal → end) | discarding over more chunks; two cut lines in a row; a cut straight after a cut; buffering after a discard; the end while discarding | one mark per cut, the discard lasts to the next newline, later text is normal, nothing at the end while discarding |
| STDERR-BVA-03 | 3 rows | BVA (rotation limit) | two 32-byte lines (64 = limit); a third line; two 33-byte lines (66) | no rotation; the old file becomes `.1` and the new line starts the current file; the second line rotates the first |
| STDERR-ST-02 | second rotation | State transition | five 32-byte lines | `.1` = lines 3–4, current = line 5 (one rotation only) |

Total: 36 tests per SDK (29 data rows + 7 in cases.mjs).
