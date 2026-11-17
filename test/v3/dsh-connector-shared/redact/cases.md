# R-FIX-REDACT: the redactor (`dsh-connector-shared/redact`)

Source: the R-FIX-REDACT requirements relayed with the task (2026-11-18). Expected outputs come from
them only, never from `redact.js`. The rows are data in [constants.mjs](<constants.mjs>) (`REDACT_ROWS`);
[cases.mjs](<cases.mjs>) registers them for each SDK. Each test name is `<case id> <row> [SDK x] <title>`.

Every row checks three things: the exact output; every planted secret substring is absent from the
output; and `redact(output) === output` (idempotence). The mask text is exactly `[redacted]`.

## Requirements under test

| # | Rule |
| --- | --- |
| R1 | A name is a bare identifier or a quoted one (`"…"`, `'…'`, or escaped JSON `\"…\"`). It is split at camelCase, acronym and non-alphanumeric boundaries. It is sensitive if any component is exactly token, key, secret, password, credential or authorization, or that word plus `s`. `APIKEY` and `apikey` are one component, so they stay unchanged (a known limitation). |
| R2 | The separator is `:` or `=` straight after the name, with optional spaces or tabs on either side and no newlines. A name with no separator masks nothing. |
| R3a | A quoted value has its contents masked and keeps its delimiters. Escapes are honoured, one level of escaped JSON included. An empty value stays as it is. An unterminated value is masked to the end of its line. |
| R3b | A container (`[` or `{`) is masked whole, and the brackets inside strings do not count. A container may span lines. An unbalanced container is masked to the end of the text. |
| R3c | An Authorization name with an unquoted value is masked to the end of the line, scheme included. |
| R3d | Any other sensitive name with an unquoted value has its run masked. The run ends at whitespace, `"`, `'`, `,`, `;`, `&` or the end of the text. A leading `Bearer` or `Basic` (any case) is masked together with the next run. |
| R4 | A standalone `Bearer <run>` keeps its scheme and masks the run. A standalone `Basic` is not masked. |
| R5 | A run of 32 or more characters from `[A-Za-z0-9_+=-]` is masked. `/` and `.` split runs. |
| R6 | Overlapping or touching masks merge into one. |
| R7 | The function is pure and stateless. Unrelated text comes back unchanged, and several credentials in one text are all masked. |

## Case list

| Id | Rows | Technique | Input / condition | Expected |
| --- | --- | --- | --- | --- |
| RED-EP-01 | 24 | EP (sensitive-name partitions: snake, camel, acronym, kebab, dotted, plural, bare word) | `<name>=s3cr3tValue9` for apiKey, api_key, API_KEY, access_token, accessToken, refreshToken, client_secret, clientSecret, DSH_AGENT_TOKEN, DSHAgentToken, myAPIKey, APIKeys, password, Passwords, x-api-key, X-Api-Key, config.apiKey, cacheKey, key, keyId, tokens, secrets, credential, credentials | `<name>=[redacted]` |
| RED-EP-02 | 11 | EP (non-sensitive: the word only as a substring; one component) | monkey, keyboard, tokenizer, passwordless, secretary, url, user, name, APIKEY, apikey, keyboardLayout | unchanged |
| RED-EP-03 | 5 | EP (quoted names) | `"api key"`, `'client_secret'`, `"user.password"`; `"monkey"`; a sensitive word only in the value | masked, masked, masked; unchanged, unchanged |
| RED-BVA-01 | 8 | BVA (separator spacing: 0, 1, 2 spaces, tabs; no separator; a newline before or after; end of text) | `password: hunter2`, `password = …`, `password  =  …`, `password\t:\t…`, `password hunter2`, `password\n=…`, `password=\n…`, `password=` | the first four masked; the rest unchanged |
| RED-DT-01 a … | 18 | Decision table, value form a (quote kind × escape × empty × terminated × raw/escaped JSON) | double, single, leading space, punctuation, `\"` inside, `\'` inside, one character, empty `""` and `''`, a JSON member, a single-quoted object, escaped JSON, escaped JSON with `\\\"` inside, escaped JSON in a log line, unterminated (then a line / at the end / single quote), a quoted Authorization | delimiters kept and the contents become `[redacted]`; empty values unchanged; an unterminated value masked to the end of its line |
| RED-DT-01 b … | 6 | Decision table, value form b (array/object × nesting × brackets in strings × multi-line × balanced) | `passwords:[…]`, `"credentials": {…}, "x": 1`, nested with `]` and `[` in strings, an escaped quote in a string, pretty-printed JSON, unbalanced | the container becomes `[redacted]` and the rest stays; unbalanced masks to the end of the text |
| RED-DT-01 c … | 10 | Decision table, value form c (scheme Basic/Digest/Bearer/unknown × name case × lines after) | Basic, a 72-char base64 with `/+=`, Digest with `,` and `=`, Bearer with a next line; 5 name spellings with `Negotiate …`; one header in a block | `<name>: [redacted]`; later lines kept |
| RED-DT-01 d … | 21 | Decision table, value form d (terminator × scheme word × value shape) | short, dotted, env name, query string, punctuation, one character, a space after the separator; each of 8 terminators; `Basic`/`Bearer`/`bearer` plus a run; `BASIC abc def`; tabs; `Bearer` alone | the run becomes `[redacted]` and the terminator and text after it stay; scheme + run is one mask |
| RED-EP-04 | 7 | EP (standalone Bearer) | in prose, lower and upper case, ended by `,`, in quotes; `Bearer` alone; `Basic plan required` | scheme kept + `[redacted]`; the last two unchanged |
| RED-BVA-02 | 10 | BVA (run length 31 / 32 / 33; the `_+=-` class at 31/32; inside text; a path segment; split by `.` and `/`; a file path) | as listed | 32+ masked; 31, split runs and paths unchanged |
| RED-EP-05 | 6 | EP (overlap / touch) | `token=<40-run>` (`=` joins it into one run: one mask for all), `token: <run>`, a name inside a run, a container touching a run, `Bearer <run>`, `password="<run>"` | exactly one `[redacted]` per merged region |
| RED-EP-06 | 9 | EP (several credentials; unrelated text) | several on one line, several lines; error line, stack trace, plain, non-ASCII, a sensitive word in prose, `keyboard layout: us`, empty | all masked, the rest kept; unrelated text unchanged |
| RED-ST-01 | 1 | State transition (masked → plain → masked → plain calls) | alternating calls | each call answers as on its own |

Total: 136 tests per SDK (135 data rows + RED-ST-01).
