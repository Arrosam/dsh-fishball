# R-FIX-REDACT: the child-stderr log (`captureChildStderr`)

Source: the R-FIX-REDACT requirements relayed with the task (2026-11-18), including fix F4's report.
Expected outputs come from them only, never from `stderr-log.js`. The rows are data in
[rows.mjs](<rows.mjs>) with the vocabulary in [constants.mjs](<constants.mjs>); [cases.mjs](<cases.mjs>)
drives `captureChildStderr(stream, { root }, limitBytes)` with a synthetic `PassThrough` (no child
process) into a scratch directory under the OS temp dir.

A row feeds its chunks one at a time. After each chunk, and again after `end()`, it waits for the log
(`child-stderr.log.1` then `child-stderr.log`) to hold exactly the expected text and to stay unchanged
for 10 polls. It then checks that every planted secret, and U+FFFD, is absent from both files.

## Requirements under test

| # | Rule |
| --- | --- |
| S1 | `child-stderr.log` is created empty at once. A null or undefined stream is a no-op. Errors are swallowed. |
| S2 | Text is buffered to a newline. Each newline-terminated block goes through `redact` and is appended. |
| S3 | Before a write would push the file past `limitBytes`, the file is renamed to `child-stderr.log.1`. There is one rotation. |
| S4 (F4) | When the unterminated buffer exceeds `limitBytes` UTF-8 bytes, the log gets the redacted prefix up to and including the last whitespace, then `[truncated]\n`. Everything after that, up to and including the next real `\n`, is discarded. With no whitespace, only `[truncated]\n` is written. At or below the cap nothing is force-flushed. |
| S4a | The F4 cut, refined by the review (2026-11-18; supersedes S4's head). The cut fires whenever the buffered unterminated text exceeds `limitBytes` after a chunk, including the remainder after a newline in the same chunk. The head is the first (`limitBytes` − 12) bytes, backed off to a character boundary, then cut after that prefix's last whitespace (nothing is kept without one). The head is redacted on its own and the mark appended. If redaction lengthened the head, it is cut again on a character boundary, so that head + mark ≤ `limitBytes`. Head and mark are one write: they rotate together and always share a file. |
| S5 | At the end, a remaining buffer is written redacted with `\n`. If the stream ends while discarding, nothing more is written. |
| S6 | The user's rule (2026-11-18) for a single write larger than `limitBytes` after redaction. Cuts are in bytes on a UTF-8 character boundary, so no file holds U+FFFD or a partial character. The final write at the end keeps its head, then `[truncated]\n`, in at most `limitBytes`. Below 12 bytes (the mark's size) it is exactly `[truncated]\n`. A newline-terminated block keeps its last bytes from a character boundary, at most `limitBytes`. |

## Case list (cap 64 unless stated)

| Id | Row | Technique | Input | Expected |
| --- | --- | --- | --- | --- |
| STDERR-UC-01 | F4 report | Use case (fix F4, cap 65536) | `'x '×32756 + ' ' + token[0,24]`, then `token[24..] + '\n'` | the prefix to the last space + `[truncated]\n`; neither token half in either file |
| STDERR-UC-01 | F4 report, then a line | Use case / ST | the same, then `next line\n` | `next line\n` written normally |
| STDERR-EP-01 | 5 rows | EP (buffering) | one line; a line over 3 chunks; `password=hunter2` split over chunks; several lines plus a rest; an Authorization line | written only at a newline, redacted whole |
| STDERR-EP-02 | 4 rows | EP (end of stream) | a remainder; a remainder with a secret; nothing buffered; no data | remainder + `\n` (redacted); nothing more; an empty file |
| STDERR-EP-03 | null, undefined | EP (stream argument) | `null`, `undefined` | no throw, no file |
| STDERR-EP-03 | missing root | EP (errors swallowed) | a root that does not exist | no throw on call, write or end; nothing created |
| STDERR-BVA-01 | cap-1, cap | BVA | 63 / 64 buffered bytes | nothing before the end; 63 → written whole at the end; 64 → the 65-byte final write becomes its 52-byte head + `[truncated]\n` (S6) |
| STDERR-BVA-01 | cap+1 and variants | BVA | 65 bytes; 64 over two chunks then one more; no whitespace; whitespace first; a tab | prefix to the last whitespace + `[truncated]\n`; only `[truncated]\n` when there is no whitespace; nothing at the end |
| STDERR-BVA-02 | 4 rows | BVA (UTF-8 bytes, not characters) | 32 × é (64 bytes); 33 × é (66 bytes); 5 é + space + 26 ü (63 bytes) then one ü; 21 then 22 × € | at the cap: not cut while buffered, then 26 × é + `[truncated]\n` at the end (S6); over it: cut by bytes |
| STDERR-BVA-06 | 11 rows | BVA / ST (S4a) | the remainder after a newline in the same chunk; whitespace past the 52-byte prefix; whitespace at byte 52; whitespace at byte 53; two-byte text over the prefix end; cap 30 `key=a key=a key=a …` (the redacted head grows to 45 bytes); the same with `éé` at the second cut; `{"tokens":["ab]` + c×30 + space + d×40 (F2); the review's cap-40 probe; 50 earlier bytes + a cut; the review's cap-65536 probe (two EARLIER lines, a 131072-char `w0 w1 …` line in two writes, `\nafter\n`) | `ok\n` + head + mark; the head up to the in-prefix whitespace; the whole 52-byte prefix + mark; only the mark; the head to its last space; `key=[redacted] key[truncated]\n` (30 bytes); `key=[redacted] é[truncated]\n` (29 bytes, on a character boundary); `{"tokens":[redacted][truncated]\n`, with no c or d run; `.1` = `abc password="[redacted][truncated]\n` and current = `next\n`; `.1` = the earlier line, current = head + mark; `.1` = the 65519-byte head + mark and current = `after\n` (the EARLIER lines rotate out). In every row, head and mark are in the same file |
| STDERR-BVA-04 | 7 rows | BVA (S6, final write over the limit: the head's boundary; limit = mark+1, mark, mark−1; limit 4) | `w`+31 é+`w`; `ww`+15 😀+`ww` (cap 64); 13/12/11-byte limits with that many ASCII bytes; limit 4 with `éé`, and with `ééé` | `w`+25 é+mark; `ww`+12 😀+mark (heads back off to a character boundary); `a`+mark; the mark; the mark; the mark; the mark (`ééé` already cut by F4) |
| STDERR-BVA-05 | 6 rows | BVA (S6, a terminated block over the limit) | a 64-byte line; a 65-byte line; 30 € + `\n`; 40 é + `\n`; a 105-byte ASCII line; a 90-byte line that redacts to 20 bytes | whole; the last 64 bytes; 21 € + `\n`; 31 é + `\n` (63 bytes, from a boundary); the last 64 bytes; the redacted line whole (the limit applies after redaction) |
| STDERR-DT-01 | 2 rows | Decision table (where the secret is relative to the last whitespace) | `password: hunter2 …` before the cut; `token=aaa…` after the last space, then `lmn\n` | the prefix redacted; the after-part never written in any form, the mask included |
| STDERR-ST-01 | 5 rows | State transition (normal → discarding → newline → normal → end) | discarding over more chunks; two cut lines in a row; a cut straight after a cut; buffering after a discard; the end while discarding | one mark per cut, the discard lasts to the next newline, later text is normal, nothing at the end while discarding |
| STDERR-BVA-03 | 3 rows | BVA (rotation limit) | two 32-byte lines (64 = limit); a third line; two 33-byte lines (66) | no rotation; the old file becomes `.1` and the new line starts the current file; the second line rotates the first |
| STDERR-ST-02 | second rotation | State transition | five 32-byte lines | `.1` = lines 3–4, current = line 5 (one rotation only) |

Total: 60 tests per SDK (53 data rows + 7 in cases.mjs).
