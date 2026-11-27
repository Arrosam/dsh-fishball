# fishball-core tests: package

What core's own published files say about its place among the packages (R-CORE HOST-EP-03 rows 1 and
4; R-ARCH-05/08/10, R-BND-01, R-FB-01, DESIGN §20): core's manifest (name, dsh bundle and client, its
dependency on fishball-shared, no DSH-side package), DSH's own bundle inspection of core's folder, its
bundle patch as the current DSH parses it (the guard rows, the main row beside the kept rows, no V2
row, no row or module of the instance), no import of the DSH side in its shipped source, no
`src/slim/`, and its own settings page marker. Static only; no product module is loaded. Entry
[../package.test.mjs](<../package.test.mjs>); rows in [cases.mjs](<cases.mjs>).

## Retired

The instance-side rows (no file shipped by both core and the instance, the instance ships none of the
moved code, the status line is the instance's, the instance registers nothing in the panel header)
and HOST-UC-08 (a real hosted child) have their subject in the dsh-fishball-instance repository
(6b7c53bf). The withdrawn slim-panel rows (skip) are not ported.
