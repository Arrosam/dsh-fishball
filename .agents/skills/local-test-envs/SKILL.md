---
name: local-test-envs
description: Pick, open, refresh, and collect evidence from the isolated local Fishball dev and staging test environments on SSD1.
---

# Local Fishball test environments

For code changes, use `npm run test:changed` or `npm test -w <npm-name>` from the monorepo root. This does not require opening a lab slot. Do not run all repository tests or release integrations during development. See [the root testing guide](../../../TESTING.md).

Use the installed controller, not a worktree script: `/Volumes/SSD1/DSH-TestLab/fb-env`. The three slots are normally left running.

| Slot | Use it for | Parent Web GUI | Connector approval |
|---|---|---|---|
| `dev-1` | Reproduce and develop on a copied checkout; coordinate slot use before replacing another agent's fixture | http://127.0.0.1:46102 | http://127.0.0.1:46103 |
| `dev-2` | A second independent copy, parallel branch, or comparison baseline | http://127.0.0.1:46104 | http://127.0.0.1:46105 |
| `integration` | Test the already-merged local staging checkout; never point it at a feature branch | http://127.0.0.1:46100 | http://127.0.0.1:46101 |

For browser/UI testing, load `browser-skill`. Use `fb-env url SLOT` or the plain parent URL above in a BrowserSkill session explicitly bound to the verified, already connected lab browser profile. If the intended profile is not verified, connected or signed in to the slot, ask the user to confirm the BrowserSkill instance ID, connect the extension, or sign in privately in that profile as needed. Never read or capture the private admission link. Do not fall back to `fb-env open`, Chrome MCP/CDP, Playwright, or a fresh browser profile.

Once signed in, open **Fishball** in the parent sidebar (or **Plugins → dsh-instance → Open Fishball**). Bookmark only the plain parent URL; the child uses a dynamic loopback port, and the approval port is not the Web GUI. Do not use your personal browser profile for lab evidence.

## Commands

```sh
/Volumes/SSD1/DSH-TestLab/fb-env status integration
/Volumes/SSD1/DSH-TestLab/fb-env url dev-1
/Volumes/SSD1/DSH-TestLab/fb-env logs dev-1
/Volumes/SSD1/DSH-TestLab/fb-env restart integration
/Volumes/SSD1/DSH-TestLab/fb-env reinstall dev-1 --source /Volumes/SSD1/GitHub/dsh-fishball/.agents/worktrees/WORKTREE
/Volumes/SSD1/DSH-TestLab/fb-env wipe dev-2
/Volumes/SSD1/DSH-TestLab/fb-env relink integration
/Volumes/SSD1/DSH-TestLab/fb-env cleanup
```

- `create integration` or `create dev-1 --source /absolute/registered/worktree` prepares a missing slot. `start SLOT` then waits for the hosted child and its reserved parent to connect; `stop SLOT` stops only the owned parent and child. `destroy SLOT` is for stopped dev slots only; it never deletes a source checkout or evidence.
- Dev `reinstall` selects a registered monorepo checkout, snapshots its tracked working files (add new source files to the Git index first), removes the Fishball child and its plugins, and starts fresh. Omit `--source` to re-copy the recorded checkout. No source link or worktree is needed to restart the resulting dev copy. Prepared dependency versions must match the selected checkout; when no local `node_modules` is prepared, the lab copies the existing staging dependency tree.
- `wipe` recreates a slot's data and identity, preserving its dev snapshot or integration source and its external evidence. `restart` preserves data. `reinstall integration` resets its child; `relink integration` refreshes live links to the post-cutover monorepo without deleting the child. Restart integration after staging changes; make sure required artifacts and dependencies are already prepared. Status reports the registered/last-started HEAD, not proof that every HMR update ran.
- Agents may restart, wipe, and reinstall plugins in any lab slot without user confirmation. These operations can interrupt another agent's run; coordinate and mark it interrupted. Shell sandbox restrictions still apply; do not loosen them or request a blanket shell exception. A conflict on a fixed port or uncertain process identity means stop and diagnose, never take over.

## Evidence and retention

Store sanitized reports/results/screenshots in `/Volumes/SSD1/DSH-TestLab/evidence/<slot>/<YYYYMMDDTHHMMSSZ>-<git-sha>-<run-id>/`. Note slot, SHA, launch generation, model, and what actually ran. Put an empty `.pin` file in a failed run directory to keep it. Run `cleanup` to remove expired unpinned evidence: dev **7 days**, integration **30 days**. Soft limits are **2 GiB** per dev, **8 GiB** integration, **100 MiB** per run, **5 GiB** total evidence. Check limits before adding data; stop new runs or screenshots if over quota. Cleanup does not auto-wipe environment data, including integration, or remove pinned evidence.

## Isolation and model

Never read, copy, configure, or operate the real `~/.dsh`, `~/.dsh/fishball`, `~/.dsh/profiles/*`, the real Web GUI, or the real DSH/Fishball processes for lab work. Never pair real Fishball to a lab connector or use port 47615. Same-user homes and fixed ports prevent accidental crossover; they are **not** a security boundary for untrusted plugins or shell code. Use only trusted checkouts and synthetic inputs; do not run untrusted workloads here.

All slots use `agnes-2.5-flash` via the OpenAI-compatible `https://apihub.agnes-ai.com/v1`. The secret is seeded from **the configured API key file at /Volumes/SSD1/DSH-TestLab/.credentials.yaml** to each isolated DSH credential store (mode 600); DSH's own provider sync uses the child credential store. Do not read out or put secrets in Git, docs, screenshots, logs, or reports. `/Volumes/SSD1/DSH-TestLab/fb-env probe-model` runs one bounded, isolated DSH tool check. Queue local inference one request at a time. The local Qwen fallback requires the dedicated loopback oMLX service; DSH's ordinary hosted provider sync does not transfer HTTP loopback providers to the child.
