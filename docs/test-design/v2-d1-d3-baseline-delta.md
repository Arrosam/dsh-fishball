# D1–D3 existing-suite baseline delta

Baseline: `5d93891aa41bd9b716faa91306b22095d3b076c2`. Only existing case failures are compared; new schema cases are included in current totals but not baseline totals. TODOs are not passes.

## 0.2.1-rc.5

### baseline

```text
ℹ tests 245
ℹ suites 22
ℹ pass 126
ℹ fail 32
ℹ cancelled 0
ℹ skipped 0
ℹ todo 87
ℹ duration_ms 2791.088292
```

Failed cases:
- XC-BVA-BATCH-BYTES-65535 joined UTF-8 byte size includes multibyte text and blank-line separator
- XC-BVA-BATCH-BYTES-65536 joined UTF-8 byte size includes multibyte text and blank-line separator
- XC-BVA-BATCH-COUNT-1 array count 1 obeys the 1–20 item contract without splitting
- XC-BVA-BATCH-COUNT-19 array count 19 obeys the 1–20 item contract without splitting
- XC-BVA-BATCH-COUNT-20 array count 20 obeys the 1–20 item contract without splitting
- XC-BVA-BATCH-IMAGE-bytes-4194303 image bytes cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGE-bytes-4194304 image bytes cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGE-pixels-4194303 image pixels cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGE-pixels-4194304 image pixels cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGECOUNT-19 image count is bounded per item and validated while skipped
- XC-BVA-BATCH-IMAGECOUNT-20 image count is bounded per item and validated while skipped
- XC-BVA-KEYS-10000 newest-key retention at 10000 accepted notices — file and reloaded duplicate behavior agree
- XC-BVA-KEYS-10001 newest-key retention at 10001 accepted notices — file and reloaded duplicate behavior agree
- XC-BVA-KEYS-9999 newest-key retention at 9999 accepted notices — file and reloaded duplicate behavior agree
- XC-DT-01 Samuel retries an update after queue rejection — pending key retries its reserved identity, only acceptance makes it duplicate
- XC-DT-03 singleton array retains session relay source; singleton overload is preserved
- XC-DT-04 skipImages queues text only without fetching, even without sourceSessionId
- XC-EP-BATCH-01 duplicate texts stay duplicated, extra metadata never enters text, input remains unmodified
- XC-EP-STUB-16 Samuel never mistakes a scoped connector stub for success — bridge refuses ExtensionError/not-implemented
- XC-ST-NOTIFY-HANDOVER Samuel receives the missing handover update after child rows rebuild — pending reservation reuses one message identity
- XC-ST-NOTIFY-RECOVERY Samuel receives the missing recovery update after child rows rebuild — pending reservation reuses one message identity
- XC-UC-02-A1 Samuel continues work with Fishball plugin updates — W0: wake:false is held and joins the next turn
- XC-UC-02-A2 Samuel gets one Fishball update — W0 fixture: X10 wake:true queues while manager is idle
- XC-UC-02-A3 Samuel gets one Fishball update — W0 fixture: X10 wake:true queues while manager is running
- XC-UC-02-E1 Samuel continues work with Fishball plugin updates — W0: a duplicate dedupeKey is answered duplicate and starts no second turn
- XC-UC-02-E2 Samuel retries an update after child rows reboot on the same home — durable key refuses a second notice turn
- XC-UC-02-M Samuel continues work with Fishball plugin updates — W0: wake:true is one notice turn with the plugin source
- XC-UC-04-M Samuel receives three independently sender-framed updates in one queued message in arrival order
- XW-DT-01 with the capability, set sends the value at once
- XW-DT-02 without the capability, nothing is sent
- XW-P-02 a second attention owner gets owner-busy
- XW-ST-01 none → value → reconnect (same value again) → dispose {0,0,null}

### authorized

```text
ℹ tests 279
ℹ suites 25
ℹ pass 147
ℹ fail 45
ℹ cancelled 0
ℹ skipped 0
ℹ todo 87
ℹ duration_ms 537860.416875
```

Failed cases:
- XC-BVA-BATCH-BYTES-65535 joined UTF-8 byte size includes multibyte text and blank-line separator
- XC-BVA-BATCH-BYTES-65536 joined UTF-8 byte size includes multibyte text and blank-line separator
- XC-BVA-BATCH-COUNT-1 array count 1 obeys the 1–20 item contract without splitting
- XC-BVA-BATCH-COUNT-19 array count 19 obeys the 1–20 item contract without splitting
- XC-BVA-BATCH-COUNT-20 array count 20 obeys the 1–20 item contract without splitting
- XC-BVA-BATCH-IMAGE-bytes-4194303 image bytes cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGE-bytes-4194304 image bytes cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGE-pixels-4194303 image pixels cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGE-pixels-4194304 image pixels cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGECOUNT-19 image count is bounded per item and validated while skipped
- XC-BVA-BATCH-IMAGECOUNT-20 image count is bounded per item and validated while skipped
- XC-BVA-KEYS-10000 newest-key retention at 10000 accepted notices — file and reloaded duplicate behavior agree
- XC-BVA-KEYS-10001 newest-key retention at 10001 accepted notices — file and reloaded duplicate behavior agree
- XC-BVA-KEYS-9999 newest-key retention at 9999 accepted notices — file and reloaded duplicate behavior agree
- XC-DT-01 Samuel retries an update after queue rejection — pending key retries its reserved identity, only acceptance makes it duplicate
- XC-DT-02 images.message returns unconfirmed unchanged and never retries or creates a watch
- XC-DT-03 singleton array retains session relay source; singleton overload is preserved
- XC-DT-04 skipImages queues text only without fetching, even without sourceSessionId
- XC-DT-OFF-IMAGES-1 Samuel sends through images.message with watchdog enabled but unregistered/not ready — empty attachments preserve exact wire text and delivered result
- XC-DT-OFF-IMAGES-2 Samuel sends through images.message with watchdog enabled but unregistered/not ready — omitted attachments preserve exact wire text and delivered result
- XC-DT-OFF-message_session Samuel messages a session directly with watchdog enabled but unregistered/not ready — message_session reaches connector unchanged
- XC-DT-OFF-redirect_session Samuel messages a session directly with watchdog enabled but unregistered/not ready — redirect_session reaches connector unchanged
- XC-EP-BATCH-01 duplicate texts stay duplicated, extra metadata never enters text, input remains unmodified
- XC-EP-IMAGE-01 images.message rejects a connector refusal rather than fabricating success
- XC-EP-STUB-04 Samuel never mistakes an unavailable capability for success — attention.set refuses with typed metadata
- XC-EP-STUB-16 Samuel never mistakes a scoped connector stub for success — bridge refuses ExtensionError/not-implemented
- XC-ST-NOTIFY-HANDOVER Samuel receives the missing handover update after child rows rebuild — pending reservation reuses one message identity
- XC-ST-NOTIFY-RECOVERY Samuel receives the missing recovery update after child rows rebuild — pending reservation reuses one message identity
- XC-UC-02-A1 Samuel continues work with Fishball plugin updates — W0: wake:false is held and joins the next turn
- XC-UC-02-A2 Samuel gets one Fishball update — W0 fixture: X10 wake:true queues while manager is idle
- XC-UC-02-A3 Samuel gets one Fishball update — W0 fixture: X10 wake:true queues while manager is running
- XC-UC-02-E1 Samuel continues work with Fishball plugin updates — W0: a duplicate dedupeKey is answered duplicate and starts no second turn
- XC-UC-02-E2 Samuel retries an update after child rows reboot on the same home — durable key refuses a second notice turn
- XC-UC-02-M Samuel continues work with Fishball plugin updates — W0: wake:true is one notice turn with the plugin source
- XC-UC-03-A1 Samuel sends through images.message with watchdog disabled — empty attachments preserve exact wire text and delivered result
- XC-UC-03-A2 Samuel sends through images.message with watchdog disabled — omitted attachments preserve exact wire text and delivered result
- XC-UC-03-M1 Samuel messages a session directly with watchdog disabled — message_session reaches connector unchanged
- XC-UC-03-M2 Samuel messages a session directly with watchdog disabled — redirect_session reaches connector unchanged
- XC-UC-04-M Samuel receives three independently sender-framed updates in one queued message in arrival order
- XW-DT-01 with the capability, set sends the value at once
- XW-DT-02 without the capability, nothing is sent
- XW-EP-03 two scoped clients are independent
- XW-P-01 an operation in the scope list reaches the host, with no new handshake
- XW-P-02 a second attention owner gets owner-busy
- XW-ST-01 none → value → reconnect (same value again) → dispose {0,0,null}

### Added failures
- XC-DT-02 images.message returns unconfirmed unchanged and never retries or creates a watch
- XC-DT-OFF-IMAGES-1 Samuel sends through images.message with watchdog enabled but unregistered/not ready — empty attachments preserve exact wire text and delivered result
- XC-DT-OFF-IMAGES-2 Samuel sends through images.message with watchdog enabled but unregistered/not ready — omitted attachments preserve exact wire text and delivered result
- XC-DT-OFF-message_session Samuel messages a session directly with watchdog enabled but unregistered/not ready — message_session reaches connector unchanged
- XC-DT-OFF-redirect_session Samuel messages a session directly with watchdog enabled but unregistered/not ready — redirect_session reaches connector unchanged
- XC-EP-IMAGE-01 images.message rejects a connector refusal rather than fabricating success
- XC-EP-STUB-04 Samuel never mistakes an unavailable capability for success — attention.set refuses with typed metadata
- XC-UC-03-A1 Samuel sends through images.message with watchdog disabled — empty attachments preserve exact wire text and delivered result
- XC-UC-03-A2 Samuel sends through images.message with watchdog disabled — omitted attachments preserve exact wire text and delivered result
- XC-UC-03-M1 Samuel messages a session directly with watchdog disabled — message_session reaches connector unchanged
- XC-UC-03-M2 Samuel messages a session directly with watchdog disabled — redirect_session reaches connector unchanged
- XW-EP-03 two scoped clients are independent
- XW-P-01 an operation in the scope list reaches the host, with no new handshake

### Resolved failures
None.

## 0.2.2-rc.1

### baseline

```text
ℹ tests 245
ℹ suites 22
ℹ pass 126
ℹ fail 32
ℹ cancelled 0
ℹ skipped 0
ℹ todo 87
ℹ duration_ms 2914.989583
```

Failed cases:
- XC-BVA-BATCH-BYTES-65535 joined UTF-8 byte size includes multibyte text and blank-line separator
- XC-BVA-BATCH-BYTES-65536 joined UTF-8 byte size includes multibyte text and blank-line separator
- XC-BVA-BATCH-COUNT-1 array count 1 obeys the 1–20 item contract without splitting
- XC-BVA-BATCH-COUNT-19 array count 19 obeys the 1–20 item contract without splitting
- XC-BVA-BATCH-COUNT-20 array count 20 obeys the 1–20 item contract without splitting
- XC-BVA-BATCH-IMAGE-bytes-4194303 image bytes cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGE-bytes-4194304 image bytes cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGE-pixels-4194303 image pixels cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGE-pixels-4194304 image pixels cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGECOUNT-19 image count is bounded per item and validated while skipped
- XC-BVA-BATCH-IMAGECOUNT-20 image count is bounded per item and validated while skipped
- XC-BVA-KEYS-10000 newest-key retention at 10000 accepted notices — file and reloaded duplicate behavior agree
- XC-BVA-KEYS-10001 newest-key retention at 10001 accepted notices — file and reloaded duplicate behavior agree
- XC-BVA-KEYS-9999 newest-key retention at 9999 accepted notices — file and reloaded duplicate behavior agree
- XC-DT-01 Samuel retries an update after queue rejection — pending key retries its reserved identity, only acceptance makes it duplicate
- XC-DT-03 singleton array retains session relay source; singleton overload is preserved
- XC-DT-04 skipImages queues text only without fetching, even without sourceSessionId
- XC-EP-BATCH-01 duplicate texts stay duplicated, extra metadata never enters text, input remains unmodified
- XC-EP-STUB-16 Samuel never mistakes a scoped connector stub for success — bridge refuses ExtensionError/not-implemented
- XC-ST-NOTIFY-HANDOVER Samuel receives the missing handover update after child rows rebuild — pending reservation reuses one message identity
- XC-ST-NOTIFY-RECOVERY Samuel receives the missing recovery update after child rows rebuild — pending reservation reuses one message identity
- XC-UC-02-A1 Samuel continues work with Fishball plugin updates — W0: wake:false is held and joins the next turn
- XC-UC-02-A2 Samuel gets one Fishball update — W0 fixture: X10 wake:true queues while manager is idle
- XC-UC-02-A3 Samuel gets one Fishball update — W0 fixture: X10 wake:true queues while manager is running
- XC-UC-02-E1 Samuel continues work with Fishball plugin updates — W0: a duplicate dedupeKey is answered duplicate and starts no second turn
- XC-UC-02-E2 Samuel retries an update after child rows reboot on the same home — durable key refuses a second notice turn
- XC-UC-02-M Samuel continues work with Fishball plugin updates — W0: wake:true is one notice turn with the plugin source
- XC-UC-04-M Samuel receives three independently sender-framed updates in one queued message in arrival order
- XW-DT-01 with the capability, set sends the value at once
- XW-DT-02 without the capability, nothing is sent
- XW-P-02 a second attention owner gets owner-busy
- XW-ST-01 none → value → reconnect (same value again) → dispose {0,0,null}

### authorized

```text
ℹ tests 279
ℹ suites 25
ℹ pass 147
ℹ fail 45
ℹ cancelled 0
ℹ skipped 0
ℹ todo 87
ℹ duration_ms 538172.669625
```

Failed cases:
- XC-BVA-BATCH-BYTES-65535 joined UTF-8 byte size includes multibyte text and blank-line separator
- XC-BVA-BATCH-BYTES-65536 joined UTF-8 byte size includes multibyte text and blank-line separator
- XC-BVA-BATCH-COUNT-1 array count 1 obeys the 1–20 item contract without splitting
- XC-BVA-BATCH-COUNT-19 array count 19 obeys the 1–20 item contract without splitting
- XC-BVA-BATCH-COUNT-20 array count 20 obeys the 1–20 item contract without splitting
- XC-BVA-BATCH-IMAGE-bytes-4194303 image bytes cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGE-bytes-4194304 image bytes cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGE-pixels-4194303 image pixels cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGE-pixels-4194304 image pixels cap applies even when fetches are skipped
- XC-BVA-BATCH-IMAGECOUNT-19 image count is bounded per item and validated while skipped
- XC-BVA-BATCH-IMAGECOUNT-20 image count is bounded per item and validated while skipped
- XC-BVA-KEYS-10000 newest-key retention at 10000 accepted notices — file and reloaded duplicate behavior agree
- XC-BVA-KEYS-10001 newest-key retention at 10001 accepted notices — file and reloaded duplicate behavior agree
- XC-BVA-KEYS-9999 newest-key retention at 9999 accepted notices — file and reloaded duplicate behavior agree
- XC-DT-01 Samuel retries an update after queue rejection — pending key retries its reserved identity, only acceptance makes it duplicate
- XC-DT-02 images.message returns unconfirmed unchanged and never retries or creates a watch
- XC-DT-03 singleton array retains session relay source; singleton overload is preserved
- XC-DT-04 skipImages queues text only without fetching, even without sourceSessionId
- XC-DT-OFF-IMAGES-1 Samuel sends through images.message with watchdog enabled but unregistered/not ready — empty attachments preserve exact wire text and delivered result
- XC-DT-OFF-IMAGES-2 Samuel sends through images.message with watchdog enabled but unregistered/not ready — omitted attachments preserve exact wire text and delivered result
- XC-DT-OFF-message_session Samuel messages a session directly with watchdog enabled but unregistered/not ready — message_session reaches connector unchanged
- XC-DT-OFF-redirect_session Samuel messages a session directly with watchdog enabled but unregistered/not ready — redirect_session reaches connector unchanged
- XC-EP-BATCH-01 duplicate texts stay duplicated, extra metadata never enters text, input remains unmodified
- XC-EP-IMAGE-01 images.message rejects a connector refusal rather than fabricating success
- XC-EP-STUB-04 Samuel never mistakes an unavailable capability for success — attention.set refuses with typed metadata
- XC-EP-STUB-16 Samuel never mistakes a scoped connector stub for success — bridge refuses ExtensionError/not-implemented
- XC-ST-NOTIFY-HANDOVER Samuel receives the missing handover update after child rows rebuild — pending reservation reuses one message identity
- XC-ST-NOTIFY-RECOVERY Samuel receives the missing recovery update after child rows rebuild — pending reservation reuses one message identity
- XC-UC-02-A1 Samuel continues work with Fishball plugin updates — W0: wake:false is held and joins the next turn
- XC-UC-02-A2 Samuel gets one Fishball update — W0 fixture: X10 wake:true queues while manager is idle
- XC-UC-02-A3 Samuel gets one Fishball update — W0 fixture: X10 wake:true queues while manager is running
- XC-UC-02-E1 Samuel continues work with Fishball plugin updates — W0: a duplicate dedupeKey is answered duplicate and starts no second turn
- XC-UC-02-E2 Samuel retries an update after child rows reboot on the same home — durable key refuses a second notice turn
- XC-UC-02-M Samuel continues work with Fishball plugin updates — W0: wake:true is one notice turn with the plugin source
- XC-UC-03-A1 Samuel sends through images.message with watchdog disabled — empty attachments preserve exact wire text and delivered result
- XC-UC-03-A2 Samuel sends through images.message with watchdog disabled — omitted attachments preserve exact wire text and delivered result
- XC-UC-03-M1 Samuel messages a session directly with watchdog disabled — message_session reaches connector unchanged
- XC-UC-03-M2 Samuel messages a session directly with watchdog disabled — redirect_session reaches connector unchanged
- XC-UC-04-M Samuel receives three independently sender-framed updates in one queued message in arrival order
- XW-DT-01 with the capability, set sends the value at once
- XW-DT-02 without the capability, nothing is sent
- XW-EP-03 two scoped clients are independent
- XW-P-01 an operation in the scope list reaches the host, with no new handshake
- XW-P-02 a second attention owner gets owner-busy
- XW-ST-01 none → value → reconnect (same value again) → dispose {0,0,null}

### Added failures
- XC-DT-02 images.message returns unconfirmed unchanged and never retries or creates a watch
- XC-DT-OFF-IMAGES-1 Samuel sends through images.message with watchdog enabled but unregistered/not ready — empty attachments preserve exact wire text and delivered result
- XC-DT-OFF-IMAGES-2 Samuel sends through images.message with watchdog enabled but unregistered/not ready — omitted attachments preserve exact wire text and delivered result
- XC-DT-OFF-message_session Samuel messages a session directly with watchdog enabled but unregistered/not ready — message_session reaches connector unchanged
- XC-DT-OFF-redirect_session Samuel messages a session directly with watchdog enabled but unregistered/not ready — redirect_session reaches connector unchanged
- XC-EP-IMAGE-01 images.message rejects a connector refusal rather than fabricating success
- XC-EP-STUB-04 Samuel never mistakes an unavailable capability for success — attention.set refuses with typed metadata
- XC-UC-03-A1 Samuel sends through images.message with watchdog disabled — empty attachments preserve exact wire text and delivered result
- XC-UC-03-A2 Samuel sends through images.message with watchdog disabled — omitted attachments preserve exact wire text and delivered result
- XC-UC-03-M1 Samuel messages a session directly with watchdog disabled — message_session reaches connector unchanged
- XC-UC-03-M2 Samuel messages a session directly with watchdog disabled — redirect_session reaches connector unchanged
- XW-EP-03 two scoped clients are independent
- XW-P-01 an operation in the scope list reaches the host, with no new handshake

### Resolved failures
None.

## Classification

Added XC-EP-STUB-04 requires the removed attention.set stub. Other added failures exercise send/images/scoped control paths with the unchanged fake host omitting interaction.timerfree; new built-in intentionally refuses ready. These are fixture compatibility deltas, not waived product failures. The same 32 pre-existing case names also fail now, but matching names do not prove matching causes: legacy-readiness rejection can mask earlier durable-queue behavior and unrelated regressions. No modernized copy of the existing fixture was run; this is a material coverage limitation. Only the independently authored capable-peer tests establish the bounded new behavior.

Excluded real-host integration suites were not run: their fixtures spawn DSH. New signal/latch tests supply explicit semantic advertisement without editing those old fixtures.
