# MiniCPM5 2B local runtime validation — October9

Status: **PINNED_DOWNLOAD_IN_PROGRESS; LOCAL_INFERENCE_NOT_RUN; DF_INTEGRATION_HELD**.

## Authorized scope

The owner asked to revalidate local inference, use installed oMLX if Ollama cannot run, and download **MiniCPM5 2B**, explicitly correcting the older MiniCPM 2B interpretation. Parent handoff at12:16–12:18UTC permits runtime/model metadata checks, one compatible pinned local download and one bounded harmless provider probe if needed. The parent owns any subsequent actual DF/IAB submission, avoiding duplicate inference. No extra implementation/review agents, credentials, account/security changes, alternative models or remote model Python code are authorized.

This is provider readiness work. It does not authorize inspection of the opaque RuntimeStore or override the earlier automatic approval denial. The existing DF preview, its synthetic model/profile, retained task data, both reserved drafts and the full backlog remain unchanged.

## Runtime metadata

At12:20:31UTC, Ollama `http://127.0.0.1:11434/api/version` returned200/version0.40.0 and `/api/tags` returned200/empty local-model list. The exact previously authorized `deepseek-v4.1-flash:cloud` `/api/show` request returned200 with completion/thinking/tools/vision capabilities. These requests do not perform inference. There is **no demonstrated Ollama outage**; cloud execution/accounting was not tested.

Installed oMLX is0.6.2, app build2347, executable `/opt/homebrew/bin/omlx` resolving to `/Users/samuel/.omlx/bin/omlx`; bundled mlx-lm is0.31.3. The existing app/settings identify model root `/Users/samuel/.lmstudio/models` and port1234. Only those allowlisted configuration fields were read; no secrets or personal model contents were inspected. `http://127.0.0.1:1234/v1/models` refused connection. No global service/settings changes are made.

Physical RAM is68,719,476,736bytes (64GiB). Port1235 was available in the normal approved ownership check. Initial sandbox sysctl/bind checks returned permissions errors; they are not evidence of insufficient RAM or an occupied port. Normal bounded execution approval subsequently allowed the same metadata/availability check (`c241ac`).

## Exact artifact and disk plan

Official publisher: [openbmb/MiniCPM5-2B-MLX](https://huggingface.co/openbmb/MiniCPM5-2B-MLX), revision `8a9ad7539ac86281d0ac2b017ba04a5de53fe9a3`. Public/ungated metadata and pinned file sizes were checked before streaming download. This is the publisher's Apple Silicon MLX4-bit artifact; its config uses standard `LlamaForCausalLM`/`llama`, affine4-bit/group64, and has no `auto_map`. No Python model file is downloaded or executed. Compatibility inferred from the format/bundled Llama implementation must still be established by the actual local load/probe.

One owned copy is being downloaded directly into `.runtime/minicpm5-local-2026-10-09/models/MiniCPM5-2B-MLX/`, avoiding a duplicate HF cache. No MiniCPM cache/directory was found in the narrowly checked existing model/cache roots. Total selected nine files:1,426,231,589bytes; `.gitattributes` is omitted. Disk available at download start:3,326,255,104bytes. This leaves about1.9GB before small runtime state; no user files/caches are deleted. Each file is streamed to `.part`, checked against pinned size and hashed, then atomically renamed. Official published weight SHA256 and the previously checked config digest must match.

| File | Expected bytes | Expected SHA256 |
| --- | ---: | --- |
| `model.safetensors` | 1,416,035,216 | `c207798696a4a454e7ac211b25227625466c693335941cee8904fb922f295cc1` |
| `config.json` | 886 | `deb9ca33e863cbc84a9ab7209cd924fc05505dc33270c807d47f1b78fbd53a50` |

Local download metadata and per-file digests live under the ignored owned runtime root. The model is not added to Git or the Library preview archive. The publisher marks the model Apache2.0; this local test does not redistribute it or modify DF's MIT license/notices.

## Planned bounded probe

Use the installed supported foreground `omlx serve` with a new project-owned `--base-path`, only this model directory, loopback1235, concurrency1, enabled memory guard and `--no-cache --no-hf-cache`. This does not start a daemon, modify the user's1234 service or replace DF3091. Read local `/v1/models` and public OpenAPI metadata first. If loaded, submit at most one synthetic completion, temperature0, finite output and finite timeout, without tools/files/accounts. Preserve actual API usage or unknown fields without substituting byte counts. A timeout/unknown outcome is not automatically retried.

The official local Jinja template supports `enable_thinking=false`; it may be used only through a verified public server request field. No speculative global model setting is changed. Provider success alone cannot establish DF durable capture, audit or result delivery.

## Persisting DF blocker

[The frontend validation ledger](FRONTEND-VALIDATION-2026-10-09.md) records the current public synthetic byte-accounting contracts and exact stopped protected search. Automatic approval rejected the focused RuntimeStore accounting/capture grep because trusted instructions require that implementation opaque. Switching Ollama to oMLX does not resolve authoritative API-token accounting/capture compatibility. **No protected inspection, alternative route, real DF task or duplicate model call is performed here.** A specific authorization resolving that restriction remains necessary for the accounting change; a provider-only success must not be labeled a real DF acceptance pass.

## Results

Pending download verification, owned server load and the one bounded provider probe. No inference has been made in this continuation so far. The delivered Library version2, main branch and existing3091 preview remain unchanged.
