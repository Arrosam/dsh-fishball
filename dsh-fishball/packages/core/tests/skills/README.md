# fishball-core tests: private Skills

Core's private Skills modules, `src/manager/skills.js` (`registerPrivateSkills(manager, {home})`, the six
`private_skill_*` tools, the private provider and the S4 prompt section) and `src/manager/skills-store.js`
(the confined store), tested black box from S1–S8, the SK-SEAM decisions 1–4 and Fishball's answers
Q1–Q6 (docs/test-design/private-skills.md). Entry file: [skills.test.mjs](<../skills.test.mjs>), registered
once on the current DSH. Ported from the legacy `test/private-skills/` (sk-*.test.mjs and support/).

| file | technique | ids |
|---|---|---|
| [uc.mjs](<uc.mjs>) | Use Cases | SK-UC-25…28, SK-UC-LIFE-*, SK-UC-UI-M |
| [ep.mjs](<ep.mjs>) | Equivalence partitions (+ native-oracle premises `-N`) | SK-EP-19…22, SK-EP-*-N |
| [bva.mjs](<bva.mjs>) | Boundary values (+ `-N`) | SK-BVA-12-*, SK-BVA-D/B/C-*, SK-BVA-12-*-N |
| [dt.mjs](<dt.mjs>) | Decision tables | SK-DT-09-*, SK-DT-01…04-* |
| [st.mjs](<st.mjs>) | State transitions (+ `-N`) | SK-ST-09…12-*, SK-ST-*-N |

## How it is observed

- [harness.mjs](<harness.mjs>): an in-process Fishball child built from the current DSH's real public
  services (Cordis, SkillRegistry, ToolsService, SystemPrompt, a read-only SandboxedFileSystem, a recording
  approval service), with core's modules imported through `fishball-test-helpers/bind`. The manager is one
  `createScope` generation; workers are other scope keys.
- Observation points: tool results, the registry per scope, tool visibility per scope, the files under a
  fixture home in the run's temp directory, a filesystem trace ([fs-trace.mjs](<fs-trace.mjs>), wraps
  `node:fs`), and the **native oracle** ([native-oracle.mjs](<native-oracle.mjs>)): the current DSH's own
  `isSkillName` / `isModelInvocable` / `FileSystemSkillProvider` over one root, which defines
  "native-loadable". The `-N` rows check the oracle's premises themselves.
- One scenario per behaviour ([scenarios.mjs](<scenarios.mjs>)), shared by every id whose oracle it is.

## Not here

- SK-UC-25-M, SK-UC-25-E2, SK-DT-09-R5 (old `todo`): their oracle is a live manager→worker delivery or the
  worker send gate, not the Skills modules; the observable halves run in SK-EP-19-06/07, SK-UC-25-A2,
  SK-UC-UI-M.
- SK-ST-12-T4's overlay half: the hosted child's `launchOverlay` (leaves `<child home>/skills` out of the
  stock skill rows) was dsh-instance's and moved to the dsh-fishball-instance repository (6b7c53bf). Core's
  half (no worker, preset or global view gains the provider or tools) runs.
