# Outside agent：从本地对话到 Fishball，再收回

[评审索引](index.html)（逐屏 HTML 与 PNG） · [从第一屏开始](review.html#wide-closed)

**先看两件事：我在给哪一个 CLI 发消息？现在谁能写？** 这是 rc.3 Web 浅色界面的设计稿，不是已安装的插件。底部蓝灰色翻页栏属于评审工具，不属于 DSH。所有消息、目录、身份、模型 ID 都是样例；打开页面不会启动进程、访问工作区、登录或发消息。可直接双击 HTML，无需构建。

## 按用户动作走一遍

1. **找会话。** 在 Settings 上方点 **outside agent**。宽栏[就地展开](review.html#wide-open)，[图标栏](review.html#rail-closed)则打开[锚定列表](review.html#rail-open)。点击标题只影响列表，右侧仍是原来的 Workspace notes。点击某一行才打开它。状态看文字，不只看颜色：Running 表示有一轮在执行，而不是“进程还活着”；Idle 表示可等待输入；Managed by Fishball 是控制权，可以与 Running 同时出现。[空列表](review.html#empty)仍有新建入口。
2. **从本地新建。** 点 [New](review.html#new)，选 CLI → 已授权的文件夹 → 该 CLI 的模型 → 第一条消息。**Start session** 才创建由你控制的会话；先核验目录、真实模型和输入目标，再投递。CLI default 不是模型 ID。切换到 [Claude Code](review.html#new-claude) 或 [agy](review.html#backend) 可查看目录不可用的示例：保留草稿，但不允许输入任意模型或使用过期选项。Cancel / × / Esc 取消，不会发送。
3. **读写与看模型。** 打开 [Release notes](review.html#idle)，看顶部标题、模型和控制者，再看底部状态。**Send** 只提交给当前 outside 会话；仅确认接收的用户文本与最终回复进入消息流，一次最多一轮。**Stop** 请求中断当前轮，不退出 CLI。点[模型选择器](review.html#models)，只看此 Codex、此目录的示例条目；没有 DSH / Claude / agy 的模型。只有当前写入者、空闲且验证过“仅本会话切换＋回读”才可原地换模型。否则显式新建，不悄悄重启或改全局默认值。
4. **交给 Fishball。** 在你拥有的空闲会话点 [Hand to Fishball](review.html#handoff)，按稳定 ID 确认配对对象 fb-07。默认只分享**本次交接以后**的新消息，不补发旧历史。确认后进入[旁观视图](review.html#managed)：同一会话、同一进程，你看得到后续工作，但不能发送、换模型或抢写。忙碌、有未提交文字或待决请求时不允许交出；connector 不在或不兼容时只有本地模式。
5. **收回，不重跑。** 即使执行中，也可点 [Take back](review.html#takeback)。确认立即撤销旧写入权、待发输入和未决授权；[回到用户控制](review.html#returned)时，已开始的那轮可能仍在跑。你可以等它完成，或明确 Stop。取消则保持 Fishball 控制。两者都不会重放输入。
6. **Fishball 先发起。** [Audit checklist](review.html#fishball) 是另一段对话：先验证工作区、模型及能力，再绑定管理者，然后才发送第一条消息。侧栏新增摘要但不抢走你的当前视图。打开后可看到发起者以及当前控制者；[确认收回](review.html#takeback-fish)以后，[发起者不变，写入权归你](review.html#returned-fish)。
7. **遇到等待，分清原因。** [CLI 原生审批](review.html#approval)不是聊天问题，也不是交接授权。无法核验原生请求时不提供 Allow、代按 Enter 或永久授权；安全中断或结束，而不是猜输入。[需要登录](review.html#auth)时停止采集、禁止写入，只在 CLI 正常外部流程登录；DSH 不收密码、key 或验证码。登录成功也不自动恢复。
8. **失败时不补发。** [降级](review.html#degraded)：保留已核验消息，无法确认版本、消息来源或写入目标时锁定输入与交接。[投递未确认](review.html#error)：保留可定位的会话，核对记录；不要点“再发一次”。[断开](review.html#disconnected)：元数据不是写入权；只有确认原进程不再持有写入权、同一目录及精确恢复 ID 时才可显式恢复，否则新建。关闭视图不停止进程；[End session](review.html#end) 经确认才终止进程并标记[已结束](review.html#ended)，并非删除厂商历史。

## 哪些是已知的，哪些仍待验证？

| 屏幕 | 成立条件（不是测试结果） |
|---|---|
| 01–05 入口 | rc.3 有 sidebar footer 与 keyed main panel；布局按源码复刻。挂载、焦点和窄屏可用性仍须插件实测。 |
| 06–10 新建、聊天、模型 | 必须证明同一进程/工作区/根 turn 的消息提取、安全输入、空闲及模型回读。Codex 的候选来源是 CLI 元数据或同一服务器目录；Claude Code 须验证完整原生 picker 可无副作用取消；agy 须验证模型表解析及启动后未静默回退。任一缺证即禁用；此稿不证明任何 CLI 可热切模型。 |
| 11–17 交接、托管与收回 | 除上述能力外，还需 connector 注册、配对和唯一写入权在最终写入点生效，撤销不能有竞态。没有运行过真实 Fishball。 |
| 18–24 阻塞、恢复与退出 | 是失败边界的样稿，不表示能识别所有审批/登录提示，也不证明可安全中断或恢复。仅在证据充分时启用对应动作。 |

**不在本次范围：** 不实现插件、registry 或工具；不改原生 Session、搜索、导出和模型列表；无原始终端、历史扫描、SDK 替身、认证自动化、自动重试或代批准。样稿中的宿主导航只是参照，不操作真实 DSH。

**请评审时决定：** ① 插件专属主区是否就够，还是原生历史/搜索是硬要求？② 哪些 CLI 版本、OS 和目录策略先认证？不能热切时能否接受“新建会话”？③ 是否允许无消息的目录探测，或逐会话同意读取精确 transcript 文件？④ 是否保留默认向前分享、重启仅元数据、收回后让当前轮继续？原生审批是否始终只由人处理？

## 复刻依据

采用已安装 DSH 0.2.2-rc.3 Web 源码而非用户正在使用的界面截图，以免采入私人对话。白色消息画布、浅灰侧栏、文字与分隔色取自 design-platform tokens；宽栏 280 px、rail 56 px，使用系统字体。插件新增项参考宿主现有控件，但不冒充原生 Session。约束依据：[设计提案](../headed-cli-sessions.md)、[开发交接说明](../headed-cli-dev-prompt.md)（基线 0deac39；这里不执行实现步骤）。

源码定位（rc.3 的 `node_modules/@deepseek-ai/` 下）：侧栏尺寸见 `dsh-client-ui-layout/src/client/columns.ts`、`dsh-client-ui-sidebar/src/client/SidebarRoot.module.css`；会话的标题、消息栏和输入区域参照 `dsh-client-ui-conversation/src/client/skeleton/{ConversationRoot,InputBar}.module.css` 与 `dsh-client-ui-chat/src/client/chat/MessageItem.module.css`；文件夹和弹层参照 `dsh-client-ui-workspace/src/client/WorkspacePicker.module.css`。PNG 由临时独立配置的 headless Chromium 打开本地 HTML 生成，未访问真实 DSH、CLI 或用户浏览器配置。每屏 ID 对应 `png/<id>.png`，另附 [索引截图](png/index.png)。
