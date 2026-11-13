"""V3-S7b Python MCP SDK probe: the stock `OAuthClientProvider` (authorization code + PKCE, CIMD
client id, loopback redirect, iss check, refresh) and `ClientCredentialsOAuthProvider`.

Reads one JSON object from stdin (URLs, token values, CA file); secrets never appear in argv or env.
Each scenario is driven against the disposable DSH that `probe-py.mjs` started. The "browser" is a
scripted form submit (httpx2) the redirect handler runs; the callback handler waits for the redirect
to reach a loopback listener on an OS-assigned port. Prints one JSON result line. Throwaway spike code.
"""

import asyncio
import json
import re
import socket
import ssl
import sys
import warnings
from urllib.parse import parse_qs, urlparse

import httpx2
from mcp import Client
from mcp.client.auth import OAuthClientProvider
from mcp.client.auth.extensions.client_credentials import ClientCredentialsOAuthProvider
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.auth import AuthorizationCodeResult, OAuthClientMetadata

cfg = json.loads(sys.stdin.read())

# The simulated tunnel host resolves to loopback in this probe process only (the stand-in for public DNS
# pointing at the user's tunnel). The SDK is untouched; only name resolution is redirected.
_real_getaddrinfo = socket.getaddrinfo


def _spike_getaddrinfo(host, *args, **kwargs):
    name = host.decode() if isinstance(host, bytes) else host   # anyio passes IDNA-encoded bytes
    if name in cfg.get("resolve", {}):
        host = cfg["resolve"][name]
    return _real_getaddrinfo(host, *args, **kwargs)


socket.getaddrinfo = _spike_getaddrinfo
CB_PATH = "/cb"
wire: list[dict] = []


class Memory:
    def __init__(self) -> None:
        self.tokens = None
        self.client_info = None

    async def get_tokens(self):
        return self.tokens

    async def set_tokens(self, tokens) -> None:
        self.tokens = tokens

    async def get_client_info(self):
        return self.client_info

    async def set_client_info(self, info) -> None:
        self.client_info = info


def tls_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    if cfg.get("caFile"):
        ctx.load_verify_locations(cfg["caFile"])
    return ctx


async def on_request(request: httpx2.Request) -> None:
    entry = {"method": request.method, "path": urlparse(str(request.url)).path, "host": request.url.host}
    if request.url.path.endswith("/oauth/token"):
        form = parse_qs(request.content.decode())
        entry["params"] = sorted(form.keys())
        entry["grant"] = form.get("grant_type", [None])[0]
    wire.append(entry)


class Callback:
    """A loopback redirect listener on an OS-assigned port (exercises the any-port rule)."""

    def __init__(self) -> None:
        self.future: asyncio.Future = asyncio.get_running_loop().create_future()
        self.server = None
        self.port = 0

    async def start(self) -> None:
        async def handle(reader, writer):
            line = (await reader.readline()).decode()
            while (await reader.readline()) not in (b"\r\n", b""):
                pass
            writer.write(b"HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: close\r\n\r\nok")
            await writer.drain()
            writer.close()
            target = line.split(" ")[1]
            if not self.future.done():
                self.future.set_result({k: v[0] for k, v in parse_qs(urlparse(target).query).items()})

        self.server = await asyncio.start_server(handle, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]

    async def close(self) -> None:
        self.server.close()


async def scripted_browser(authorization_url: str, fields: dict, page_log: list) -> None:
    """Open the page, submit the form like the page does, follow the redirect to the loopback client."""
    async with httpx2.AsyncClient(verify=tls_context(), follow_redirects=False) as browser:
        page = await browser.get(authorization_url, headers={"sec-fetch-site": "none"})
        html = page.text
        request_id = re.search(r'name="request" value="([^"]*)"', html)
        nonce = re.search(r'name="form" value="([^"]*)"', html)
        entry = {"pageStatus": page.status_code, "cacheControl": page.headers.get("cache-control"), "pageHost": urlparse(authorization_url).netloc}
        if not request_id:
            entry["alert"] = (re.search(r'<p role="alert">([^<]*)</p>', html) or [None, None])[1]
            page_log.append(entry)
            return
        origin = f"{urlparse(authorization_url).scheme}://{urlparse(authorization_url).netloc}"
        decided = await browser.post(
            origin + "/authorize/decision",
            data={"request": request_id[1], "form": nonce[1], "action": fields.pop("action", "authorize"), **fields},
            headers={"origin": origin, "sec-fetch-site": "same-origin"},
        )
        entry["decisionStatus"] = decided.status_code
        alert = re.search(r'<p role="alert">([^<]*)</p>', decided.text)
        entry["alert"] = alert[1] if alert else None
        page_log.append(entry)
        location = decided.headers.get("location")
        if location:
            async with httpx2.AsyncClient() as follow:
                await follow.get(location)


def provider_for(storage: Memory, cb: Callback, fields: dict, page_log: list) -> OAuthClientProvider:
    redirect = f"http://127.0.0.1:{cb.port}{CB_PATH}"
    metadata = OAuthClientMetadata(
        redirect_uris=[redirect], client_name="Agent P", grant_types=["authorization_code", "refresh_token"],
        response_types=["code"], token_endpoint_auth_method="none",
    )

    async def redirect_handler(url: str) -> None:
        asyncio.get_running_loop().create_task(scripted_browser(url, dict(fields), page_log))

    async def callback_handler() -> AuthorizationCodeResult:
        params = await asyncio.wait_for(cb.future, 10)
        cb.future = asyncio.get_running_loop().create_future()   # each authorization waits for its own redirect
        if "error" in params:
            raise RuntimeError(f"authorization error {params['error']} iss={params.get('iss')} state={'state' in params}")
        return AuthorizationCodeResult(code=params["code"], state=params.get("state"), iss=params.get("iss"))

    return OAuthClientProvider(
        server_url=cfg["mcp"], client_metadata=metadata, storage=storage,
        redirect_handler=redirect_handler, callback_handler=callback_handler, client_metadata_url=cfg["cimd"],
    )


def leaf(error: BaseException) -> BaseException:
    while isinstance(error, BaseExceptionGroup):
        error = error.exceptions[0]
    return error


async def control(action: str, **extra) -> dict:
    async with httpx2.AsyncClient() as c:
        r = await c.post(cfg["control"], headers={"x-s7b-control": cfg["controlKey"]}, content=json.dumps({"action": action, **extra}))
        return r.json()


async def browser_session(fields: dict, mcp_url: str | None = None, keep=None) -> dict:
    """One authorization-code connection; optional `keep(client)` coroutine runs extra calls."""
    cb = Callback()
    await cb.start()
    storage = Memory()
    pages: list = []
    provider = provider_for(storage, cb, fields, pages)
    if mcp_url:
        provider.context.server_url = mcp_url
    out: dict = {"callbackPort": cb.port}
    try:
        async with httpx2.AsyncClient(auth=provider, verify=tls_context(), event_hooks={"request": [on_request]}) as http:
            async with Client(streamable_http_client(mcp_url or cfg["mcp"], http_client=http), mode=cfg["protocol"]) as client:
                out["tools"] = sorted(t.name for t in (await client.list_tools()).tools)
                out["whoami"] = (await client.call_tool("whoami", {})).structured_content
                if keep:
                    out.update(await keep(client, storage, provider))
        out["ok"] = True
    except BaseException as error:  # noqa: BLE001 - spike reports every failure
        e = leaf(error)
        out["ok"] = False
        out["error"] = f"{type(e).__name__}: {str(e)[:300]}"
    finally:
        await cb.close()
    out["pages"] = pages
    t = storage.tokens
    out["tokenScope"] = t.scope if t else None
    out["hasRefresh"] = bool(t and t.refresh_token)
    return out


# Machine exchange: pair-only token, scope narrowing, 403 step-up behaviour.
async def cc_run(client_id: str, secret: str, do_pair: bool) -> dict:
    storage = Memory()
    p = ClientCredentialsOAuthProvider(server_url=cfg["mcp"], storage=storage, client_id=client_id, client_secret=secret,
                                       token_endpoint_auth_method="client_secret_basic", issuer=cfg["issuer"], scope="fishball")
    r: dict = {}
    try:
        async with httpx2.AsyncClient(auth=p, event_hooks={"request": [on_request]}) as http:
            async with Client(streamable_http_client(cfg["mcp"], http_client=http), mode=cfg["protocol"]) as client:
                r["tools"] = sorted(t.name for t in (await client.list_tools()).tools)
                r["scope"] = storage.tokens.scope
                r["hasRefresh"] = bool(storage.tokens.refresh_token)
                if do_pair:
                    r["pair"] = (await client.call_tool("pair", {})).structured_content
                try:
                    r["whoami"] = (await client.call_tool("whoami", {})).structured_content
                except BaseException as error:  # noqa: BLE001
                    e = leaf(error)
                    r["whoamiError"] = f"{type(e).__name__}: {str(e)[:200]}"
        r["ok"] = True
    except BaseException as error:  # noqa: BLE001
        e = leaf(error)
        r["ok"] = False
        r["error"] = f"{type(e).__name__}: {str(e)[:300]}"
    return r



async def main() -> None:
    out: dict = {}
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        if cfg.get("mode") == "cc":
            out["cc"] = await cc_run(cfg["clientId"], cfg["tokens"]["machine"], True)
            out["warnings"] = [str(w.message)[:200] for w in caught]
            out["wire"] = wire
            print(json.dumps(out))
            return

        # B1/B2: full flow, then an expired access token → refresh (rotation), no page. The SDK refreshes
        # only when its own expires_in clock says so, so time passing is simulated on both sides.
        async def after_expiry(client, storage, provider):
            rt1 = storage.tokens.refresh_token
            await control("expireAll")
            provider.context.token_expiry_time = 1.0   # in the past (0 would read as "no expiry")
            who = (await client.call_tool("whoami", {})).structured_content
            return {"afterExpiry": who, "rotated": storage.tokens.refresh_token != rt1}

        # Server-side revocation only (client clock still valid): what does the SDK do on the 401?
        async def after_server_401(client, storage, provider):
            await control("expireAll")
            mark = len(wire)
            try:
                await client.call_tool("whoami", {})
                outcome = "ok"
            except BaseException as error:  # noqa: BLE001
                outcome = type(leaf(error)).__name__
            grants = [w.get("grant") for w in wire[mark:] if w.get("grant")]
            return {"server401Outcome": outcome, "server401Grants": grants,
                    "server401Discovery": sum(1 for w in wire[mark:] if "well-known" in w["path"])}

        out["browser"] = await browser_session({"token": cfg["tokens"]["first"], "id": "agent-p-1", "name": "Py Agent"}, keep=after_expiry)
        out["server401"] = await browser_session({"token": cfg["tokens"]["second"], "id": "agent-p-401"}, keep=after_server_401)

        # iss mismatch: the client must refuse before redeeming the code.
        await control("issOverride", value="https://evil.example/oauth")
        before = len([w for w in wire if w.get("grant") == "authorization_code"])
        out["issMismatch"] = await browser_session({"token": cfg["tokens"]["iss"], "id": "agent-p-iss"})
        out["issMismatch"]["codeRedemptions"] = len([w for w in wire if w.get("grant") == "authorization_code"]) - before
        await control("issOverride", value=None)

        # Cancel → access_denied reaches the callback handler.
        out["cancel"] = await browser_session({"action": "cancel"})

        # Already-paired on the page (the first token is bound now).
        out["alreadyPaired"] = await browser_session({"token": cfg["tokens"]["first"], "id": "agent-p-2"})

        # Behind the tunnel: https://fb.example (TLS terminated by the local proxy).
        if cfg.get("tunnelMcp"):
            out["tunnel"] = await browser_session({"token": cfg["tokens"]["tunnel"], "id": "agent-p-tunnel"}, mcp_url=cfg["tunnelMcp"])

        mark = len(wire)
        out["ccUnpaired"] = await cc_run("py-machine", cfg["tokens"]["machine"], False)
        out["ccUnpaired"]["tokenRequests"] = [w for w in wire[mark:] if w.get("grant")]
        out["ccPair"] = await cc_run("py-machine", cfg["tokens"]["machine"], True)

    out["warnings"] = [str(w.message)[:200] for w in caught]
    out["wire"] = wire
    print(json.dumps(out))


asyncio.run(main())
