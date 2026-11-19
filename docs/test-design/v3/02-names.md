# 2. Names (NAME)

Requirements: R-NAME-01…07, R-ID-10 (ids are not names), R-HOST-09. Conventions:
[README](<README.md>).

## Use Cases

### NAME-UC-01 — A principal pairs with or without a name
**Req:** R-NAME-04, R-NAME-06, R-NAME-08, R-ID-03 · **Level:** integration · **Flags:** —

- **Actor:** a pairing client (Fishball DSH or external agent).
- **Preconditions:** C has principals named "Fishball" and "Ops".
- **Main flow:** the client calls `pair({name: "Bob"})` (free) → `{ok: true, paired: true, id, name: "Bob", nameAssigned: true}`.
- **Alternative flows:**
  - A1. `pair({})` → `{ok: true, paired: true, id, name: null}` with no `nameRefused`; the principal is shown as `ID: <id>` everywhere.
  - A2. A Fishball DSH pairs with its local default `identity.name` "Fishball" while no one holds it → name "Fishball".
- **Exception flows:**
  - E1. `pair({name: "fishball"})` (held by another, case-insensitively) → pairing succeeds, `name: null`, `nameAssigned: false`, `nameRefused: "name-taken"`.
  - E2. `pair({name: "   "})` → pairing succeeds, `name: null`, `nameRefused: "name-invalid"`.
- **Postconditions:** the token and id are bound whatever the name outcome; no "Fishball-2" or other default exists anywhere.

### NAME-UC-02 — The owner renames their Fishball
**Req:** R-NAME-02, R-NAME-03, R-NAME-05 · **Level:** integration (core + C), e2e (page and marks) · **Flags:** —

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
  - E2. The owner sets a 65-character name → `name-invalid`; the page shows it the same way as `name-taken`, with the reason; the name stays "Fishball" (TQ-6 decided A).
  - E3. The owner clears the name (`identity.name` empty) → core calls `set_name({name: null})`; the principal is shown as **ID:** <id> everywhere.
- **Postconditions:** the id is unchanged by any rename.

### NAME-UC-03 — An external agent renames itself
**Req:** R-NAME-02, R-NAME-01 · **Level:** integration · **Flags:** —

- **Actor:** external agent P(E2, `b`) named "Fishball-2".
- **Main flow:** `set_name({name: "Indexer"})` → ok; `set_name` with a pair-only AT → HTTP 403 `insufficient_scope`.
- **Alternative flows:** A1. `set_name({name: "Fishball-2"})` (own name) → ok, nothing else changes.
- **Exception flows:** E1. `set_name({name: "INDEXER"})` while another holds "Indexer" → `name-taken`.
- **Postconditions:** "Fishball-2" is now free for anyone to choose; nobody is renamed to it.

## Equivalence Partitioning

### NAME-EP-01 — Name normalisation and validity
**Req:** R-NAME-02 · **Level:** unit · **Flags:** —

| # | Class | Input | Stored / result |
| --- | --- | --- | --- |
| 1 | plain | `Bob` | `Bob` |
| 2 | surrounding spaces | `  Bob  ` | `Bob` |
| 3 | inner runs | `Bob   the\t\tfish` | `Bob the fish` |
| 4 | other Unicode whitespace (NBSP, ideographic space) | `Bob\u00A0\u00A0fish` | `Bob fish` (all Unicode whitespace, TQ-6 decided A) |
| 5 | NFD input | `Cafe\u0301` | `Café` (NFC) |
| 6 | empty | `` | `name-invalid` |
| 7 | whitespace only | `   ` | `name-invalid` |
| 8 | control char inside | `Bo\u0007b` | `name-invalid` |
| 9 | newline inside | `Bob\nFish` | `Bob Fish` (whitespace collapsed before the control check, TQ-6 decided A) |
| 9a | tab inside | `Bob\tFish` | `Bob Fish` |
| 9b | a non-whitespace control char (`\u0007`) inside | `Bo\u0007b` | `name-invalid` |
| 9c | name starting with `ID:` | `ID: agent-x` | accepted; shown as plain text (1.23 item 3) |
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
| 9 | `Bob`, held by a **disabled** entry | `bob` | `name-taken` (a disabled entry keeps its name, TQ-7 decided) |
| 10 | `Bob`, held by a **deleted** entry | `bob` | ok (deleting frees the name) |

### NAME-EP-03 — Who may call `set_name`
**Req:** R-NAME-02, R-ID-06 · **Level:** integration · **Flags:** —

| # | Caller | Expected |
| --- | --- | --- |
| 1 | full AT | processed |
| 2 | pair-only, unbound | HTTP 403 `insufficient_scope` (`not-paired`) |
| 3 | pair-only, bound to another id | HTTP 403 `insufficient_scope` (`id-mismatch`) |
| 5 | a nameless browser principal | `set_name` works; `ID: <id>` is replaced by the name everywhere |
| 4 | no / invalid AT | 401 |

### NAME-EP-04 — Principals without a name
**Req:** R-NAME-04, R-NAME-08, R-NAME-05, R-UI-10, R-NAME-02 · **Level:** integration (connector), e2e (embed-UI) · **Flags:** —

| # | Where the principal is shown | Expected for a nameless principal with id `agent-x` |
| --- | --- | --- |
| 1 | managed-session mark | **ID:** agent-x (prefix bold) |
| 2 | Hand over button / dropdown row | "Hand over to ID: agent-x" / `ID: agent-x` |
| 3 | token entry status in native settings | `ID: agent-x` (and the bound id column) |
| 4 | designated-Fishball setting | `ID: agent-x` |
| 5 | connector notes in sessions ("managed by …") | "managed by ID: agent-x" |
| 6 | `call.principal.name` given to contributors | `null` (the contributor gets no id, R-EXT-10) |
| 7 | two nameless principals | never clash with each other |
| 8 | a principal named "ID: agent-y" by hand | allowed; shown as **plain text** "ID: agent-y" (1.23 item 3) |
| 9 | the nameless principal `agent-y` in the same place | **ID:** agent-y, with the prefix in bold, so rows 8 and 9 are visibly different |

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

### NAME-BVA-02 — *Withdrawn* (no default names, Q-NAME-1 = B)
**Req:** R-NAME-04 · **Level:** unit · **Flags:** —

The lowest-free default series no longer exists. Nameless principals are covered by NAME-EP-04. The id stays reserved.

### NAME-BVA-03 — Concurrent pairing and naming
**Req:** R-NAME-02, R-NAME-06 · **Level:** integration · **Flags:** —

| # | Setup | Expected |
| --- | --- | --- |
| 1 | 2 unbound entries `pair({name: "Fishball"})` at once | one gets "Fishball"; the other pairs with `name: null`, `nameRefused: "name-taken"` |
| 2 | 10 at once, all `pair({})` | all pair, all `name: null`, no name assigned |
| 3 | one `pair({name: "Ops"})` races one `set_name("Ops")` from an existing principal | exactly one ends with "Ops"; the loser gets `name: null` (pair) or `name-taken` (set_name); either branch may win (both seen in S3 `b4dca86`), never a duplicate folded name |

S3 ran these races on the name registry as a single serial transaction over all entries; the
uniqueness oracle carries over unchanged to Q-NAME-1 = B (rows 1–2 now expect `name: null` instead
of a default, which changes the value written, not the race).

## Decision Tables

### NAME-DT-01 — `pair({name?})` name outcome
**Req:** R-NAME-06, R-NAME-04 · **Level:** integration · **Flags:** —

| Rule | `name` given | Valid after normalisation | Held by another | Paired | `name` result | `nameAssigned` | `nameRefused` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | no | — | — | yes | `null` | — (K: absent) | — |
| 2 | yes | yes | no | yes | given (normalised) | `true` | — |
| 3 | yes | yes | yes | yes | `null` | `false` | `name-taken` |
| 4 | yes | no | — | yes | `null` | `false` | `name-invalid` |
| 5 | yes | yes, "Fishball-2" (no longer special) | no | yes | `Fishball-2` | `true` | — |

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
**Req:** R-NAME-03 · **Level:** unit (core), e2e (page) · **Flags:** —

| Rule | Source | Outcome | Page shows | Core keeps working as |
| --- | --- | --- | --- | --- |
| 1 | `pair` | `nameAssigned: true` | nothing | the given name |
| 2 | `pair` | `nameAssigned: false`, `name-taken` | "used by another agent on that DSH", that it is shown as `ID: <id>` for now, ask to choose | no name (`ID: <id>`) |
| 3 | `pair` | `nameAssigned: false`, `name-invalid` | as rule 2, with the reason "invalid name" (TQ-6 decided A) | no name (`ID: <id>`) |
| 4 | `set_name` | ok | nothing | new name |
| 5 | `set_name` | `name-taken` | as rule 2, with the old name | old name |
| 6 | reconnect, setting changed while offline | — | — | calls `set_name` with the setting |

## State Transitions

### NAME-ST-01 — A principal's name
**Req:** R-NAME-01, R-NAME-02, R-NAME-04, R-NAME-07, R-NAME-08 · **Level:** unit · **Flags:** —

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | (unpaired) | `pair` without a usable name | Nameless | shown as `ID: <id>` |
| 2 | (unpaired) | `pair` with free name N | Named(N) | |
| 3 | Nameless | another principal renames | Nameless | never named by others |
| 4 | Nameless | `set_name(N)` free | Named(N) | `ID: <id>` replaced by N everywhere |
| 5 | Named(N) | `set_name(M)` taken | Named(N) | `name-taken` |
| 6 | Named(N) | `set_name(M)` free | Named(M) | N freed for anyone |
| 7 | any | entry deleted | (gone) | name freed |
| 8 | Nameless (successor) | `retire` succeeds | the old principal's state (Named(old) or Nameless) | moved in the same step (R-NAME-07) |
| 9 | Nameless (successor) | `retire` fails | Nameless | old principal keeps its name |
| 10 | Named(N) | `set_name({name: null})` | Nameless | shown as **ID:** <id>; N freed (1.23) |
| 11 | Nameless | `set_name({name: null})` | Nameless | ok; nothing changes |

