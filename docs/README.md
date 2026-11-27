# Documentation index

## Packages

Each package's README says what it does, how it is built and how to test it.

| package | folder | README | tests |
|---|---|---|---|
| fishball-core | `packages/core` | [README](<../packages/core/README.md>) | [tests](<../packages/core/tests/README.md>) |
| fishball-ui | `packages/core/ui` | [README](<../packages/core/ui/README.md>) | [tests](<../packages/core/ui/tests/README.md>) |
| fishball-board | `packages/fishball-board` | [README](<../packages/fishball-board/README.md>) | [tests](<../packages/fishball-board/tests/README.md>) |
| fishball-heartbeat | `packages/fishball-heartbeat` | [README](<../packages/fishball-heartbeat/README.md>) | [tests](<../packages/fishball-heartbeat/tests/README.md>) |
| fishball-taskboard | `packages/fishball-taskboard` | [README](<../packages/fishball-taskboard/README.md>) | [tests](<../packages/fishball-taskboard/tests/README.md>) |
| fishball-amenities | `packages/fishball-amenities` | [README](<../packages/fishball-amenities/README.md>) | [tests](<../packages/fishball-amenities/tests/README.md>) |
| fishball-shared | `packages/shared` | [README](<../packages/shared/README.md>) | [tests](<../packages/shared/tests/README.md>) |
| fishball-test-helpers | `packages/test-helpers` | [README](<../packages/test-helpers/README.md>) | its own `tests/` |
| fishball-integration-core-ui | `packages/integration-core-ui` | [README](<../packages/integration-core-ui/README.md>) | its own `tests/` (release only) |
| fishball-integration-page-ui | `packages/integration-page-ui` | [README](<../packages/integration-page-ui/README.md>) | its own `tests/` (release only) |
| fishball-integration-page-stream | `packages/integration-page-stream` | [README](<../packages/integration-page-stream/README.md>) | its own `tests/` (release only) |
| fishball-integration-amenities | `packages/integration-amenities` | [README](<../packages/integration-amenities/README.md>) | its own `tests/` (release only) |
| fishball-integration-release | `packages/integration-release` | [README](<../packages/integration-release/README.md>) | its own `tests/` (release only) |

## Design and requirements

- [DESIGN.md](<../DESIGN.md>): the decisions in force (V3 §17–§35 and the rules kept from V2).
- [planning/v3-design.md](<planning/v3-design.md>) (§1.0 first) and [planning/v3-requirements.md](<planning/v3-requirements.md>): the V3 design and requirements.
- [planning/v3-multi-dsh.md](<planning/v3-multi-dsh.md>): PLAN-MULTI, several DSH targets.
- [planning/v3-tasks.md](<planning/v3-tasks.md>): the V3 task table.
- [package-layout.md](<package-layout.md>): the packages, their folders and the rules between them.
- [plugins/fishball-taskboard.md](<plugins/fishball-taskboard.md>): the task board's design.
- [spikes/](<spikes/>): the V3 spikes S6, S7b and S7c.
- [../SMART-PROMPT.md](<../SMART-PROMPT.md>): the original brief.

## Testing and release

- [testing/README.md](<testing/README.md>): the rules, the layout, how to run one package, the release run.
- [testing/inventory/](<testing/inventory/README.md>): what the old tests covered and where each case went.
- [testing/failures.md](<testing/failures.md>): every baseline failure classified; the open real bugs.
- `node scripts/pack-v3.mjs`: the release tarballs (the root README's Status section).

## History

[history/](<history/README.md>): the V1/V2 design documents and the documents of the DSH-side packages that left this repository.
