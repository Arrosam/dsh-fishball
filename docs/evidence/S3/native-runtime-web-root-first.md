# First actual runtime Web launch: initialization failure

This is failed actual-host evidence, not a passing fixture, browser test or independent CODE verdict. Root launched the existing official DSH Web0.2.1-alpha.1 with the prepared ten-file candidate on the authorized fixed loopback127.0.0.1:3080, using the separate project-owned synthetic runtime profile. No new dependency, personal setting, credential or external provider was used.

The launch command was `/opt/homebrew/bin/node scripts/runtime-web.mjs`; managed listener approval was granted. Candidate manifest `native-runtime-web-prepared.sha256` has SHA256 `2adf885f0b878a90e4579bcdb7261664ced39f43f2779d6d02ed74598db7ca99`. Owned native childPID46486, wrapperPID46479, launch exec session98634. The runtime selected the intended factory, then failed during public RPC installation:

```text
Error: cannot get property "webServer" without inject
dsh-client-connection/lib/index.js:656:35
installOperatorBridge — src/operator-bridge.mjs:80:37
src/runtime-plugin.mjs:240:16
```

The inner runtime plugin did not declare the public webServer service required by HostConnection's scoped route-registration callback. The outer fixture declared it. Earlier public Context module fixtures did not include WebServer and therefore did not exercise this hosted dependency. The exact corrected public injection contract and a scoped-service registration regression are required before retry; no host capability or authentication guard is relaxed.

Initial smoke `/opt/homebrew/bin/node scripts/runtime-web-smoke.mjs initial 46486` ended with exit1 and the stable code `RUNTIME_WEB_SMOKE_FAILED` (exec session67308). No owner RPC or task admission was reached. Root sent SIGTERM only to owned native child46486 under managed approval. The launch wrapper then completed exit0; this process exit after graceful termination does not turn plugin initialization into a pass. Both exec sessions closed. Root's post-stop `lsof -nP -iTCP:3080 -sTCP:LISTEN` returned exit1 with empty output: no listener remained.

Allowlisted private-file metadata after stop: runtime-key.bin remained a regular nonsymlink32byte0600 file; runtime.sqlite remained a regular nonsymlink139264byte0600 file. auth-record.json, access.json and observer state.json were absent (ENOENT). No key, token, cookie or database content was printed. The same private key/database bytes are retained for the corrected retry; absence of an auth record is reported rather than fabricated as a persisted credential.

The official permission-presets plugin also reported pending service:shell because this no-inference fixture disables shell and tool providers. No tool/model action was dispatched. That diagnostic is preserved and is not corrected by enabling external effects.

Independent fixture probes separately reported WEB-T01 dangling credential-record symlink replacement and WEB-T02 cleanup overriding redacted errors; a nested profile-directory boundary is also under review. They are implementation findings, not sandbox denials. The independent CODE session's earlier platform flag remains separately blocked; no rerouting or final CODE claim occurs. Actual browser rendering and real provider/model behavior remain untested.
