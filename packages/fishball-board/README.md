# fishball-board

Fishball's session-linked work board. It ships in the release inside the [`fishball-amenities`](../fishball-amenities/README.md) umbrella, and can be installed on its own. It has no browser code.

It needs `fishball-core` in the same DSH; without it the row loads, logs `fishball-core-missing` once and stays idle. Known limit: it binds `fishballInstance` apiVersion 1 (its frozen contract), and fishball-core is at apiVersion 2 since MULTI-0, so beside today's core it also stays idle until the board is updated to core's current contract.
