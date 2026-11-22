# Fishball for DeepSeek Harness (`dsh-fishball-bundle`)

[English](README.md)

**Fishball** 是为 **DeepSeek Harness (DSH)** 打造的常驻个人助手。它通过一个独立的助手会话协调你在 DSH 中的其他会话：汇总进展、转发或代答权限请求、提问与计划评审，并在不直接修改本地文件的前提下为你调度工作。

本仓库是面向大众用户的**项目主页面**：

- **一体化嵌入版（推荐）：** 通过 `dsh-fishball-bundle` 一键安装完整版 Fishball 到你的主 DSH 中。
- **独立部署版：** 在独立的 DSH 实例或另一台机器上运行 Fishball，通过 MCP 连接主 DSH。
- **接入其他 MCP Agent：** 通过标准 MCP + OAuth 2.1 将 DSH 会话能力开放给任意外部 Agent 或客户端。

---

## 支持的 DSH 版本

- **DSH `0.2.1-rc.5` 与 `0.2.2-rc.1`**（以及兼容的 `0.2.2` 版本），支持 DSH Web 与 DSH-X。
- 运行 DSH 需要 **Node `24.9+`**（打包构建需要 `22.14+`）。
- `$DSH_HOME` 目录（默认 `~/.dsh`）必须是真实路径，路径中不能包含符号链接（否则嵌入子进程会报 `INVALID_MAIN_HOME`）。

---

## 1. 一键安装：一体化嵌入版（推荐）

`dsh-fishball-bundle` 将嵌入式 Fishball 所需的全部组件打包在一起，只需安装这一个插件即可：

| 包含组件 | 作用 |
| --- | --- |
| `dsh-instance` | 在隔离的子 DSH 中自动部署并运行 `fishball-core`（含 `fishball-ui`）与 `fishball-amenities`，自动同步 API-key 模型列表并签发托管 Token。 |
| `dsh-agent-connector` | 提供 MCP（`/api/agent/mcp`）与 OAuth（`/api/agent/oauth`）服务、侧边栏 Fishball 入口与窗口（`dsh-connector-ui`），以及会话中的 **交给 / 收回（Hand over / Take back）** 控制。 |
| `dsh-connector-adapter` | 让当前 DSH 通过 MCP 登录并操作其他 DSH 的 connector。 |
| `dsh-connector-watchdog` | 根据会话目标监督托管会话，并在安全范围内自动处理权限请求（附带 `preset-watchdog`）。 |

> **重要提示：** 请勿将 `dsh-agent-connector`、`dsh-connector-amenities` 或 `dsh-instance` 与 `dsh-fishball-bundle` 同时安装——本包已完整包含它们，重复安装会导致组件重复加载。

### 安装步骤

安装前请先**退出 DSH**。如果之前安装过旧的预览版包（`dsh-fishball`、`fishball-connector`、`fishball-instance`、`fishball-embed-ui`、`dsh-fishball-*`）或单独安装过 `dsh-agent-connector` / `dsh-connector-amenities` / `dsh-instance`，请先卸载它们（若从旧预览版升级，请一并删除 `<DSH_HOME>/fishball/`）。

在 DSH 界面中进入 **Plugins（插件）→ 添加插件 → `dsh-fishball-bundle@1.0.0-alpha.1`**，或在终端执行（如使用非 `web` profile 请替换 `--profile` 参数）：

```bash
dsh plugin --profile web add dsh-fishball-bundle@1.0.0-alpha.1
```

*（安装过程中 pnpm 可能会提示 `@deepseek-ai/*` 为 missing peer dependencies，这些包由 DSH 在运行时提供，属于正常现象，忽略即可。）*

### 首次启动与设置

1. 启动 DSH，并在浏览器中使用 `http://127.0.0.1:<端口>` 或 `http://localhost:<端口>` 打开（为保证本地安全，Fishball 窗口仅允许本机回环地址访问）。
2. 点击左侧边栏的小鱼图标（或进入 **插件 → Fishball → 打开 Fishball**）。
3. 首次启动时，Fishball 会自动同步一次你的 API-key 模型供应商列表，并在界面中提示你为 Fishball 选择模型。（OAuth 登录型供应商与非 HTTPS 端点不会自动同步，如有需要可在 Fishball 窗口内单独登录。）
4. 打开 **插件 → Fishball** 即可在同一页面完成全部配置：
   - **Fishball 实例** 标签页：查看子实例运行状态、打开 Fishball、重新连接（Reconnect）、检查/同步模型列表以及启停开关。
   - **连接器与 Token** 标签页：创建/管理 MCP Token、配置授权页面端口（默认 `47615`）、DSH 显示名称以及安全限制参数。
   - **组件（Components）** 列表：直接点开 `dsh-connector-adapter` 或 `dsh-connector-watchdog` 即可配置跨 DSH 连接或 Watchdog 巡查参数。

### 卸载（嵌入版）

1. 先退出 DSH（同时会停止嵌入的 Fishball 子进程）。
2. 运行清理脚本移除 `<DSH_HOME>/fishball/runtime`（若自定义了目录请加 `--home <路径>`）：

   ```bash
   node ~/.dsh/profiles/web/node_modules/dsh-instance/uninstall.js
   ```

3. 移除插件包：

   ```bash
   dsh plugin --profile web remove dsh-fishball-bundle
   ```

---

## 2. 独立部署版（独立的 Fishball DSH）

如果你希望将 Fishball 运行在**另一套独立的 DSH 实例**中（本机另一个 profile 或另一台主机），并用它管理一个或多个目标 DSH：

### 第一步：在被管理的 DSH 上安装 Connector

在需要暴露会话的 DSH 上安装（先退出 DSH）：

```bash
dsh plugin --profile web add dsh-agent-connector@1.0.0-alpha.2
# 可选：同时安装 adapter 与 watchdog 附加组件
dsh plugin --profile web add dsh-connector-amenities@1.0.0-alpha.1
```

启动被管理的 DSH，打开 **插件 → Fishball 连接器（Fishball connector）**，输入标签并点击 **新建 token**，立即复制保存 `dsht_...` 密钥（仅显示一次）。

### 第二步：在 Fishball DSH 上安装 Fishball

在专门用于运行 Fishball 的 DSH 上安装（先退出 DSH）：

```bash
dsh plugin --profile fishball add fishball-core@1.0.0-alpha.1
# 可选：安装工作板、心跳和任务板附加组件
dsh plugin --profile fishball add fishball-amenities@1.0.0-alpha.1
```

*（请按实际 profile 名称替换 `--profile fishball`。）*

### 第三步：连接两端的 DSH

打开 Fishball DSH → **插件 → fishball-core**：

1. 将 **目标（Target）** 设置为被管理 DSH 的 MCP 端点，例如 `http://127.0.0.1:<端口>/api/agent/mcp`（跨机器访问需使用 `https://...`）。
2. 使用以下任一方式完成认证：
   - **直接填入 Token：** 将刚才创建的 `dsht_...` 粘贴到 **连接 DSH 所用的 Token** 中并点击 **保存**。
   - **浏览器授权（Connect / OAuth PKCE + CIMD）：** 托管一个 [Client ID Metadata Document](#方法-b浏览器与公开-oauth-客户端pkce-s256--cimd)，在 **客户端元数据地址** 中填入其 `https://...` 地址并点击 **Connect**，随后在打开的授权页面（默认 `http://127.0.0.1:47615/authorize`）中输入 Token 完成授权。

> **注意：** 非本机回环地址连接必须使用 **HTTPS**（例如通过反向代理或内网穿透工具暴露，并为 DSH 添加 `--trusted-host`）。明文 HTTP 仅限 `127.0.0.1`、`localhost` 和 `[::1]`。

---

## 3. 通过 MCP 接入其他 Agent

任何支持标准 MCP 的 Agent 或编排器（Claude Code、自定义脚本/机器人或其他 DSH）都可以连接到运行了 `dsh-agent-connector` 的 DSH（`dsh-fishball-bundle` 与 `dsh-agent-connector` 均提供该服务）。

### 服务端点一览

| 用途 | 路径 |
| --- | --- |
| MCP Streamable HTTP（`2026-07-28`） | `/api/agent/mcp` |
| OAuth 2.1 签发 / Token 端点 | `/api/agent/oauth`（`/api/agent/oauth/token`） |
| 受保护资源元数据（RFC 9728） | `/.well-known/oauth-protected-resource/api/agent/mcp` |
| 授权服务器元数据（RFC 8414） | `/.well-known/oauth-authorization-server/api/agent/oauth` |
| 浏览器授权页面（PKCE） | `http://127.0.0.1:47615/authorize`（端口可配） |

请先在连接器设置页中（嵌入版：**插件 → Fishball → 连接器与 Token**；独立版：**插件 → Fishball 连接器**）为你的 Agent 创建一个专属 `dsht_...` Token。

### 方法 A：无头 / 服务端 Agent（`client_credentials`）

1. 向 `POST <origin>/api/agent/oauth/token` 请求有效期 1 小时的 Access Token：
   - `grant_type=client_credentials`
   - `client_id=<agent-id>`（`1–64` 位 `[A-Za-z0-9_-]+`）
   - `client_secret=<dsht_token>`（支持 HTTP Basic `client_secret_basic` 或表单参数 `client_secret_post`）
   - `resource=<origin>/api/agent/mcp`
2. 在 `/api/agent/mcp` 请求头携带 `Authorization: Bearer <access_token>`（注意不要附带浏览器的 `Origin` 请求头，携带 `Origin` 的请求会被拒绝）。
3. 首次连接时 Token 仅拥有 `agent:pair` 配对权限：调用一次 MCP 工具 `pair`（可选 `name` 参数）将该 `<agent-id>` 与 Token 绑定。绑定后当前及后续签发的 Token 即具备完整 `agent` 管理权限。

### 方法 B：浏览器与公开 OAuth 客户端（PKCE S256 + CIMD）

适用于无法保管客户端密钥的交互式 MCP 客户端（例如另一台 DSH 中的 `dsh-connector-adapter`）：

1. 在公网 `https://` 地址托管一个 **Client ID Metadata Document (CIMD)**（不可重定向，不超过 5 KiB，禁止指向私网/回环地址）：

   ```json
   {
     "client_id": "https://example.com/dsh/client.json",
     "client_name": "My Agent",
     "redirect_uris": ["http://127.0.0.1/callback"],
     "token_endpoint_auth_method": "none"
   }
   ```

   其中 `client_id` 必须与文档自身的 URL 完全一致（`http://127.0.0.1:<任意端口>/callback` 允许任意回环端口）。
2. 使用该 CIMD URL 作为 `client_id` 发起标准 OAuth 2.1 Authorization Code + PKCE（`S256`）流程，并在弹出的授权页面输入 `dsht_...` Token 完成配对与授权（Refresh Token 支持轮换）。
3. 若使用另一台 DSH 的 `dsh-connector-adapter` 接入，在其组件设置中填写 `clientMetadataUrl` 与 `servers`（`{ serverName, url }`），然后让 Agent 调用 `dsh_connector_sign_in` 工具即可登录。

### 会话控制与事件模型

- **会话隔离：** Agent 只能查看并操作自己通过 `session_start` 启动的会话，或由用户在 DSH 会话界面主动点击 **交给（Hand over）** 移交的会话。
- **事件邮箱：** 订阅资源 `dsh-agent://events` 获取变更提示，通过 `inbox_poll` 拉取事件并使用 `inbox_ack` 确认。
- **常用控制工具：** `session_message`、`session_read`、`session_stop`、`session_redirect`、`session_release`、`permission_decide`、`question_answer`、`plan_review_decide`，以及通过 `dsh-agent://identity` 读取/订阅 DSH 名称变更。
- **远程访问说明：** 远程暴露时需自行通过反向代理或隧道同时转发 DSH Web 端口与授权端口（默认 `47615`）到同一个 `https://` 域名下，并在启动 DSH 时添加 `--trusted-host`。

---

## 4. 底层实现包与仓库（面向高阶用户与开发者）

如果你需要查看源码、运行自动化测试、单独选用或定制部分底层插件，可前往对应的底层实现仓库：

| 仓库 | npm 包 | 说明 |
| --- | --- | --- |
| [`Arrosam/dsh-connector`](https://github.com/Arrosam/dsh-connector) | `dsh-agent-connector`, `dsh-connector-amenities`, `dsh-connector-adapter`, `dsh-connector-watchdog`, `dsh-connector-shared` | 通用 DSH 侧 MCP/OAuth 连接器、会话标记与窗口 UI、跨 DSH 适配器与 Watchdog。 |
| [`Arrosam/dsh-fishball`](https://github.com/Arrosam/dsh-fishball) | `fishball-core`, `fishball-amenities`, `fishball-board`, `fishball-heartbeat`, `fishball-taskboard`, `fishball-shared` | Fishball 助手核心逻辑、Persona、私有 Skills 与 Fishball 侧附加组件。 |
| [`Arrosam/dsh-fishball-instance`](https://github.com/Arrosam/dsh-fishball-instance) | `dsh-instance` | 嵌入式子 DSH 进程托管、模型列表同步与生命周期管理。 |

## 开源协议

[MIT](LICENSE)
