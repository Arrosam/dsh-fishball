# Cancelled dsh-std discovery and targeted rollback

Historical decision only. The owner first named `dsh-std`, clarified that identity/requirements had to be verified before changes, then explicitly withdrew adoption and requested full rollback. No standard-specific dependency, code refactor, configuration, manifest, ticket/AGENTS/workflow requirement or executable test was introduced. The verified canonical research was not turned into a product requirement.

## Actual introduced scope

- A temporary task-plan discovery step and agent investigation; removed from the current plan and stopped.
- Six ignored project-local scratch files under `.runtime/npm-metadata`: `std-metadata.mjs` and `std-{core,manifest,composition,lifecycle,adapter-dsh}.json`. These were a public read-only metadata helper and responses; no package code or install script ran. All six were precisely deleted.
- The code audit's discovery-pending paragraph; its author replaced it with a historical cancellation note, with no active standard gate.
- No `docs/standards` directory, `dsh-plugin.json`, standard adapter, standard tests, installed namespace, package/lock changes or standard implementation commit exists. No broad reset/revert or removal of general tests was needed.

## Verification

Root inspected all branch commits and actual working diffs, and scanned `src`, `scripts`, `test`, `AGENTS.md`, README, contracts/workflow/tickets and package manifests. Standard-specific executable/import/dependency/requirement matches were absent. Both the tracked and installed official Web manifests/locks have zero `@dsh-std/*` or unscoped `dsh-std` dependency entries. The exact installed DSH pin remains `0.2.1-alpha.1`. All six scratch paths are absent after deletion.

Separate `/root/code_audit` and `/root/istqb_review` sessions independently confirmed there were no standard-specific source, dependency, requirement or test changes to revert. Existing Cordis `~standard` / Standard Schema validation and its security regressions are unrelated native interfaces and were retained. The independent general/direct-Web suite previously passed 81/81; final impacted-suite checks will be recorded with the frozen Web foundation snapshot in [validation](validation.md).

This cancellation is recorded by a normal local logical commit. Latest official Web adaptation, host-neutral ledger fixes, useful general tests and granular feature history are preserved. There is no active standard-conformance acceptance requirement.
