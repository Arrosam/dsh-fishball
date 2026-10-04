# Execution-policy boundary

The supplied managed policy permits workspace-write under task-6 plus temporary directories, read-only inspection elsewhere, and restricts network. Local code/dependency execution remains subject to the available tool sandbox. M1 uses normal use_default execution with existing installed Node binaries and built-in APIs; no dependency installation, escalation or alternate denied-action path is assumed.

The bootstrap author inspected the installed DSH public package inventory for a separate runtime-policy package/surface and found none; no such tool is enabled here. That absence does not waive the managed sandbox or owner restrictions. An actual denied action must stop and be reported precisely.

No live model, paid request, DSH profile/settings/credentials mutation, live account, webhook/chat adapter, fishball personal-data/source read, remote Git mutation or publication is authorized in M1. Public installed host-library imports and explicitly synthetic disposable fixtures are permitted local validation. They cannot establish actual installed-profile/UI/provider acceptance.

Local execution checkpoint after a Desktop disconnect callback: harmless pwd, node -p process.version, git branch/status/remotes completed successfully in the bubbles repo on feat/M1-foundation, Node v22.22.2, no remotes. No uncertain external mutation was retried because of the callback.
