# bubbles

A native DeepSeek Harness (DSH) personal-assistant plugin, currently in local staged development. DSH owns tools, models, permissions and agent execution; bubbles owns bounded coordination and durable product state.

## Current milestone

M1 foundation covers bounded BUB001, BUB003, BUB006 and the minimum BUB012 admission controls. It is not the complete MVP. No real model invocation, chat integration, webhook account, profile installation or publication is authorized in M1.

The full proposed preview MVP spans every ticket in [the local backlog](docs/tickets/README.md). All stages require independent development code/test review and actual supported functional validation. UI stages additionally require actual visual validation.

## Development

Read [AGENTS.md](AGENTS.md), [the workflow](docs/development-workflow.md), [M1 acceptance](docs/milestones/M1-foundation.md) and [the contracts](docs/foundation-contract.md) first. This is a new standalone local Git repository, separate from Hydrogen and fishball.

License selection and redistributed fishball licensing remain owner decisions. No LICENSE is selected, no fishball source is copied, and no remote is configured. Future releases default to preview; stable needs an explicit owner designation.
