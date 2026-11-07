# Third-party notices

fishball-instance is MIT-licensed ([LICENSE](LICENSE)).

It runs inside DeepSeek Harness and uses the host's installed packages as peer dependencies: `@deepseek-ai/*` (MIT, Copyright (c) 2026 DeepSeek) and `@deepseek-ai/cordis` (MIT, Copyright (c) 2021-present Shigma).

## DSH design tokens

`src/slim/ui/dsh-tokens.css` is a copy of the CSS custom properties (`--dsw-*`, `--dsh-*`, `--ds-*`) that `@deepseek-ai/dsh-client-ui-theme` **0.2.2-rc.1** declares in its `lib/client.js` styles `base.css`, `design-platform.css`, `focus.css` and `gradient-shadow-text.css`. Fishball's chat page is a separate document in an iframe, so it cannot inherit those properties from the main DSH page (design §0.5 "Chat page", task I8). Only the custom properties are copied, unchanged. The file repeats the licence below in its header.

```
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Any third-party code added later must be listed here with its licence and notice.
