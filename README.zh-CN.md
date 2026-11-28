<div align="center">

<img src="assets/fishball-icon.svg" alt="Fishball for DeepSeek Harness" width="88">

<h1>Fishball for DeepSeek Harness</h1>

<p>在自己的子 DSH 中运行、统筹你 <b>DeepSeek Harness (DSH)</b> 会话的个人助手。</p>

<p>
  <a href="#安装"><b>安装</b></a> ·
  <a href="#工作原理"><b>工作原理</b></a> ·
  <a href="#组件"><b>组件</b></a> ·
  <a href="#连接器端点"><b>MCP &amp; OAuth</b></a> ·
  <a href="TESTING.md"><b>开发</b></a> ·
  <a href="README.md"><b>English</b></a>
</p>

<p>
  <a href="https://www.npmjs.com/package/dsh-fishball-bundle"><img alt="npm alpha" src="https://img.shields.io/npm/v/dsh-fishball-bundle/alpha?label=npm%20alpha&color=22d3ee&labelColor=0c1219"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-5eead4?labelColor=0c1219"></a>
  <img alt="DSH" src="https://img.shields.io/badge/DSH-0.2.1--rc.5%20%7C%200.2.2--rc.1-a78bfa?labelColor=0c1219">
  <br>
  <img alt="协议" src="https://img.shields.io/badge/%E5%8D%8F%E8%AE%AE-MCP%20%2B%20OAuth%202.1-38bdf8?labelColor=0c1219">
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A5%2024.9-3c873a?logo=nodedotjs&logoColor=white&labelColor=0c1219">
  <a href="https://github.com/Arrosam/dsh-fishball/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Arrosam/dsh-fishball?color=eab308&labelColor=0c1219"></a>
</p>

</div>

---

**Fishball（鱼丸）** 是 DeepSeek Harness 的常驻个人助手。它在属于自己的**子 DSH** 中运行一个长期会话，
并通过 **`dsh-connector`** 管理你**主 DSH** 中的会话：读取进度，回答或转交权限请求、提问和计划审批，
替你新建会话并发送消息。它负责阅读、整理、决策和派发，但自己不动手干活，也从不写入你的本地文件
（它自己的私有 Skills 是唯一例外）。

Fishball 是一个普通的 MCP agent。连接器通过 MCP 和 OAuth 2.1 暴露一个 DSH 的会话，Fishball 只使用
这一公开接口。两边从不互相导入代码，连接器也服务于任何 MCP 客户端，而不只是 Fishball。

> **一次安装** — `dsh-fishball-bundle` 把连接器、托管实例、Watchdog 和跨 DSH 适配器装进你的主 DSH。
> 之后由 `dsh-instance` 创建、启动并看护 Fishball 的子 DSH，为它配置连接器 Token，并把你的 API-key
> 模型供应商复制进去。
>
> **移交与收回** — 由你决定 Fishball 管理哪些会话，其余会话它一概看不到。
>
> **Watchdog** — 可选的监督者，使用独立模型，让受管会话不偏离目标，并在请求到达 Fishball 之前处理
> 范围内的权限请求。

---

## 工作原理

```
主 DSH（你的工作区与会话）
  │
  ├── dsh-agent-connector       MCP /api/agent/mcp + OAuth 2.1 /api/agent/oauth，移交 / 收回
  │     └── dsh-connector-ui    侧边栏 Fishball 入口与窗口、通知提示
  ├── dsh-connector-watchdog    监督受管会话，裁决范围内的权限请求
  ├── dsh-connector-adapter     让本 DSH 登录其他 DSH 的连接器
  └── dsh-instance              创建、启动并看护子 DSH
        │
        └── 子 DSH（<DSH_HOME>/fishball/runtime）
              ├── fishball-core        管理会话  ── MCP ──▶ 主 DSH 的连接器
              │     └── fishball-ui    Fishball 页面、提问卡片、侧边栏目标
              └── fishball-amenities   board · heartbeat · taskboard · consultant
```

五个概念，各司其职：

| 概念 | 说明 |
|---|---|
| **主 DSH** | 你日常工作的 DSH。连接器、Watchdog、适配器和实例都运行在这里。 |
| **子 DSH** | Fishball 专属的私有 DSH profile，由 `dsh-instance` 运行，随主 DSH 一起停止。 |
| **连接器** | `dsh-agent-connector`：MCP 端点加 OAuth 服务器，让持有 Token 的 agent 管理本 DSH 的会话。 |
| **管理会话** | Fishball 在子 DSH 中的唯一长期会话，带有人设、提醒和私有 Skills。 |
| **受管会话** | Fishball 用 `session_start` 发起的、或你通过**移交（Hand over）**交给它的主 DSH 会话。Fishball 只能看到并操作这些会话。 |

受管会话中发生的事：

| 事件 | 去向 |
|---|---|
| 一轮对话停下来 | Fishball 收到一条 `turn-finished`，带最终回复（截断到 4 KB）或停止原因。 |
| 权限请求 | 若有 Watchdog 监督则先给它：范围内 → 允许；偏离目标且危险 → 拒绝；其余 → 交给 Fishball。Fishball 上报时你自己的提示才会出现。 |
| 提问或计划审批 | 交给 Fishball，同时会话里也会出现你的卡片，以先答者为准。 |
| **收回（Take back）**、`session_release` 或其 Token 被停用 | 管理结束，仍在等待的请求转给你。 |

Fishball 按批处理连接器事件，每批一轮；你输入的消息从不被延迟。

---

## 功能一览

- **统筹者，而非执行者。** 一个管理会话，带有人设、提醒（`schedule_*`）、在 Fishball 页面发言的
  `message_user`、`ask_user` 提问卡片和私有 Skills。
- **访问隔离。** 连接器只向 agent 展示它管理的会话。**移交给 <agent>** 与**收回**位于每个会话的顶部和
  侧边栏菜单中，受管会话的侧边栏行会显示 Fishball 的小鱼。
- **自我照管的托管子实例。** `dsh-instance` 每次启动时把 `fishball-core` 和 `fishball-amenities` 放进子
  DSH，一次性配置连接器 Token，并提供**重启（Restart）**、**重新连接（Reconnect）**和**打开 Fishball**。
  插件页上的 **Fishball** 标签页可以从主 DSH 安装、开关和卸载子 DSH 自己的插件。
- **首次启动引导。** 四个可跳过的页面：Fishball 模型、Watchdog 模型、推荐的记忆与长上下文插件、欢迎页。
- **模型同步。** API-key 供应商及其模型列表会自动复制进子 DSH 一次；之后 **Check for new models** 只列出
  子 DSH 缺少的供应商。密钥不会出现在页面、日志或对话中。
- **多个 DSH。** Fishball 的设置中有一个 DSH 目标列表，每个目标对应一个连接器端点。托管子实例中，主 DSH
  排在第一位且不可删除。
- **Watchdog。** 按会话下达目标与范围，定时巡查，发现跑偏会停止当前轮次，使用独立模型。未选择模型前保持停用。
- **跨 DSH 登录。** `dsh-connector-adapter` 让一个 DSH 通过 DSH 自带的 MCP 客户端、以浏览器 OAuth
  使用另一个 DSH 的连接器。
- **子 DSH 中的可选附加组件：** `fishball-taskboard`（右侧边栏 **Task board** 标签页中的任务板与备忘录）、
  `fishball-heartbeat`（Fishball 空闲时保持提示缓存温热；两个计时设置都设好之前不启用）、`fishball-board`
  和 `fishball-consultant`。当前限制见各自 README：board 在当前的 `fishball-core` 旁保持空闲；consultant
  在没有受保护的连接器能力时不发送任何请求，而当前连接器尚未提供该能力。
- **程序化工具调用（PTC）。** 在 DSH 0.2.2 上，管理会话默认通过 `run_code` 调用工具；DSH 0.2.1 保持直接调用。

---

## 安装

Fishball 目前处于 **alpha** 阶段，各包以 `alpha` 标签发布在 npm 上。

| | 方式 | 适用场景 |
|---|---|---|
| **1** | [Bundle](#1-bundle推荐) | 所有人。主 DSH 中装一个插件，Fishball 在它管理的子 DSH 中运行。 |
| **2** | [托管组件](#2-托管组件) | 想自己挑选主 DSH 上的包。 |
| **3** | [独立 Fishball DSH](#3-独立-fishball-dsh) | 在自己搭建的 DSH（本机或另一台机器）中运行 Fishball。 |
| **4** | [从源码](#4-从源码) | 离线安装与本地构建。 |

### 环境要求

| 要求 | 说明 |
|---|---|
| **DSH** | 已在 `0.2.1-rc.5` 和 `0.2.2-rc.1` 上测试，DSH Web 或 DSH-X 自带的 DSH 均可。 |
| **Node.js** | 运行 DSH 需 `24.9+`；各包与发布工具需 `22.14+`。 |
| **`$DSH_HOME`** | 默认 `~/.dsh`。必须是规范的真实路径，不能经过符号链接，否则 `dsh-instance` 报 `INVALID_MAIN_HOME` 并拒绝启动。 |

### 1. Bundle（推荐）

`dsh-fishball-bundle` 就是本仓库根目录的包。它依赖 `dsh-agent-connector`、`dsh-connector-adapter`、
`dsh-connector-watchdog` 和 `dsh-instance`，并通过 [`cordis.patch.yml`](cordis.patch.yml) 把它们以及
Watchdog 的 `preset-watchdog` agent 预设装配进你的 profile。

1. **退出 DSH。** 如果装过 V3 之前的预览版（`dsh-fishball`、`fishball-connector`、`fishball-instance`、
   `fishball-embed-ui`、`dsh-fishball-*`），请先卸载并删除 `<DSH_HOME>/fishball/`。不做任何迁移。
2. **安装**：在 DSH 插件页（**添加插件 → `dsh-fishball-bundle@1.0.0-alpha.3`**），或在终端执行
   （`web` 是 profile 名，请换成你自己的）：

   ```bash
   dsh plugin --profile web add dsh-fishball-bundle@1.0.0-alpha.3
   ```

   pnpm 可能提示 DSH 自己的 `@deepseek-ai/*` 包为 missing peer。这些包由 DSH 在运行时提供，属于正常现象。
3. **启动 DSH**，用 `http://127.0.0.1:<端口>` 或 `http://localhost:<端口>` 打开。Fishball 窗口拒绝其他主机名。
4. **打开 Fishball**：点击侧边栏的小鱼，或 **插件 → Fishball → 打开 Fishball**，然后按引导完成设置。

> **不要再叠加安装组件。** Bundle 已包含 `dsh-agent-connector`、`dsh-connector-adapter`、
> `dsh-connector-watchdog` 和 `dsh-instance`。在它旁边再装其中任何一个或 `dsh-connector-amenities`，
> 都会产生重复的插件条目。

**插件 → Fishball** 是统一的设置页：

- **Fishball 实例** 标签页：子实例状态、**打开 Fishball**、**重新连接**、模型同步和启停开关。
- **连接器与 Token** 标签页：MCP Token（`dsht_…`）、授权页端口（默认 `47615`）、DSH 名称和连接器限制。
- **组件（Components）**：点开 `dsh-connector-adapter` 或 `dsh-connector-watchdog` 进行配置。

### 2. 托管组件

不用 bundle 的同一种托管方式。退出 DSH，在主 profile 中安装连接器和实例。`fishball-core` 与
`fishball-amenities` 由 `dsh-instance` 自己放进子 DSH。

```bash
dsh plugin --profile web add dsh-agent-connector@alpha dsh-instance@alpha
# 可选：一并安装适配器与 Watchdog
dsh plugin --profile web add dsh-connector-amenities@alpha
```

### 3. 独立 Fishball DSH

让 Fishball 运行在单独的 DSH 中，管理一个或多个其他 DSH。

1. **在每个被管理的 DSH 中**安装连接器，然后在 **插件 → Fishball 连接器 → Tokens → New token** 创建
   Token。`dsht_…` 的值只显示一次。

   ```bash
   dsh plugin --profile web add dsh-agent-connector@alpha
   ```

2. **在 Fishball DSH 中**安装 `fishball-core`（已包含 `fishball-ui`），以及可选的附加组件。
   `fishball-amenities` 总包与单个附加组件二选一，不要同时安装。

   ```bash
   dsh plugin --profile fishball add fishball-core@alpha
   dsh plugin --profile fishball add fishball-amenities@alpha
   ```

3. **建立连接**：在 **插件 → fishball-core** 中添加被管理 DSH 的端点，例如
   `http://127.0.0.1:<端口>/api/agent/mcp`，然后把 Token 粘贴到该目标的 Token 字段并**保存**，或使用
   **Connect**（浏览器 OAuth，需要你自己托管 Client ID Metadata Document；见
   [连接器 README](dsh-connector/packages/dsh-connector/README.md#browser-clients-authorization-code-with-pkce)）。

明文 `http` 只允许用于本机回环地址（`127.0.0.1`、`localhost`、`[::1]`）。其他目标必须使用 `https`，
例如通过你自己的隧道，并在启动 DSH 时传入 `--trusted-host`。

### 4. 从源码

在本仓库的 checkout 中打包各组件。先打包 Fishball，这样实例可以内嵌它的 tarball 用于离线放置：

```bash
npm run pack:v3                            # → dsh-fishball/.runtime/release/<version>/
(cd dsh-connector && npm run pack)         # → dsh-connector/.runtime/release/<version>/
(cd dsh-fishball-instance && npm run pack) # → dsh-fishball-instance/.runtime/release/<version>/
```

每个发布目录都包含 tarball、`SHA256SUMS`、离线 pnpm store，以及写有确切安装命令的 `INSTALL.md`。
详见[工作区和发布布局](docs/layout.md)。

---

## 首次启动

1. **Fishball 模型。** 引导会把你的 API-key 供应商同步进子 DSH，并请你选择 Fishball 使用的模型及其推理强度。
   OAuth/登录型供应商、带自定义请求头的供应商和非 https 端点不会被复制，需要时请在 Fishball 内登录。
   选定模型之前，Fishball 使用子 DSH 的默认模型。
2. **Watchdog 模型**（可选）。没有模型时 Watchdog 保持停用。
3. **记忆与上下文插件**（可选），安装到子 DSH 中。
4. 在会话顶部或侧边栏菜单中**移交**一个会话，或让 Fishball 新建一个。随时可以**收回**。

---

## 连接器端点

任何 MCP 客户端都可以管理运行 `dsh-agent-connector` 的 DSH 上的会话。请先为每个 agent 创建一个 Token；
一个 Token 只服务一个 agent，并授予对本 DSH 会话的完整管理权。

| 用途 | 路径 |
|---|---|
| MCP（Streamable HTTP，修订版 `2026-07-28`） | `/api/agent/mcp` |
| OAuth 2.1 签发方与 Token 端点 | `/api/agent/oauth`、`/api/agent/oauth/token` |
| 受保护资源元数据（RFC 9728） | `/.well-known/oauth-protected-resource/api/agent/mcp` |
| 授权服务器元数据（RFC 8414） | `/.well-known/oauth-authorization-server/api/agent/oauth` |
| 浏览器客户端授权页 | 授权端口（默认 `47615`）上的 `/authorize` |

两种接入方式：无头 agent 用 **client credentials**（Token 即 client secret，之后调用一次 `pair`）；
浏览器客户端用 **authorization code + PKCE `S256`**，其 client id 是你托管的 Client ID Metadata Document。
具体流程、MCP 工具、会话路由和设置见[连接器 README](dsh-connector/packages/dsh-connector/README.md)。

---

## 组件

本仓库既是 npm workspace，根目录又是 `dsh-fishball-bundle` 包。各组件包保留自己的 npm 包名并独立发布。

| 包 | 目录 | 安装位置 | 职责 |
|---|---|---|---|
| `dsh-fishball-bundle` | [`/`](.) | 主 DSH | 一体化 bundle：依赖四个主 DSH 插件，并提供统一设置页。 |
| `dsh-agent-connector` | [`dsh-connector/packages/dsh-connector`](dsh-connector/packages/dsh-connector/README.md) | 主 / 被管理 DSH | MCP 端点、OAuth、Token、会话路由、移交 / 收回。内含 `dsh-connector-ui` 组件。 |
| `dsh-connector-adapter` | [`dsh-connector/packages/dsh-connector-adapter`](dsh-connector/packages/dsh-connector-adapter/README.md) | 任意 DSH | 让一个 DSH 登录另一个 DSH 的连接器。 |
| `dsh-connector-watchdog` | [`amenities/watchdog`](amenities/watchdog/README.md) | 主 / 被管理 DSH | 替管理者监督受管会话。 |
| `dsh-connector-amenities` | [`amenities/connector-amenities`](amenities/connector-amenities/README.md) | 主 / 被管理 DSH | 适配器与 Watchdog 的总包，带它们的设置页。 |
| `dsh-instance` | [`dsh-fishball-instance/packages/dsh-instance`](dsh-fishball-instance/packages/dsh-instance/README.md) | 主 DSH | 运行托管的 Fishball 子实例，并把它桥接到连接器。 |
| `fishball-core` | [`dsh-fishball/packages/core`](dsh-fishball/packages/core/README.md) | Fishball DSH / 子 DSH | 管理会话、它的工具以及到各 DSH 目标的连接。内含 `fishball-ui` 组件。 |
| `fishball-amenities` | [`amenities/fishball-amenities`](amenities/fishball-amenities/README.md) | Fishball DSH / 子 DSH | [`fishball-board`](amenities/board/README.md)、[`fishball-heartbeat`](amenities/heartbeat/README.md)、[`fishball-taskboard`](amenities/taskboard/README.md) 与 [`fishball-consultant`](amenities/consultant/README.md) 的总包。 |
| `fishball-shared`、`dsh-connector-shared` | [`dsh-fishball/packages/shared`](dsh-fishball/packages/shared/README.md)、[`dsh-connector/packages/dsh-connector-shared`](dsh-connector/packages/dsh-connector-shared/README.md) | 随包内置 | tarball 内的库，不是插件。 |

```
.                        dsh-fishball-bundle：index.js、client.js、cordis.patch.yml、locale/
dsh-fishball/            Fishball：核心、界面、共享库、设计文档、集成测试包
dsh-connector/           连接器、适配器、共享库、集成测试包
dsh-fishball-instance/   dsh-instance 及其集成测试包
amenities/               Fishball 附加组件（子 DSH）与连接器附加组件（主 DSH）
scripts/                 按包运行的测试运行器
docs/                    工作区布局与找回的发布历史
```

每个组件目录都有自己的索引：[Fishball](dsh-fishball/README.md)、[连接器](dsh-connector/README.md)和
[实例](dsh-fishball-instance/README.md)。已批准的设计见 [dsh-fishball/DESIGN.md](dsh-fishball/DESIGN.md)。

---

## 卸载

移除插件时 DSH 不会运行任何插件代码，所以要先清理子实例。

1. **退出 DSH**，这同时会停止 Fishball 子进程。
2. **删除子实例运行目录**（只删 `<DSH_HOME>/fishball/runtime`）。若不使用 `~/.dsh`，请加 `--home <DSH_HOME>`：

   ```bash
   node ~/.dsh/profiles/web/node_modules/dsh-instance/uninstall.js
   ```

   子实例仍在运行，或无法证明该目录属于这个 home 时，它会拒绝并且什么都不删。错误码见
   [实例 README](dsh-fishball-instance/README.md#install-and-uninstall)。
3. **移除插件：**

   ```bash
   dsh plugin --profile web remove dsh-fishball-bundle
   ```

与其他 DSH 插件一样，连接器的设置和 Token 条目会保留在 profile 中。

---

## 开发

在仓库根目录工作。只测试一个包，或测试改动涉及的包；开发时没有全仓库运行。

```bash
npm run test:changed -- --list   # 预览改动会选中哪些包
npm run test:changed             # 测试这些包，每包一个 worker
npm test -w fishball-core        # 按 npm 名测试单个包
npm test -- dsh-fishball-bundle  # 根目录的包
```

测试在一次性的 home 中运行，从不针对真实的 DSH profile。集成测试包和 `npm run test:release` 仅用于发布。
规则、选项和包独立性检查见 **[TESTING.md](TESTING.md)**；打包见 [docs/layout.md](docs/layout.md)。

## 许可证

[MIT](LICENSE)
