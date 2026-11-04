# Slim native Fishball: embedded UI, narrow bridge, and the retirement of in-process Fishball

Status: **design for approval, 2026-11-05**. No production code is written until Fishball reports the
user approved this design. Development and testing stay separate: this document names test
scenarios; a separate testing session writes and runs them in a disposable environment.

Base: `d67e69f` on `integration/native-runtime-on-74fe6be`, branch `feat/slim-native-embedded-ui`.
SDK baseline: DSH 0.2.1-rc.3, read-only at
`/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.3/node_modules/@deepseek-ai/`
(cited below as `<pkg>/...` without that prefix).

## 1. Decisions

| # | Decision | Source |
| --- | --- | --- |
| D1 | The isolated Fishball serves its **own chat page**; the main DSH shows it in an iframe through a same-origin broker route on the main DSH. UI code lives in the child and changes without touching the main page or plugin. | user |
| D2 | The child no longer runs a DSH Web UI. It runs the DSH **core** (`dsh-base`) plus one Fishball-owned app plugin. | user |
| D3 | The isolated Fishball fully replaces legacy in-process Fishball; no automatic fallback. Lifecycle unchanged (starts/stops with the main DSH). | user |
| D4 | Main DSH settings manage the child's model, plugins, settings, status and restart. | user |
| D5 | Models and API keys arrive through the existing provider sync: preview, then confirm; API-key providers only; add-only; first real sync is separately approved. | user |
| D6 | The narrow bridge keeps start/message/read/approve powers over main-DSH sessions and receives no main DSH credentials. | user |
| D7 | Fishball must be able to see and send images, by reference, never by file path. | user |
| D8 | Fishball's own session is hard-wired read-only; its composer has no permission control. | user |
| D9 | Fishball decisions are labelled inline in Fishball's own chat, not in a trail under managed sessions. | user |
| D10 | One "Hand over to Fishball" button with an optional user note replaces watch-only and send-only. | user |
| D11 | Main-DSH session rows keep the Fishball fish as the base layer in every managed state; DSH's hollow running spinner draws above it, and green unread / yellow needs-action dots stay at the top-right. Running animation reuses rc.3's orca swim when the DeepSeek icon is on. | user |
| D12 | Fishball-accent buttons become normal DSH buttons with one magenta ring, from one shared constant/token. | user |
| D13 | Main-DSH plugins may technically script the same-origin embedded Fishball page; accepted, because the child process, its home and its credentials stay isolated. | user |

Rejected alternatives are recorded where they were rejected (§3.2, §6.2, §13).

## 2. Architecture

### 2.1 What the child runs

**Decision:** the child boots the shipped `dsh` launcher with a Fishball-owned profile whose only
bundle is `dsh-base`, plus a launch overlay that inserts one row: `fishball-native-app` (this
repository's child app). The child app owns a loopback `node:http` server (UI, JSON API, SSE) and
wires the DSH core services to it.

It runs: `agent`, `session` + JSONL persistence + projection + storage, `llm` + adapters
(`llm-pi-ai`, `llm-deepseek-api-key`), `tools` (bash/fs/search/skill/goal/jobs/todo/present),
`user-approval`, `user-questions`, `settings`, `config-editor`, `plugin-manager`, plus the
Fishball rows: `schedule` + `tool-schedule` (reminders) and our app row.

It does not run: `dsh-web-app`, the browser client kernel (`client-modules`, `web-frontend`), any
`dsh-client-ui-*` package, the web server row, MCP clients, memory plugins, web/X search plugins.

### 2.2 Evidence that rc.3 can start a core without the Web UI

| Claim | Evidence (rc.3 SDK) |
| --- | --- |
| Profiles are bundle stacks; several shipped templates have no web UI | `dsh-app-boot/lib/index.js:551-557`: `"headless"` = base + headless, `"sdk"` = base + sdk-app, `"sdk-minimal"` = sdk-minimal alone. |
| A base-backed core is a supported, documented composition | `dsh-headless/package.json:3`: "a direct core Agent/Session runner over dsh-base with no Host, HTTP, or browser layer". |
| The launcher provides the services a non-web app needs | `dsh/lib/profile-boot-C14i-8IN.js:304-312`: `profileContext`, launch environment, `cmdlineArgs`/`appReady` are provided by the launcher before the tree composes. |
| Boot does not require `webServer`/`connection` | Same file: the tree is only patch layers; rows gate on `profileContext` (`dsh-base/cordis.patch.yml:20,105,109`). Nothing in base injects `webServer`. |
| The sdk bundle is stdio-bound, so unsuitable for a detached child | `dsh-sdk-app/lib/index.js` calls `exitOnStdinEnd(ctx, "sdk-app.stdin")`, while the native child is spawned with stdio ignored plus one pipe (`src/native-runtime/index.js:211`). |
| A headless core can be long-lived only if a plugin holds the process | `runProfile` returns after `appReady.commit()` (`dsh/lib/profile-boot-C14i-8IN.js:314`); the child app's listening server keeps the loop alive and calls `ctx.appExit` on stop. |
| Core services suffice for a chat agent | `ctx.agents.create/resume` (`dsh-agent/lib/types/index.d.ts:278,286`), session events (`dsh-session/lib/types/index.d.ts:224`), approval waterfall (`dsh-user-approval/lib/index.js:176`), question waterfall (`dsh-user-questions/lib/index.js:681`). |

This is the "headless core" option rather than a purpose-built agent loop or a bare minimal server:
DSH's own agent, session, tool and model stack runs the chat, and only the transport and UI are
Fishball's. The headless bundle itself is not the runtime — it is a one-shot runner (`dsh headless
"run the tests"` answers one task and exits, `dsh/lib/bin.js` help examples) and carries the same
`dsh-base` rows we compose directly.

**Why not reuse `dsh-web-app` with rows disabled:** its bundle patch is 117 rows
(`dsh-web-app/cordis.patch.yml`), including the client kernel, the frontend dist and the whole UI
roster. Disabling rows would still ship and mount the web shell, which is what D2 removes.

**Why not include `dsh-host-webserver` in the child:** that row requires `webStartup`
(`dsh-web-app/cordis.patch.yml:179-189`), which belongs to the web app. The child app therefore
binds its own `127.0.0.1:0` server — the same pattern this repository already uses for the
provider-sync channel (`src/provider-sync-channel.js:1-20`). Route registration, SSE and
backpressure are the child app's responsibility.

### 2.3 Child profile and launch overlay

- Profile: `<child home>/profiles/fishball` with `dsh.profile.bundles = ["@deepseek-ai/dsh-base"]`
  (replaces today's `boot.PROFILE_TEMPLATES.web.bundles` at `src/native-runtime/installation.js:113`).
- Overlay rows: `fishball-native-app` (required), `schedule`, `tool-schedule`; keep `hmr`
  disabled, set `sandbox-policy.mode = read-only`, `approval.policy = ask`, `bash-sandbox`
  unchanged.
- The row's config carries `mainHome`, `hostId`, `instanceId`, `limits`, `control`, and the
  256-bit bridge bearer endpoint. Nothing else crosses into the child.
- `native-child.js` no longer injects `webServer`/`webApp`; it injects `nativeRuntime`,
  `agents`, `sessions`, `tools`, `profileContext`, `appExit`, `appReady`. Its readiness probe
  becomes "server is listening + core services present + authenticated request succeeds".

### 2.4 Lifecycle (unchanged rules)

Start after main `appReady`, stop on dispose/exit, HMR stop-then-restart, one writer per attached
home, bounded stop (4000 ms inside rc.3's 5000 ms grace), parent-lifetime pipe, no PID-only signals.
Only the readiness checks and the copied code set change: `src/native-runtime/constants.js`
`requiredServices`, `overlay.js` row assertions, and `copyChildCode` now copies `src/slim/**`
in addition to the lifecycle modules.

## 3. Embedded UI

### 3.1 Serving and ownership

- The child app serves `/` (HTML), `/ui/*` (its own ES modules, CSS, assets), `/api/*` (JSON)
  and `/api/events` (SSE). All bytes are child-owned, so a UI change is one child update.
- The **main DSH** registers one prefix route, `/fishball/embed/*`, on its own web server and
  reverse-proxies it to the child, keeping the browser on the main origin. The route is the only
  path a browser uses; the child's port is never addressed by the browser.
- Main-side route ownership: `src/slim/host/embed.js`. It admits the request with
  `ctx.connection.requestRejection(request)` (`dsh-client-connection/lib/types/rpc.d.ts:185`),
  requires `sec-fetch-site: same-origin`, and forwards to the child with the bridge bearer.

### 3.2 Authentication without a separate login

The browser already has the main DSH session. The broker route is authenticated by that session;
the child is authenticated by the **parent process**, not by the browser:

1. On child readiness the child mints a 256-bit bearer and returns it over the lifecycle control
   channel (unix socket, HMAC-authenticated; `src/native-runtime/wire.js`).
2. The main host keeps it in memory and attaches `Authorization: Bearer <token>` to every proxied
   child request. Tokens rotate on restart; nothing is persisted.
3. The child accepts only that bearer on its loopback server. Any other request gets `401`.

Consequences, each a requirement:

- **No separate login**: the iframe request carries the main DSH cookie (same origin, same site).
- **No token in URLs**: the iframe `src` is `/fishball/embed/` with no query and no fragment.
- **No token in main-page-readable storage**: the child token never reaches JavaScript; the browser
  holds only the existing HttpOnly DSH cookie.

**Rejected alternatives**

- Direct iframe to `http://127.0.0.1:<childPort>`: the first request needs either a capability in
  the URL (forbidden) or a page-readable token (forbidden), or a cookie the child cannot set before
  it has authenticated the browser.
- `postMessage` handshake from the main page: the capability would live in main-page memory, where
  any main-profile plugin can read it, and the requirement forbids it.
- Reusing the main DSH's cookie as the child's credential: cookies ignore ports
  (`dsh-client-connection/lib/index.js:335-350` binds the name to the authority but the browser
  still sends it to every port on the host), so the child would receive the main session cookie.
  D6 forbids handing main credentials to the child.

### 3.3 CSP and framing

- Embed route response headers:
  `Content-Security-Policy: frame-ancestors 'self'; default-src 'self'; img-src 'self' data:; connect-src 'self'`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on the
  shell document, long-lived immutable caching for `/ui/*` with content hashes.
- The child's own loopback responses add `Content-Security-Policy: frame-ancestors 'none'` and
  `Cross-Origin-Resource-Policy: same-origin`, so the child origin can never be framed directly.
- Because the iframe is same-origin with the main page, frame-ancestors is a second fence, not the
  first: the main page could script the iframe. That is accepted (see risks) — the isolation goal
  is UI ownership and process separation, not a security boundary against the user's own main page.

### 3.4 Desktop shell (DSH-X)

The shell does not use `file://` for DSH pages: the window loads the instance URL
(`/Applications/DSH.app/Contents/Resources/app/shell/tabs.mjs:138`, `.../app/shell/main.mjs:304`) with
`sandbox: true, contextIsolation: true` (`main.mjs:335-338`). So the top-level origin is
`http://127.0.0.1:<mainPort>` and the same-origin broker works unchanged. The shell's
`setWindowOpenHandler` (`main.mjs:323`) only affects new windows; the embed uses an iframe and
never opens one. The shell's `will-navigate` guard applies to the main frame, not subframes.

### 3.5 Cookies and SameSite across ports on 127.0.0.1

For the record, because a direct-iframe design would hit this: rc.3 mints
`HttpOnly; SameSite=Strict` cookies whose name hashes the authority
(`dsh-client-connection/lib/index.js:335-350`). Cookies are host+path scoped, not port scoped, so
two `127.0.0.1:<port>` origins are **same-site** (ports never change the site), share the cookie
jar, and `SameSite=Strict` would still be sent in an iframe. That is exactly why a direct iframe
would work at the cookie layer but leak the main session cookie to the child origin. The broker
removes the question: the browser never talks to the child origin, so there is no cross-port cookie,
no `SameSite=None; Secure` workaround, and no dependency on `127.0.0.1` vs `localhost` spelling.

### 3.6 Proxy contract

| Concern | Rule |
| --- | --- |
| Methods | `GET`, `HEAD`, `POST` only. |
| Paths | `/fishball/embed` (document), `/fishball/embed/ui/*`, `/fishball/embed/api/*`, `/fishball/embed/api/events`. No traversal, no encoded `..`, no absolute URL. |
| Streaming | SSE passes through unbuffered; the client's `AbortSignal` closes the upstream child request. Backpressure: pause the child response when the browser response returns `false` from `write`. |
| Limits | 1 MiB JSON body; 8 MiB on the one upload route (base64 of a 4 MiB image plus headroom); 32 concurrent proxied streams; 30 s idle timeout (SSE heartbeat every 15 s). |
| Failure | Child not ready — `503` with a static page carrying the error and a Retry button; never a redirect to legacy Fishball. |

## 4. Feature migration

| Feature | Runs today | Runs after | Notes |
| --- | --- | --- | --- |
| Fishball chat UI | main DSH conversation + injected slots (`client.js:156-175`) | child UI (`src/slim/ui/`) | D1; not feature-parity with DSH at v1. UI changes ship as a child update; Fishball never edits its own UI at runtime. |
| Permission mode in Fishball's composer | DSH composer selector (`dsh-client-ui-permission-presets/lib/client.js:803`) | absent from the child composer; the session is fixed read-only | D8, §8.4. |
| Fishball agent/session | main process (`index.js`, `src/lifecycle.js`) | child (`src/slim/child/chat.js`) | read-only sandbox (§8.4). |
| `message_fishball`, `ask_fishball`, `list_user_messages` | main, `src/messaging.js`, `src/request-desk.js` | tool definitions stay in the main host (they run in managed sessions); delivery moves over the bridge into the child's inbox | §5. |
| Session control (`start_session`, `message_session`, `stop_session`, `redirect_session`) | main `src/messaging.js` | bridge operations executed by the main host (§5.2) | Fishball calls them from the child. |
| `read_session`, `watch_session`, `list_watches`, `unwatch_session` | main `src/watches.js` | bridge operations + child-side tools | §5.2. |
| Approvals: Fishball decides allow/grant/reject/escalate | main `src/approvals.js` | child decides and answers over the bridge; the live card stays in the managed session's pile on the main DSH | §5.2, §8.1. |
| User questions / plan reviews | main `src/questions.js` | child receives and answers over the bridge | same rules. |
| Pile/cards | main dock (`client.js:3242+`) | live cards stay in the main DSH on the session they belong to; Fishball's own requests appear in the child UI | Q1. |
| Decision labels | main turn tail (`client.js:3376-3389`) | child timeline (§8.1) | host tag records removed (`src/tags.js`, `src/approvals.js:397,465,878,1182`). |
| Reminders | main `dsh-schedule` | child `dsh-schedule` + `tool-schedule`, child UI list | §2.1. |
| Memory / web / X search plugins | main profile plugins, shared via the legacy composition | not installed in the child by default; installable per child | D2. |
| Plugin hooks (`agent/created`, `session/event`, ...) | main profile plugins can inject into Fishball's agent | only plugins installed in the child see the child's agent | the isolation win. |
| Model choice / context window | main settings | child settings applied through the admin API | §9. |
| Provider sync | main to other profile (pairing channel) | main to child (same preview/confirm; child owns the write) | §10. |
| Open isolated Fishball | new browser tab (`client.js:2403-2425`) | embed panel; `openUrl` route removed | §7. |
| Unread count / brand mark | main `client.js` | main unchanged, plus the always-on fish base layer, the spinner drawn above it, and Fishball's own unread / needs-action dots (§8.2) | — |
| Send / watch / hand over | three header buttons (`client.js:4138-4143`) | one hand-over button with a note (§8.3) | D10. |

## 5. The narrow bridge

### 5.1 Auth model

Two independent channels; neither is a generic RPC tunnel.

| Channel | Transport | Authentication | Who may use it |
| --- | --- | --- | --- |
| Lifecycle + admin | existing unix/TCP control wire, framed HMAC (`src/native-runtime/wire.js`) | per-instance 256-bit secret, mutual HMAC proof, host/instance identity | the main host process only |
| Session bridge | messages on the same authenticated wire, operation allowlist (`src/native-control/protocol.js:66-101`) | the wire identity plus a per-session authorization check on the main host | the child process only |
| Embed | main DSH web route to child loopback | main browser session + parent bearer | the browser, through the main origin |
| Provider sync | existing pairing channel, extended with a child target | pairing capability + preview token | the owner's settings page |

Rules that do not change: every session operation carries an explicit `sessionId`; the main host
checks it against `managedSessionIds`, the workspace registry and archived state
(`src/native-host-adapter.js:31-45`); the child never receives main credentials; no operation can
read a main file, plugin or config.

### 5.2 Operations

All payloads are exact-key validated; unknown keys reject the frame. Text limits are byte bounded;
attachment frames are bounded separately (§6.2).

| Op | Direction | Payload | Authorization | Result / errors |
| --- | --- | --- | --- | --- |
| `session.list` | child to main | `{workspaceId?, limit}` | related sessions only (managed, watched, messaged by, forwarded) | `{sessions:[{sessionId,title,workspaceId,running,pendingInteraction}]}`; bounded (100). |
| `session.start` | child to main | `{folder, title, model?, reasoningEffort?, message, attachments[]}` | folder must exist and be a workspace or absolute path the user opened | `{sessionId, managed, titleError?, workspaceError?}`; never creates folders. |
| `session.message` | child to main | `{sessionId, message, attachments[]}` | managed session, live or resumable | `{status: delivered or unconfirmed}`; never retried after an unconfirmed flush. |
| `session.redirect` | child to main | `{sessionId, message, attachments[]}` | managed session | as `message`, after `cancel`. |
| `session.stop` | child to main | `{sessionId, reason?}` | managed session | `{stopped:true}`. |
| `session.read` | child to main | `{sessionId, maxMessages, maxBytes}` | related session (managed, watched, messaged by, or forwarded) | `{messages:[{seq,role,author,text,images:[...]}], truncated}`. |
| `session.watch` | child to main | `{sessionId, mode}` | related session | `{watchId}`; refusal carries `watchError`. |
| `session.watches` | child to main | `{}` | — | bounded list. |
| `session.unwatch` | child to main | `{watchId}` | — | `{ok}`. |
| `approval.list` | child to main | `{sessionId}` | managed session | live requests only, current `offerId`. |
| `approval.answer` | child to main | `{sessionId, approvalId, offerId, answer: {decision} or {text}}` | live offer, not expired | `{accepted:true}`; `expired`, `conflict`. |
| `attachment.read` | child to main | `{sessionId, attachmentId}` | the image is referenced by that session's log (`referencedImage`, `dsh-api-session-controller/lib/index.js:978-989`) | chunked bytes; `not-referenced`, `too-large`. |
| `attachment.put` | child to main | `{transferId, total, sha256, mediaType, name?, chunks[]}` | the child instance only; bytes are admitted by the host's own attachment store | `{hostRef, expiresAt}` for one later `session.start`/`session.message` |
| `inbox.push` | main to child | `{messageId, kind, sourceSessionId, text, images[], dedupeKey, at}` | a managed session authored it | `{acked:true}`; re-delivered unchanged after reconnect |
| event `approval.request` | main to child | same shape as today (`src/native-control/protocol.js:49-55`) | managed session | — |
| event `approval.settled` | main to child | `{approvalId, decision, by: user or fishball}` | managed session | lets the child update decision labels (§8.1). |
| event `watch.status` | main to child | existing | watch owner | — |
| event `session.state` | main to child | `{sessionId, running, pendingInteraction}` | managed session | drives the indicator and the child's list. |

In `session.start`, `session.message` and `session.redirect`, the `attachments` list carries the
`hostRef`s returned by `attachment.put`; the host consumes each ref at the same time as it builds
the message.

**Inbox (main to child).** `inbox.push` carries a message a managed session sent to Fishball, with
a dedupe key, the caller's framed text and image references. The main host's existing intake
ledger (`src/intake.js`) remains the durable queue, so a stopped child never loses a message; the
child acks each item and the host re-delivers unacked items after a reconnect with the same
dedupe key.

**Not in the bridge:** file writes, plugin or config changes on the main side, agent/session
objects, model calls, main credentials, shell execution. The admin operations are on the lifecycle
channel, not here.

## 6. Images and attachments

### 6.1 Channels

| Channel | Direction | What carries images |
| --- | --- | --- |
| `message_fishball` | session to Fishball | new optional `images: [{attachment_id}]`; ids must be images the **calling session's** log references. |
| `ask_fishball` | session to Fishball | new optional `images: [{attachment_id}]` from the quoted user messages of the calling session. |
| Finished-session notice | session to Fishball | the existing watch notice gains an `images` list of ids from the watched session's last assistant turn; Fishball pulls the ones it wants with `attachment.read`. |
| `read_session` / history | session to Fishball | per-message `images: [{attachmentId, mediaType, width, height, bytes}]`, never bytes by default. |
| `message_session` / `start_session` / `redirect_session` | Fishball to session | new optional `attachments: [{attachment_id, kind: 'image' or 'file'}]` from Fishball's own store. |
| Fishball chat uploads | user to Fishball | the child UI posts bytes to its own API; the child admits them into its own store. |

### 6.2 Format, limits, and rc.3 reuse

rc.3 already has the whole vocabulary; we reuse it and add no new image format.

| Need | rc.3 API | Evidence |
| --- | --- | --- |
| Image content part | `ImageBlock { type:'image', attachment: ImageAttachmentRef }` | `dsh-llm/lib/types/types.d.ts:61-71` |
| Allowed media types | `image/png`, `image/jpeg`, `image/webp`, `image/gif` | `dsh-attachment/lib/types/types.d.ts:5` |
| Durable, content-addressed id | `ImageAttachmentRef.attachmentId` (`types.d.ts:7-20`); file ids are the sha256 of the bytes (`:34-41`) | `dsh-attachment/lib/types/types.d.ts` |
| Admission and normalization | `saveImage`, `saveImages`, `admitPromptContent`, `readImage` | `dsh-attachment/lib/types/index.d.ts` (`AttachmentStore`) |
| Defaults | 20 images/message, 4 194 304 pixels, 4 194 304 normalized bytes | `dsh-attachment-local/lib/index.js:971-1014` |
| Capability gate | reject when the route's model lacks `image` in `inputModalities` | `dsh-api-session-controller/lib/index.js:938-941` |
| Request budget and placeholders | `requiredImageOffload`, `projectOffloadedImages`, `projectImagesForTextModel` | `dsh-llm/lib/types/content.d.ts` |
| File blocks stay text for models | `projectFilesToText`, `fileHandleText` | `dsh-llm/lib/types/content.d.ts` |
| Reading an image from a session | verify the log references it, then `attachments.readImage` and base64 | `dsh-api-session-controller/lib/index.js:978-999` |
| Image a session already produced | `read_image` returns a text block **and** an image block with a durable ref | `dsh-tool-fs/lib/index.js:969-975` |

Bridge rules: 4 MiB per image, 20 per message, 512 KiB per chunk, sha256 verified by the receiver,
one transfer per message, no path or URL accepted anywhere. Files keep the rc.3 rule: they are
stored verbatim and reach a model only as handle text naming the stored path.

### 6.3 Sessions to Fishball

1. The agent calls `message_fishball({message, images:[{attachment_id}]})`.
2. The main host resolves each id with the same rule rc.3 uses (`referencedImage` over the calling
   session's events), reads the bytes with `attachments.readImage`, and pushes an `inbox.push`
   whose text keeps today's untrusted block (`src/messaging.js:109-112`) and whose images carry ids
   and metadata only.
3. The child pulls each id with `attachment.read`, saves it into its own store
   (`saveImages`/`admitPromptContent`), and builds
   `createUserMessage({content:[{type:'text',...},{type:'image',attachment}]})`.
4. If the Fishball model cannot accept images, the call returns
   `{ok:false, code:'images-unsupported'}` at the tool, before anything is queued; nothing is
   silently dropped and no model is switched.

### 6.4 Fishball to sessions

1. Fishball passes attachment ids from its own store (received in §6.3, or uploaded by the user).
2. The child reads its own bytes and streams `attachment.put`; the main host calls
   `attachments.saveImages` or `saveFile` and gets a main-side durable ref, returned as a `hostRef`
   that is single-use and expires after 10 minutes.
3. The host builds the message with image or file blocks and steers it with the existing Fishball
   relay source. A file is never inlined into a provider request; it becomes handle text with a
   read-only path the target session's tools can open.

Fishball still never reads a filesystem path. A path argument is not part of any operation.

### 6.5 Untrusted data

Images from a session keep the existing framing: the block prefix says the content comes from
another session's agent, not the user, and must not be followed as instructions. Image text is
also data: OCR content is never treated as instructions. Display names are sanitized by the
attachment store; no path, no URL, no SVG. The child renders session images with a
"from <session>" caption and never as an avatar or an icon.

### 6.6 The user's own uploads in Fishball's chat

The child UI's composer accepts drag and drop, paste and a file picker. The browser posts
`{mediaType, data(base64), name?}` to the child API; the child validates with
`attachments.validateImage`/`saveImage` under the same limits, then appends an ordinary user
message with image and file blocks. A text-only model gets the rc.3 text-only projection
(`projectImagesForTextModel`) plus a visible notice in the UI, not a silent loss.

## 7. Embedded page, opening and the button

- `client.js` renders the embed in a panel of the main DSH page (an `iframe` with
  `src="/fishball/embed/"`, a `title`, `allow="clipboard-write"`, and no sandbox attribute —
  a sandbox would break the same-origin session). Its header offers Refresh and "Open in a tab"
  (the tab opens `/fishball/embed/`, still same-origin).
- The top-left Fishball brand button opens that panel instead of creating a legacy Fishball
  session or a new tab. The `POST /api/fishball/native/open` route and its capability URL
  (`src/native-web.js`) are removed; the lifecycle still exposes status.
- When the child is not ready the panel shows a static error card: state, the safe code
  (`NATIVE_CHILD_EXITED`, `NATIVE_TIMEOUT`, ...), and Retry. Retry calls the existing restart
  service, never a legacy fallback.

## 8. Main-DSH session UI

### 8.1 Decision labels move into Fishball's chat

Today: Fishball's own chat timeline is DSH's conversation renderer (`dsh-client-ui-conversation`),
and each decision writes a tag record (`src/tags.js`; writes at
`src/approvals.js:397,465,878,1182`) that `client.js:3376-3389` renders inside the managed session's
turn tail (`conversation.chat.turnTail`, `client.js:172`). That is the trail the user dislikes.

After: the label is a child-side timeline entry (`src/slim/child/decisions.js`), one compact row
such as "Fishball asked about <session> and allowed it once", expanding to the request card and
Fishball's reply. The host stops writing tag records; `SLOT.turnTail` stops rendering them.

Bridge data for each record: `decisionId`, `kind` (message, start, redirect, stop, approval,
grant, question, plan review, escalation), `sessionId` and title, `at`, the request snapshot
(`toolName`, `callId`, prompt and choices, reason, quoted user messages), Fishball's answer text,
the outcome, and — for escalations — the user's final decision delivered by `approval.settled`.
The child owns placement and rendering; the host owns authorization and outcomes.

### 8.2 Sidebar mark: the fish is always the base layer

Accepted layout (Q5 answered): the Fishball fish sits in the 16x20 leading cell in **every** state
of a managed session. While the session runs, DSH's own status spinner draws on top; rc.3's spinner
is a hollow ring, so the fish shows through its centre. Fishball's green unread dot and yellow
needs-action dot stay at the cell's top-right, needs-action winning when both apply. The fish may
flip or turn while running; with the DeepSeek-icon switch on, the orca plays rc.3's own swim. Under
`prefers-reduced-motion: reduce` nothing animates; the dots and the accessible name carry the state.

| State | Base layer | On top |
| --- | --- | --- |
| needs action | fish | yellow dot, top-right; DSH's spinner while running |
| unread | fish | green dot, top-right; DSH's spinner while running |
| running, nothing pending | fish | DSH's spinner |
| idle | fish | nothing |
| unmanaged | none | DSH's own indicator, unchanged |

**Can rc.3 do this cleanly?** Not with a real element while running:

- The leading cell is one 16x20 inline-flex span
  (`dsh-client-ui-workspace/lib/client.js:1742`).
- It renders DSH's `SessionStatusDots` whenever the primary status is not idle, and the
  `sidebar.session.row.leading` slot only when it is idle
  (`dsh-client-ui-workspace/lib/client.js:2261,2307`). The slot is unmounted while running, so no
  plugin element can sit under the spinner.
- The row's only stable hook is `data-row-key="session:<id>"` on the row element
  (`dsh-client-ui-workspace/lib/client.js:2276`). The hover slot lives inside the hover card
  (`dsh-client-ui-workspace/lib/client.js:2155`) and the row-action slot is hover-only
  (`dsh-client-ui-workspace/lib/client.js:2349`); neither mounts in the leading cell.
- The spinner is `StateDot` for `ongoing`: a 14px SVG
  (`dsh-web-frontend/dist/assets/index-BXV-oxvX.js:129`) whose track and arc are
  `fill:none; stroke-width:2` (`dsh-web-frontend/dist/assets/index-BNyAYEM7.css:1`) — a hollow
  ring, as assumed.

**Upstream ask (the clean path).** Either render `sidebar.session.row.leading` in every state and
draw DSH's status dot/spinner above it, or add a `sidebar.session.row.accessory` slot rendered
inside the leading cell in every state. Then the fish is an ordinary slot element, the spinner
overlays its hollow centre, Fishball's dots and `role="img"` label live in the same element, and the
orca SMIL swim runs unchanged.

**Closest plugin-only option (interim).** A CSS-only base layer keyed to `data-row-key`: the fish
painted on the leading cell through a CSS mask so it follows the theme's text colour, with the
spinner above it and the two dots as another layer. It uses no portal, no DOM mutation and no slot
abuse, and the row hook is stable. It can show the static fish and turn the masked fish with a CSS
transform while running, but it cannot run the orca SMIL swim (an image used as a CSS mask does not
animate), and it cannot add an accessible label of its own; DSH's visually hidden status labels
still announce running and waiting, while unread is visual-only in the interim. So the fish under
the spinner, the flip and the two dots are achievable now; only the DeepSeek swim needs the upstream
slot.

The Fishball client generates the per-session CSS the same way it already hides the model seat
(`client.js:102,3522-3533`): one selector per managed session id from the host state feed. No DOM
query, no React portal.

Reuse, do not redraw: the orca morph is rc.3's `HeroFish` — `FISH_LOGO_PATH`,
`HERO_SWIM_UP_PATH`, `HERO_SWIM_DOWN_PATH`, a SMIL `d` animation over 1.6 s
(`dsh-client-ui-conversation/lib/client.js:17724,17736`) with the CSS sway
(`dsh-client-ui-conversation/lib/client.js:17644`, gated by hover and reduced-motion media
queries). The Fishball client should import `FISH_LOGO_PATH` and `FISH_LOGO_VIEWBOX` from
`dsh-client-ui-primitives` instead of keeping its own copy (this repository's `client.js:32`
already imports from that package; the current `ORCA_SWIM` copy at `client.js:474` is replaced).

The "DeepSeek icon" condition is Fishball's existing switch (`client.js:1688,3413`, host
preference `brandStyle`), not a DSH theme setting. rc.3 ships no such user setting: the official
brand package is presentation only (`dsh-client-ui-brand-official/lib/index.js:3-8`, an empty
`apply`), and the only icon choice found is Fishball's own.

### 8.3 One hand-over button

Current header buttons: "Tell Fishball when finished" (`client.js:2652`, `WATCH_HEADER` 66),
"Send to Fishball" (`client.js:2538`, `SEND_HEADER_ID` 74) and "Hand over to Fishball"
(`client.js:2706`, `MANAGE_HEADER` 79), registered at `client.js:4140-4142`; the same flows exist
as session-menu items (`makeSendMenuItem` 2529, `makeWatchMenuItem` 2641, `makeManageMenuItem` 2690,
registered 4144-4148).

After: only "Hand over to Fishball" (and "Take back from Fishball" when managed). Clicking opens a
small dialog with an optional note ("watch it and tell me when it is done", "approve builds and
tests"). Confirming makes the session managed and forwards the note as the **user's own words**,
in the existing notice (`TEXT.forwarded`, `src/messaging.js:114-119`: "The user's note: ..."),
which is not inside the untrusted block. The note is bounded by `maxMessageBytes` and is optional.

What replaces the other two flows: hand-over with the note covers both. Watch-only (watch a
session Fishball does not manage) is dropped; send-only (forward a note without managing) is
dropped because forwarding already made the session managed (`src/messaging.js:203-221`). If the
user wants watch-only back, it becomes a hand-over note rather than a separate button (Q11).

### 8.4 Fishball's session is read-only

Fishball's own session is created with the read-only permission preset and `approval: ask`; the
child exposes no permission switch in the composer and rejects any request that would change the
session's preset (admin API included), and no bridge operation can change it. Because the child's
sandbox is `read-only` and its workspace
is the private runtime workspace, file-mutating tools fail at the sandbox rather than at a UI
convention. Installing plugins into Fishball is a host action of the settings page, not a model
tool, so read-only costs nothing there.

### 8.5 One Fishball button style

Today's Fishball-accent buttons are filled magenta by the `.fb-...accent` rules
(`client.js:1602-1603`, constants `FISHBALL_COLOUR` at `client.js:369-375`). Every call site:

| # | Call site | Button |
| --- | --- | --- |
| 1 | `client.js:1889` | Recommended plugin · Install |
| 2 | `client.js:1896` | Recommended · Turn on |
| 3 | `client.js:2122` | Install dialog · Install |
| 4 | `client.js:2140` | Install dialog · Install (confirm) |
| 5 | `client.js:2160` | Install done · Open plugin page |
| 6 | `client.js:2173` | Build blocked · Allow scripts |
| 7 | `client.js:2174` | Install failed · Retry |
| 8 | `client.js:3744` | "+ Install for Fishball" |
| 9 | `client.js:3975` | Limits form · Save |

Sites 3 to 7 go through the `accent()` helper (`client.js:2104`). Switches inside the same wrapper
(`client.js:3676`, rules `1607-1609`) are switches, not buttons; they keep the magenta knob.
For completeness, these Fishball buttons use DSH's plain `primary`, `outline` or `ghost` and are
**not** restyled: pile Allow (`client.js:2953,3112`), model gate "Open settings" (`2486`), settings
Save (`2239`, `2351`), send dialog (`2573-2574`), notice Close (`2671`), Adopt (`1851`), mode
radio (`3192`), uninstall (`4039`).

After: one shared token and one helper. `FISHBALL_ACCENT = '#EC0A6E'` (already `FISH_MARK.eyeColor`)
is exposed once as `--fb-accent` on the plugin root; a single `accentButton` helper renders DSH's
`Button` with `variant: 'secondary'` (DSH's normal background and text) plus class `fb-outline`
whose rule is `box-shadow: 0 0 0 1px color-mix(in srgb, var(--fb-accent) 55%, transparent)`;
DSH's hover and active states come from the variant, focus-visible is unchanged. The fill, text and
hover constants are deleted. Light and dark both work because the ring mixes the accent with the
current surface rather than a fixed white. The restyle lands in the new settings page (§9); legacy
copies are deleted, not restyled.

## 9. Settings page and admin

The Plugins → Fishball → settings page is rebuilt around the isolated Fishball:

- Status and restart, with the safe state/code the host already exposes.
- Model: provider/model/reasoning effort from the child's own catalog; applies through the admin
  API and takes effect on the next request.
- Plugins: list the child's installed packages, enable/disable, install (spec or market entry),
  uninstall; everything targets the child's profile; nothing touches the main profile.
- Settings: the child plugin config forms that the page can render; limits that belong to Fishball.
- Provider sync: preview/confirm for API-key providers (§10).
- No legacy sections (intake, outbox, watches, approvals, hidden tools, main plugin catalog) —
  those concepts are either main-side or gone.

Admin API: owner-only same-origin routes (`/api/fishball/native/admin/*`) go to the lifecycle
control channel and then to the child admin service. The child applies changes with its own
`settings.mutate`, `credentials.modifyRecord` and `pluginManager` (all rows are in `dsh-base`,
`dsh-base/cordis.patch.yml:20,105,109`). The page never writes the child's files directly.

## 10. Provider sync into the isolated home

Reuse `src/provider-sync*.js` unchanged in its rules: preview with metadata only, opaque preview
id, confirm with `confirmed:true`, add-only, revision-checked `settings.mutate`, create-only
credential record, per-item result, no retry after `unknown`. The only change is the target:

- The **source** is the main DSH; the **target** is the child. The existing pairing channel is not
  usable across the lifecycle (the child is not another user-visible profile), so the target side
  becomes the child's `provider-sync` handler reached over the lifecycle channel with the same
  payloads and the same `inventory` and `import` actions.
- The child owns all writes in its own home; the main host only reads the selected API-key records
  and streams them on the authenticated wire. The browser gets ids and status, never values.
- First real sync remains gated on a separate user approval; design and tests never trigger it.

## 11. Failure modes and UX

| Condition | Main page | Embed | Data |
| --- | --- | --- | --- |
| Child not started (`disabled`) | status Disabled; no embed button | not offered | retained |
| Starting | status Starting; spinner | "Starting Fishball..." then auto-retry once | retained |
| Crashed or exited | status Failed and code; Restart | error card and Retry | retained; inbox queued |
| Child unreachable (auth or port) | Failed `NATIVE_UNAVAILABLE` | error card and Retry | inbox queued |
| Child slow (SSE idle) | — | "Reconnecting..." banner, retries with backoff | session state from the baseline |
| Bridge operation refused | — | inline tool result, not a crash | no retry |
| Main DSH shutting down | — | closed with the page | existing bounded child stop |

No state ever falls back to legacy Fishball, and no error text includes a URL, token or path.

## 12. Legacy retirement

Removed or disabled when the embedded path is live:

- Fishball's own agent and session in the main process (`src/lifecycle.js`, its persona and prompt
  rows).
- Legacy chat surfaces in `client.js`: welcome card, model gate, Fishball pile, managed banner,
  turn-tail tags, send/watch/hand-over trio, `SLOT.turnTail`, legacy settings sections.
- `POST /api/fishball/native/open` and `openUrl`; the native "Open isolated Fishball" button.
- Tag records and their store table (`src/tags.js`, `src/store.js` table), tag rendering.
- Dead constants and CSS for the removed surfaces.

Kept on the main side: the brand mark and button, the embed panel, the settings page, the sidebar
mark, the hand-over button, the intake ledger and queue, the managed-session registry, the host
bridge handlers, approvals and questions forwarding, and the pile (for main sessions).

The `dsh-fishball` main row itself stays, because it owns the client UI and the plugin settings
namespace (`ENTRY_ID`); only its agent/session composition, tools and legacy chat surfaces are
removed.

## 13. Risks

1. **Same-origin iframe means no script boundary.** Any main-page plugin can read or drive the
   Fishball UI. The isolation claim is process, data and deployment isolation, not confidentiality
   from the main page. Accepted (D13).
2. **The child's bearer lives in main-process memory.** It is not persisted and rotates per
   instance; a compromised main process already owns both sides.
3. **Loopback port exposure.** The child refuses all requests without the bearer, but any local
   process can still attempt connections; rate limiting and 401 are the only defense.
4. **A DSH core upgrade may move rows we depend on** (`dsh-base` row ids, `profileContext`,
   `agents` and `sessions` contracts). The design pins rc.3 contracts and fails loud at startup.
5. **The leading cell is not composable in rc.3** (§8.2): while a session runs, DSH renders its
   spinner in place of the plugin slot, so the orca swim needs a small upstream slot change; the
   interim CSS layer covers the static fish, the flip and the dots but not the swim (Q13).
6. **A purpose-built chat UI is less capable than DSH's** at v1 (markdown, tool cards, plan review,
   attachment previews). It is Fishball-owned, so it can catch up incrementally.
7. **No tests are written here.** Acceptance depends on the separate testing session.
8. **Provider sync writes are not transactional across config and credentials** (already accepted
   in the v1 design); the child adds one more hop, not a new guarantee.

## 14. Open questions (each needs one answer)

Answered on 2026-11-05 (kept here so the numbering stays stable):

- Q3 -> D13: the user accepts that a main-page plugin can script the same-origin embed.
- Q5 -> D11: the fish is always the base layer; DSH's hollow spinner draws above it; the green and
  yellow dots stay at the top-right. Composition, the rc.3 constraint and the upstream ask are in
  §8.2.
- Q6 -> settled by the Q5 wording "when that toggle is on": Fishball's existing "Use the DeepSeek
  icon" switch.
- Q7 -> settled by the Q5 instruction "Keep the reduced-motion rule": static mark, dots and an
  accessible name.

Still open:

Q1. For an approval Fishball escalates to you, should the live card stay only in that managed
session's pile on the main DSH (with a mirror label in Fishball's chat), or should the card also
appear in Fishball's chat as an answerable card?
Q2. If Fishball's selected model cannot accept images, should the call be refused with
`images-unsupported` (proposed), or should Fishball switch to an image-capable model first?
Q4. Where should the isolated Fishball's installable plugins come from: the DSH plugin market
index, a fixed recommended list, or a manual package spec only?
Q8. Do routine outbound messages (a `message_fishball` delivery, a `message_session` send) each get
a decision label, or only decisions about permissions, questions and escalations? Labels per
message could fill the timeline when Fishball is chatty.
Q9. Should the isolated Fishball's OAuth providers (ChatGPT and Claude subscriptions) be logged in
inside the embedded page's own minimal settings area, or do you expect to log in elsewhere?
Q10. Should the child's chat UI be plain modern JavaScript with no build step (proposed, so a UI
change is one file edit in the isolated Fishball), or may it use a build step with React?
Q11. Is dropping watch-only and send-only acceptable now that hand-over with an optional note
covers both?
Q12. Should the embed survive a main DSH restart with the same child instance (re-mint the bearer
and keep the open page), or is reloading the page acceptable?
Q13. Sidebar composition: wait for the DSH slot change before shipping the running fish, or ship
the interim CSS base layer now (static fish and flip under the spinner; the orca swim arrives with
the upstream slot)?

## 15. Task breakdown for parallel single-task sessions

Rules for every task: one branch, one deliverable; do not read or write another task's files; the
separate testing session owns all test code; merge before the dependants start. `client.js` is a
single DSH client module, so **at most one task per wave may own it** (marked `[client]`).

### Wave 1 — contract (one task, everything builds on it)

**T01 — Freeze the slim contract and this design**
- Goal: one place that defines every operation, frame, limit, error code and route both sides use.
- Owns: `docs/slim-native-design.md`, `src/slim/contract.js`, `src/slim/limits.js`.
- Provides: envelope v2 (adds `attachment.*`), operation allowlist, payload validators, status
  model, `/fishball/embed/*` route names, bearer rules.
- Depends: none. Acceptance: every later task can name its payloads from this file; no later task
  edits it without a contract change note.
- Tests: `CONTRACT-01 envelope rejects an unknown key`; `-02 unknown operation rejected`;
  `-03 oversize frame rejected`; `-04 capability mismatch rejected`.

### Wave 2 — runtime and child app (parallel)

**T02 — Slim child runtime `[host]`**
- Goal: the child boots a base-only profile plus the Fishball app row, and readiness means core
  plus server, not web UI.
- Owns: `src/native-runtime/*` (constants, installation, overlay, index), `native-child.js`.
- Depends: T01. Acceptance: `dsh` starts with the base-only profile, the app row mounts, the
  lifecycle reports ready, stop/restart and the parent-pipe exit path still work, and no
  `webServer` or `webApp` injection remains. The app row itself is T03.
- Tests: `LIFE-01 base-only profile reaches ready`; `-02 missing app row fails loud`; `-03 stop is
  bounded`; `-04 parent exit stops the child`; `-05 snapshot contains the slim app`.

**T03 — Child app, server and embed auth `[child]`**
- Goal: the child serves its page, API and SSE on loopback, accepts only the parent bearer, and
  exposes the embed endpoints.
- Owns: `src/slim/child/app.js`, `server.js`, `auth.js`, `src/slim/ui/shell.html`.
- Depends: T01. It implements the row T02 inserts and the pair is verified together at wave merge;
  no T02 file is edited here.
- Tests: `SRV-01 401 without bearer`; `-02 rotated bearer rejected`; `-03 SSE heartbeat and
  reconnect`; `-04 CSP headers`; `-05 no-store on shell`; `-06 embed endpoints exist`.

### Wave 3 — bridge, embed, admin, reminders (parallel; one client task)

**T04 — Embedded page `[host]` plus `[client]`**
- Goal: the Fishball button opens a panel that frames the child's page through the main origin.
- Owns: `src/slim/host/embed.js`, the embed component in `client.js`.
- Depends: T02, T03. Acceptance: the iframe URL has no token; the route rejects non-same-origin and
  unauthenticated requests; SSE streams through; a stopped child yields a 503 error card with
  Retry; no new tab.
- Tests: `EMBED-01 authenticated same-origin document`; `-02 cross-origin rejected`; `-03
  unauthenticated 401`; `-04 SSE passthrough`; `-05 child down 503 and Retry`; `-06 no token in URL
  or page storage`.

**T05 — Bridge v2: sessions and messages `[host]` plus `[child]`**
- Goal: Fishball can list, start, message, redirect, stop, read and watch main-DSH sessions
  through typed operations.
- Owns: `src/slim/host/bridge.js`, `src/slim/child/bridge.js`, child tool definitions.
- Depends: T01, T02. Acceptance: every operation in §5.2 works against a disposable main DSH;
  authorization refuses unmanaged sessions; delivery dedupe and "never retry unconfirmed" hold;
  reading is bounded; starting never creates a folder.
- Tests: `BRIDGE-01 list managed sessions`; `-02 start in an existing folder`; `-03 start refuses a
  missing folder`; `-04 message delivered once`; `-05 unconfirmed is not retried`; `-06 read is
  bounded`; `-07 unmanaged session refused`; `-08 stop leaves the session managed`.

**T10 — Reminders in the child `[child]`**
- Goal: Fishball can create, list, update and delete reminders and see them in its UI.
- Owns: `src/slim/child/reminders.js`, `src/slim/ui/reminders.js`, the overlay rows T02 composes.
- Depends: T03. Acceptance: a reminder created from chat fires once at its time, is listed, and is
  cancelled; no reminder is lost across a child restart.
- Tests: `REM-01 create and fire once`; `-02 list and update and delete`; `-03 survives restart`.

**T11 — Admin relay and child admin service `[host]` plus `[child]`**
- Goal: the main settings page can read and change the child's model, plugins and settings, and
  restart it, without writing the child's files.
- Owns: `src/slim/host/admin.js`, `src/slim/child/admin.js`.
- Depends: T02, T03, **Q4 answered** (where installable plugins come from). Acceptance: list/install/remove/enable/disable hit the child's profile only;
  model change takes effect on the next request; every mutation is revision-checked; refusals are
  typed, not thrown into the page.
- Tests: `ADMIN-01 list the child's plugins`; `-02 install lands in the child profile, not the
  main one`; `-03 model change is applied`; `-04 unknown plugin is refused`; `-05 restart keeps
  data`.

### Wave 4 — images, chat UI, approvals, settings UI, model sync (parallel; one client task)

**T06 — Images and files across the bridge `[host]` plus `[child]`**
- Goal: both directions of §6 work with rc.3 limits.
- Owns: `src/slim/attachment-transfer.js`, `src/slim/host/images.js`, `src/slim/child/images.js`,
  the image parts of `src/slim/ui/composer.js`.
- Depends: T05, **Q2 answered** (text-only model). Acceptance: png, jpeg, webp and gif accepted, others refused; 4 MiB and 20-image
  limits enforced on both sides; sha256 verified; no path accepted; text-only model refused with
  `images-unsupported`; files arrive as handle text.
- Tests: `IMG-01 session image reaches the model`; `-02 Fishball image reaches a session`;
  `-03 unsupported type refused`; `-04 oversize refused`; `-05 path argument refused`; `-06 file
  becomes handle text`; `-07 text-only model refused`; `-08 user upload to Fishball`.

**T07 — Fishball chat shell `[child]`**
- Goal: a usable chat page: timeline, streaming text, tool rows, composer, model picker, and the
  read-only composer (D8: no permission control at all).
- Owns: `src/slim/ui/*` except the settings, decision and image parts.
- Depends: T03, T05. Acceptance: a prompt streams into the timeline, tool calls render, the model
  picker changes the next request, the composer is read-only with no permission control.
- Tests: `CHAT-01 send and stream a reply`; `-02 tool row renders`; `-03 model switch`; `-04 no
  permission control in the composer`; `-05 read-only session cannot write`; `-06 reconnect shows
  the session`.

**T09 — Approvals, questions and escalation outcomes `[host]` plus `[child]`**
- Goal: Fishball decides allow, grant, reject or escalate and answers questions, from its own chat.
- Owns: `src/slim/child/approvals.js`, `src/slim/host/approvals.js`.
- Depends: T05. Acceptance: a live card is answered once with the current offer id; an expired
  offer is refused; an escalation settles with the user's decision and emits `approval.settled`;
  the same rules as today's allowance apply.
- Tests: `APPR-01 allow once`; `-02 reject`; `-03 grant then use`; `-04 expired offer`; `-05
  escalation answered by the user`; `-06 question answered`; `-07 disconnect does not lose the
  card`.

**T12 — Settings page and one button style `[client]` plus `[host]`**
- Goal: the rebuilt settings page (§9) and the §8.5 restyle of all nine accent buttons.
- Owns: the settings page in `client.js`, the accent token and helper, `src/slim/host/settings-routes.js`.
- Depends: T11, T04, **Q4 answered**. Acceptance: status, model, plugins, settings and restart work end to end
  against a disposable child; every accent button is DSH secondary plus one magenta ring; one
  constant and one CSS class; light and dark checked; no legacy sections.
- Tests: `SET-01 status and restart`; `-02 model change`; `-03 plugin install and uninstall`; `-04
  refusal shows the typed reason`; `-05 all accent buttons share one ring`; `-06 light, dark and
  focus-visible`; `-07 no legacy section remains`.

**T16 — Provider sync into the child `[host]` plus `[child]`**
- Goal: preview and confirm of API-key providers into the child's own home, add-only.
- Owns: `src/slim/child/provider-sync-target.js`, the target wiring in `src/provider-sync-service.js`
  (contract only; no behavior change to preview rules).
- Depends: T02, T11. Acceptance: preview reports metadata and never reads values; confirm writes
  config then credential create-only; conflicts skip; `unknown` is reported and not retried; no
  real key is read in development or tests.
- Tests: `SYNC-01 preview lists add-ready and conflicts`; `-02 confirm adds config`; `-03 existing
  key skipped`; `-04 stale preview refused`; `-05 partial result reported`; `-06 no value in any
  response`.

### Wave 5 — decisions and the row mark (parallel; one client task)

**T08 — Decision labels in Fishball's chat `[child]` plus `[host]`**
- Goal: one inline label per decision at its point in Fishball's timeline, expandable; the trail
  under managed sessions is gone.
- Owns: `src/slim/child/decisions.js` and its UI, removal in `client.js` of tag rendering and in
  `src/approvals.js` and `src/tags.js` of tag writes.
- Depends: T07, T09. Acceptance: each settled decision yields exactly one label; expansion shows
  the request card and Fishball's reply; no label appears in a managed session's turn tail; the
  user's escalation outcome updates the label.
- Tests: `DEC-01 allow label`; `-02 escalation label updates after the user's answer`; `-03
  question label`; `-04 message label`; `-05 expand shows card and reply`; `-06 no turn-tail tags`.

**T13 — Sidebar mark: fish base layer under the spinner `[client]`**
- Goal: the §8.2 layout: the fish in every managed state, DSH's hollow spinner above it, green and
  yellow dots top-right, reduced-motion static.
- Owns: the row mark and its per-session stylesheet in `client.js`; a small host feed of per-session
  state.
- Depends: T05, D11, D13, **Q13 answered**; the orca swim additionally needs the DSH slot change
  in §8.2 (the interim covers the static fish, the flip and the dots).
- Acceptance: the fish is present in every managed state; while running the hollow spinner draws
  above it and the fish shows through; needs-action beats unread; reduced-motion is static; the
  unmanaged row is untouched; the orca path data is imported, not copied where the slot path is used.
- Tests: `MARK-01 fish present in every managed state`; `-02 spinner draws over the fish`; `-03
  needs-action beats unread`; `-04 running plus dot`; `-05 reduced motion static`; `-06 unmanaged
  unchanged`; `-07 DeepSeek mode plays the imported swim`.

### Wave 6 — hand-over (one client task)

**T14 — One hand-over button with a note `[client]` plus `[host]`**
- Goal: §8.3: one button, one optional note, hand over and forward; remove send-only and watch-only.
- Owns: the header and menu components in `client.js`, `src/messaging.js` forward note path,
  `src/watches.js` user-facing entry points.
- Depends: T05, **Q11 answered**. Acceptance: the note is delivered as the user's words outside
  the untrusted block; the session becomes managed; an empty note still hands over; Take back
  still works; the other two buttons and menu items are gone.
- Tests: `HAND-01 hand over with a note`; `-02 hand over without a note`; `-03 note framing is the
  user's words`; `-04 take back`; `-05 no send or watch buttons or menu items`.

### Wave 7 — cleanup (one task)

**T15 — Retire the legacy Fishball `[client]` plus `[host]`**
- Goal: §12, after every new path is merged and green.
- Owns: `index.js`, `cordis.patch.yml`, `package.json` exports, the remaining legacy modules.
- Depends: all. Acceptance: no legacy chat route, no tag table, no dead constants or CSS, the
  plugin still loads with only the new rows, and the main DSH is unaffected on restart.
- Tests: `RET-01 no legacy chat surface`; `-02 plugin loads with the new rows`; `-03 restart is
  clean`; `-04 no orphaned storage table`.

### Dependency graph (summary)

`T01 -> {T02, T03} -> {T04, T05, T10, T11} -> {T06, T07, T09, T12, T16} -> {T08, T13} -> T14 -> T15`

T03 implements the row T02 inserts, so the pair is verified together at the end of wave 2. T13
needs T05 plus the sidebar decision (Q13); T14 needs T05 plus Q11; both own `client.js`, so they are
split across waves 5 and 6.
`client.js` appears in T04, T12, T13, T14 and T15 only, one per wave.

## 16. Test plan outline (names only)

- Contract: `CONTRACT-01..04`.
- Lifecycle: `LIFE-01..05`.
- Child server and embed auth: `SRV-01..06`, `EMBED-01..06`.
- Bridge: `BRIDGE-01..08`.
- Chat: `CHAT-01..06`.
- Images: `IMG-01..08`.
- Approvals and questions: `APPR-01..07`.
- Decision labels: `DEC-01..06`.
- Row mark: `MARK-01..07`.
- Hand-over: `HAND-01..05`.
- Settings: `SET-01..07`.
- Provider sync: `SYNC-01..06`.
- Reminders: `REM-01..03`.
- Retirement: `RET-01..04`.
- End-to-end smoke in a disposable home: `E2E-01 cold start`; `-02 chat and tool call`; `-03
  hand-over and inbound message`; `-04 restart with an open page`; `-05 child crash and Retry`;
  `-06 main DSH shutdown stops the child`.

## 17. Development and testing boundary

This document and the tasks above are development work. The testing session runs every named
scenario in a disposable `DSH_HOME`, with a disposable main home and child home, never the user's
real homes, never a real API key, and never the first real provider sync.
