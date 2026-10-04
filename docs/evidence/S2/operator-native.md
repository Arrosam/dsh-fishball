# Native operator boundary development evidence

Status: coherent module evidence; independent review is in progress. This is not browser, live authentication, worker inference, full Stage2 acceptance or release evidence.

Root implementation: `src/operator-bridge.mjs`, `src/runtime-plugin.mjs` and their two test files. Exact supported source is the project-pinned official `@deepseek-ai/dsh-client-connection@0.2.1-alpha.1`, using its public `HostConnectionService`, connection-owned `OperatorPeer` and `connection.rpc.handle` API. All calls stay in the host's public Connection admission path. The plugin owns `/bubbles-rpc` with `v1/` endpoints; it does not occupy the official single-owner `/api` interceptor.

The factory takes trusted same-process identity, encryption-key and permission callbacks. It captures scope at native load, privately binds owner/coordinator/host handles and publishes only diagnostics on `ctx.bubbles`. Owner operations are private closures behind the exact admitted operator peer. Payload role, scope, approval flags, raw store handles and model text cannot create authority. Missing callbacks deny before storage opens. Host permissions default to denial; asynchronous `ApprovalService.request` cannot substitute for pre-create admission because it requires an open native turn.

Module checks on Node22.22.2:

- `node --test test/operator-bridge.test.mjs`:4 tests passed. Exact fourth-argument peer identity, unknown endpoints, bounded JSON descriptor capture, getter/proxy/prototype/sparse input rejection, abort ordering, immediate unload fence and stable error projection.
- `node --test test/runtime-plugin.test.mjs`:2 tests passed. Actual public Cordis, SessionStore, ApprovalService and HostConnectionService, native RPC framing and Host/Origin fence, real encrypted RuntimeStore, duplicate ingress, captured scope, malicious payload rejection, secret rejection, metadata-only export, reopen and unload.

The public Connection fixture uses a private synthetic BrowserAuth double and captured Node request/response streams. It creates no listener, browser, credential, provider or model stream. Rejection401 tests the injected authentication double; rejection403 uses the official Host/Origin fence. It does not verify real browser cookies or production pairing. Initial native-fixture cleanup used nonexistent `Context.dispose`, causing two hook failures; cleanup was corrected to public `Context.fiber.dispose`, followed by a clean2/2 rerun. No assertions were removed.

Independent finding S2-CR01 was repaired: uncertain liveness (Promise/object/string/exception) now fails closed unless `isAlive() === true`. Root regressions passed and the independent reviewer confirmed closure; final frozen-tree retest remains required.

Runtime entry activation and composition with worker/event/client modules remain development integration work. The default entry still retains the W1 reference facade until the complete runtime composition is reviewed. Durable key/identity provisioning, production policy choices, real model catalog readiness, live inference and full UI/browser validation are separate gates. No live execution or final acceptance is claimed here.
