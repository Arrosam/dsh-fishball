# bubbles

A native DeepSeek Harness (DSH) personal-assistant plugin, currently in local staged development. DSH owns tools, models, permissions and agent execution; bubbles owns bounded coordination and durable product state.

## Current milestone

M1 foundation covers bounded BUB001, BUB003, BUB006 and the minimum BUB012 admission controls. It is not the complete MVP. The owner authorized installing the latest official DSH Web in project-local isolation and testing its loopback browser/profile. No real model invocation, live chat/webhook account, personal profile/credential change or publication is authorized in M1.

The implementation is frozen at `1072381` on local `feat/M1-foundation`: 109 tests pass, with actual Web-profile reload/restart/stop evidence. Aggregate M1 acceptance is held because both permitted browser surfaces block loopback with `ERR_BLOCKED_BY_CLIENT`; see [current validation](docs/evidence/M1/validation.md). Local main remains the setup baseline until this gate is resolved and the reviewed squash merge can occur.

The full proposed preview MVP spans every ticket in [the local backlog](docs/tickets/README.md). All stages require independent development code/test review and actual supported functional validation. UI stages additionally require actual visual validation.

## Development

Read [AGENTS.md](AGENTS.md), [the workflow](docs/development-workflow.md), [M1 acceptance](docs/milestones/M1-foundation.md) and [the contracts](docs/foundation-contract.md) first. This is a new standalone local Git repository, separate from Hydrogen and fishball.

License selection and redistributed fishball licensing remain owner decisions. No LICENSE is selected, no fishball source is copied, and no remote is configured. Future releases default to preview; stable needs an explicit owner designation.

## Local verification

The current target is exact **official DSH Web 0.2.1-alpha.1**, the newest published official preview verified on 2026-10-04. [Compatibility](docs/compatibility.md) explains why the newer alpha is selected even though npm's `latest` tag still names an older release candidate. The host is acquired with reviewed lifecycle scripts disabled into project-controlled isolation; its exact dependency lock and setup evidence are recorded in [host evidence](docs/evidence/M1/host-interface.md). Shell Node 22.22.2 is the development runtime. The ledger uses Node built-ins.

```sh
npm run host:setup
npm run check
npm test
npm run host:smoke
```

`host:setup` is the explicit downloader and uses the tracked lock with all install scripts disabled. Launch/tests do not download dependencies. `test:host` is an alias for the same Node 22.22.2 suite. The syntax gate checks ESM directly; no transpilation/build dependency is required. Tests use temporary stores, synthetic identities and mocked effects. Real public Cordis fixtures and actual isolated Web-profile/browser checks are reported separately. Native identity/operator bridges remain unavailable and dispatch defaults deny.

For the authorized local host fixture, run `npm run host:web`, then `npm run host:profile-smoke` in another terminal. It binds only `127.0.0.1:3080`, sets separate project-local DSH_HOME and DSH_AGENTS_HOME, disables accounts/inference, and keeps synthetic browser access private. Ctrl-C stops the owned host. Managed approval may be required for registry acquisition or loopback listening; a rejected action must stop. Browser automation currently blocks that URL, so rendered UI is untested. All validation children are stopped in the delivered workspace.

Old Desktop evidence is retained in [the historical record](docs/evidence/M1/historical-desktop-de1097e.md); it does not establish current compatibility. No backward compatibility shim or Electron/native-shell acceptance is part of this baseline. Future DSH breaking updates will be assessed explicitly before changing the pin.

The owner cancelled `dsh-std` adoption. [Targeted rollback](docs/evidence/M1/rollback-dsh-std.md) confirms no active standard dependency, import or requirement remains.

See [the exact host matrix](docs/evidence/M1/host-interface.md), [core contracts](docs/evidence/M1/core-design.md), [independent code review](docs/evidence/M1/code-review.md), [ISTQB review](docs/evidence/M1/test-review.md) and [explicit waves](docs/waves.md). Full source-ticket and MVP acceptance remain pending.
