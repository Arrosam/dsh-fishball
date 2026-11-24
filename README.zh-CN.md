<div align="center">

<img src="assets/fishball-icon.svg" alt="Fishball for DeepSeek Harness" width="88">

<h1>Fishball for DeepSeek Harness</h1>

<p>面向 <b>DeepSeek Harness (DSH)</b> 的常驻个人助手与 MCP/OAuth 控制面。</p>

<p>
  <a href="#快速上手嵌入版"><b>快速上手</b></a> ·
  <a href="#工作原理"><b>工作原理</b></a> ·
  <a href="#独立部署版"><b>独立部署</b></a> ·
  <a href="#通过-mcp-接入外部-agent"><b>MCP &amp; OAuth</b></a> ·
  <a href="#相关仓库"><b>相关仓库</b></a> ·
  <a href="README.md"><b>English</b></a>
</p>

<p>
  <a href="https://www.npmjs.com/package/dsh-fishball-bundle"><img alt="npm alpha" src="https://img.shields.io/npm/v/dsh-fishball-bundle/alpha?label=npm%20alpha&color=22d3ee&labelColor=0c1219"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-5eead4?labelColor=0c1219"></a>
  <img alt="DSH" src="https://img.shields.io/badge/DSH-0.2.1--rc.5%20%7C%200.2.2--rc.1-a78bfa?labelColor=0c1219">
  <br>
  <img alt="协议" src="https://img.shields.io/badge/%E5%8D%8F%E8%AE%AE-MCP%20%2B%20OAuth%202.1-38bdf8?labelColor=0c1219">
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A5%2024.9-3c873a?logo=nodedotjs&logoColor=white&labelColor=0c1219">
  <a href="https://github.com/Arrosam/dsh-fishball-bundle/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Arrosam/dsh-fishball-bundle?color=eab308&labelColor=0c1219"></a>
</p>

</div>

---

**Fishball** 在 **DeepSeek Harness (DSH)** 中运行一个专属的个人助手会话：它可以统筹协调你的其他 DSH 会话、汇总进度、转发或处理权限请求 / 提问 / 计划审批，并代你派发任务，而不会直接修改你的本地文件。

`dsh-fishball-bundle` 是面向普通用户的**一体化嵌入发行版**：一条安装命令即可装齐隔离运行的 Fishball 子实例、MCP/OAuth 连接器、内置前端窗口以及 Watchdog / 跨 DSH 适配器等附加组件。

> **一条命令开箱即用** — 无需手动维护第二套 DSH profile。`dsh-instance` 会自动拉起并看护隔离的 Fishball 子实例、同步 API-key 模型供应商并完成托管 Token 配置。
>
> **Watchdog 与跨 DSH 互联** — `dsh-connector-watchdog` 支持独立配置模型，对受管会话进行巡查并自动审批范围内的权限请求；`dsh-connector-adapter` 可让本 DSH 登录到其他 DSH 的 Connector。
>
> **开放 MCP + OAuth 2.1** — 内置的 `dsh-agent-connector` 同样允许 Claude Code、自建脚本或任意外部 MCP 客户端安全地管理已移交的 DSH 会话。

---

## 工作原理

```
主 DSH（你的工作区与常规会话）
  │
  ├── dsh-agent-connector        MCP (/api/agent/mcp) + OAuth 2.1 (/api/agent/oauth)
  │     └── dsh-connector-ui     侧边栏小鱼入口、内置窗口、移交 / 收回（Hand over / Take back）
  ├── dsh-connector-watchdog     监督受管会话（支持独立模型 + preset-watchdog）
  ├── dsh-connector-adapter      登录其他 DSH 的 Connector（OAuth PKCE + CIMD）
  └── dsh-instance               拉起并桥接隔离的 Fishball 子实例
        │
        └── Fishball 子实例（~/.dsh/fishball/runtime）
              ├── fishball-core        助手运行时、人设与私有技能
              └── fishball-amenities   工作板（Board）、心跳（Heartbeat）与任务板（Taskboard）
```

由 [`cordis.patch.yml`](cordis.patch.yml) 将四个核心包装配在一起：

| 包含包 | 职责 |
| --- | --- |
| `dsh-instance` | 启动并管理隔离的 Fishball 子实例（`fishball-core` + `fishball-amenities`），自动同步 API-key 模型列表并配置托管 Token。 |
| `dsh-agent-connector` | 通过 MCP（`/api/agent/mcp`）和 OAuth 2.1（`/api/agent/oauth`）暴露本 DSH 的会话能力，并提供内置 Fishball 窗口与会话**移交 / 收回**控件。 |
| `dsh-connector-adapter` | 让本 DSH 可以作为客户端登录到其他 DSH 的 Connector。 |
| `dsh-connector-watchdog` | 按目标监督受管会话，并在安全范围内自动审批权限请求（`preset-watchdog`）。 |

> **请勿重复安装：** 使用 `dsh-fishball-bundle` 时，**不要**再单独安装 `dsh-agent-connector`、`dsh-connector-amenities` 或 `dsh-instance`，否则会产生重复的插件条目。

---

## 快速上手（嵌入版）

### 环境要求

| 要求 | 说明 |
| --- | --- |
| **DSH** | `0.2.1-rc.5` 或 `0.2.2-rc.1`（及兼容的 `0.2.2` 版本），支持 DSH Web 与 DSH-X。 |
| **Node.js** | 运行 DSH 需 `24.9+`（包管理工具需 `22.14+`）。 |
| **`$DSH_HOME`** | 默认 `~/.dsh` 必须是**真实的非符号链接目录**（否则子实例会报错 `INVALID_MAIN_HOME`）。 |

### 1. 安装

安装前请先**退出 DSH**。如果之前安装过旧的预览版包（`dsh-fishball`、`fishball-connector`、`fishball-instance`、`fishball-embed-ui`、`dsh-fishball-*`）或单独安装过 `dsh-agent-connector` / `dsh-connector-amenities` / `dsh-instance`，请先卸载它们（若从旧预览版升级，请一并删除 `<DSH_HOME>/fishball/`）。

在 DSH 界面中进入 **Plugins（插件）→ 添加插件 → `dsh-fishball-bundle@1.0.0-alpha.3`**，或在终端执行（如使用非 `web` profile 请替换 `--profile` 参数）：

```bash
dsh plugin --profile web add dsh-fishball-bundle@1.0.0-alpha.3
```

*（安装过程中 pnpm 可能会提示 `@deepseek-ai/*` 为 missing peer dependencies，这些包由 DSH 在运行时提供，属于正常现象，忽略即可。）*

### 2. 首次启动与引导设置

1. 启动 DSH，并在浏览器中使用 `http://127.0.0.1:<端口>` 或 `http://localhost:<端口>` 打开（为保证本地安全，Fishball 窗口仅允许本机回环地址访问）。
2. 点击左侧边栏的小鱼图标（或进入 **插件 → Fishball → 打开 Fishball**）。
3. 按首次启动引导向导完成配置：
   - **Fishball 模型**：自动同步一次你的 API-key 模型供应商列表，并选择 Fishball 使用的模型。*（OAuth 登录型供应商与非 HTTPS 端点不会自动同步，如有需要可在 Fishball 窗口内单独登录。）*
   - **Watchdog 模型**：可选为 `dsh-connector-watchdog` 指定独立模型（未配置时默认停用）。
   - **推荐插件**：按需一键向 Fishball 子实例安装推荐扩展。
4. 之后可随时打开 **插件 → Fishball** 在同一页面管理全部配置：
   - **Fishball 实例** 标签页：查看子实例运行状态、打开 Fishball、重新连接（Reconnect）、检查/同步模型列表以及启停开关。
   - **连接器与 Token** 标签页：创建/管理 MCP Token（`dsht_...`）、配置授权页面端口（默认 `47615`）、DSH 显示名称以及安全限制参数。
   - **组件（Components）** 列表：点开 `dsh-connector-adapter` 或 `dsh-connector-watchdog` 即可配置跨 DSH 连接或 Watchdog 模型与巡查参数。

### 3. 卸载

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

## 独立部署版

如果你希望将 Fishball 运行在**另一套独立的 DSH 实例**中（本机另一个 profile 或另一台主机），并用它管理一个或多个目标 DSH：

### 第一步：在被管理的 DSH 上安装 Connector

先退出被管理的 DSH，然后执行：

```bash
dsh plugin --profile web add dsh-agent-connector@1.0.0-alpha.3
# 可选：同时安装 adapter 与 watchdog 附加组件
dsh plugin --profile web add dsh-connector-amenities@1.0.0-alpha.1
```

启动被管理的 DSH，打开 **插件 → Fishball 连接器（Fishball connector）**，输入标签并点击 **新建 token**，立即复制保存 `dsht_...` 密钥（仅显示一次）。

### 第二步：在 Fishball DSH 上安装 Fishball

先退出专门用于运行 Fishball 的 DSH，然后执行：

```bash
dsh plugin --profile fishball add fishball-core@1.0.0-alpha.1
# 可选：安装工作板、心跳和任务板附加组件
dsh plugin --profile fishball add fishball-amenities@1.0.0-alpha.1
```

*（请按实际 profile 名称替换 `--profile fishball`。）*

### 第三步：将 Fishball 连接到被管理的 DSH

打开 Fishball DSH → **插件 → fishball-core**：

1. 将 **目标地址（Target）** 设为被管理 DSH 的 MCP 地址，例如 `http://127.0.0.1:<端口>/api/agent/mcp`（远程 DSH 请使用 `https://<域名>/api/agent/mcp`）。
2. 任选一种方式完成认证：
   - **直接填 Token**：将 `dsht_...` 粘贴到 **连接 DSH 的 Token** 中并保存。
   - **浏览器授权（OAuth PKCE + CIMD）**：托管一个 [Client ID Metadata Document](#方式-b浏览器--公开-oauth-客户端pkce-s256--cimd)，将 `https://...` 地址填入 **Client metadata URL**，点击 **连接**，并在授权页面（默认 `http://127.0.0.1:47615/authorize`）输入 `dsht_...` 确认授权。

> **本地与远程说明：** 非本机回环地址的连接必须使用 **HTTPS**（例如通过反向代理或内网穿透工具转发，并在启动 DSH 时传入 `--trusted-host`）。仅 `127.0.0.1`、`localhost` 和 `[::1]` 允许使用明文 HTTP。

---

## 通过 MCP 接入外部 Agent

任何兼容 MCP 的 Agent 或编排器（Claude Code、自建脚本或另一台 DSH）都可以管理运行了 `dsh-agent-connector` 的 DSH 会话。请先在 **插件 → Fishball → 连接器与 Token**（嵌入版）或 **插件 → Fishball 连接器**（独立版）中创建专属 `dsht_...` Token。

### 端点列表

| 用途 | 路径 |
| --- | --- |
| MCP Streamable HTTP（`2026-07-28`） | `/api/agent/mcp` |
| OAuth 2.1 签发 / Token 端点 | `/api/agent/oauth`（`/api/agent/oauth/token`） |
| 受保护资源元数据（RFC 9728） | `/.well-known/oauth-protected-resource/api/agent/mcp` |
| 授权服务器元数据（RFC 8414） | `/.well-known/oauth-authorization-server/api/agent/oauth` |
| 浏览器授权确认页（PKCE） | `http://127.0.0.1:47615/authorize` *（端口可配）* |

### 方式 A：机器 / 无头 Agent（`client_credentials`）

1. 向 `POST <origin>/api/agent/oauth/token` 请求 1 小时有效期的 Access Token：
   - `grant_type=client_credentials`
   - `client_id=<agent-id>`（`1–64` 位，匹配 `[A-Za-z0-9_-]+`）
   - `client_secret=<dsht_token>`（支持 HTTP Basic `client_secret_basic` 或表单参数 `client_secret_post`）
   - `resource=<origin>/api/agent/mcp`
2. 携带 `Authorization: Bearer <access_token>` 连接 `/api/agent/mcp`（**不要**附带浏览器的 `Origin` 请求头，服务端会拒绝带 `Origin` 的请求）。
3. 首次连接时 Token 仅拥有 `agent:pair` 权限——调用一次 MCP 工具 `pair`（可选传 `name`）将 `<agent-id>` 与该 Token 绑定，之后即可获得完整的 `agent` 权限。

### 方式 B：浏览器 / 公开 OAuth 客户端（PKCE `S256` + CIMD）

适用于没有 `client_secret` 的交互式 MCP 客户端（包括另一个 DSH 中的 `dsh-connector-adapter`）：

1. 在公网 `https://` 上托管一份 **Client ID Metadata Document (CIMD)**（禁止重定向、不超过 5 KiB、不可指向私网或回环地址）：

   ```json
   {
     "client_id": "https://example.com/dsh/client.json",
     "client_name": "My Agent",
     "redirect_uris": ["http://127.0.0.1/callback"],
     "token_endpoint_auth_method": "none"
   }
   ```

   其中 `client_id` 必须与文档 URL 一致（`http://127.0.0.1:<端口>/callback` 允许任意回环端口）。
2. 使用 `client_id` = CIMD URL 走标准 OAuth 2.1 Authorization Code + PKCE（`S256`）流程，并在授权页输入 `dsht_...` Token 批准。Refresh Token 在每次使用时轮换。
3. 若在另一台 DSH 中通过 `dsh-connector-adapter` 连接，配置好 `clientMetadataUrl` 与 `servers`（`{ serverName, url }`）后，让 Agent 调用 `dsh_connector_sign_in` 即可发起登录。

### 会话与事件工作流

- **权限隔离**：Agent 只能看到并操作自己发起的会话（`session_start`），或用户主动**移交（Hand over）**给它的会话（可在 DSH 会话顶部或菜单中操作）。
- **事件邮箱**：订阅 `dsh-agent://events` 获取变更通知，使用 `inbox_poll` 拉取事件并使用 `inbox_ack` 确认消费。
- **审批与控制**：支持 `session_message`、`session_read`、`session_stop`、`session_redirect`、`session_release`、`permission_decide`、`question_answer` 与 `plan_review_decide`；订阅 `dsh-agent://identity` 可实时获取 DSH 名称更新。
- **远程暴露**：需将 DSH Web 端口与授权端口（`47615`）一并通过反向代理或内网穿透暴露为 `https://`，并在启动 DSH 时传入 `--trusted-host`。

---

## 相关仓库

如需查看源码、运行完整测试套件、单独定制组件或手动离线打包，请访问对应的底层仓库：

| 仓库 | npm 包 | 说明 |
| --- | --- | --- |
| [`Arrosam/dsh-connector`](https://github.com/Arrosam/dsh-connector) | `dsh-agent-connector`、`dsh-connector-amenities`、`dsh-connector-adapter`、`dsh-connector-watchdog`、`dsh-connector-shared` | 通用 DSH 侧 MCP/OAuth 连接器、会话 UI 组件、跨 DSH 适配器与 Watchdog。 |
| [`Arrosam/dsh-fishball`](https://github.com/Arrosam/dsh-fishball) | `fishball-core`、`fishball-amenities`、`fishball-board`、`fishball-heartbeat`、`fishball-taskboard`、`fishball-shared` | Fishball 助手运行时、人设、私有技能与 Fishball 侧附加组件。 |
| [`Arrosam/dsh-fishball-instance`](https://github.com/Arrosam/dsh-fishball-instance) | `dsh-instance` | 嵌入式子 DSH 启动器、模型供应商同步、引导向导与生命周期管理。 |

## 许可证

[MIT](LICENSE)
