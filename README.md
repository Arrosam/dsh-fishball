# dsh-fishball (DF) — initial preview

A native DeepSeek Harness workbench for durable tasks, scoped memory/context and controlled worker/result flows. DSH owns execution, models, tools and permissions; DF owns coordination and encrypted product state. Full DSH quit stops DF. No separate harness or daemon is introduced.

**Start here: [INITIAL-PREVIEW.md](docs/INITIAL-PREVIEW.md).** It contains the as-built module inventory, persistence/migrations, task and cancellation semantics, security, model/configuration boundaries, decisions, limitations and later acceptance checklist. [The work log](docs/INITIAL-PREVIEW-WORKLOG.md) records chronology, exact delivery identity, checks and recovery instructions.

The owner requested this local **0.1.0-preview.1 initial preview** now and accepts incomplete validation. It is not the accepted full MVP or stable release. The default worker uses an existing source-owned deterministic DSH provider: no network/model billing. The requested Ollama cloud path remains blocked/unverified; synthetic results do not establish real inference or model quality.

The packaged native path passed explicit storage setup, one synthetic task/worker execution, result capture/retrieval and worker finish. The initial restart-result defect was corrected: after restarting the same profile, the saved result reopened with identical bytes, artifact digest and source references, without another execution. See the exact [delivery checks](docs/INITIAL-PREVIEW-DELIVERY.md). Bounded actual [UI/task and worker-status/catalogue retests](docs/FRONTEND-VALIDATION-2026-10-09.md) now pass after the render/recovery fixes; full UI acceptance and complete native worker continuation remain open.

## Run on this Mac

Use the already installed pinned DSH Web0.2.1-alpha.1 flat host and Node22.22.2. From the repository:

```sh
/opt/homebrew/opt/node@22/bin/node scripts/initial-preview.mjs \
  --host-root /Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball/.runtime/dsh-web
```

The maintained native app uses `127.0.0.1:3091`, a new `df-initial-preview` profile and this package's `.runtime/initial-preview` state. Do not precreate that state directory; the launcher creates its ownership marker. It refuses unrelated existing state. Only its own profile is reused on restart. Ctrl+C quits the owned host and retains your tasks.

Authentication is private: `.runtime/initial-preview/private/current-launch.json` records the current local access-file path. The authenticated URL stays in that private file and is handed to the supported browser locally; do not paste it into work records. A plain authentication-required page is not connected UI evidence. Port3080 and its old QA profile are untouched.

For an extracted artifact, run the same script with the absolute existing host root. The archive does not include/install the host or run lifecycle scripts. `BUILD-METADATA.json` carries the exact source commit/member hashes; the adjacent `.sha256` validates the archive.

## Build a local artifact

```sh
/opt/homebrew/bin/python3 -I scripts/package-initial-preview.py \
  --commit <exact-40-character-source-commit> --date 2026-10-08 \
  --output /absolute/new-directory/dsh-fishball-initial-preview.tar.gz
```

The output directory must exist and the destination must be fresh. The [delivery record](docs/INITIAL-PREVIEW-WORKLOG.md) has the exact produced package/hash and complete reproducible command including selected public contracts. Packaging is closed and deterministic; private state, dependencies, credentials and historical fixture directories are excluded.

## Project records

**[Full product backlog and remaining-work index](docs/PRODUCT-BACKLOG.md)** links the complete approved plan, all18 ticket cards,82 original plus5 chat-contract criteria, scope amendments, implementation/validation debt and newer evidence. It distinguishes committed records from reserved drafts and the unavailable original DOCX/PDF binaries.

[AGENTS.md](AGENTS.md), [workflow](docs/development-workflow.md), [decisions](docs/decisions.md), [three-stage mapping](docs/three-stage-development.md), [tickets/BUB aliases](docs/tickets/README.md), [traceability](docs/acceptance-traceability.md) and [acceptance debt](docs/evidence/acceptance-debt.md) preserve the full agreed scope. Every ticket's development code/test review remains separate from runtime independent audit. Incomplete, failed and unrun checks remain visible; initial delivery does not promote them to PASS.

The owner chose [MIT](LICENSE); [notices](THIRD_PARTY_NOTICES.md) and [fishball provenance](docs/fishball-provenance.md) describe the translated memory subset and separately pinned host. No personal fishball files are automatically imported or shared. The ledger is authoritative; summaries cannot authorize work.

Git remains local. Intended eventual public target is Arrosam/dsh-fishball. No remote, push, publication, stable release, OAuth expansion or denied cloud-call retry is part of this initial delivery. Keep granular working branches and reserved user drafts. The [October8 delivery amendment](docs/owner-initial-preview-2026-10-08.md) supersedes earlier full-acceptance-before-initial-delivery wording only for this local initial preview.
