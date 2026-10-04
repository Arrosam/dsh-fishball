# Pinned native Connection dependency reproducer and public resolution

The unchanged default Connection provider reproduces the missing WebServer dependency. A real supported profile-entry injection resolves this through the original public Loader and original Connection module, without a wrapper, upstream patch or alternative transport. This is a no-listener module proof of the Connection installation boundary; it is not normal actual-process/browser acceptance, production secret-store acceptance, complete df installation or MVP readiness. The earlier synthetic wrapper success remains diagnostic only.

## Minimal reproduction and smallest resolution

The executable [native-connection-reproducer.test.mjs](native-connection-reproducer.test.mjs) uses exact installed public Cordis, Loader, Connection.Config/apply, the actual CredentialProvider extension interface with fresh synthetic JSON0600 backing, and actual WebServer constructor/register. It never loads WebServer as a class plugin or invokes Service.init/listen; server.server must stay undefined. All writes are disposable mkdtemp files. It starts no host, HTTP client, browser, provider, model or tool and changes no installed file, owned profile, credential, global environment or frozen15-entry correction file.

Case1 loads the unchanged official Connection directly. Its declared inject array is ['credentials']. A consumer declaring both connection and webServer still fails through public connection.rpc.handle('/df-reproducer', handler), with `cannot get property "webServer" without inject`; there is no new route or handler invocation. Public rpc-host.d.ts declares the underlying register private, and no private method/reflection/tracing symbol is accessed.

Case2 constructs the actual public in-memory Loader, whose write() is an existing no-op, then uses its exported typed create method with ordinary entry metadata:

```js
await ctx.loader.create({
  name: originalConnectionPackageEntry,
  inject: ['webServer'],
  config: { trustedHosts: [] },
});
```

The imported namespace is object-identical to the original official module; Config/apply remain object-identical; original exported inject remains ['credentials']; the resulting public plugin Fiber.inject contains exactly credentials+webServer. This is the Loader's supported entry injection, not a plugin wrapper or a change to exports. The original package name/browser client metadata is retained. Native BrowserAuth token exchange yields its original clean303 and private cookie; original OperatorPeer admission gives anonymous401/cross-origin403 and one authenticated handler invocation. The response retains native server-response type, original rpcId and result shape. Endpoint/envelope mismatch is rejected before the handler. Duplicate channel registration rejects without replacing the existing route. Consumer disposal removes its route, and provider removal removes /api after the actual retained public fiber settles.

The minimal fixed-loopback project profile override is:

```yaml
- id: connection
  inject: [webServer]
  config:
    trustedHosts: []
```

The name is deliberately omitted, so the existing official `@deepseek-ai/dsh-client-connection` row remains selected. Required credentials is merged from the original plugin declaration. This override supplies a complete closed-loopback config and removes dependency on the official dynamic trustedHosts expression. For a profile retaining the official `ctx.webRuntime.trustedHosts` expression instead, preserve its existing entry dependency and add WebServer:

```yaml
- id: connection
  inject: [webRuntime, webServer]
```

The latter is source-grounded preservation guidance; the exact proven plain metadata vector is inject:[webServer], config:{trustedHosts:[]}. Do not broaden loopback binding or configure additional trust authorities for this test. Actual CLI/profile layering and browser/owner RPC must still be tested separately after root authorizes a fresh normal-profile candidate. No owned profile is edited here.

## Why the other exported paths are not the preferred fix

Case3 uses the unchanged default Connection and native shared /api route. Public rpc.intercept('/api', matches, handler) does not require generic channel WebServer registration and preserves native decoded peer/framing, but the implementation permits exactly one interceptor for the entire channel. A second namespace matcher rejects even when endpoints do not overlap. The official TypertGateway already registers that interceptor. Replacing it would take over native host traffic; that is excluded, not a supported product setup fix.

Public fetch.register accepts an exact path below /api, explicit GET/HEAD/POST methods and buffered/streaming body policy. It composes before the shared interceptor and retains native physical admission. A reserved synthetic /api/df-reproducer/read GET can coexist with the interceptor: anonymous401/origin403 happen before its callback, authenticated GET returns its own response, POST falls through, and disposal removes only the exact contribution while the shared RPC remains working. Exact path collisions reject even if methods differ. This is independently demonstrated with real native route handlers on synthetic streams. Its callback receives Request, not the decoded RPC endpoint/payload/Peer, and owns its own Response. Adopting it for the current product bridge would introduce a new payload/framing/peer-binding protocol and client route change; it is unnecessary once public profile injection works and is not proposed as an alternate browser transport.

No TypertGateway implementation or installer is substituted. The single-owner collision proof uses the exact native Connection implementation; the default host ownership conclusion additionally comes from the exact installed Gateway source. Full Gateway/provider/Remote activation is not credited by this bounded test.

## Exact public source provenance

The runtime is existing project-pinned DSH Web0.2.1-alpha.1, Cordis4.0.5-alpha.1, Loader1.0.6-alpha.1 and Node22.22.2. Package repository fields point to official https://github.com/deepseek-ai/deepseek-harness, packages/client/connection and vendor/loader. Source bytes, not moving upstream master, are the reference. Test startup verifies all below except the read-only Gateway source, whose hash is independently recorded here.

| Installed public file under .runtime/dsh-web/node_modules/@deepseek-ai | SHA256 | Relevant contract |
| --- | --- | --- |
| cordis/lib/index.js | 6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e | declared dependency and traced service semantics |
| cordis-plugin-loader/lib/index.js | 638b9ad360e01236120772323f80a65570c4f3f42f4cfc6243330241025b6d72 | lines627–632 merge EntryOptions.inject into original plugin Fiber.inject |
| cordis-plugin-loader/lib/types/config/entry.d.ts | 047a95a352588e566336593969e4a3a7164b3a6ef1bd0ca16a1eb6b766b1c6a5 | EntryOptions.inject explicitly required services/intercept config |
| dsh-client-connection/lib/index.js | 3950f524aed44e28240140a254cd928ea40eba8e2d04cc8fd04f92a687f5c91d | lines573–579 rpc getter;643–656 native channel registration;658–671 single shared interceptor;798 original credentials dependency;820 native Web child scope |
| dsh-client-connection/lib/types/rpc.d.ts | 3ca86c027408eb2dd6f1aa6efba0778b0f14802d638fc2f66bced8c5e698b0a4 | exported rpc.handle/intercept/fetch.register/Peer/framing contracts |
| dsh-client-connection/lib/types/rpc-host.d.ts | 4655fdfdef83f155b6aa8d8240b8ae74972ddcc185e8873efde7b819fc0e7426 | public service/Config contracts; register is private |
| dsh-host-webserver/lib/index.js | 6efea1375eadeff62d5cfb6d1f515ff75a939d40405a62e5d138e8e7a6b18df5 | constructor/register without calling separate Service.init/listen |
| dsh-api-gateway/lib/index.js | 12489aafd3be30c606824f52b45f682c42f95448db89f2458bba87fa944a50c0 | lines623–625 official gateway owns /api interceptor |

The existing lock resolves Connection0.2.1-alpha.1 to `https://registry.npmjs.org/@deepseek-ai/dsh-client-connection/-/dsh-client-connection-0.2.1-alpha.1.tgz`, integrity sha512-y4O4Ryj4vlM08v4XCU6Pb0eaYIbq4jmRXWR4Xd4veUEKXlKzIhoBxbHu6Vm30sOrAmaDjCbFhkuEmEvHoxgjcw==. Loader1.0.6-alpha.1 resolves to `https://registry.npmjs.org/@deepseek-ai/cordis-plugin-loader/-/cordis-plugin-loader-1.0.6-alpha.1.tgz`, integrity sha512-S+3ygx3cyoA/uvcX8hpWf+FnNlygO2pE3BgLMC0Y+vss3SHmGPPC/gfELBQFu0WPRa4ieE0ZRdTk0FLW12e1Eg==. No new download/install or source patch occurs.

## Reproduction, outcome and limits

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin node --test docs/evidence/S3/native-connection-reproducer.test.mjs
node --check docs/evidence/S3/native-connection-reproducer.test.mjs
shasum -a 256 -c docs/evidence/S3/native-runtime-web-corrections.sha256
```

Final3/3 PASS,0skip is retained in native-connection-reproducer-final.tap; syntax passes; all15 previous correction hashes remain unchanged. First2PASS/1FAIL and intermediate2PASS/1FAIL outputs are retained in native-connection-reproducer-first.tap and native-connection-reproducer-fixed.tap. Both failures happened after the successful Loader/native admission assertions: the initial oracle assumed Loader.remove(id) + Loader.await() waits for the removed entry's deferred disposal, but remove returns void and removes it from the active task list. A first attempted explicit consumer-unregister adjustment addressed the wrong step and did not change the failure. Final test waits on the retained exported entry.fiber.dispose() after remove; the unchanged route-absence assertion then passes. No business/native admission predicate is weakened.

Material setup implication: consumers must declare their Web dependency, and the user-owned project profile must also declare WebServer for its original Connection provider entry. The supported profile override resolves this pinned dependency defect without changing global DSH, package exports, native RPC or auth. Product RuntimePlugin still requires trusted private identity/key/model/environment/tool/policy composition; the package foundation default is not the fully configured runtime. A connection-only resolution does not make the application turnkey or satisfy missing production settings, model/provider/UI acceptance or final independent CODE review.

Proposal before any readiness claim: root may authorize replacing only the synthetic profile's diagnostic wrapper row with the official name-preserving entry injection, create a fresh immutable manifest, independently retest, and rerun the same isolated actual process/auth/intake/context/dedup/quit/restart oracles. Until that happens, existing wrapper-backed successes are diagnostic only; ordinary default-host AC, actual normal-profile compatibility, browser/visual behavior and MVP readiness remain HOLD. This report introduces no harness, alternate transport, upstream patch, new provider or broader product scope.
