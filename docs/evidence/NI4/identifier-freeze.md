# NI4 trusted-label correction decision

Root read and verified [the author correction](identifier-addendum.md) SHA256 `eb45f5a54b7d7773154b189dd7e9268828e63b993d496f56c82b0010f2e6f837` and [the separate independent design](identifier-test-addendum.md) SHA256 `a40ede17988e763e4c36a4ef55f8227a83b014a6bdc964500ee9f906ac7558aa`.

The existing raw caller-ID validator correctly excludes `/`. The affected product-owned fixed labels must instead use the existing raw UTF8 SHA256 helper, preserving the digest of each exact constant. Root grants this narrow correction in the already-authorized new module and dedicated authored tests. The independent design supplies all four exact golden values and six planned families. It does not broaden caller input, change persisted identity, remove negative assertions or certify actual-store/native behavior.

First authored failure remains retained; later source holds must bind the corrected module/test bytes and actual test results. Original contract, clock and pair documents stay unchanged. CODE/browser/full acceptance remains HOLD.
