# Old-test behaviour inventory: fishball-core

Generated from the baseline run of `integrate/2026-11-22-fixes` (0377153f) on DSH 0.2.1-rc.5 and 0.2.2-rc.1, before the restructure.
One row per case id of an old suite: the number of distinct behaviours (test names, SDK folded) it registered,
their baseline results, and one sample title. **Where now** is filled in by the port: the new test file, or
`retired: <reason>` (withdrawn, todo placeholder, subject moved to another repository), or `bug: <report id>`.

## test/persona-bold-render

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| PBR-01 | 2 | pass 2 | R-B4 DSH 0.2.1-rc.2 markdown parser > PBR-01 **还在进行中：**dsh keeps its asterisks |  |
| PBR-02 | 2 | pass 2 | R-B4 DSH 0.2.1-rc.2 markdown parser > PBR-02 **还在进行中**：dsh is bold with no asterisks |  |
| PBR-03 | 18 | pass 18 | R-B4 DSH 0.2.1-rc.2 markdown parser > PBR-03 what follows the punctuation: accented ("é") |  |
| PBR-04 | 30 | pass 30 | R-B4 DSH 0.2.1-rc.2 markdown parser > PBR-04 Chinese mark — |  |
| PBR-05 | 6 | pass 6 | R-B4 DSH 0.2.1-rc.2 markdown parser > PBR-05 in context: list |  |
| PBR-06 | 2 | pass 2 | R-B4 DSH 0.2.1-rc.2 markdown parser > PBR-06 the examples the persona gives behave as it says |  |

## test/private-skills/sk-bva

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| SK-BVA-12-01-N | 1 | pass 1 | SK-BVA-12-01-N native grammar: "" (length 0) is invalid |  |
| SK-BVA-12-02-N | 1 | pass 1 | SK-BVA-12-02-N native grammar: "a" (length 1) is valid |  |
| SK-BVA-12-03-N | 1 | pass 1 | SK-BVA-12-03-N native grammar: "ab" (length 2) is valid |  |
| SK-BVA-12-04-N | 1 | pass 1 | SK-BVA-12-04-N native grammar: "a-b" (separator between groups) is valid |  |
| SK-BVA-12-05-N | 1 | pass 1 | SK-BVA-12-05-N native grammar: "-a" (leading separator) is invalid |  |
| SK-BVA-12-06-N | 1 | pass 1 | SK-BVA-12-06-N native grammar: "a-" (trailing separator) is invalid |  |
| SK-BVA-12-07-N | 1 | pass 1 | SK-BVA-12-07-N native grammar: "a--b" (empty group between separators) is invalid |  |
| SK-BVA-12-08-N | 1 | pass 1 | SK-BVA-12-08-N native grammar: "0" (lowest digit) is valid |  |
| SK-BVA-12-09-N | 1 | pass 1 | SK-BVA-12-09-N native grammar: "9" (highest digit) is valid |  |
| SK-BVA-12-10-N | 1 | pass 1 | SK-BVA-12-10-N native grammar: "/" (code point below 0) is invalid |  |
| SK-BVA-12-11-N | 1 | pass 1 | SK-BVA-12-11-N native grammar: ":" (code point above 9) is invalid |  |
| SK-BVA-12-12-N | 1 | pass 1 | SK-BVA-12-12-N native grammar: "z" (highest lowercase letter) is valid |  |
| SK-BVA-12-13-N | 1 | pass 1 | SK-BVA-12-13-N native grammar: "`" (code point below a) is invalid |  |
| SK-BVA-12-14-N | 1 | pass 1 | SK-BVA-12-14-N native grammar: "{" (code point above z) is invalid |  |
| SK-BVA-12-15-N | 1 | pass 1 | SK-BVA-12-15-N native grammar: "A" (lowest uppercase letter) is invalid |  |
| SK-BVA-12-16-N | 1 | pass 1 | SK-BVA-12-16-N native grammar: "Z" (highest uppercase letter) is invalid |  |

## test/private-skills/sk-ep

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| SK-EP-19-02-N | 1 | pass 1 | SK-EP-19-02-N a single-root native composition does not scan main homes passed to it |  |
| SK-EP-21-01-N | 1 | pass 1 | SK-EP-21-01-N an S6 directory bundle is native-loadable with exact name, description and body |  |
| SK-EP-21-06-N | 1 | pass 1 | SK-EP-21-06-N fixture validity: the STOCK reader follows an escaping file symlink, so SK-EP-21-06 is a real escape |  |
| SK-EP-21-07-N | 1 | pass 1 | SK-EP-21-07-N fixture validity: the STOCK reader follows an escaping directory symlink |  |
| SK-EP-21-08-N | 1 | pass 1 | SK-EP-21-08-N natively, a document without front matter or without a closing delimiter is ignored, not loaded |  |
| SK-EP-21-09-N | 1 | pass 1 | SK-EP-21-09-N natively, a missing name or description makes the document unloadable |  |
| SK-EP-21-10-N | 1 | pass 1 | SK-EP-21-10-N natively, discovery does NOT enforce directory/name equality, so the tool must (S6) |  |
| SK-EP-21-11-N | 1 | pass 1 | SK-EP-21-11-N natively, disable-model-invocation true hides the skill from the model; absent or false keeps it |  |
| SK-EP-21-12-N | 1 | pass 1 | SK-EP-21-12-N natively, each legacy camelCase invocation key makes the document unloadable |  |
| SK-EP-21-13-N | 1 | pass 1 | SK-EP-21-13-N natively, a whitespace-only description is accepted, so Q4 makes the tool stricter than native |  |
| SK-EP-21-14-N | 1 | pass 1 | SK-EP-21-14-N natively, an empty body is accepted, so Q3 makes the tool stricter than native |  |
| SK-EP-21-16-N | 1 | pass 1 | SK-EP-21-16-N the YAML-significant fixture round-trips natively when quoted, so the tool has a lossless target |  |

## test/private-skills/sk-st

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| SK-ST-09-T4-N | 1 | pass 1 | SK-ST-09-T4-N natively, a held candidate whose file was removed no longer loads |  |
| SK-ST-11-T2-N | 1 | pass 1 | SK-ST-11-T2-N natively, a held candidate rereads its file: a later load sees an updated body |  |

## test/private-skills/support

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| SK-BVA-12-01 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-01 name "" (length 0): create is refused with a validation error before any path use, and no skill is created or changed. The sa |  |
| SK-BVA-12-02 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-02 name "a" (length 1): create is accepted and loads natively under that name. The same holds for read, update and remove. — own |  |
| SK-BVA-12-03 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-03 name "ab" (length 2): create is accepted and loads natively under that name. The same holds for read, update and remove. — ow |  |
| SK-BVA-12-04 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-04 name "a-b" (separator between groups): create is accepted and loads natively under that name. The same holds for read, update |  |
| SK-BVA-12-05 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-05 name "-a" (leading separator): create is refused with a validation error before any path use, and no skill is created or chan |  |
| SK-BVA-12-06 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-06 name "a-" (trailing separator): create is refused with a validation error before any path use, and no skill is created or cha |  |
| SK-BVA-12-07 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-07 name "a--b" (empty group between separators): create is refused with a validation error before any path use, and no skill is  |  |
| SK-BVA-12-08 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-08 name "0" (lowest digit): create is accepted and loads natively under that name. The same holds for read, update and remove. — |  |
| SK-BVA-12-09 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-09 name "9" (highest digit): create is accepted and loads natively under that name. The same holds for read, update and remove.  |  |
| SK-BVA-12-10 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-10 name "/" (code point below 0): create is refused with a validation error before any path use, and no skill is created or chan |  |
| SK-BVA-12-11 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-11 name ":" (code point above 9): create is refused with a validation error before any path use, and no skill is created or chan |  |
| SK-BVA-12-12 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-12 name "z" (highest lowercase letter): create is accepted and loads natively under that name. The same holds for read, update a |  |
| SK-BVA-12-13 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-13 name "`" (code point below a): create is refused with a validation error before any path use, and no skill is created or chan |  |
| SK-BVA-12-14 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-14 name "{" (code point above z): create is refused with a validation error before any path use, and no skill is created or chan |  |
| SK-BVA-12-15 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-15 name "A" (lowest uppercase letter): create is refused with a validation error before any path use, and no skill is created or |  |
| SK-BVA-12-16 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-12-16 name "Z" (highest uppercase letter): create is refused with a validation error before any path use, and no skill is created o |  |
| SK-BVA-B-01 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-B-01 body "" (length 0): create and update refused with a validation error naming the body (Q3). — owner: SK |  |
| SK-BVA-B-02 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-B-02 body " \n\t" (whitespace only): refused (Q3). — owner: SK |  |
| SK-BVA-B-03 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-B-03 body "x" (one non-whitespace character): accepted; native load returns body "x". — owner: SK |  |
| SK-BVA-C-01 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-C-01 library with 0 skills (root absent, or present and empty): list succeeds with an empty complete catalog; this is not an error. |  |
| SK-BVA-C-02 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-C-02 library with 1 skill: list returns exactly that one; after removing it, list returns 0. — owner: SK |  |
| SK-BVA-C-03 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-C-03 library with 2 skills: removing one leaves exactly the other, byte-identical. — owner: SK |  |
| SK-BVA-D-01 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-D-01 description "" (length 0): create and update refused with a validation error naming description; the prior version is intact.  |  |
| SK-BVA-D-02 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-D-02 description " " (length 1, whitespace only): refused (Q4, trim then nonempty), although native would accept it. — owner: SK |  |
| SK-BVA-D-03 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-D-03 description "a" (length 1, after trimming): accepted; native load returns a description whose trimmed value is "a". — owner: S |  |
| SK-BVA-D-04 | 1 | fail 1 | T-SK BVA (SK-owned) > SK-BVA-D-04 description " a " (surrounding whitespace, trimmed length 1): accepted. Whether the stored text keeps the spaces is not specif |  |
| SK-DT-01-R1 | 1 | fail 1 | T-SK Decision Tables > SK-DT-01-R1 manager + dedicated tool: allowed on its own root without approval. — owner: SK |  |
| SK-DT-01-R2 | 1 | fail 1 | T-SK Decision Tables > SK-DT-01-R2 manager + ordinary write/edit/shell on the skills root: denied by read-only, no approval offered. — owner: SK |  |
| SK-DT-01-R3 | 1 | fail 1 | T-SK Decision Tables > SK-DT-01-R3 worker (native subagent or managed session) + dedicated tool: not available, or refused before any read or write. — owner: SK |  |
| SK-DT-01-R4 | 1 | fail 1 | T-SK Decision Tables > SK-DT-01-R4 worker + ordinary route: read-only and its own sandbox apply; the private library is not in its skill catalog. — owner: SK |  |
| SK-DT-01-R5 | 1 | fail 1 | T-SK Decision Tables > SK-DT-01-R5 a dispatch nested inside a worker turn that names the dedicated operation: refused; identity comes from the live receiving ag |  |
| SK-DT-02-R1 | 1 | fail 1 | T-SK Decision Tables > SK-DT-02-R1 create + absent + valid: committed; one new native-loadable skill. — owner: SK |  |
| SK-DT-02-R10 | 1 | fail 1 | T-SK Decision Tables > SK-DT-02-R10 read + absent: not-found; no fallback to another root. — owner: SK |  |
| SK-DT-02-R11 | 1 | fail 1 | T-SK Decision Tables > SK-DT-02-R11 read, update or remove + invalid name: validation error before any filesystem access. — owner: SK |  |
| SK-DT-02-R12 | 1 | fail 1 | T-SK Decision Tables > SK-DT-02-R12 reload + any library: a fresh complete catalog of the valid private skills; succeeds with an empty library. — owner: SK |  |
| SK-DT-02-R2 | 1 | fail 1 | T-SK Decision Tables > SK-DT-02-R2 create + present + valid: conflict; the existing bytes are unchanged. — owner: SK |  |
| SK-DT-02-R3 | 1 | fail 1 | T-SK Decision Tables > SK-DT-02-R3 create + any state + invalid name or document: validation error; nothing written. — owner: SK |  |
| SK-DT-02-R4 | 1 | fail 1 | T-SK Decision Tables > SK-DT-02-R4 update + present + valid: committed; the complete new version loads. — owner: SK |  |
| SK-DT-02-R5 | 1 | fail 1 | T-SK Decision Tables > SK-DT-02-R5 update + absent + valid: not-found (Q5); nothing created. — owner: SK |  |
| SK-DT-02-R6 | 1 | fail 1 | T-SK Decision Tables > SK-DT-02-R6 update + present + invalid document: validation error; the old version is byte-identical. — owner: SK |  |
| SK-DT-02-R7 | 1 | fail 1 | T-SK Decision Tables > SK-DT-02-R7 remove + present: committed; it no longer resolves, other skills and the root remain. — owner: SK |  |
| SK-DT-02-R8 | 1 | fail 1 | T-SK Decision Tables > SK-DT-02-R8 remove + absent: not-found (Q5); nothing changed. — owner: SK |  |
| SK-DT-02-R9 | 1 | fail 1 | T-SK Decision Tables > SK-DT-02-R9 read + present: the current complete document; no write. — owner: SK |  |
| SK-DT-03-R1 | 1 | fail 1 | T-SK Decision Tables > SK-DT-03-R1 no commit (validation, I/O, permission or cancellation before commit): result "not committed" naming the operation; the prior |  |
| SK-DT-03-R2 | 1 | fail 1 | T-SK Decision Tables > SK-DT-03-R2 commit + refresh ok + delivered: success; the next list/load shows it. — owner: SK |  |
| SK-DT-03-R3 | 1 | fail 1 | T-SK Decision Tables > SK-DT-03-R3 commit + refresh failed + delivered: distinct committed-not-refreshed; never "write failed" and never plain success. — owner: |  |
| SK-DT-03-R4 | 1 | fail 1 | T-SK Decision Tables > SK-DT-03-R4 commit + any refresh + cancelled delivery: the committed state is kept (no silent rollback), and a later list/read/reload rep |  |
| SK-DT-03-R5 | 1 | fail 1 | T-SK Decision Tables > SK-DT-03-R5 commit + refresh failed, then an explicit reload: the reload succeeds and the catalog shows the committed state; a retried cr |  |
| SK-DT-04-R1 | 1 | fail 1 | T-SK Decision Tables > SK-DT-04-R1 SKILL.md is a symlink escaping the root: list/read/load refuse before reading the target; update/remove never write through i |  |
| SK-DT-04-R2 | 1 | fail 1 | T-SK Decision Tables > SK-DT-04-R2 the <name> directory is a symlink escaping the root: same as R1; remove never deletes the target's contents. — owner: SK |  |
| SK-DT-04-R3 | 1 | fail 1 | T-SK Decision Tables > SK-DT-04-R3 a symlink that stays inside the root: no oracle beyond "nothing outside is read or written". — owner: SK |  |
| SK-DT-04-R4 | 1 | fail 1 | T-SK Decision Tables > SK-DT-04-R4 <name>/ holds extra files besides SKILL.md and is removed: nothing outside <root>/<name>/ is touched (Q2); what happens to th |  |
| SK-DT-04-R5 | 1 | fail 1 | T-SK Decision Tables > SK-DT-04-R5 a hand-corrupted, name-mismatched, non-regular or hardlinked SKILL.md: the manager and tool stay usable, other skills still l |  |
| SK-DT-09-R1 | 1 | fail 1 | T-SK Decision Tables > SK-DT-09-R1 Fishball list/read/load of its own skill in read-only mode: available through the confined tool and native loader, with no wr |  |
| SK-DT-09-R2 | 1 | fail 1 | T-SK Decision Tables > SK-DT-09-R2 Fishball create/update of a valid child skill: complete confined publication and catalog refresh, no user approval. — owner:  |  |
| SK-DT-09-R3 | 1 | fail 1 | T-SK Decision Tables > SK-DT-09-R3 Fishball removes its own skill: gone from future loads; prior conversation text is untouched. — owner: SK |  |
| SK-DT-09-R4 | 1 | fail 1 | T-SK Decision Tables > SK-DT-09-R4 Ordinary agent write, or a target outside the skills root: read-only or confinement refusal, nothing outside mutated, no disc |  |
| SK-DT-09-R5 | 1 | todo 1 | T-SK Decision Tables > SK-DT-09-R5 A worker needs Fishball's experience: the message holds the relevant content, never a direct private-library load. — owner: S |  |
| SK-DT-09-R6 | 1 | fail 1 | T-SK Decision Tables > SK-DT-09-R6 A write fails before commit: clear error, no partial file, the old update target intact. — owner: SK |  |
| SK-DT-09-R7 | 1 | fail 1 | T-SK Decision Tables > SK-DT-09-R7 Commit succeeds and reload fails: explicit persisted-not-refreshed outcome, complete file intact. — owner: SK |  |
| SK-DT-09-R8 | 1 | fail 1 | T-SK Decision Tables > SK-DT-09-R8 User rejection, sensitive data, duplicate, contradiction or stale note: no prescribed classification or result; any write act |  |
| SK-EP-19-01 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-19-01 Partition: Fishball's own private skill. Expect: Fishball's list, read and load return it while ordinary tools stay read-only.  |  |
| SK-EP-19-02 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-19-02 Partition: main-home sources (~/.dsh/skills, ~/.agents/skills, main project .dsh/skills and .agents/skills, main customSkillDir |  |
| SK-EP-19-03 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-19-03 Partition: a name collision, where main ~/.dsh/skills has the same name as a private skill. Expect: Fishball loads the private  |  |
| SK-EP-19-04 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-19-04 Partition: DSH bundled/preset skills and child-profile plugin skills. Expect: no presence or absence assertion (Q6). If one col |  |
| SK-EP-19-05 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-19-05 Partition: absent name. Expect: read/load return a clear not-found; no fallback to main home or any other root. — owner: SK |  |
| SK-EP-19-06 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-19-06 Partition: worker caller, native subagent or managed worker session. Expect: the private skill is absent from its catalog and i |  |
| SK-EP-19-07 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-19-07 Partition: worker with its own same-named skill. Expect: the worker's own skill is untouched; Fishball's handoff carries Fishba |  |
| SK-EP-20-01 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-20-01 Partition: list by the manager. Expect: a successful catalog of exactly the valid private skills, with no write, approval or si |  |
| SK-EP-20-02 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-20-02 Partition: read by the manager. Expect: the selected skill's complete current document or body; nothing is written. — owner: SK |  |
| SK-EP-20-03 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-20-03 Partition: create of a valid new skill. Expect: one complete native document is published with no approval, and native load fin |  |
| SK-EP-20-04 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-20-04 Partition: update of an existing skill. Expect: a complete new version is published, and the next load returns it. — owner: SK |  |
| SK-EP-20-05 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-20-05 Partition: remove of an existing skill. Expect: future list and load do not resolve it; the root and other skills are unchanged |  |
| SK-EP-20-06 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-20-06 Partition: reload. Expect: invalidation, then a fresh complete manager-scoped catalog. The result reports success only if the c |  |
| SK-EP-20-07 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-20-07 Partition: ordinary write/edit/delete/move/shell aimed at the skills root. Expect: read-only refusal, no approval offered and n |  |
| SK-EP-20-08 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-20-08 Partition: a non-manager caller (worker, side agent, nested dispatch from a worker) invoking any of the six operations. Expect: |  |
| SK-EP-20-09 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-20-09 Partition: an attempt to widen permissions (/permission workspace-write, danger-full-access, a saved setting, a denied-retry es |  |
| SK-EP-20-10 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-20-10 Partition: an input carrying a root, path, command or extra file. Expect: refused or unsupported. The tool takes a name and a d |  |
| SK-EP-21-01 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-01 Partition: valid bundle (kebab name, nonempty trimmed description, nonempty body, directory equals name). Expect: accepted, and |  |
| SK-EP-21-02 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-02 Partition: absolute path as name (e.g. /Users/x/.dsh/skills/a). Expect: refused before any path use; no outside byte read or wr |  |
| SK-EP-21-03 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-03 Partition: traversal (../a, a/../../b, ..). Expect: refused; nothing outside the root is touched. — owner: SK |  |
| SK-EP-21-04 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-04 Partition: sibling prefix (skills-evil/a, ../skills2/a). Expect: refused; a sibling directory named skills* is unchanged. — own |  |
| SK-EP-21-05 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-05 Partition: separators or aliases (a/b, a\b, ., a%2Fb, a/, a NUL byte). Expect: refused by the grammar before any filesystem cal |  |
| SK-EP-21-06 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-06 Partition: escaping symlink, <root>/<name>/SKILL.md linked outside (bypass fixture). Expect: list, read and load refuse it BEFO |  |
| SK-EP-21-07 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-07 Partition: escaping directory symlink, <root>/<name> linked outside (bypass fixture). Expect: same as SK-EP-21-06; remove does  |  |
| SK-EP-21-08 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-08 Partition: missing front matter or no closing ---. Expect: create/update refused with a validation error; the prior version is  |  |
| SK-EP-21-09 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-09 Partition: missing or non-string name/description. Expect: refused with a validation error. — owner: SK |  |
| SK-EP-21-10 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-10 Partition: front-matter name differs from the target name. Expect: refused; no mismatched pair is published. — owner: SK |  |
| SK-EP-21-11 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-11 Partition: disable-model-invocation: true. Expect: refused (S6 keeps skills model-loadable). Absent or false is accepted. — own |  |
| SK-EP-21-12 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-12 Partition: legacy camelCase invocation keys (disableModelInvocation, modelInvocable, userInvocable). Expect: refused (S6 uses D |  |
| SK-EP-21-13 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-13 Partition: whitespace-only description. Expect: refused with a validation error naming description (Q4: trim, then require none |  |
| SK-EP-21-14 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-14 Partition: empty or whitespace-only body. Expect: refused with a validation error naming the body (Q3). — owner: SK |  |
| SK-EP-21-15 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-15 Partition: input that is not valid UTF-8 or YAML (e.g. an unparseable front matter). Expect: refused; the prior version is inta |  |
| SK-EP-21-16 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-16 Partition: YAML-significant text in description or body (colon, #, a line that looks like a key, a repeated --- in the body). E |  |
| SK-EP-21-17 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-21-17 Partition: bypass-only document shapes (hand-corrupted, name-mismatched or non-regular SKILL.md, stray files, hardlink). Expect |  |
| SK-EP-22-01 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-22-01 Partition: mutation committed and refresh succeeded. Expect: a success naming the operation and skill; the next list/load refle |  |
| SK-EP-22-02 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-22-02 Partition: failure before commit (I/O or permission error). Expect: an error naming the operation and "not committed"; the prio |  |
| SK-EP-22-03 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-22-03 Partition: interrupted or cancelled. Expect: either the complete prior state or the complete new state, reported truthfully, ne |  |
| SK-EP-22-04 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-22-04 Partition: committed but refresh failed. Expect: a distinct committed-not-refreshed outcome, not "write failed" and not plain s |  |
| SK-EP-22-05 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-22-05 Partition: semantic situations (user rejection, secret or PII, duplicate, stale or contradictory note). Expect: Fishball decide |  |
| SK-EP-22-06 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-22-06 Partition: not-found for update/remove (Q5). Expect: a clear not-found; nothing created or changed. — owner: SK |  |
| SK-EP-22-07 | 1 | fail 1 | T-SK EP (SK-owned) > SK-EP-22-07 Partition: create conflict on an existing name. Expect: an explicit conflict; the existing bytes are unchanged. — owner: SK |  |
| SK-ST-09-T1 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-09-T1 Absent → create: committed and the catalog refreshed; the next list and load show the new body; no approval was  |  |
| SK-ST-09-T2 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-09-T2 Visible → child restart or manager resume: the same skill lists and loads unchanged; the worker and main catalog |  |
| SK-ST-09-T3 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-09-T3 Visible → update: the next load returns the new body; the old body is not reported as current; text already deli |  |
| SK-ST-09-T4 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-09-T4 Visible → remove: the next list and load do not resolve it; nothing claims removed text was erased from earlier  |  |
| SK-ST-09-T5 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-09-T5 Absent (after remove) → create of the same name: allowed, and loads the newly created body, not the removed one. |  |
| SK-ST-09-X1 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-09-X1 Invalid transition: update or remove while Absent gives not-found and the state stays Absent (Q5); create while  |  |
| SK-ST-10-T1 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-10-T1 Valid(old) → update with a pre-commit fault: back to Valid(old), byte-identical and loadable; the result says no |  |
| SK-ST-10-T2 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-10-T2 Absent → create with a pre-commit fault: stays Absent; no partial or loadable skill and no leftover that blocks  |  |
| SK-ST-10-T3 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-10-T3 Valid(old) → update commits → refresh fails: RefreshFailed with a distinct outcome; the file is complete and new |  |
| SK-ST-10-T4 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-10-T4 RefreshFailed → explicit reload succeeds: Valid(new); list and load show the new version. — owner: SK |  |
| SK-ST-10-T5 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-10-T5 RefreshFailed → reload fails again: still RefreshFailed, reported truthfully; the file is unchanged; a later suc |  |
| SK-ST-10-T6 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-10-T6 Attempt → cancelled: the observed state is exactly Valid(old) or Valid(new) as a whole document, and the result  |  |
| SK-ST-10-T7 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-10-T7 Two concurrent attempts on one name: both settle; the final state equals one caller's complete document; each re |  |
| SK-ST-10-X1 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-10-X1 Forbidden states: a truncated or mixed published document, an outside-root mutation, an ambiguous commit reporte |  |
| SK-ST-11-T1 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-11-T1 After a successful mutation, the next list and load and the next model step's catalog reflect it; no restart or  |  |
| SK-ST-11-T2 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-11-T2 A body loaded before an update stays as-is in conversation; only future loads see the new body. — owner: SK |  |
| SK-ST-11-T3 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-11-T3 The host watcher is off: a bypass edit is not promised to appear until an explicit reload (Q1, "it is what it is |  |
| SK-ST-11-T4 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-11-T4 An in-flight model request keeps its inputs; invalidation schedules no wake or turn. — owner: SK |  |
| SK-ST-11-T5 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-11-T5 No result claims a native slash-menu refresh; the menu may keep its cached list (decision 3). — owner: SK |  |
| SK-ST-11-T6 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-11-T6 An incomplete discovery (rc.5 none published; rc.1 partial with a warning) is never reported as a successful rel |  |
| SK-ST-12-T1 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-12-T1 Manager setup: the tool and private provider register for the singleton Fishball manager scope only. — owner: SK |  |
| SK-ST-12-T2 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-12-T2 Manager disposal: the registration is released; a stale-generation call cannot list or mutate. — owner: SK |  |
| SK-ST-12-T3 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-12-T3 Resume or a new generation: registration happens again exactly once, with no duplicate provider or tool, and ear |  |
| SK-ST-12-T4 | 1 | fail 1 | T-SK State Transitions (SK-owned) > SK-ST-12-T4 Throughout, no worker composition, standing preset or main DSH gains the provider or the tool. — owner: SK |  |
| SK-UC-25-A1 | 1 | fail 1 | T-SK Use Cases > SK-UC-25-A1 A skill exists only in main ~/.dsh/skills. Fishball's list and load do not return it, and the tool reports not-found. Nothing is co |  |
| SK-UC-25-A2 | 1 | fail 1 | T-SK Use Cases > SK-UC-25-A2 A worker has its own same-named skill. Fishball's handoff message carries Fishball's private body, the worker's own skill file and  |  |
| SK-UC-25-E1 | 1 | fail 1 | T-SK Use Cases > SK-UC-25-E1 Fishball loads a name it does not have. The tool returns the real not-found outcome, Fishball keeps working and the worker gains no |  |
| SK-UC-25-E2 | 1 | todo 1 | T-SK Use Cases > SK-UC-25-E2 The worker send is refused (dormant brief). The real send error reaches Fishball, the message is not resent automatically and the s |  |
| SK-UC-25-M | 1 | todo 1 | T-SK Use Cases > SK-UC-25-M Fishball, in read-only mode, lists and loads its own child skill through the dedicated tool and native loader, then messages a manag |  |
| SK-UC-26-A1 | 1 | fail 1 | T-SK Use Cases > SK-UC-26-A1 Samuel asks Fishball to remember a rule and Fishball creates the skill: same no-approval path and same result as SK-UC-26-M. — owne |  |
| SK-UC-26-A2 | 1 | fail 1 | T-SK Use Cases > SK-UC-26-A2 Fishball judges a detail one-off and makes no create call (judgment: no oracle on the choice). The library bytes are unchanged and  |  |
| SK-UC-26-E1 | 1 | fail 1 | T-SK Use Cases > SK-UC-26-E1 Fishball sends a create whose content fails validation (whitespace-only description or empty body). The tool returns a clear valida |  |
| SK-UC-26-E2 | 1 | fail 1 | T-SK Use Cases > SK-UC-26-E2 A create name holds a traversal or absolute path. The tool refuses it whatever Fishball intended, and no byte outside the owned ski |  |
| SK-UC-26-M | 1 | fail 1 | T-SK Use Cases > SK-UC-26-M Fishball decides on its own to create a valid skill. No approval or review card appears. Exactly one complete native document lands  |  |
| SK-UC-27-A1 | 1 | fail 1 | T-SK Use Cases > SK-UC-27-A1 Fishball "renames" by creating the new name, then removing the old one. Each call reports its own outcome, no atomic rename is clai |  |
| SK-UC-27-A2 | 1 | fail 1 | T-SK Use Cases > SK-UC-27-A2 Fishball creates a name that already exists. The result is an explicit conflict, the existing document is byte-identical, and no si |  |
| SK-UC-27-A3 | 1 | fail 1 | T-SK Use Cases > SK-UC-27-A3 Fishball updates or removes a name that does not exist. The result is a clear not-found, the library is unchanged, and nothing is c |  |
| SK-UC-27-E1 | 1 | fail 1 | T-SK Use Cases > SK-UC-27-E1 Fishball removes an existing skill. Later loads and lists do not resolve it, and already-delivered text stays where it is. — owner: |  |
| SK-UC-27-E2 | 1 | fail 1 | T-SK Use Cases > SK-UC-27-E2 An update cannot complete. The tool reports the failure and its known outcome, leaves the old complete version loadable and does no |  |
| SK-UC-27-M | 1 | fail 1 | T-SK Use Cases > SK-UC-27-M Fishball updates an existing skill with a complete new version. The next load returns the new body, while text already in Fishball's |  |
| SK-UC-28-A1 | 1 | fail 1 | T-SK Use Cases > SK-UC-28-A1 A create hits a fault before commit. No loadable partial skill exists, native discovery finds no new skill, and a later create of t |  |
| SK-UC-28-A2 | 1 | fail 1 | T-SK Use Cases > SK-UC-28-A2 A write commits but the catalog refresh fails. The tool returns a distinct committed-but-not-refreshed outcome, an explicit reload  |  |
| SK-UC-28-A3 | 1 | fail 1 | T-SK Use Cases > SK-UC-28-A3 A call is cancelled. Before commit, the prior state remains and the result says not committed. After commit, the committed state re |  |
| SK-UC-28-E1 | 1 | fail 1 | T-SK Use Cases > SK-UC-28-E1 Fishball tries an ordinary write, edit or shell command on the skills folder. It is still denied by read-only, with no approval off |  |
| SK-UC-28-E2 | 1 | fail 1 | T-SK Use Cases > SK-UC-28-E2 Two concurrent Fishball creates or updates target one name. Both settle; the final SKILL.md equals exactly one caller's complete do |  |
| SK-UC-28-M | 1 | fail 1 | T-SK Use Cases > SK-UC-28-M An update hits a filesystem fault before commit. The clear error names the update and says nothing was committed. The previous compl |  |
| SK-UC-LIFE-A1 | 1 | fail 1 | T-SK Use Cases > SK-UC-LIFE-A1 On a fresh child with no skills folder yet, list returns an empty successful catalog and the first create makes the owned root an |  |
| SK-UC-LIFE-M | 1 | fail 1 | T-SK Use Cases > SK-UC-LIFE-M After the child restarts or the manager resumes, the dedicated tool is available again to the singleton manager only, and earlier  |  |
| SK-UC-UI-M | 1 | fail 1 | T-SK Use Cases > SK-UC-UI-M Samuel never has to view or approve a skill. No viewer, review or approval card appears for any of the six operations, and no tool r |  |

## test/v3/contract/k3a-core-seams

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| F-LINK | 7 | pass 7 | F-LINK done 1 the secret goes only to the target's token endpoint; MCP requests carry only the access token |  |
| K3a-ARCH | 12 | pass 12 | K3a-ARCH row 1 core contracts (every .d.ts and constants.js) import or reference no DSH-side package, by name or by relative path |  |
| K3a-CONNECT | 19 | todo 8, pass 11 | K3a-CONNECT agent_id Connect passes identity.id as agent_id — TODO F-LINK-SAVE (core reads DSH_AGENT_TOKEN and dsh-instance-child.targetUrl, saves fishball-core |  |
| K3a-DECL | 13 | pass 13 | K3a-DECL ConnectConfigurationCode the declared ConnectConfigurationCode union equals the constants object's values |  |
| K3a-HOST | 13 | pass 9, fail 1, todo 3 | K3a-HOST grant scope CONNECT.grantRecordScope is fishball-core and a valid SDK key segment |  |
| K3a-LINK | 5 | fail 5 | K3a-LINK code LINK.code equals TARGET_CODE |  |
| K3a-MCP | 29 | fail 23, pass 6 | K3a-MCP events events {name, uri, mimeType} equal RESOURCE.events |  |
| K3a-META | 8 | fail 8 | K3a-META auth methods AS metadata: token_endpoint_auth_methods_supported holds every MCP.oauth.clientAuth value |  |
| K3a-MULTI-BVA-01 | 1 | pass 1 | K3a-MULTI-BVA-01 duplicate the duplicate suffix is " (" + n + ")" from n = 2: open and close differ, firstSuffix is an integer ≥ 2 |  |
| K3a-MULTI-BVA-02 | 1 | pass 1 | K3a-MULTI-BVA-02 ids parentId and generated ids at the alphabet's ends fit [a-z][a-z0-9-]*, hold no "_", and have length prefix + 16 |  |
| K3a-MULTI-BVA-03 | 3 | pass 3 | K3a-MULTI-BVA-03 allowed TOOL allowed accepts 1 and 64 characters of [A-Za-z0-9_-], refuses 65 and spaces, dots, Unicode, empty |  |
| K3a-MULTI-DT-01 | 4 | pass 4 | K3a-MULTI-DT-01 SDK parent grant the SDK parses the parent's grant record keys with scope fishball-core |  |
| K3a-MULTI-DT-02 | 2 | pass 2 | K3a-MULTI-DT-02 isolation every (target, epoch) has its own reference and records; token and grant records differ |  |
| K3a-MULTI-DT-03 | 1 | pass 1 | K3a-MULTI-DT-03 adversarial remote ids holding ", \, ], , or a forged tuple tail never make two (kind, target, epoch, id) tuples share a key or handle |  |
| K3a-MULTI-DT-04 | 1 | pass 1 | K3a-MULTI-DT-04 equal names two targets with the same name, one target before and after an endpoint change, and remote vs local origin all give different final  |  |
| K3a-MULTI-EP-01 | 3 | pass 3 | K3a-MULTI-EP-01 formats id and epoch prefixes differ; the alphabet is 32 distinct lowercase segment characters |  |
| K3a-MULTI-EP-02 | 2 | pass 2 | K3a-MULTI-EP-02 records the per-target records are fishball-core/token-<id>-<epoch> and fishball-core/connect-<id>-<epoch> |  |
| K3a-MULTI-EP-03 | 2 | pass 2 | K3a-MULTI-EP-03 approval A and B both offering ap-1 give two approval handles; a new epoch of A gives a third |  |
| K3a-MULTI-EP-04 | 10 | pass 10 | K3a-MULTI-EP-04 BVA cut on a dash "abcdefghijklmno-pq" → readable abcdefghijklmno; the final name is allowed and ≤ 64 |  |
| K3a-MULTI-EP-05 | 7 | pass 4, fail 3 | K3a-MULTI-EP-05 action routes every POST action route is under /api/fishball/targets/, one segment, unique, and the method is POST |  |
| K3a-MULTI-EP-06 | 2 | pass 2 | K3a-MULTI-EP-06 toolSource (adversarial) an adversarial name stays one JSON token: the formatter output holds JSON.stringify(name) once, and it parses back to t |  |
| K3a-MULTI-EP-07 | 2 | pass 2 | K3a-MULTI-EP-07 hosted signal link.d.ts states the URL-independent hosted signal (settings lists targetSetting.row), the renewed parent epoch, the parent grant  |  |
| K3a-MULTI-EP-08 | 7 | pass 7 | K3a-MULTI-EP-08 README Hosted signal the core contracts README has one "Hosted signal" row stating its frozen contract |  |
| K3a-MULTI-EP-09 | 1 | pass 1 | K3a-MULTI-EP-09 storage names every frozen store domain and table name matches the SDK's dsh-storage UNIT_NAME_RE (dsh-storage-domain refuses others at open) |  |
| K3a-MULTI-SEC-BVA | 12 | pass 12 | K3a-MULTI-SEC-BVA canonical endpoint boundary an identical canonical endpoint retains its epoch, but every actual endpoint change retires bindings, even on the  |  |
| K3a-MULTI-SEC-DT | 9 | pass 9 | K3a-MULTI-SEC-DT attention.signal attention.signal keeps its three required parameters and takes the public TargetSelector as its final parameter |  |
| K3a-MULTI-SEC-EP | 5 | pass 5 | K3a-MULTI-SEC-EP binding declaration TargetCredentialBinding is publicly exported with all four required readonly binding fields |  |
| K3a-MULTI-ST-01 | 2 | pass 2 | K3a-MULTI-ST-01 literal (2) a literal Office-DSH (2) held with Office-DSH held → the next Office-DSH is Office-DSH (3) |  |
| K3a-NAMES | 5 | pass 5 | K3a-NAMES events the event resource is agent-events at dsh-agent://events |  |
| K3a-TARGET | 5 | fail 5 | K3a-TARGET row 1 EP blank (no target) the child row configured {targetUrl: ""} is listed by the real settings.describe() under ns dsh-instance-child, and core's |  |
| K3a-UI | 24 | todo 4, pass 20 | K3a-UI A1 fishball-ui without core logs fishball-core-missing once and changes nothing — TODO test/v3/fishball-ui/package: UI-UC-02 (fishball-core-missing once, |  |

## test/v3/contract/own-schema

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| OWN-ARCH | 3 | pass 2, todo 1 | OWN-ARCH absence F-OWN-SCHEMA removes generated schema, generator, export and packed vendor entry |  |
| OWN-LINK | 1 | todo 1 | OWN-LINK connector drift the real-connector comparisons (link, ids, tools, events, HTTP, approval, metadata) live in dsh-connector — TODO moved with the connect |  |

## test/v3/fishball-core/asks

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| ASK-BVA-01 | 7 | pass 7 | ASK-BVA-01 absent the user's text absent → reason is the fixed line |  |
| ASK-BVA-02 | 1 | pass 1 | ASK-BVA-02 filed at once a card answered right after filing commits (no minimum wait) |  |
| ASK-BVA-03 | 4 | pass 4 | ASK-BVA-03 reason empty a permission whose reason is empty → card.reason null |  |
| ASK-DT-01 | 4 | pass 4 | ASK-DT-01 allow with a reason allow with a reason → {decision: allow, risk: low, reason: the text} |  |
| ASK-DT-02 | 7 | pass 7 | ASK-DT-02 already-settled the connector answers already-settled → the user gets {"ok":false,"code":"already-settled"}; the card is closed |  |
| ASK-DT-03 | 9 | pass 9 | ASK-DT-03 answer on answered card an answer on an answered card → already-settled; nothing changes, nothing is sent |  |
| ASK-DT-04 | 15 | pass 15 | ASK-DT-04 filed answered, ok, not listed a filed answered card beside an unfiled ask of its session, approvals_list answers ok, not listed → the unfiled one is  |  |
| ASK-EP-01 | 9 | pass 9 | ASK-EP-01 a seen ask ask_user with a polled ask's offer id → {ok:true, card}, the card list() shows |  |
| ASK-EP-02 | 3 | pass 3 | ASK-EP-02 row 1 every field comes from the event: ids and question from the descriptor, sessionId from sourceSessionId, askedAt from the descriptor's at |  |
| ASK-EP-03 | 7 | pass 7 | ASK-EP-03 a choice in another case (Allow) an answer that is a choice in another case (Allow) → invalid-arguments; nothing sent, the card stays open |  |
| ASK-EP-04 | 4 | pass 4 | ASK-EP-04 row 1 a settlement naming the card's approvalId → closed |  |
| ASK-EP-05 | 3 | pass 3 | ASK-EP-05 no asks no ask at all → {deleted: 0, kept: 0} and no approvals_list call |  |
| ASK-EP-06 | 4 | pass 4 | ASK-EP-06 card-able (ask) ask_user with a polled ask event's offer id → {ok:true, card}: sessionId, sessionTitle, question = prompt, choices exactly allow/rejec |  |
| ASK-EP-07 | 8 | pass 7, skip 1 | ASK-EP-07 allow on a truncated card answering allow on a card whose arguments are truncated → invalid-arguments, nothing sent, the card stays open; reject still |  |
| ASK-ST-01 | 8 | pass 8 | ASK-ST-01 answered → answered (a replay of the ask) an answered card stays answered on a replay of the ask |  |
| ASK-ST-02 | 10 | pass 10 | ASK-ST-02 answered, higher a new offer for an already answered card changes nothing: the answered card stays, nothing is sent; the new id is not filed |  |
| ASK-ST-03 | 9 | pass 9 | ASK-ST-03 ask_user(r1) after r2 ask_user on r1 after r2 replaced it → expired, and r2 is not filed by it |  |
| ASK-UC-01 | 4 | pass 4 | ASK-UC-01 E3 settled before it was filed (a retirement) → ask_user answers expired and no card is filed |  |
| ASK-UC-02 | 8 | pass 8 | ASK-UC-02 E1 invalid POST answer: a choice that is not offered → 400 invalid-arguments; nothing is sent and the card stays open |  |
| ASK-UC-03 | 2 | pass 2 | ASK-UC-03 A1 after a restart a settlement naming a filed open card still closes it |  |
| ASK-UC-04 | 3 | pass 2, fail 1 | ASK-UC-04 main 1 client.asks.js exists and ships in fishball-ui's package.json files |  |
| ASK-UC-05 | 2 | pass 2 | ASK-UC-05 E1 a throwing listener affects no other listener and no operation |  |
| ASK-UC-06 | 1 | pass 1 | ASK-UC-06 main close() stops the store: an ask taken afterwards is unknown |  |
| ASK-UC-07 | 6 | pass 6 | ASK-UC-07 another restart after another restart a deleted ask is unknown: ask_user answers unknown-offer |  |
| ASK-UC-08 | 10 | pass 10 | ASK-UC-08 answer allow, no reason the user answers a permission card allow (no reason) → one approval_answer {sessionId, approvalId, offerId, answer: {decision, |  |
| ASK-UI-01 | 5 | pass 5 | ASK-UI-01 complete a card with complete arguments and a reason shows the question, the arguments, the reason, and Allow and Reject buttons |  |
| MULTI-ASK-DT-01 | 3 | pass 3 | MULTI-ASK-DT-01 row 1 open × removed A's card open, then A is removed → voided; B's equal card stays open; nothing is sent to either target |  |
| MULTI-ASK-EP-01 | 4 | pass 4 | MULTI-ASK-EP-01 row 1 equal approvalId on A and B A and B offer the same approvalId → two cards, two handles (each the base64url of ["approval", targetId, epoch |  |
| MULTI-ASK-ROUTE-01 | 2 | pass 2 | MULTI-ASK-ROUTE-01 B by handle POST {handle: B's, choice} → 200; only B's link answers |  |
| MULTI-ASK-ST-01 | 1 | pass 1 | MULTI-ASK-ST-01 row 1 voided → answer refused → restart a voided card: listed (read-only history), answer(handle) refused (expired) with nothing sent; after a r |  |
| PLAT-UC-07 | 7 | pass 7 | PLAT-UC-07 A1 Fishball decides itself (no ask_user call) → no card, nothing sent |  |
| RFIX-F12-DT-01 | 4 | pass 4 | RFIX-F12-DT-01 rule 1 (one of two fails) a page of two offers, the first card's write fails → the listener resolves with [the first event's id]; the second card |  |
| RFIX-F12-ST-01 | 1 | pass 1 | RFIX-F12-ST-01 row 1 the write fails, the same offer is polled again after the store recovers → stored, and ask_user files it (no unknown-offer) |  |

## test/v3/fishball-core/bridge

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| EXT-DT-03 | 4 | todo 2, pass 2 | EXT-DT-03 E6 (end to end) a hosted Fishball with a remote target offers only the remote connector's contributions — TODO X-REMOTE (two DSH processes: the real c |  |
| EXT-UC-02 | 8 | pass 8 | EXT-UC-02 A3 (intercepted partition) a plugin registered for that contributed type gets it, and Fishball's model never sees it (R-EXT-20) |  |
| EXT-UC-04 | 9 | pass 9 | EXT-UC-04 A1 (DT) rule 1 tool absent, link up, important true → unsupported-operation |  |
| F-FACADE | 31 | pass 30, todo 1 | F-FACADE BVA count 0 the contributed-tool count is 0 when C lists 0 contributed tool(s) |  |
| K2-AMEND-1 | 7 | pass 7 | K2-AMEND-1 (F-FACADE) BVA 64 (dots) fbtest-bva-x.aaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaa.aaaaaaaaaaaaaaa (61 characters, 3 dots) maps to 64: offered |  |
| MODEL | 1 | todo 1 | MODEL browser page reload and real settings navigation |  |
| RFIX-F13-BVA-01 | 2 | pass 2 | RFIX-F13-BVA-01 exactly 4 MiB an image of exactly 4194304 bytes (in 524288-byte chunks) → shown as an image |  |
| RFIX-F13-DT-01 | 8 | pass 8 | RFIX-F13-DT-01 decoded size ≠ total (one less) decoded size ≠ total (one less) → a text block saying the image is unavailable; no base64; nothing saved |  |
| RFIX-F13-EP-01 | 4 | pass 4 | RFIX-F13-EP-01 valid image/gif a valid image/gif result → one metadata text block (no chunks) and one image block saved through DSH's attachments |  |

## test/v3/fishball-core/child-plugins

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| CP-R1-07 | 4 | pass 4 | CP-R1-07 dsh-instance an overlay row id next to dsh-instance-child is standalone |  |
| CP-R1-08 | 1 | pass 1 | CP-R1-08 no profileContext a context outside a dsh-launched profile is standalone |  |
| CP-R1-09 | 1 | pass 1 | CP-R1-09 exclusive each row is composed once and exactly one of them runs, in both modes |  |
| CP-R2-01 | 1 | pass 1 | CP-R2-01 en list instance-run: Add plugin, its group and its menu anchor are hidden; the rest of the toolbar is not |  |
| CP-R2-02 | 1 | pass 1 | CP-R2-02 not loaded Add plugin stays hidden while the page is loading (disabled) |  |
| CP-R2-03 | 1 | pass 1 | CP-R2-03 menu open the menu anchor stays hidden with its menu open |  |
| CP-R2-04 | 5 | pass 5 | CP-R2-04 cjk Uninstall is hidden on the bundle page; its other controls stay |  |
| CP-R2-05 | 1 | pass 1 | CP-R2-05 standalone without the row the same page shows every control and no notice (the control row) |  |
| CP-R2-06 | 1 | pass 1 | CP-R2-06 host nothing on the Host refuses an install: DSH's plugin management rows are as DSH composes them, and the row's Node half reads no Host service |  |
| CP-R2-07 | 12 | pass 12 | CP-R2-07 instance-run, head + Versions list every Update button is hidden; the other controls stay |  |
| CP-R2-08 | 3 | pass 3 | CP-R2-08 en → zh the Update buttons are hidden in DSH's words of the active language |  |
| CP-R2-09 | 2 | todo 1, pass 1 | CP-R2-09 aria-label a contributed action labelled "Update notes" stays visible — TODO accepted limit, not a defect: the hide rule matches DSH's label templates  |  |
| CP-R3-01 | 1 | pass 1 | CP-R3-01 [Discover] on Installed Discover the only extra tab, Installed selected: the tab bar is hidden |  |
| CP-R3-02 | 1 | pass 1 | CP-R3-02 [Discover] on Discover Discover selected: the bar and Installed stay reachable; Discover and its panel are hidden |  |
| CP-R3-08 | 1 | pass 1 | CP-R3-08 [other] alone no Discover: the bar and every tab stay |  |
| CP-R3-09 | 2 | pass 2 | CP-R3-09 alone a contributed tab whose id ends in "-discover" is not Discover: it and the bar stay |  |
| CP-R3-10 | 1 | pass 1 | CP-R3-10 Installed → Discover → Installed the bar shows only while Discover is selected |  |
| CP-R4-01 | 1 | pass 1 | CP-R4-01 en the toolbar shows the English notice once |  |
| CP-R4-02 | 1 | pass 1 | CP-R4-02 zh in Chinese from the start the toolbar shows the Chinese notice |  |
| CP-R4-03 | 1 | pass 1 | CP-R4-03 en → zh → en the notice follows each language switch |  |
| CP-R4-04 | 1 | pass 1 | CP-R4-04 ja a language without its own notice shows DSH's fallback (en), not Chinese |  |
| CP-R4-05 | 1 | todo 1 | CP-R4-05 position the notice is at the top of the toolbar — TODO R4 names the place ("at the top of the Plugins page toolbar", "where Add plugin was") but no ob |  |
| CP-R5-01 | 1 | pass 1 | CP-R5-01 zh in Chinese from the start the install entries are hidden in Chinese markup |  |
| CP-R5-02 | 1 | pass 1 | CP-R5-02 en → zh after switching to Chinese the redrawn page keeps them hidden |  |
| CP-R5-03 | 1 | pass 1 | CP-R5-03 zh → en after switching back to English they stay hidden |  |
| CP-R5-04 | 1 | pass 1 | CP-R5-04 ja in a further language DSH has words for (ja) they are hidden in its markup |  |

## test/v3/fishball-core/events

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| EVT-DT-02 | 8 | pass 8 | EVT-DT-02 row 1 equal priority, both filters true → R1 (earliest); one warning at R2's registration |  |
| EVT-DT-03 | 12 | pass 12 | EVT-DT-03 row 1 Fishball accepted, no crash: acked after acceptance, one turn |  |
| EVT-DT-04 | 11 | pass 11 | EVT-DT-04 row 1 (rejects) not accepted, handler rejects → Fishball once |  |
| EVT-EP-03 | 8 | pass 6, todo 2 | EVT-EP-03 row 1 no registration for the type → Fishball, exactly one turn |  |
| EVT-EP-05 | 5 | pass 5 | EVT-EP-05 row 1 Fishball's next turn holds nothing about an event an interceptor handled alone |  |
| EVT-ST-02 | 50 | pass 49, skip 1 | EVT-ST-02 row 1 Polled → ledger record → Recorded: a polled event is recorded before any receiver sees it (no lost event on a later failure) |  |
| EVT-UC-02 | 14 | pass 13, todo 1 | EVT-UC-02 A1 a message with no registration starts exactly one Fishball turn |  |
| EVT-UC-03 | 5 | pass 5 | EVT-UC-03 A1 a second plugin with the same types and priority 0: accepted, one warning naming both, the first still wins |  |
| MULTI-EVT-DT-01 | 3 | pass 3 | MULTI-EVT-DT-01 row 1 both intercepted one registration, the same eventId from A and B, the handler accepts → two offers (A then B source), no wake; each acked  |  |
| MULTI-EVT-EP-01 | 3 | pass 3 | MULTI-EVT-EP-01 row 1 same eventId on A and B A and B both send eventId X → two ledger records (one per tuple), two manager messages fbe_<handle A> / fbe_<handl |  |
| MULTI-EVT-RETIRED-ST-01 | 4 | pass 4 | MULTI-EVT-RETIRED-ST-01 row 1 removed from inbox a pending manager message of a retired endpoint epoch (A) is gone from the DSH inbox after recovery |  |
| MULTI-EVT-ST-01 | 1 | pass 1 | MULTI-EVT-ST-01 row 1 durable before ack, then restart each ack reaches its mailbox only after the record of that source's tuple is in the ledger; after a resta |  |
| RFIX-F11-ST-01 | 1 | pass 1 | RFIX-F11-ST-01 row 1 recovery of E1, E2 (fishball) with a stale pending E1 copy → both handed over and admitted once each, both ledger admitted, acked; no user- |  |
| RFIX-F14-DT-01 | 3 | pass 3 | RFIX-F14-DT-01 rule 1 the move to committing fails → commit resolves {ok: false, code: fenced}, send not called, no unhandled rejection; Fishball once |  |
| WAKE-EVT-BVA-01 | 3 | pass 3 | WAKE-EVT-BVA-01 real clock real timers (no timers option), window 1 s: the delivery is admitted no earlier than 1 s after core took the event |  |
| WAKE-EVT-BVA-02 | 5 | pass 5 | WAKE-EVT-BVA-02 max batch 1 max batch 1 (its lower bound): each wake event is flushed at once in its own delivery, each with the warning naming 1 |  |
| WAKE-EVT-DT-01 | 4 | pass 4 | WAKE-EVT-DT-01 max batch the max batch changed 20 → 2 while running: the 2nd wake event flushes at once with the warning naming 2 |  |
| WAKE-EVT-DT-02 | 5 | pass 5 | WAKE-EVT-DT-02 busy, user queued an event arrives while Fishball is busy and the user queues a message: when the running turn ends, ONE next turn holds both the |  |
| WAKE-EVT-EP-00 | 2 | pass 2 | WAKE-EVT-EP-00 contract WAKE.defaults equal the requirements: window 10 s, max batch 20, the listed WAKE and SILENT types; class words wake / silent |  |
| WAKE-EVT-EP-01 | 11 | pass 11 | WAKE-EVT-EP-01 ask a ask event alone wakes Fishball once the window passed (not before) |  |
| WAKE-EVT-EP-02 | 4 | pass 4 | WAKE-EVT-EP-02 retirement a retirement event alone never wakes Fishball (recorded, acked); the next wake delivery carries it as a summary in the same one messag |  |
| WAKE-EVT-ST-01 | 1 | pass 1 | WAKE-EVT-ST-01 main events at 0 s, 6 s, 12 s (window 10 s) → no turn at 21.999 s; ONE turn at 22 s holding all three |  |
| WAKE-EVT-ST-02 | 3 | pass 3 | WAKE-EVT-ST-02 admitted a batch of three: every record admitted once (ledger admitted, never discarded), each acked once, each admitted into the session once |  |
| WAKE-EVT-UC-01 | 1 | pass 1 | WAKE-EVT-UC-01 interceptor first an interceptor still gets its event first: X keeps contributed:demo.ping; only the message is batched to Fishball |  |

## test/v3/fishball-core/link

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| LNK-FIX3-BVA-01 | 4 | pass 4 | LNK-FIX3-BVA-01 row 1 attempts 1 failed attempt → exactly 1 warning; retries at the backoff's delays |  |
| LNK-FIX3-DT-01 | 4 | pass 3, fail 1 | LNK-FIX3-DT-01 rule 1 no sdk, the import fails, a logger → target-unreachable, a retry scheduled, one warning |  |
| LNK-FIX3-EP-01 | 11 | pass 11 | LNK-FIX3-EP-01 row 1 code the client import fails with an Error with code 'EFBTEST_FIX3' (and a name) → its code: target-unreachable, one warning with exactly t |  |
| LNK-FIX3-ST-01 | 2 | fail 1, pass 1 | LNK-FIX3-ST-01 row 1 import failing (two attempts, two warnings) → the package loads again: the next attempt warns no more → stop: nothing more |  |
| REM-DT-01 | 12 | pass 12 | REM-DT-01 rule 1 target not set → target-unset |  |
| REM-EP-01 | 9 | pass 9 | REM-EP-01 row 1 a blank target is target-unset and opens no connection |  |
| REM-UC-02 | 7 | todo 2, pass 5 | REM-UC-02 A1 the user answered in S1 while F was offline: F later gets the settlement — TODO F-INTERCEPT (a polled event, the settlement included, reaches core' |  |
| RFIX-F02-ST-01 | 3 | pass 3 | RFIX-F02-ST-01 held the gate holds the attempt after the first list → no second tools/list, no listen, not connected |  |
| RFIX-F03-BVA-01 | 4 | pass 4 | RFIX-F03-BVA-01 hint an events hint on the open link drains too: from no cursor, following nextCursor |  |
| RFIX-F03-DT-01 | 5 | pass 5 | RFIX-F03-DT-01 rule 1 (resync once) the first page answers resync → the drain restarts once from no cursor, then follows the pages |  |
| RFIX-F03-ST-01 | 3 | pass 3 | RFIX-F03-ST-01 overtaken (reconnect) a drain overtaken by reconnect() while its page 2 is in flight emits nothing more |  |
| RFIX-F04-EP-01 | 7 | pass 7 | RFIX-F04-EP-01 row 1 a call meets 401 and the token request answers invalid_client → the call rejects; token-refused / TOKEN_REFUSED; refused() once; a retry at |  |
| RFIX-F04-ST-01 | 1 | pass 1 | RFIX-F04-ST-01 row 1 connected → runtime refusal → token-refused → the secret is accepted again → the retry connects |  |

## test/v3/fishball-core/link-save

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| EFIX3-LS-BVA-01 | 3 | pass 3 | EFIX3-LS-BVA-01 row 1 begins 1 begin() while the import fails → as many import warnings as failed loads (at least 1); each begin gives no approval URL |  |
| EFIX3-LS-DT-01 | 3 | pass 2, fail 1 | EFIX3-LS-DT-01 rule 1 no sdk, the import fails → Connect unavailable / failed as before, one warning per failed load |  |
| EFIX3-LS-EP-01 | 11 | pass 11 | EFIX3-LS-EP-01 row 1 code no sdk option, the client import fails with an Error with code 'EFBTEST_FIX3' (and a name) → its code: begin() gives no approval URL,  |  |
| EFIX3-LS-ST-01 | 2 | fail 2 | EFIX3-LS-ST-01 row 1 import failing (one begin, its warnings) → the package loads again: the next begin gives the approval URL and adds no warning |  |
| FLS-BVA-01 | 1 | pass 1 | FLS-BVA-01 row 1 refused reference, nothing saved: retries no sooner than 1000 ms, then at least 2000 ms apart |  |
| FLS-BVA-02 | 2 | pass 2 | FLS-BVA-02 row 1 path "/" (root) → metadata-url-root-path |  |
| FLS-BVA-03 | 1 | pass 1 | FLS-BVA-03 row 1 a grant ten years old still refreshes: no chain-age cap; Connect stays authorized |  |
| FLS-DT-01 | 7 | pass 7 | FLS-DT-01 rule 1 nothing saved, no reference → nothing sent; not connected |  |
| FLS-DT-02 | 4 | pass 4 | FLS-DT-02 rule 1 the same value, saved, after a restart → no pair, no warning |  |
| FLS-DT-03 | 4 | pass 4 | FLS-DT-03 rule 1 a new non-empty value in the reference → onChange; core's own unset after the save does not fire it again |  |
| FLS-EP-01 | 6 | pass 6 | FLS-EP-01 row 1 CIMD URL absent → needs-configuration / metadata-url-missing; nothing sent |  |
| FLS-EP-02 | 6 | pass 6 | FLS-EP-02 row 1 resource path is not the MCP path → needs-configuration / not-a-connector; no authorization request |  |
| FLS-EP-03 | 3 | pass 3 | FLS-EP-03 row 1 hosted path: no token or access token in any log, status, setting, pairing record or home file |  |
| FLS-EP-04 | 2 | pass 2 | FLS-EP-04 row 1 core never writes a user's reference; it only clears DSH_AGENT_TOKEN after a save |  |
| FLS-EP-05 | 2 | pass 2 | FLS-EP-05 row 1 target unreachable with a reference token: nothing saved, the reference keeps the value |  |
| FLS-FIXTURE | 1 | pass 1 | FLS-FIXTURE row 1 discovery reaches the fake on both names without a wildcard listener |  |
| MULTI-CRED-DT-01 | 1 | pass 1 | MULTI-CRED-DT-01 binding mismatch a saved copy whose binding names another endpoint epoch (or another agentId) is not used: nothing is presented, not connected |  |
| MULTI-CRED-EP-01 | 1 | pass 1 | MULTI-CRED-EP-01 names credentialNames: the parent has DSH_AGENT_TOKEN, fishball-core/hosted-agent, fishball-core/pending-token-origin; an added target FISHBALL |  |
| MULTI-CRED-EP-02 | 1 | pass 1 | MULTI-CRED-EP-02 added target an added target's token in its own reference: accepted → saved only as fishball-core/token-<id>-<epoch> with binding {targetId, en |  |
| MULTI-CRED-ST-01 | 1 | pass 1 | MULTI-CRED-ST-01 parent epoch retired (same origin) the parent connected on epoch E1 (hosted copy bound to E1); the endpoint changes on the same origin (new epo |  |
| REM-ST-01 | 22 | pass 22 | REM-ST-01 invalid (begin while needs-configuration) begin() in needs-configuration answers the code and stays; nothing is sent |  |
| REM-UC-04 | 19 | pass 19 | REM-UC-04 A1 the page left the name empty: core sends set_name once with its requested name ("Fishball" by default) |  |
| RFIX-F01-EP-01 | 1 | pass 1 | RFIX-F01-EP-01 record the binding is durable: record fishball-core/pending-token-origin holds {v: 1, ref, binding: {targetId: parent, endpointEpoch, origin: A,  |  |
| RFIX-F01-ST-01 | 6 | pass 6 | RFIX-F01-ST-01 back to A bound to A, target B, then A again → A is offered T again (a B attempt in between used nothing) |  |
| RFIX-F10-DT-01 | 1 | pass 1 | RFIX-F10-DT-01 record id ≠ attempt id, full scope a grant saved for another id and a paired record of that id → the grant is not used: no pair, no listen, not c |  |
| RFIX-F10-EP-01 | 1 | pass 1 | RFIX-F10-EP-01 agentId stored Connect's grant payload holds agentId = the agent_id it passed (identity.id) |  |
| RFIX-F10-ST-01 | 3 | pass 3 | RFIX-F10-ST-01 id changed identity.id changes after Connect → the grant is no credential: link target-unset, nothing sent with it; Connect needs-authorization |  |
| RFIX-F16-DT-01 | 7 | pass 7 | RFIX-F16-DT-01 connect.clientMetadataUrl during discovery connect.clientMetadataUrl changes while begin() awaits discovery → begin rejects; no approval URL, no  |  |
| RFIX-F16-ST-01 | 2 | pass 2 | RFIX-F16-ST-01 begin after dispose after dispose(), begin() starts no attempt: no discovery request, no approval URL |  |
| X-11 | 20 | pass 20 | X-11 authorization-code exchange 301 authorization-code exchange answered 301: the code and code_verifier never reach the Location; nothing saved; Connect ends  |  |
| X-12 | 18 | pass 18 | X-12 authorization_endpoint a javascript: URL authorization_endpoint a javascript: URL: the authorization-server document is invalid → begin() rejects, Connect  |  |
| X-13 | 5 | pass 5 | X-13 code_challenge_methods_supported absent code_challenge_methods_supported absent → no approval URL, no authorization request; Connect ends failed |  |

## test/v3/fishball-core/manager

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| MGR-ID-EP-01 | 1 | pass 1 | MGR-ID-EP-01 the first start writes no settings document and saves no identity.id into settings |  |
| MGR-ID-EP-02 | 1 | fail 1 | MGR-ID-EP-02 with identity.id unset, the id core sends (Connect agent_id) is fb- + 16 of [a-z2-7] |  |
| MGR-ID-ST-01 | 1 | pass 1 | MGR-ID-ST-01 the generated id is the same after a restart of the same home |  |
| MGR-ID-ST-02 | 1 | fail 1 | MGR-ID-ST-02 a user-set identity.id overrides the generated id |  |
| MGR-ID-ST-03 | 1 | pass 1 | MGR-ID-ST-03 identity.id unset again: the kept generated id is used again |  |
| MGR-MOD-EP-01 | 1 | todo 1 | MGR-MOD-EP-01 model.reasoningEffort reaches the request |  |
| MGR-MOD-ST-01 | 1 | pass 1 | MGR-MOD-ST-01 model unset: the manager runs on DSH's default model |  |
| MGR-MOD-ST-02 | 1 | pass 1 | MGR-MOD-ST-02 set to a routable model: the live manager uses it, no restart |  |
| MGR-MOD-ST-03 | 1 | pass 1 | MGR-MOD-ST-03 set to an unroutable model: DSH's default is kept |  |
| MGR-MOD-ST-04 | 1 | pass 1 | MGR-MOD-ST-04 unset again: DSH's default |  |
| MGR-MOD-ST-05 | 1 | pass 1 | MGR-MOD-ST-05 set before a restart: the manager uses it on activation |  |
| MGR-MOD-ST-06 | 1 | pass 1 | MGR-MOD-ST-06 unset after the restart: DSH's default |  |
| MGR-MOD-ST-07 | 1 | todo 1 | MGR-MOD-ST-07 an unroutable selection is logged once |  |
| MGR-MOD-ST-08 | 1 | todo 1 | MGR-MOD-ST-08 a change of DSH's default while model is unset |  |
| MGR-REM-DT-01 | 6 | pass 6 | MGR-REM-DT-01 schedule_create BVA after 0 s (below 1): refused, never listed |  |
| MGR-REM-EP-01 | 1 | pass 1 | MGR-REM-EP-01 the manager's model-visible tools include schedule_create/list/update/delete |  |
| MGR-REM-EP-02 | 1 | pass 1 | MGR-REM-EP-02 an ordinary new session sees none of core's tools (reminders, ask_user, message_user, private skills) |  |
| MGR-REM-EP-03 | 1 | pass 1 | MGR-REM-EP-03 the V2 reminder page API is not served (404) |  |
| MGR-REM-EP-04 | 1 | pass 1 | MGR-REM-EP-04 R-FB-13 ignores core's own tools: the guard report stays ok after the reminder tools ran, before and after restart |  |
| MGR-REM-ST-01 | 1 | pass 1 | MGR-REM-ST-01 a one-shot reminder fires into the manager as a user message, then has ended |  |
| MGR-REM-ST-02 | 1 | pass 1 | MGR-REM-ST-02 schedule_update renames a listed reminder in place |  |
| MGR-REM-ST-03 | 1 | pass 1 | MGR-REM-ST-03 schedule_delete removes a reminder from the list |  |
| MGR-REM-ST-04 | 1 | pass 1 | MGR-REM-ST-04 a reminder survives a restart of the same home |  |
| MGR-REM-ST-05 | 1 | pass 1 | MGR-REM-ST-05 a reminder that came due while DSH was down is delivered after the next start |  |
| MGR-SET-EP-01 | 1 | pass 1, skip 1 | MGR-SET-EP-01 the manager runs on core's fishball preset, the default |  |
| MGR-SET-EP-01b | 1 | pass 1 | MGR-SET-EP-01b the default agent preset is fishball |  |
| MGR-SET-EP-02 | 1 | pass 1 | MGR-SET-EP-02 the manager's tools are exactly read, read_image, working_directory plus core's own |  |
| MGR-SET-EP-03 | 1 | pass 1 | MGR-SET-EP-03 the persona names session_message and approval_answer and none of the V2 names |  |
| MGR-SET-EP-04 | 5 | pass 5 | MGR-SET-EP-04 1 the persona does not mention ask_agent (no such tool) |  |
| MGR-SET-ST-01 | 1 | pass 1 | MGR-SET-ST-01 POST /api/fishball/session twice at once and once more: 200 and one id; GET and the service then answer it |  |
| MGR-SET-ST-02 | 1 | pass 1 | MGR-SET-ST-02 after a restart of the same home, POST then GET answer the same manager id |  |
| MGR-SET-ST-03 | 1 | todo 1 | MGR-SET-ST-03 GET before any ensure on a fresh home |  |
| RFIX-F05-DT-01 | 3 | pass 3 | RFIX-F05-DT-01 any other failure resume fails (any other failure) for a recorded session → chat-session, and no session is created |  |
| RFIX-F05-ST-01 | 2 | pass 2 | RFIX-F05-ST-01 1 the first create fails; the next activation creates the session under the recorded id and works |  |
| RFIX-F06-ST-01 | 2 | pass 2 | RFIX-F06-ST-01 activation the setting changes from B to C while the activation validates B → the manager ends on C |  |
| RFIX-F07-BVA-01 | 2 | pass 2 | RFIX-F07-BVA-01 create over the bound creates up to the byte bound are kept; the create that would pass 3774873 bytes (90% of 4194304) is refused schedule-store |  |
| RFIX-F07-EP-01 | 4 | pass 4 | RFIX-F07-EP-01 an unexpected shape a store an unexpected shape → every schedule tool answers schedule-unavailable; the file is never overwritten |  |
| RFIX-F07-EP-02 | 1 | pass 1 | RFIX-F07-EP-02 ended on load ended tasks already in a stored file are dropped on load; schedule_list never shows ended |  |
| RFIX-F08-DT-01 | 3 | pass 3 | RFIX-F08-DT-01 owner teardown the turn claiming a one-shot ends by owner teardown before admission → delivered again: one admission |  |
| RFIX-F08-ST-01 | 2 | pass 2 | RFIX-F08-ST-01 busy → held a reminder due while the manager is busy is not handed over into that turn; it is its own turn after it, admitted once |  |
| RFIX-F08-ST-02 | 2 | pass 2 | RFIX-F08-ST-02 recurring a recurring reminder (cron every minute) delivered and admitted → lastDelivery recorded, the next occurrence scheduled later, still lis |  |
| RFIX-F09-BVA-01 | 1 | fail 1 | RFIX-F09-BVA-01 a 64-character id (the grammar's maximum) is valid and used; 65 is refused (EP row long) |  |
| RFIX-F09-EP-01 | 3 | pass 3 | RFIX-F09-EP-01 dot: identity.id "bad.id" is not used or sent; the generated id stays in force; id-invalid is logged by code only |  |
| RFIX-F09-EP-02 | 1 | pass 1 | RFIX-F09-EP-02 a blank identity.id means the generated id |  |
| RFIX-F09-ST-01 | 2 | fail 2 | RFIX-F09-ST-01 a valid user id after invalid ones is used at once |  |
| RFIX-F15-BVA-01 | 16 | pass 16 | RFIX-F15-BVA-01 23:59:59 at "2026-03-01T23:59:59Z" → accepted at exactly that instant |  |
| RFIX-F17-EP-01 | 2 | pass 2 | RFIX-F17-EP-01 1 the persona names the managed sessions: the ones Fishball starts and the ones the user hands over |  |
| RFIX-F18-EP-01 | 2 | pass 2 | RFIX-F18-EP-01 manager scope a global harness:source section and context reach an ordinary agent but not the manager's model; sandbox and approval contexts stay |  |
| RFIX2-ABOVE-DT-01 | 5 | pass 5 | RFIX2-ABOVE-DT-01 create in a store above 90% (bookkeeping), a create → refused schedule-store-full, nothing written |  |
| RFIX2-ABOVE-ST-01 | 1 | pass 1 | RFIX2-ABOVE-ST-01 pending → delivered the occurrence pending in a store above 90% is delivered once when the busy turn ends, then removed |  |
| RFIX2-CREATE-BVA-01 | 4 | pass 4 | RFIX2-CREATE-BVA-01 89% a create whose resulting store is 3732930 bytes → accepted, the file is exactly that size |  |
| RFIX2-DELIVER-ST-01 | 2 | pass 2 | RFIX2-DELIVER-ST-01 one-shot a one-shot comes due in a store creates filled to exactly 3774873 bytes → handed to the manager once, then removed |  |
| RFIX2-FULL-ST-01 | 1 | pass 1 | RFIX2-FULL-ST-01 missed one-shot at 100% a one-shot missed while down in a store 1 byte under the limit → not dropped: still listed until delivered; after a del |  |
| RFIX2-UPDATE-BVA-01 | 4 | pass 4 | RFIX2-UPDATE-BVA-01 89% an update growing a prompt from 88% to a 3732930-byte store → accepted, the file is exactly that size |  |
| WD-PERSONA-DT-01 | 1 | pass 1 | WD-PERSONA-DT-01 Watchdog offered: every persona line naming a Watchdog tool states the condition (a DSH offering Watchdog); none names one unconditionally |  |
| WD-PERSONA-DT-02 | 1 | pass 1 | WD-PERSONA-DT-02 Watchdog not offered: session_start guidance stays in lines that do not mention Watchdog, and no line forbids session_start outright |  |
| WD-PERSONA-EP-01 | 1 | pass 1 | WD-PERSONA-EP-01 core's contract WATCHDOG is frozen and its tools are exactly sessionStart: watchdog_session_start and brief: watchdog_brief |  |
| WD-PERSONA-EP-01b | 1 | pass 1 | WD-PERSONA-EP-01b the connector tool it replaces is still MCP.tools.sessionStart: session_start |  |
| WD-PERSONA-EP-02 | 1 | pass 1 | WD-PERSONA-EP-02 the persona names WATCHDOG.tools.sessionStart instead of MCP.tools.sessionStart in one sentence conditional on a DSH offering Watchdog |  |
| WD-PERSONA-EP-03 | 1 | pass 1 | WD-PERSONA-EP-03 the instruction says watchdog_session_start takes the same arguments plus the session's purpose and approvable scope |  |
| WD-PERSONA-EP-04 | 1 | pass 1 | WD-PERSONA-EP-04 the instruction says Watchdog supervises the session from its first request |  |
| WD-PERSONA-EP-05 | 1 | pass 1 | WD-PERSONA-EP-05 the persona names WATCHDOG.tools.brief with its limit: it only covers what a running session asks after the brief |  |
| WD-PERSONA-EP-06 | 1 | pass 1 | WD-PERSONA-EP-06 the persona takes both Watchdog tool names from core's contract (a contract copy with other names shows those, not the literals) |  |
| WD-PERSONA-EP-07 | 1 | pass 1 | WD-PERSONA-EP-07 the session_start placement and model guidance is still there: workspaceId from workspaces_list as folder, model from models_list, verified ID  |  |
| WD-PERSONA-EP-08 | 1 | pass 1 | WD-PERSONA-EP-08 style kept: exactly one bold rule line and it is still the last line; no carriage return, no trailing line break |  |
| WD-PERSONA-EP-09 | 1 | pass 1 | WD-PERSONA-EP-09 style kept: the Watchdog line has balanced bold markers and no Chinese punctuation just inside a closing ** |  |
| WD-PERSONA-ST-01 | 1 | pass 1 | WD-PERSONA-ST-01 before → after the change: every line of the earlier persona is still there in the same order, and the only new line is the Watchdog one |  |
| WD-PERSONA-SYS-01 | 1 | pass 1 | WD-PERSONA-SYS-01 the manager's real model request carries the Watchdog instruction line, naming both Watchdog tools and session_start |  |

## test/v3/fishball-core/message-user

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| MSG-PAGE-DT-01 | 1 | pass 1 | MSG-PAGE-DT-01 empty, whitespace-only, non-string, missing and unparsable message arguments draw no row |  |
| MSG-PAGE-DT-02 | 1 | pass 1 | MSG-PAGE-DT-02 control enabled and closed: the turn's assistant replies are hidden |  |
| MSG-PAGE-DT-03 | 1 | pass 1 | MSG-PAGE-DT-03 control disabled without data-open (nothing to fold besides the reply): the reply is visible |  |
| MSG-PAGE-EP-00 | 1 | pass 1 | MSG-PAGE-EP-00 precondition: the manager world opens as the Fishball page (<html data-fishball-page>) |  |
| MSG-PAGE-EP-01 | 1 | pass 1 | MSG-PAGE-EP-01 each non-empty message_user call is its own fishball-message row, in call order, with its Markdown drawn |  |
| MSG-PAGE-EP-02 | 1 | pass 1 | MSG-PAGE-EP-02 the message rows are visible, outside DSH's turn-process fold and step groups, with the control closed, open and closed again |  |
| MSG-PAGE-EP-03 | 1 | pass 1 | MSG-PAGE-EP-03 the message row looks like Fishball's reply: avatar ::before, "Fishball" ::after label and a bubble around the message |  |
| MSG-PAGE-EP-04 | 1 | todo 1 | MSG-PAGE-EP-04 outside the Fishball page (another session in the same DSH) nothing changes |  |
| MSG-PAGE-ST-01 | 1 | pass 1 | MSG-PAGE-ST-01 clicking the control (closed -> open) shows the folded process and the replies, in DSH's plain look; the message_user tool rows are normal rows i |  |
| MSG-PAGE-ST-01b | 1 | pass 1 | MSG-PAGE-ST-01b an expanded reply has no avatar, no "Fishball" label and no bubble: the same look as with fishball-page unloaded |  |
| MSG-PAGE-ST-02 | 1 | pass 1 | MSG-PAGE-ST-02 clicking it again (open -> closed) hides the replies again |  |
| MSG-PAGE-ST-03 | 1 | pass 1 | MSG-PAGE-ST-03 running turn: its message row is visible at once, its reply is hidden |  |
| MSG-PAGE-ST-04 | 1 | pass 1 | MSG-PAGE-ST-04 running -> completed with a closed enabled control: the message stays visible, the replies stay hidden |  |
| MSG-PAGE-ST-05 | 1 | pass 1 | MSG-PAGE-ST-05 running -> stopped (control open and disabled): the replies show, the message row stays |  |
| MSG-PAGE-ST-06 | 1 | pass 1 | MSG-PAGE-ST-06 DSH's verbose work details (every control open, disabled) show the replies; back to the default hides them again |  |
| MSG-PAGE-ST-07 | 1 | pass 1 | MSG-PAGE-ST-07 after a page reload the stored turn draws the same message rows in call order and hides its replies |  |
| MSG-PAGE-ST-08 | 1 | pass 1 | MSG-PAGE-ST-08 fishball-page unloaded (its row off in DSH's Plugins): no message rows, no folded marks, DSH's own fold works as before |  |
| MSG-PAGE-ST-09 | 1 | pass 1 | MSG-PAGE-ST-09 fishball-page switched on again: the message rows return from the stored session |  |
| MSG-PAGING-EP-00 | 1 | pass 1 | MSG-PAGING-EP-00 precondition: 40 turns open on the newest window only; DSH offers "Load earlier" |  |
| MSG-PAGING-EP-01 | 1 | pass 1 | MSG-PAGING-EP-01 a hidden reply seat takes no space (0×0 box) and leaves no extra gap: the rows around it are as far apart as with the seat taken out (within 0. |  |
| MSG-PAGING-EP-02 | 1 | pass 1 | MSG-PAGING-EP-02 no uncaught exception from Fishball's code while scrolling and paging |  |
| MSG-PAGING-ST-01 | 1 | pass 1 | MSG-PAGING-ST-01 each older page keeps the message rows in call order, contiguous up to the newest, all visible; at the end every turn's message is there |  |
| MSG-PAGING-ST-02 | 1 | pass 1 | MSG-PAGING-ST-02 the anchor row on screen stays put (within 2px) while and after each older page arrives |  |
| MSG-PERSONA-EP-01 | 1 | pass 1 | MSG-PERSONA-EP-01 the persona names message_user and embed-ui__notify |  |
| MSG-PERSONA-EP-02 | 1 | pass 1 | MSG-PERSONA-EP-02 the persona says ordinary replies, reasoning and tool calls are hidden from the user |  |
| MSG-PERSONA-EP-03 | 1 | pass 1 | MSG-PERSONA-EP-03 the persona says the user sees only what message_user (and notify, when offered) surfaces |  |
| MSG-PERSONA-EP-04 | 1 | pass 1 | MSG-PERSONA-EP-04 the persona says what needs attention or action must be sent proactively with message_user, plus a notify notice |  |
| MSG-PERSONA-EP-05 | 1 | pass 1 | MSG-PERSONA-EP-05 the persona says no messages or notices for routine events, and to batch them |  |
| MSG-PERSONA-EP-06 | 1 | pass 1 | MSG-PERSONA-EP-06 the persona says every reply to the user goes through message_user, including the setup greeting and the report after a stop/redirect |  |
| MSG-PERSONA-EP-07 | 1 | pass 1 | MSG-PERSONA-EP-07 no sentence tells Fishball to tell the user "in this chat" without message_user |  |
| MSG-STREAM-EP-01 | 1 | pass 1 | MSG-STREAM-EP-01 no uncaught exception from Fishball's code during the stream |  |
| MSG-STREAM-ST-01 | 1 | pass 1 | MSG-STREAM-ST-01 a long streamed reply (400 deltas) stays hidden and takes no space while it streams; the messages around it are drawn at once and stay visible |  |
| MSG-STREAM-ST-02 | 1 | pass 1 | MSG-STREAM-ST-02 after the stream the page still works: replies folded behind a closed control, the control opens them, the streamed reply is complete |  |
| MSG-TOOL-DT-01 | 9 | pass 9 | MSG-TOOL-DT-01 BVA empty string {"message":""} -> {"shown":false,"code":"message-empty"} |  |
| MSG-TOOL-EP-01 | 1 | pass 1 | MSG-TOOL-EP-01 message-tools.js is import-free and exports MESSAGE_TOOL = {send: "message_user"} |  |
| MSG-TOOL-EP-02 | 1 | pass 1 | MSG-TOOL-EP-02 GUARDS.coreTools lists {module: "../manager/message-tools.js", table: "MESSAGE_TOOL"} |  |
| MSG-TOOL-EP-03 | 1 | pass 1 | MSG-TOOL-EP-03 the manager is offered message_user: a required string parameter "message", described as Markdown |  |
| MSG-TOOL-EP-04 | 1 | pass 1 | MSG-TOOL-EP-04 an ordinary new session is not offered message_user (manager only) |  |
| MSG-TOOL-EP-05 | 1 | pass 1 | MSG-TOOL-EP-05 R-FB-13: the guard report does not count message_user as an extra or overriding manager tool |  |

## test/v3/fishball-core/package

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| HOST-EP-03 | 15 | pass 11, fail 2, skip 2 | HOST-EP-03 row 1 core depends on fishball-shared (dependencies and bundleDependencies); never on the connector, the instance or dsh-connector-shared |  |
| HOST-UC-08 | 8 | pass 1, skip 3, todo 2, fail 2 | HOST-UC-08 A3 standalone: no slim settings panel entry remains, and no Fishball plugin fails |  |

## test/v3/fishball-core/settings

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| BRAND-SET-E1 | 2 | pass 2 | BRAND-SET-E1 refused the Host refused the write: a visible alert/save-failed line, and the stored value stays fishball |  |
| BRAND-SET-EP-01 | 2 | pass 2 | BRAND-SET-EP-01 control en (en) core's settings page has one [data-fishball-brand-style] control with exactly the options fishball / deepseek labelled Fishball  |  |
| BRAND-SET-EP-02 | 6 | pass 6 | BRAND-SET-EP-02 a non-string stored a non-string (7) → the control shows fishball |  |
| BRAND-SET-UC-01 | 2 | pass 2 | BRAND-SET-UC-01 choose DeepSeek choosing DeepSeek writes {op:'set', path:['brandStyle'], value:'deepseek'} through core's config form, and the page shows the st |  |
| BRAND-STATUS-EP-01 | 1 | pass 1 | BRAND-STATUS-EP-01 default with no brand port (an absent stored value) the status snapshot brand is exactly {style: fishball} |  |
| BRAND-STATUS-EP-02 | 10 | pass 10 | BRAND-STATUS-EP-02 a number stored logo theme a number → brand.style fishball |  |
| BRAND-STATUS-SHAPE-01 | 1 | pass 1 | BRAND-STATUS-SHAPE-01 shape every snapshot keeps exactly {fishball, guards, set, targets, brand} and brand.style one of fishball/deepseek |  |
| BRAND-STATUS-ST-01 | 1 | pass 1 | BRAND-STATUS-ST-01 live after the stored choice changes and core recomposes (its settings write / HMR path), the new status snapshot reads fishball → deepseek → |  |
| CONNECT-DT-01 | 12 | pass 12 | CONNECT-DT-01 another code of the same state en (en) press refused → first status after it → needs-configuration/metadata-url-not-https: alert shown |  |
| CONNECT-ST-01 | 2 | pass 2 | CONNECT-ST-01 newer read wins in order too read 1 answers first, read 2 after: the state is read 2's |  |
| CONNECT-ST-02 | 1 | pass 1 | CONNECT-ST-02 read before a press list answered → refocus read pending → Connect pressed (POST) → the older read answers failed: ignored; the read after the pre |  |
| CONNECT-ST-03 | 3 | pass 3 | CONNECT-ST-03 follow-up read after unmount press answered → its follow-up read pending → unmount → the read answers: no state update |  |
| CONNECT-ST-04 | 2 | pass 2 | CONNECT-ST-04 latest press notice press 1 pending → press 2 answers authorized → press 1 answers needs-configuration late: no notice |  |
| EFIX3-SET-BVA-01 | 2 | pass 2 | EFIX3-SET-BVA-01 row 0 groups an empty catalog (groups: []) → "No model is configured in this DSH yet."; no "could not be read" |  |
| EFIX3-SET-DT-01 | 7 | pass 7 | EFIX3-SET-DT-01 rule 1 en no remote.session service at all → the page still registers and renders and says "The models could not be read." |  |
| EFIX3-SET-MUT-01 | 1 | pass 1 | EFIX3-SET-MUT-01 base c4845000 mutating-test sanity: client.settings.js at c4845000 in the same world (catalog provided) does NOT list the catalog and says "cou |  |
| EFIX3-SET-RULE-01 | 1 | pass 1 | EFIX3-SET-RULE-01 harness the SDK's Cordis with the page's Remote: a plugin without remote.session in inject cannot read ctx.remote.session (throws); with it, i |  |
| EFIX3-SET-UC-01 | 2 | pass 2 | EFIX3-SET-UC-01 main en remote.session provided (own fiber, Cordis's rule): two groups, plain models and a model with two efforts → one option per model / per e |  |
| MULTI-SET-BVA-01 | 2 | pass 2 | MULTI-SET-BVA-01 empty token text "" → nothing written |  |
| MULTI-SET-DT-01 | 4 | pass 4 | MULTI-SET-DT-01 remove cancelled Remove opens DSH's confirmation dialog; no {confirmed: true} is posted before the user confirms; cancelling posts none |  |
| MULTI-SET-EP-01 | 3 | pass 3 | MULTI-SET-EP-01 empty GET api/fishball/targets (document-relative, same-origin, no-store) → one card per target, keyed by targetId, in list order (empty) |  |
| MULTI-SET-EP-02 | 1 | pass 1 | MULTI-SET-EP-02 parent vs remote the parent card (removable/urlEditable false) has no Remove and no URL field; a remote card has both; both have Connect, Retry  |  |
| MULTI-SET-EP-03 | 1 | pass 1 | MULTI-SET-EP-03 unnamed Q01: a target with name null shows no URL-derived name (the card text holds no hostname of its URL outside its URL field) |  |
| MULTI-SET-ST-01 | 1 | pass 1 | MULTI-SET-ST-01 unavailable the list route answers 503 → no card, nothing failed; it answers again → the cards appear after a re-read (window focus) |  |
| MULTI-SET-ST-02 | 3 | pass 3 | MULTI-SET-ST-02 add accepted Add posts {url}; the list is read again and the new card appears |  |
| MULTI-SET-UC-01 | 3 | pass 3 | MULTI-SET-UC-01 parent a token pasted in the parent card and saved is written with remote.credentials.set(DSH_AGENT_TOKEN, trimmed value) only; the field is bla |  |
| MULTI-SET-UC-02 | 4 | pass 4 | MULTI-SET-UC-02 approval url Connect answering approval-url opens it with window.open(url, "_blank", "noopener") once |  |
| SET3-BVA-01 | 4 | skip 4 | SET3-BVA-01 row 1 empty token field: '' → nothing written |  |
| SET3-BVA-02 | 3 | skip 3 | SET3-BVA-02 apiVersion 0 apiVersion 0 → 503 |  |
| SET3-BVA-03 | 2 | pass 1, skip 1 | SET3-BVA-03 entries exactly one entry of each kind across the header actions |  |
| SET3-BVA-04 | 4 | skip 4 | SET3-BVA-04 row 1 one space instance " " → the user's |  |
| SET3-BVA-05 | 4 | skip 4 | SET3-BVA-05 row 0 requests 0 failing GETs → exactly 0 warnings, one per request |  |
| SET3-DT-01 | 6 | skip 5, pass 1 | SET3-DT-01 row 1 settings only, Host accepts → one mutate, no credential write, no failed line |  |
| SET3-DT-02 | 2 | pass 2 | SET3-DT-02 row 1 pluginNavigation present → openBundle('fishball-core'), no selectPanel |  |
| SET3-DT-03 | 3 | pass 3 | SET3-DT-03 row 1 DSH's launcher on the page → it is pressed once; no alert; no navigation |  |
| SET3-DT-04 | 3 | pass 3 | SET3-DT-04 row 1 active panel still Plugins when the session mark arrives → opens again (2 in all) |  |
| SET3-DT-05 | 5 | skip 5 | SET3-DT-05 row 1 GET, compatible service → 200 status |  |
| SET3-DT-06 | 24 | skip 24 | SET3-DT-06 row 1 instance absent × user absent → effectiveTarget undefined (user), hasInstanceTarget false |  |
| SET3-DT-07 | 19 | skip 19 | SET3-DT-07 row 1 GET, status() answers → 200, nothing logged |  |
| SET3-EP-01 | 7 | skip 5, pass 2 | SET3-EP-01 row 1 new target.url: a URL into an empty target.url → set |  |
| SET3-EP-02 | 1 | skip 1 | SET3-EP-02 row 3 whitespace token field: tabs and newlines only → nothing written |  |
| SET3-EP-03 | 9 | skip 9 | SET3-EP-03 bad state GET 200 with a state outside CONNECT.state → state 'unavailable', nothing opened, nothing failed |  |
| SET3-EP-04 | 7 | skip 7 | SET3-EP-04 approval without url POST answers approval without url → an unavailable line; nothing is opened; nothing failed |  |
| SET3-EP-05 | 7 | pass 7 | SET3-EP-05 bare fragment "#settings" → nothing opens, at load or at the session mark |  |
| SET3-EP-06 | 5 | skip 5 | SET3-EP-06 row 1 absent no fishballInstance → 503 CONNECT_UNAVAILABLE on GET and POST |  |
| SET3-EP-07 | 5 | skip 5 | SET3-EP-07 row 1 not served the instance namespace not served → no instance target line |  |
| SET3-EP-08 | 9 | skip 9 | SET3-EP-08 absent instance absent → no line, the ordinary hint (en, zh) |  |
| SET3-EP-09 | 12 | skip 12 | SET3-EP-09 row 1 code status() throws an Error with code 'EFBTEST_FIX3' (and a name) → its code; 503 and one warning carrying exactly that code, no message, URL |  |
| SET3-ST-01 | 3 | pass 2, skip 1 | SET3-ST-01 row 1 not served → served: the entry appears |  |
| SET3-ST-02 | 3 | skip 3 | SET3-ST-02 row 1 blank → typed: staged (Save enabled), nothing written yet |  |
| SET3-ST-03 | 2 | skip 2 | SET3-ST-03 row 1 unavailable → focus with the route back → shows the new state |  |
| SET3-ST-04 | 1 | pass 1 | SET3-ST-04 row 1 session marked → marked again, removed and set again: no further open (only the first mark counts) |  |
| SET3-ST-05 | 4 | skip 4 | SET3-ST-05 row 1-3 en (en) not served → served: line and "not used" hint; → withdrawn: both back to standalone; → served again: hosted again |  |
| SET3-ST-06 | 1 | skip 1 | SET3-ST-06 row 1 throwing → answering → withdrawn → throwing (another code): warnings only for the two throws, each with its own code |  |
| SET3-UC-01 | 8 | pass 3, skip 4, todo 1 | SET3-UC-01 A1 namespace not served: no plugins.bundle.config entry, and nothing failed |  |
| SET3-UC-02 | 8 | pass 3, skip 5 | SET3-UC-02 A1 clearing a stored field sends {op:'unset', path:['identity','name']} |  |
| SET3-UC-03 | 7 | skip 7 | SET3-UC-03 E1 a refused write (credentials.set → {ok:false}) shows the save-failed line |  |
| SET3-UC-04 | 5 | skip 5 | SET3-UC-04 A3 window focus → the status is read again (exactly one GET per focus) |  |
| SET3-UC-05 | 9 | skip 9 | SET3-UC-05 E3 (F-FIX-3) status() throws → the same 503, and one warning on ctx.logger('fishball-link'): the fixed line, the fixed reason, the code |  |
| SET3-UC-06 | 2 | skip 2 | SET3-UC-06 A1 the line follows the Host: served later → it appears; withdrawn → it goes |  |
| SET3-UC-07 | 4 | todo 1, pass 3 | SET3-UC-07 e2e DSH settings opens DSH's native Settings dialog in a browser — TODO E2E-UI (W6 browser flows on a real DSH: the Plugins page, the native Settings |  |
| SET3-UC-08 | 2 | pass 2 | SET3-UC-08 main 1 #view=settings at load → core's settings page opens once (the Fishball-settings action) |  |
| SET3-UC-09 | 1 | pass 1 | SET3-UC-09 main no main slot entry 'fishball-settings', no slim panel markers, no fishballSettingsSections service |  |
| SET3-UC-10 | 6 | pass 6 | SET3-UC-10 A1 configForms missing: the page entry stays pending; the Fishball-page entries still register; nothing fails |  |
| SET3-UC-11 | 6 | skip 6 | SET3-UC-11 A1 no instance value (standalone) → the user's target.url, unchanged; hasInstanceTarget false |  |
| UIPF-CORE-DT-01 | 6 | skip 6 | UIPF-CORE-DT-01 authorized Connect read authorized: the section keeps its heading and a StateDot; the Connect button is outline |  |
| UIPF-CORE-EP-01 | 4 | skip 4 | UIPF-CORE-EP-01 connect heading en (en) the Connect section shows an h3 "Connect" that names it (aria-labelledby, no aria-label), a StateDot and the Connect but |  |
| UIPF-ENTRY-EP-01 | 5 | pass 5 | UIPF-ENTRY-EP-01 dsh en (en) the dsh entry: a button, icon only, aria-label "DSH settings", Tooltip label equals it, side bottom |  |
| UIPF-ENTRY-ST-01 | 1 | pass 1 | UIPF-ENTRY-ST-01 tooltip an entry's Tooltip shows on hover with its label and goes on leave |  |
| WAKE-SET-BVA-01 | 10 | pass 10 | WAKE-SET-BVA-01 maxBatch -3 maxBatch typed "-3" → an inline alert, nothing written |  |
| WAKE-SET-CFG-01 | 1 | pass 1 | WAKE-SET-CFG-01 volatile the three wake fields are volatile in core's Config (a change applies without a restart) |  |
| WAKE-SET-CFG-02 | 10 | pass 10 | WAKE-SET-CFG-02 absent max batch Config({}) reads wake.maxBatch = 20 (bad stored values fall back to the default) |  |
| WAKE-SET-EP-01 | 2 | pass 2 | WAKE-SET-EP-01 defaults with nothing stored the page shows window 10, max batch 20 and each listed type's default class |  |
| WAKE-SET-EP-02 | 13 | pass 13 | WAKE-SET-EP-02 ask choosing silent for ask writes at once (no Save): wake.classes[ask] = silent, every other type keeps its class |  |

## test/v3/fishball-core/status

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| F-STATUS-00 | 1 | pass 1 | F-STATUS-00 surface STATUS_MODEL is frozen and spells the relayed words; guardsNotice names the list; stripLine is exported |  |
| F-STATUS-01 | 1 | pass 1 | F-STATUS-01 snapshot the snapshot is frozen, has exactly {fishball, guards, set, targets, brand}, fishball on, brand {style} fishball for an absent stored value |  |
| F-STATUS-02 | 1 | pass 1 | F-STATUS-02 snapshot the snapshot carries the guard report when the port is there |  |
| F-STATUS-03 | 1 | pass 1 | F-STATUS-03 snapshot a guards port whose report is still undefined gives guards null |  |
| F-STATUS-BVA-01 | 6 | skip 6 | F-STATUS-BVA-01 change contributed tools line |  |
| F-STATUS-BVA-02 | 1 | pass 1 | F-STATUS-BVA-02 fiber board row fiber ACTIVE (2) and FAILED (3): ok either way, the board never reported |  |
| F-STATUS-DT-01 | 22 | pass 21, skip 1 | F-STATUS-DT-01 rule 1 connected link connected (Connect needs authorization): connected, no control |  |
| F-STATUS-EP-01 | 12 | pass 12 | F-STATUS-EP-01 unusable blank unusable target "blank": the link word, no Connect (rule 1) |  |
| F-STATUS-EP-02 | 3 | pass 3 | F-STATUS-EP-02 an ordinary other bundle fbtest-other-bundle enabled but skipped, or with a failed row, is never reported; nor is the skipped board |  |
| F-STATUS-ST-01 | 2 | pass 2 | F-STATUS-ST-01 Connect needs-authorization → authorizing → authorized → link connected: connect, cancel, none |  |
| F-STATUS-ST-02 | 1 | pass 1 | F-STATUS-ST-02 changed the set stays ok across plugin-manager/changed while the board goes loaded → skipped → failed → loaded; nothing re-emitted |  |
| F-STATUS-ST-03 | 2 | pass 2 | F-STATUS-ST-03 at start a report already overridden at createStatus sends the one notice |  |
| F-STATUS-ST-04 | 2 | pass 2 | F-STATUS-ST-04 already ready app already ready at createStatus: the set is computed |  |
| F-STATUS-STRIP | 6 | skip 6 | F-STATUS-STRIP cancel the strip view |  |
| HOST-DT-03 | 1 | pass 1 | HOST-DT-03 rule 10 standalone: fishball-hosted-settings is never reported missing, even enabled and skipped or failed |  |
| MULTI-STATUS-EP-01 | 3 | pass 3 | MULTI-STATUS-EP-01 connected snapshot.targets is the targets port's list() exactly (connected) |  |
| MULTI-STATUS-ST-01 | 1 | pass 1 | MULTI-STATUS-ST-01 change a target list change is emitted once with the new list; an equal list does not re-emit |  |
| PLAT-DT-02 | 19 | todo 1, pass 18 | PLAT-DT-02 integration rules 1–5 in a real standalone DSH, read through the fishballStatus service — TODO F-WIRE (the status service provided as fishballStatus  |  |
| TOOLS-00 | 1 | pass 1 | TOOLS-00 text toolsNotice names every listed tool, is gentle (not "overridden", not "weaker" / "guarantees") and is not the guards notice |  |
| TOOLS-BVA-01 | 1 | pass 1 | TOOLS-BVA-01 zero no extras (ok report, or manager-tools with []) gives no tools notice and writes no record |  |
| TOOLS-DT-01 | 13 | pass 13 | TOOLS-DT-01 row 1 ok overridden [], extras none, missing []: guards notice none, tools notice none; each at most once; the snapshot carries the report exactly |  |
| TOOLS-EP-01 | 2 | pass 2 | TOOLS-EP-01 another home what one home recorded does not count for another home: the same names are announced there |  |
| TOOLS-EP-02 | 7 | pass 7 | TOOLS-EP-02 a JSON list a malformed record (a JSON list) counts as nothing announced: one notice, no throw, then the record is rewritten to the current extras |  |
| TOOLS-EP-03 | 2 | pass 2 | TOOLS-EP-03 no profileContext (no profileContext) memory only: the same set again gives no notice, a new name one notice, a re-added name none; no record is wri |  |
| TOOLS-EP-04 | 1 | pass 1 | TOOLS-EP-04 snapshot the snapshot's guards equals the report as given, extraManagerTools and missingManagerTools included, across extras / ok / no-extras / miss |  |
| TOOLS-ST-01 | 1 | pass 1 | TOOLS-ST-01 announced set one status: a -> notice; a -> none; a,b -> notice "a, b"; b -> none; ok -> none; a -> none; a,b,c -> notice "a, b, c"; the record is t |  |
| TOOLS-ST-02 | 2 | pass 2 | TOOLS-ST-02 at start a report already carrying recorded extras when the status is created gives no notice and leaves the record as it is |  |
| TOOLS-ST-03 | 2 | pass 2 | TOOLS-ST-03 always rejected a tools notice that keeps being rejected is sent once per refresh that sees the name, never in a loop, and never recorded |  |
| TOOLS-ST-04 | 1 | pass 1 | TOOLS-ST-04 in flight while a tools notice is pending, refreshes with the same extras send no second one and nothing is recorded; once it resolves the record is |  |
| TOOLS-ST-05 | 7 | pass 7 | TOOLS-ST-05 closed in flight, first accepted close() while the first notice is in flight with a new name pending: once the first is accepted, no further notice |  |
| TOOLS-UC-01 | 2 | pass 2 | TOOLS-UC-01 main one extra a report with unannounced extras gives ONE tools notice listing them all (sorted, ", "), then the record holds them as one JSON line |  |
| UC-STATUS-01 | 7 | todo 2, skip 2, pass 3 | UC-STATUS-01 A1 press pressing Connect calls connect.begin(); pressing cancel calls connect.cancel() — TODO E2E-CORE / F-UI (pressing the strip control calls co |  |
| UC-STATUS-02 | 1 | pass 1 | UC-STATUS-02 A3 no pluginManager service: set stays null after app ready and plugin-manager/changed |  |
| UC-STATUS-03 | 8 | pass 8 | UC-STATUS-03 A2 new process a new process (a new DSH start) notifies with another dedupe key; within one process both statuses share one key |  |
| UC-STATUS-05 | 5 | pass 5 | UC-STATUS-05 off a string statusOf(a string) is the frozen fishball-off status; the strip shows one fishball-off line |  |
| UC-STATUS-06 | 2 | pass 2 | UC-STATUS-06 close after close: no emission, no notice, no set recompute, and every port listener disposed |  |
| UIPF-CARD-BVA-01 | 1 | skip 1 | UIPF-CARD-BVA-01 all the tools chip |  |
| UIPF-CARD-DT-01 | 1 | skip 1 | UIPF-CARD-DT-01 all the status card |  |
| UIPF-CARD-EP-01 | 1 | skip 1 | UIPF-CARD-EP-01 control labels the control labels |  |

## test/v3/fishball-core/wire

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| BRAND-CONFIG-DT-01 | 10 | pass 10 | BRAND-CONFIG-DT-01 absent cold start with persisted absent → fishball |  |
| BRAND-CONFIG-ST-01 | 1 | pass 1 | BRAND-CONFIG-ST-01 live each malformed live edit falls back to Fishball; later valid edits still work |  |
| CONN-DT-01 | 6 | pass 6 | CONN-DT-01 board alone only the board mounted → exactly one EventSource, the carrier /api/fishball/page/events; none to /api/fishball/strip, /api/fishball/asks/ |  |
| CONN-ST-01 | 1 | pass 1 | CONN-ST-01 mount one by one, unmount one by one readers mount one at a time and then leave one at a time: one carrier from the first reader until the last leave |  |
| CONN-ST-02 | 1 | pass 1 | CONN-ST-02 last leaves → first comes again the last reader left (carrier closed) → a reader mounts again: one new carrier opens |  |
| live | 1 | pass 1 | live retry after unmask |  |
| MULTI-1-FIX | 6 | pass 6 | MULTI-1-FIX deferred continue across close |  |
| MULTI-ASK-SYS-01 | 1 | fail 1 | MULTI-ASK-SYS-01 answer route and unknown POST /api/fishball/asks/answer {handle of an unknown card} → 404 unknown-target, nothing sent; POST target routes with |  |
| MULTI-ASK-SYS-02 | 1 | fail 1 | MULTI-ASK-SYS-02 two targets, equal approvalId, then removal A and B offer the same approvalId; each target's own mcp__…__ask_user files it → two cards (handles |  |
| MULTI-CONN-DT-01 | 4 | fail 4 | MULTI-CONN-DT-01 cancel A's pending attempt, then cancel; the approval completed late → nothing is saved for A (no grant record), A not authorized by it; B's at |  |
| MULTI-CONN-ST-01 | 1 | fail 1 | MULTI-CONN-ST-01 concurrent A and B begin Connect at once: two pending attempts with distinct state; a second begin on A answers the same URL; completing B firs |  |
| MULTI-CONN-ST-02 | 1 | todo 1 | MULTI-CONN-ST-02 web callback the web callback /api/fishball/connect/callback resolves each concurrent attempt by its own state |  |
| MULTI-CRED-EP-01 | 1 | fail 1 | MULTI-CRED-EP-01 same origin, two targets two targets on one origin: A's token is saved only as fishball-core/token-<A id>-<A epoch>; B's value stays under its  |  |
| MULTI-CRED-EP-02 | 1 | pass 1 | MULTI-CRED-EP-02 one CIMD URL connect.clientMetadataUrl is one global setting: setting it once moves every target's Connect out of metadata-url-missing (no per- |  |
| MULTI-CRED-ST-01 | 1 | fail 1 | MULTI-CRED-ST-01 removal and retirement confirmed setUrl to a new endpoint deletes the old epoch's token record and the new epoch has its own names; confirmed r |  |
| MULTI-EVT-SYS-01 | 1 | fail 1 | MULTI-EVT-SYS-01 same eventId, two targets A and B both deliver eventId X → the manager gets two messages fbe_<handle A>, fbe_<handle B>; each acked only on its |  |
| MULTI-HOST-EP-01 | 2 | pass 2 | MULTI-HOST-EP-01 blank hosted child, dsh-instance-child.targetUrl blank: first target id parent, kind parent, not-set; not removable, URL not editable; remove/s |  |
| MULTI-LIFE-CRED-DT-01 | 5 | fail 4, pass 1 | MULTI-LIFE-CRED-DT-01 row 1 same URL parent connected on E1 (hosted copy bound to E1) → restart with the same instance URL → the epoch is kept, the hosted copy  |  |
| MULTI-LIFE-CRED-ST-02 | 1 | fail 1 | MULTI-LIFE-CRED-ST-02 interrupted retirement restart with the parent already on the current URL and E2, but saved and pending parent records bound to E1 → both  |  |
| MULTI-LIFE-DRAIN-ST-01 | 2 | fail 2 | MULTI-LIFE-DRAIN-ST-01 core switched off two connected targets, then core switched off → after it resolves no request reaches either target and no listen stream |  |
| MULTI-LIFE-DRAIN-ST-02 | 1 | pass 1 | MULTI-LIFE-DRAIN-ST-02 add in flight an add() issued in the same turn as core's close → the close drains it: afterwards no request reaches the new target and no |  |
| MULTI-LIFE-DRAIN-ST-03 | 1 | fail 1 | MULTI-LIFE-DRAIN-ST-03 core back on core switched off and on again in the same DSH: exactly one runtime per target (one open listen stream each), the targets li |  |
| MULTI-LIFE-SAVE-ST-01 | 1 | fail 1 | MULTI-LIFE-SAVE-ST-01 write fails parent connected on E1; the instance changes the URL while core's target store cannot be written → the parent stays listed wit |  |
| MULTI-NAME-DT-01 | 1 | fail 1 | MULTI-NAME-DT-01 duplicates (D07, Q03) A and B advertise Office-DSH → A Office-DSH (null), B Office-DSH (2); A renames to Lab-DSH → B stays (2); C Office-DSH →  |  |
| MULTI-NAME-EP-01 | 1 | fail 1 | MULTI-NAME-EP-01 name from discovery the name is _meta[serverInfo].name from server/discover (not the title, not a top-level serverInfo); identity live; one lis |  |
| MULTI-NAME-EP-02 | 1 | fail 1 | MULTI-NAME-EP-02 identity unsupported a server whose resources/list lacks dsh-agent://identity → identity unsupported; the discovered name is still shown |  |
| MULTI-NAME-ST-01 | 1 | fail 1 | MULTI-NAME-ST-01 rename into an occupied name B (Lab-DSH) renames to A's Office-DSH → B is the later appearance: Office-DSH (2); A keeps Office-DSH |  |
| MULTI-NAME-ST-02 | 1 | fail 1 | MULTI-NAME-ST-02 push and coalescing a rename push triggers rediscovery at once (well under any reconnect); a burst of 5 pushes leads to at most 2 more discover |  |
| MULTI-NAME-ST-03 | 1 | fail 1 | MULTI-NAME-ST-03 rediscover after listen ack the listen stream drops and reopens: core rediscovers after the new acknowledgement and picks up a name changed whi |  |
| MULTI-NAME-ST-04 | 1 | fail 1 | MULTI-NAME-ST-04 transient failure keeps the name a rediscovery that fails transiently keeps the last name and shows identity stale; the next push recovers it |  |
| MULTI-NAME-ST-05 | 1 | fail 1 | MULTI-NAME-ST-05 auth refusal tears down the target revokes every token: the link is torn down (state failed, not connected) and its namespaced tools are withdr |  |
| MULTI-SVC-DT-01 | 1 | fail 1 | MULTI-SVC-DT-01 bridge and attention bridge(plugin, ops, {targetId}) calls reach only that target; a removed target → supports false and unknown-target with not |  |
| MULTI-SVC-EP-01 | 1 | fail 1 | MULTI-SVC-EP-01 status snapshot fishballStatus.snapshot() is {fishball, guards, set, targets: {version: 1, targets}, brand: {style}} with no scalar link/connect |  |
| MULTI-SVC-ST-01 | 1 | fail 1 | MULTI-SVC-ST-01 one manager with two connected targets there is still exactly one manager session and one set of reminder tools |  |
| MULTI-TGT-BVA-01 | 1 | pass 1 | MULTI-TGT-BVA-01 no cap and order 12 targets are all accepted (Q12: no cap) and listed in ascending order; restart keeps every record (id, url, epoch, order) |  |
| MULTI-TGT-DT-01 | 1 | pass 1 | MULTI-TGT-DT-01 remove / setUrl remove/setUrl: unconfirmed → confirmation-required (nothing changes); unknown id → unknown-target; confirmed remove → gone; setU |  |
| MULTI-TGT-EP-01 | 1 | pass 1 | MULTI-TGT-EP-01 standalone empty standalone first run: list() is {version: 1, targets: []}; GET /api/fishball/targets answers the same; apiVersion 2; ui has tar |  |
| MULTI-TGT-EP-02 | 1 | pass 1 | MULTI-TGT-EP-02 add refusals add(): insecure http → target-insecure; malformed / blank → target-invalid; an https URL → {ok, targetId t-<16 base32>}, epoch e-<1 |  |
| MULTI-TGT-EP-03 | 1 | pass 1 | MULTI-TGT-EP-03 view shape before discovery a target added but never connected: every TargetView field; name and serverName null (never URL-derived); state not- |  |
| MULTI-TGT-EP-04 | 1 | pass 1 | MULTI-TGT-EP-04 loopback alias is another endpoint setUrl from http://127.0.0.1:P/… to http://localhost:P/… (two origins, R9) replaces the epoch |  |
| MULTI-TOOL-BVA-01 | 1 | fail 1 | MULTI-TOOL-BVA-01 normative examples names follow the README examples: 办公室-DSH → readable dsh; <b>x</b> → b-x-b; a 200-char name → readable cut to 16 and the na |  |
| MULTI-TOOL-EP-01 | 1 | fail 1 | MULTI-TOOL-EP-01 every exposed tool namespaced the manager sees, per target, exactly mcp__<readable>__<facade>_<12hex> for every exposed K1 tool and the local a |  |
| MULTI-TOOL-EP-02 | 1 | fail 1 | MULTI-TOOL-EP-02 adversarial names stay data a server name holding quotes, a newline, a fake closing marker tag and a role-looking line stays entirely inside th |  |
| MULTI-TOOL-ST-01 | 1 | fail 1 | MULTI-TOOL-ST-01 rename and binding on rename the old names are withdrawn and the new ones offered; a call reaches only its own target; after A renames to B's f |  |
| MULTI-TOOL-ST-02 | 1 | fail 1 | MULTI-TOOL-ST-02 in-flight call stays bound a call in flight on A while A's URL is edited completes on A's original endpoint only; B and A's new endpoint get no |  |
| replacement | 1 | pass 1 | replacement probe after B is cleared |  |
| SESSIONS | 28 | pass 28 | SESSIONS DT only running sessions, as {sessionId, title} |  |
| SESSIONS-WATCH | 25 | pass 24, fail 1 | SESSIONS-WATCH BVA createTargets: 14999 ms reads nothing, 15000 ms reads each connected target once; the snapshot follows |  |
| WAKE-SYS-EP-01 | 1 | fail 1 | WAKE-SYS-EP-01 final message a turn-finished event {sessionId, outcome: completed, finalMessage: {text, truncated}} → its final message text reaches the manager |  |
| WAKE-SYS-EP-02 | 2 | pass 2 | WAKE-SYS-EP-02 persona batched the persona says events arrive batched (one sentence naming events and a batch / together) |  |
| WAKE-SYS-ST-01 | 1 | fail 1 | WAKE-SYS-ST-01 one turn the window set live to 2 s through core's settings; three messages committed together → ONE delivery to the manager holding all three, a |  |
| WAKE-SYS-TOOL-01 | 2 | pass 1, fail 1 | WAKE-SYS-TOOL-01 MCP.tools core's MCP.tools copy has workspacesList: workspaces_list and modelsList: models_list |  |
| WIRE-DT-01 | 1 | pass 1 | WIRE-DT-01 patch inserts main and preserved rows, no V2 rows |  |
| WIRE-EP-01 | 1 | pass 1 | WIRE-EP-01 manifest exports and dependency boundary |  |
| WIRE-EP-02 | 1 | pass 1 | WIRE-EP-02 no cross-side imports anywhere in Fishball packages |  |
| WIRE-EP-03 | 1 | pass 1 | WIRE-EP-03 model seam and core tool tables |  |
| WIRE-SYS | 31 | pass 31 | WIRE-SYS fishball-board+fishball-ui+fishball-core apiVersion and complete public service shape |  |
