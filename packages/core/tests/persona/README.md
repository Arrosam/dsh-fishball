# fishball-core tests: persona bold-text rule (R-B4)

The persona (`src/persona.js`, its `PERSONA_ROLE` data export) tells Fishball to put Chinese punctuation
outside `**` markers, because DSH's chat renderer shows `**还在进行中：**dsh` with its asterisks and renders
`**还在进行中**：dsh` bold. Entry file: [persona.test.mjs](<../persona.test.mjs>), on the current DSH.

- [dsh-markdown.mjs](<dsh-markdown.mjs>) cuts DSH's own chat markdown parser verbatim out of the current
  DSH's shipped web frontend bundle (`dsh-web-frontend/dist/assets/index-*.js` and its vendor chunk) into
  the run's temp folder and imports it: no other markdown library. The chat's parser is the bundle's parser
  function with the most extensions (0.2.2-rc.5 has a plain one and the chat's, with math).
- "Bold" = the parse holds a `strong` node; "asterisks shown" = a literal `**` left in plain text.
- PBR-01 (the bug's form), PBR-02 (the rule's form), PBR-03 (DT: form × what follows the mark), PBR-04
  (every Chinese mark), PBR-05 (in context), PBR-06 (the persona's own example line behaves as it says).

The old suite ran on the two bundles of 0.2.1-rc.3 / 0.2.1-rc.2; it now runs on the current DSH only (the
release matrix covers the other versions).
