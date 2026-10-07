# NI3 directory/role repair: bounded affected execution

Root ran the five commands in `native-runtime-affected-execution/root-execution-freeze.json` exactly once on October7. The approved literal `c6e917b5…` changes the directory fixture's approved-profile snapshot and one disabled-provider assertion, and changes two runtime audit-input reads to use the existing host principal. Original authority checks and test refusal cases are retained.

| Command | Actual outcome |
| --- | --- |
| Parse changed runtime | PASS, exit0 |
| Parse changed directory fixture | PASS, exit0 |
| Affected directory fixture | 7 PASS, 0 FAIL |
| Original disabled-audit lifecycle, first execution | 1 PASS, 0 FAIL |
| Original native chain, first execution | 0 PASS, 1 FAIL: `MEMORY_UNAVAILABLE` during MemoryAdapter construction |

The chain stopped during genuine Cordis installation, before any agent/model operation. Its four planned synthetic streams were not reached. The original first run's two directory failures remain under `native-runtime-author-execution/`; neither those failures nor the earlier passing client/source/build results were replaced or repeated.

Exact runtime source was `4bb9aea5130e420cdcb30ae05e555e1dbfdb664543eed9069ef3c52fa973e71d`; fixture `a9965e0d45c96da3ccd8fb2e87ded9df08dae05876f23aae8279f182fea2b302`; repaired source closure `eb66e4cda383a05e723269b699e0a826bc68fd47f1c1b7f1f8272db2eb487cd1`.

Root freeze is `c8d1b04946f4e805c63551a24b3e4ae3aa27540c307860de30e540fa036bcbfa`; command-results `5900f43b033558562c03b21dedfd9c868c332d8f9728c14f8a2ee9e9a3349ca4`; verification `9042cfc2983e6d897c0036ff747574f9f2f14e46f24109350cb6f04bd09aa2b5`. All91 pinned inputs, all27577 original host files and12 symbolic links were unchanged. Raw stdout and stderr are separate; frozen changed source, fixture, exact repair and closure are retained beside them.

The new source-only [bootstrap root-cause report](native-runtime-bootstrap-memory-rootcause.md) identifies a loading-phase constructor metadata guard mismatch and proposes a constructor-only repair. That later repair and its affected retest have their own freeze and result evidence. This passing directory/lifecycle evidence establishes neither native-chain success nor installed acceptance. All87 AC, original finalCODE and UI acceptance remain HOLD.
