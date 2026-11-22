# The child-stderr log (`captureChildStderr`)

Requirements of `src/native-runtime/stderr-log.js` `captureChildStderr(stream, { root }, limitBytes)`
(R-FIX-REDACT, relayed 2026-11-18, with fix F4's report and the review's refinement; R-FIX-INSTANCE
F03 and F04). Expected outputs come from these rules only. The rows are data in [rows.mjs](<rows.mjs>);
[stderr-log.test.mjs](<stderr-log.test.mjs>) drives the capture with a synthetic `PassThrough` (no child
process) into a scratch folder. After each chunk, and after `end()`, a row waits until no file request
is in flight (`settled` of `@dsh-instance/test-helpers/wait`, no deadline) and then checks the log (`child-stderr.log.1` then
`child-stderr.log`) exactly; at the end every planted secret, and U+FFFD, is absent from both files.

| # | Rule |
| --- | --- |
| S1 | `child-stderr.log` is created empty at once. A null or undefined stream is a no-op. Errors are swallowed. |
| S2 | Text is buffered to a newline. Each newline-terminated block goes through the redactor and is appended. |
| S3 | Before a write would push the file past `limitBytes`, the file is renamed to `child-stderr.log.1`. There is one rotation. |
| S4 (F4) | When the unterminated buffer exceeds `limitBytes` UTF-8 bytes, the log gets the redacted prefix up to and including the last whitespace, then `[truncated]\n`. Everything after that, up to and including the next real `\n`, is discarded. With no whitespace, only `[truncated]\n`. At or below the cap nothing is force-flushed. |
| S4a | The cut fires whenever the buffered unterminated text exceeds `limitBytes` after a chunk, including the remainder after a newline in the same chunk. The head is the first (`limitBytes` − 12) bytes, backed off to a character boundary, then cut after that prefix's last whitespace. The head is redacted on its own and the mark appended; if redaction lengthened it, it is cut again on a character boundary so head + mark ≤ `limitBytes`. Head and mark are one write: they rotate together. |
| S5 | At the end, a remaining buffer is written redacted with `\n`. If the stream ends while discarding, nothing more is written. |
| S6 | A single write larger than `limitBytes` after redaction: cuts are in bytes on a UTF-8 boundary (no U+FFFD). The final write keeps its head, then `[truncated]\n`, in at most `limitBytes`; below 12 bytes it is exactly `[truncated]\n`. A newline-terminated block keeps its last bytes from a character boundary, at most `limitBytes`. |
| F03 | Masking a credential container does not depend on chunking: one write per line logs exactly what one write of the whole text logs. A cut whose dropped rest opens a container, or that happens while one is open, seals the stream: `[redacted: rest of stream]\n` once, nothing after it. A cut with no opener in its rest does not seal. |
| F04 | The blocks waiting for the file are bounded to one `limitBytes`: the oldest are dropped first and `[dropped]\n` precedes the first block after a gap; order is kept, the newest line survives, logging never throws, and retained memory does not grow with the burst. |
