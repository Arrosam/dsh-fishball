## NR-OLLAMA-RESP01: exact-model cloud response compatibility

The owner's new direct action-time approval passed the supported execution approval review. The original six-position command executed once. One request returned HTTP200, then the adapter recorded `OLLAMA_INVALID_RESPONSE`, `local_failure`, remote outcome/billing unknown and uncertain hold. R02–R06 were not run. The original context disposal resolved; attempt markers, reserved/consumed positions, source freeze and private observations remain immutable. There is no automatic replay of R01.

Official Ollama v0.40.0 routes.go2748–2756 uses the base model name for explicit-cloud requests; cloud_proxy.go153–160/210–224 forwards upstream response bytes. The current adapter requires its response model to equal the local `:cloud` request spelling. That excludes a documented legitimate response, but the historical R01 observation does not identify which of its five response predicates failed.

Bounded source/test criteria, mapped to BUB006/011/012/013:

1. Keep the requested provider, exact local endpoint and requested model `deepseek-v4.1-flash:cloud` unchanged. Accept only that exact response spelling or the pinned `deepseek-v4.1-flash` base spelling for this one route. No arbitrary alias normalization, other model, fallback or retry.
2. Preserve completed-response, assistant role, error, tools, thinking, content/byte, finish, token/usage, original loop/admission/currentness and timeout checks. An accepted response name alone supplies no completion, usage, billing, grant or result authority.
3. Record only finite allowlisted response-shape/refusal diagnostics. Never retain upstream error text, content, thinking, headers, tokens, credentials or arbitrary response values in diagnostic facts.
4. Preserve the original executed capsule and uncertain outcome. Implement the corrected provider in a separate successor; retain exact before/after source and literal.
5. Separate independent code and ISTQB reviews; root executes bounded offline response-name/shape regressions first. No live call is part of the offline development unit. Any subsequent live case is separately frozen and finite under the new exact-model testing authorization; quota errors stop it.

Primary basis: https://raw.githubusercontent.com/ollama/ollama/v0.40.0/server/routes.go, https://raw.githubusercontent.com/ollama/ollama/v0.40.0/server/cloud_proxy.go, https://docs.ollama.com/api/chat and https://docs.ollama.com/cloud. The historical HTTP200 result must not be retrospectively promoted to a completed/validated inference.

