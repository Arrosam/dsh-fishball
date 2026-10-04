# CLIENT C23/C24 uncertainty-fence correction

Root authorized this client-only repair after independent source/bundle counterexamples. Author onboarding_ui, Sol6.1 high. No shared core/runtime/composer/native/provider/facts import or test was executed in this correction. No independent test, first TAP, first source/failure report or historical author manifest changed.

Independent first run:63 tests,59PASS/4FAIL,0skip, exit1. C23 and C24 failed in both source and bundle: after lost capture/finish reply and ordinary task/cached-status readback, truthful uncertainty remained, but the corresponding button remained enabled and the method had no matching uncertainty guard. First native RPC repetition was not executed by that independent run; the observed defect is the typed control/method boundary, not proof of repeated native effects. First raw SHA256 is `f7b08f9a18233ce81bf679b44cb208f8007dd6f3fad980ab1a219bd71b618318`.

The correction adds matching `uncertain==='workerCapture'` and `uncertain==='workerFinish'` refusal to both their methods and rendered buttons. Each method returns false before constructing a new command or invoking RPC. Ordinary refresh/query cannot acknowledge capture or release and leaves those uncertainty fences intact. No retry, fabricated success, stopped/released projection, new confirmation or automatic reconciliation mutation is added. Explicit initial capture/finish behavior is preserved.

Exact pre-repair source/bundle/authored-test snapshots are `client-worker-before-c23-c24.source.txt`, `.bundle.txt` and `.test.txt`, retaining hashes b1862fb610ccaf809982aa2c0f7e6ad01bad536b419636fd57e4a2a7bb40d1cd, d0696c513351774774c37febaafec5c2215fa0688f2fc7554fef4a3a2570869f and 1ceb2f64cf887be15e9c0de37b785e9545ea17e9d4ee4ab495a087f0c92b254c. Prior evidence stays historical.

Node22.22.2 commands, exit0:

- `node scripts/build-client.mjs` and `node scripts/build-client.mjs --check`.
- `node --test test/worker-client.test.mjs`:32/32PASS,0skip, first corrected raw `client-worker-c23-c24-author-first.tap`. Four added source/bundle regression cases test both disabled descriptors and direct method refusal, exactly one mutation call, no acknowledged output/release, and continuing refusal after explicit refresh/query.
- `node --test test/client-features.test.mjs test/client-feature-adversarial.test.mjs test/client-build.test.mjs test/onboarding-client.test.mjs test/onboarding-client-adversarial.test.mjs test/onboarding-client-405-adversarial.test.mjs test/worker-client.test.mjs`:151/151PASS,0skip, `client-worker-c23-c24-author-affected.tap`. These files import only the client/builtins/build script. `test/client.test.mjs` imports shared core/runtime and was deliberately not run during root's core executable lease; its previously held genuine4 result is not a current rerun.

New three-pin source hold: client e11b85e7a861af290b389e4c5b0d9046874f013bdc9c3523cba08f9c393aaa99, bundle a2e37ae3cace27558dbaaae97b928a1b2b5f91f6ed9660348540d4623006a16f, authored test c65cf4333fc34e7b88be6e55396629afee5100e0427e68f3b18737ca01f728bd. Independent affected C23/C24 retest remains the separate functional lane. Actual browser, physical native output/effects, durable cold reconciliation and aggregate integration remain separate required work. CODE/browser/useful-model/full AC/MVP/publication remain HOLD. No Git or external action performed.
