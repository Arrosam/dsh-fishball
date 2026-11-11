# 2. Names (NAME)

Requirements: R-NAME-01…07, R-ID-10 (ids are not names), R-HOST-09. Conventions:
[README](<README.md>).

## Use Cases

### NAME-UC-01 — A principal pairs and receives the lowest free default name
**Req:** R-NAME-04, R-NAME-06, R-ID-03 · **Level:** integration · **Flags:** —

- **Actor:** a pairing client (Fishball DSH or external agent).
- **Preconditions:** C has principals named "Fishball" and "Fishball-3"; nobody holds "Fishball-2".
- **Main flow:** the client calls `pair({})` → `{ok: true, paired: true, id, name: "Fishball-2"}`.
- **Alternative flows:**
  - A1. `pair({name: "Bob"})`, free → name "Bob", `nameAssigned: true`.
  - A2. No principal exists → "Fishball".
- **Exception flows:**
  - E1. `pair({name: "fishball"})` (held by another, case-insensitively) → pairing succeeds, name "Fishball-2", `nameAssigned: false`, `nameRefused: "name-taken"`.
  - E2. `pair({name: "   "})` → pairing succeeds, default name, `nameRefused: "name-invalid"`.
- **Postconditions:** the token and id are bound whatever the name outcome; the name appears in the token entry status.

### NAME-UC-02 — The owner renames their Fishball
**Req:** R-NAME-02, R-NAME-03, R-NAME-05 · **Level:** integration (core + C), e2e (page and marks) · **Flags:** TQ-6

- **Actor:** the Fishball DSH owner.
- **Preconditions:** HF is paired as "Fishball" and manages S1; another principal holds "Ops".
- **Main flow:**
  1. The owner sets `identity.name` = "Navigator".
  2. Core calls `set_name({name: "Navigator"})` → ok.
  3. Before `set_name` answers, C has updated the name everywhere it is shown: S1's managed mark, the Hand over button ("Hand over to Navigator" if HF is designated), the token entry status, the designated-Fishball setting and later "managed by …" notes.
- **Alternative flows:**
  - A1. The owner sets "fishball" (a case-only change of its own name) → ok, stored as "fishball".
  - A2. The link was down during the change → after reconnect core calls `set_name` again with the current setting.
- **Exception flows:**
  - E1. The owner sets "ops" → `name-taken`; the Fishball page says the name is used by another agent on that DSH, shows "Fishball" (the name in use) and asks for another; core keeps working as "Fishball".
  - E2. The owner sets a 65-character name → `name-invalid`; the name stays "Fishball". *(R-NAME-03 names only `name-taken` for the page; what the page shows for `name-invalid` is TQ-6.)*
- **Postconditions:** the id is unchanged by any rename.

### NAME-UC-03 — An external agent renames itself
**Req:** R-NAME-02, R-NAME-01 · **Level:** integration · **Flags:** —

- **Actor:** external agent P(E2, `b`) named "Fishball-2".
- **Main flow:** `set_name({name: "Indexer"})` → ok; `set_name` with a pair-only AT → `not-paired` / `id-mismatch`.
- **Alternative flows:** A1. `set_name({name: "Fishball-2"})` (own name) → ok, nothing else changes.
- **Exception flows:** E1. `set_name({name: "INDEXER"})` while another holds "Indexer" → `name-taken`.
- **Postconditions:** "Fishball-2" is now free and is the next default (NAME-BVA-02).

## Equivalence Partitioning

### NAME-EP-01 — Name normalisation and validity
**Req:** R-NAME-02 · **Level:** unit · **Flags:** TQ-6

| # | Class | Input | Stored / result |
| --- | --- | --- | --- |
| 1 | plain | `Bob` | `Bob` |
| 2 | surrounding spaces | `  Bob  ` | `Bob` |
| 3 | inner runs | `Bob   the\t\tfish` | `Bob the fish` |
| 4 | other Unicode whitespace (NBSP, ideographic space) | `Bob\u00A0\u00A0fish` | `Bob fish` (K: which characters count as whitespace) |
| 5 | NFD input | `Cafe\u0301` | `Café` (NFC) |
| 6 | empty | `` | `name-invalid` |
| 7 | whitespace only | `   ` | `name-invalid` |
| 8 | control char inside | `Bo\u0007b` | `name-invalid` |
| 9 | newline inside | `Bob\nFish` | newline is whitespace → `Bob Fish`, or control → invalid: **TQ-6** |
| 10 | CJK | `小鱼` | `小鱼` |
| 11 | emoji | `🐟 fish` | accepted (K: characters = code points) |
| 12 | not a string | `42`, `null` | `name-invalid` (or schema `invalid-arguments`, K) |

### NAME-EP-02 — Uniqueness comparison
**Req:** R-NAME-01, R-NAME-02 · **Level:** unit · **Flags:** —

Existing principal A holds the name in column 2; B calls `set_name` with column 3.

| # | A holds | B sets | Expected |
| --- | --- | --- | --- |
| 1 | `Fishball-2` | `fishball-2` | `name-taken` |
| 2 | `Fishball-2` | ` Fishball-2 ` | `name-taken` (normalised first) |
| 3 | `Straße` | `STRASSE` | `name-taken` (full case folding) |
| 4 | `Café` (NFC) | `Cafe\u0301` | `name-taken` |
| 5 | `Bob fish` | `Bob  fish` | `name-taken` |
| 6 | `Bob` | `Bobb` | ok |
| 7 | `Bob` (B's own) | `BOB` | ok; stored `BOB` |
| 8 | `Bob` (B's own) | `Bob` | ok; nothing else changes (no notification, no change in marks) |

### NAME-EP-03 — Who may call `set_name`
**Req:** R-NAME-02, R-ID-06 · **Level:** integration · **Flags:** —

| # | Caller | Expected |
| --- | --- | --- |
| 1 | full AT | processed |
| 2 | pair-only, unbound | `not-paired` |
| 3 | pair-only, bound to another id | `id-mismatch` |
| 4 | no / invalid AT | 401 |

## Boundary Value Analysis

### NAME-BVA-01 — Name length after normalisation (1–64)
**Req:** R-NAME-02 · **Level:** unit · **Flags:** K (characters = Unicode code points after NFC)

| # | Length | Expected |
| --- | --- | --- |
| 1 | 0 | `name-invalid` |
| 2 | 1 | ok |
| 3 | 2 | ok |
| 4 | 63 | ok |
| 5 | 64 | ok |
| 6 | 65 | `name-invalid` |
| 7 | 66 raw, 64 after trimming one space each side | ok |
| 8 | 64 raw with one double space inside (→ 63) | ok |
| 9 | 64 NFD code points that become 60 in NFC | ok |
| 10 | 65 with a leading space (→ 64) | ok |

### NAME-BVA-02 — Lowest free default
**Req:** R-NAME-04 · **Level:** unit (allocator), integration (`pair`) · **Flags:** TQ-7

"Held" means by a current principal under the case-insensitive comparison.

| # | Names held | Next default |
| --- | --- | --- |
| 1 | none | `Fishball` |
| 2 | `Fishball` | `Fishball-2` |
| 3 | `Fishball`, `Fishball-2` | `Fishball-3` |
| 4 | `Fishball-2` only | `Fishball` |
| 5 | `Fishball`, `Fishball-3` | `Fishball-2` |
| 6 | `fishball` (hand-chosen, lower case) | `Fishball-2` |
| 7 | `Fishball`, `FISHBALL-2` (hand-chosen) | `Fishball-3` |
| 8 | `Fishball`, … `Fishball-9` | `Fishball-10` |
| 9 | `Fishball`, … `Fishball-10`, then `Fishball-5` is renamed away | `Fishball-5` |
| 10 | `Fishball-1` (hand-chosen) | `Fishball` (there is no "Fishball-1" in the series) |
| 11 | `Fishball`, `Fishball-1` | `Fishball-2` (`Fishball-1` is not a series name, so it is not skipped-to) |
| 12 | `Fishball`; the "Fishball" entry is deleted | `Fishball` (reused) |
| 13 | `Fishball`; that entry is **disabled** | `Fishball-2`? — TQ-7 (does a disabled entry's principal still "hold" its name?) |

### NAME-BVA-03 — Concurrent default assignment
**Req:** R-NAME-04, R-NAME-02 · **Level:** integration · **Flags:** P:S3

| # | Setup | Expected |
| --- | --- | --- |
| 1 | no principals; 2 unbound entries `pair({})` at once | names `Fishball` and `Fishball-2`, distinct |
| 2 | 10 at once | `Fishball`, `Fishball-2` … `Fishball-10`, all distinct |
| 3 | one `pair({})` races one `set_name("Fishball")` from an existing principal | no two principals end with the same folded name; the loser gets the next default or `name-taken` |

## Decision Tables

### NAME-DT-01 — `pair({name?})` name outcome
**Req:** R-NAME-06, R-NAME-04 · **Level:** integration · **Flags:** —

| Rule | `name` given | Valid after normalisation | Held by another | Paired | `name` result | `nameAssigned` | `nameRefused` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | no | — | — | yes | lowest free default | — (K: `true` or absent) | — |
| 2 | yes | yes | no | yes | given (normalised) | `true` | — |
| 3 | yes | yes | yes | yes | lowest free default | `false` | `name-taken` |
| 4 | yes | no | — | yes | lowest free default | `false` | `name-invalid` |
| 5 | yes | yes, equals a free **default** name ("Fishball-2") | no | yes | `Fishball-2` | `true` | — |

### NAME-DT-02 — `set_name` outcome
**Req:** R-NAME-02 · **Level:** integration · **Flags:** —

| Rule | Valid | Held by another (folded) | Equals own (folded) | Result | Stored |
| --- | --- | --- | --- | --- | --- |
| 1 | no | — | — | `name-invalid` | unchanged |
| 2 | yes | yes | — | `name-taken` | unchanged |
| 3 | yes | no | yes, same case | ok | unchanged; nothing else changes |
| 4 | yes | no | yes, other case | ok | new case stored |
| 5 | yes | no | no | ok | new name; old name freed |

### NAME-DT-03 — Core's reaction to the name outcome
**Req:** R-NAME-03 · **Level:** unit (core), e2e (page) · **Flags:** TQ-6

| Rule | Source | Outcome | Page shows | Core keeps working as |
| --- | --- | --- | --- | --- |
| 1 | `pair` | `nameAssigned: true` | nothing | the given name |
| 2 | `pair` | `nameAssigned: false`, `name-taken` | "used by another agent on that DSH", the default in use, ask to choose | the default |
| 3 | `pair` | `nameAssigned: false`, `name-invalid` | TQ-6 | the default |
| 4 | `set_name` | ok | nothing | new name |
| 5 | `set_name` | `name-taken` | as rule 2, with the old name | old name |
| 6 | reconnect, setting changed while offline | — | — | calls `set_name` with the setting |

## State Transitions

### NAME-ST-01 — A principal's name
**Req:** R-NAME-01, R-NAME-02, R-NAME-04, R-NAME-07 · **Level:** unit · **Flags:** —

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | (unpaired) | `pair` without usable name | Default(n) | lowest free |
| 2 | (unpaired) | `pair` with free name N | Chosen(N) | |
| 3 | Default(n) | another principal renames | Default(n) | never renamed by others |
| 4 | Default(n) | `set_name(N)` free | Chosen(N) | `Fishball-n` freed |
| 5 | Chosen(N) | `set_name(M)` taken | Chosen(N) | `name-taken` |
| 6 | Chosen(N) | `set_name(n-th default)` free | Chosen("Fishball-n") | counts as held for defaults |
| 7 | any | entry deleted | (gone) | name freed for reuse |
| 8 | Default(k) provisional (successor) | `retire` succeeds | Chosen(old name) | `Fishball-k` released in the same step (R-NAME-07) |
| 9 | Default(k) provisional | `retire` fails | Default(k) | old principal keeps its name |
