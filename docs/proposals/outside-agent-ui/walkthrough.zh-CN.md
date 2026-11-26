# Outside agent：从本地对话到 Fishball，再收回

[评审索引](index.html)（逐屏 HTML 与 PNG） · [从第一屏开始](review.html#wide-closed)

**先看两件事：我在给哪一个 CLI 发消息？现在谁能写？** 这是 rc.3 Web 浅色界面的设计稿，不是已安装的插件。底部蓝灰色翻页栏属于评审工具，不属于 DSH。所有消息、目录、身份、模型 ID 都是样例；打开页面不会启动进程、访问工作区、登录或发消息。可直接双击 HTML，无需构建。

## 按用户动作走一遍

1. **找会话。** 在 Settings 上方点 **outside agent**。宽栏[就地展开](review.html#wide-open)，[图标栏](review.html#rail-closed)则打开[锚定列表](review.html#rail-open)。点击 outside agent 后，再点 [Codex 或 Claude Code 分组](review.html#cli-groups)可独立展开或收起，不切换对话。仅列出适配器已注册且确认安装的 CLI；已安装但版本不支持的 Antigravity CLI（agy）置灰并说明原因；未安装的不占位。今后安装新 CLI，按同一规则成组。行内没有图标，只读标题、状态和控制者。点击某一行才打开它。状态看文字，不只看颜色：Running 表示有一轮在执行，而不是“进程还活着”；Idle 表示可等待输入；Managed by Fishball 是控制权，可以与 Running 同时出现。[空列表](review.html#empty)仍有新建入口。
2. **从本地新建。** 点 [New](review.html#new)，选 CLI → 已授权的文件夹 → 该 CLI 的模型 → 第一条消息。**Start session** 才创建由你控制的会话；先核验目录、真实模型和输入目标，再投递。CLI default 不是模型 ID。切换到 [Claude Code](review.html#new-claude) 或 [agy](review.html#backend) 可分别查看目录不可用、已安装但版本不受支持的示例：保留草稿，但不允许输入任意模型或使用过期选项。Cancel / × / Esc 取消，不会发送。
3. **读写与看模型。** 打开 [Release notes](review.html#idle)，看顶部标题、模型和控制者，再看底部状态。**Send** 只提交给当前 outside 会话；仅确认接收的用户文本与最终回复进入消息流，一次最多一轮。**Stop** 请求中断当前轮，不退出 CLI。点[模型选择器](review.html#models)，只看此 Codex、此目录的示例条目；没有 DSH / Claude / agy 的模型。只有当前写入者、空闲且验证过“仅本会话切换＋回读”才可原地换模型。否则显式新建，不悄悄重启或改全局默认值。
4. **交给 Fishball。** 在你拥有的空闲会话点 [Hand to Fishball](review.html#handoff)，按稳定 ID 确认配对对象 fb-07。默认只分享**本次交接以后**的新消息，不补发旧历史。确认后进入[旁观视图](review.html#managed)：同一会话、同一进程，你看得到后续工作，但不能发送、换模型或抢写。正执行或存在未提交文字时不交出。唯一的待决例外：已核验并停在原地的原生权限请求，可连同明确展示的最小请求上下文一起交接（见第 7 步）；connector 不在或不兼容时只有本地模式。
5. **收回，不重跑。** 即使执行中，也可点 [Take back](review.html#takeback)。确认立即撤销旧写入权、待发输入和未决授权；[回到用户控制](review.html#returned)时，已开始的那轮可能仍在跑。你可以等它完成，或明确 Stop。取消则保持 Fishball 控制。两者都不会重放输入。
6. **Fishball 先发起。** [Audit checklist](review.html#fishball) 是另一段对话：先验证工作区、模型及能力，再绑定管理者，然后才发送第一条消息。侧栏新增摘要但不抢走你的当前视图。打开后可看到发起者以及当前控制者；[确认收回](review.html#takeback-fish)以后，[发起者不变，写入权归你](review.html#returned-fish)。
7. **审批归谁？** 打开 Codex → [Publish draft](review.html#approval)。同一个请求：在 atlas 里用 `wc -w draft.md` 数词，不发布、不写文件、不联网。
   - **本地回答：** 对照命令、作用域和所有者，点 **Allow once** 或 **Deny**，分别看到[本人允许](review.html#approval-user)或[本人拒绝](review.html#approval-denied)的回执。没有永久授权；回答权限和发送聊天消息是两条不同路径。
   - **交由 Fishball 回答：** [确认随会话交接这个请求](review.html#approval-handoff)。旧卡立即失效；只有原生提示仍是同一个，才向新管理者签发新的 offer。[等待 Fishball](review.html#approval-managed) 时，你看到的不是第二套可点的同意按钮。Fishball 用现有的 `approvals_list` / `approval_answer` 明确回答，CLI 确认后显示[Fishball 的回执](review.html#approval-fish)。允许须参数完整、低风险、有理由；拒绝须有理由。若有适用的 Watchdog 任务范围，必须先检查；超出范围被拦或任务偏离时不可远端放行，无法完成必要检查时暂停。通过检查也不等于 Fishball 已签字。
   - **改由你回答：** 在等待中[确认收回](review.html#approval-takeback)，之前的远端 offer 作废；同一提示复核通过，才出现[新的本地卡](review.html#approval-reissued)。若答案已经送出，不撤销、不重复。若[提示身份或回答通道不确定](review.html#approval-fallback)，只提醒本人；不向 Fishball 发 offer，也不给 DSH 猜按键。管理者不会暗中改变。
8. **遇到登录，别当审批。** [需要登录](review.html#auth)时停止采集、禁止写入，只在 CLI 正常外部流程登录；DSH 不收密码、key 或验证码。登录成功也不自动恢复。
9. **失败时不补发。** [降级](review.html#degraded)：保留已核验消息，无法确认版本、消息来源或写入目标时锁定输入与交接。[投递未确认](review.html#error)：保留可定位的会话，核对记录；不要点“再发一次”。[断开](review.html#disconnected)：元数据不是写入权；只有确认原进程不再持有写入权、同一目录及精确恢复 ID 时才可显式恢复，否则新建。关闭视图不停止进程；[End session](review.html#end) 经确认才终止进程并标记[已结束](review.html#ended)，并非删除厂商历史。

## 哪些是已知的，哪些仍待验证？

| 屏幕 | 成立条件（不是测试结果） |
|---|---|
| 01–06 入口 | rc.3 有 sidebar footer 与 keyed main panel；布局按源码复刻。挂载、焦点和窄屏可用性仍须插件实测。 |
| 07–11 新建、聊天、模型 | 必须证明同一进程/工作区/根 turn 的消息提取、安全输入、空闲及模型回读。Codex 的候选来源是 CLI 元数据或同一服务器目录；Claude Code 须验证完整原生 picker 可无副作用取消；agy 须验证模型表解析及启动后未静默回退。任一缺证即禁用；此稿不证明任何 CLI 可热切模型。 |
| 12–18 交接、托管与收回 | 除上述能力外，还需 connector 注册、配对和唯一写入权在最终写入点生效，撤销不能有竞态。没有运行过真实 Fishball。 |
| 19–27 原生审批 | 已有 connector 权限协议 ≠ 外部 CLI 已接通。Codex 同一 headed 实例的结构化回调优先；Claude Code 的 PermissionRequest 是候选，须核验来源和一次性返回；agy 尚无已验证的审批钩子。任何 TUI 映射须按版本、OS、提示身份、选项和焦点认证，在最终写入处重查。没有这种证据，回退为仅提醒本人。 |
| 28–33 阻塞、恢复与退出 | 是失败边界的样稿，不表示能识别所有审批/登录提示，也不证明可安全中断或恢复。仅在证据充分时启用对应动作。 |

**不在本次范围：** 不实现插件、registry 或工具；不改原生 Session、搜索、导出和模型列表；无原始终端、历史扫描、SDK 替身、认证自动化、自动重试、自动批准或持久授权。样稿中的宿主导航只是参照，不操作真实 DSH。

**尚待决定／实测（不是重新讨论“能否交给 Fishball”）：**
- 首批认证哪些 CLI 版本、OS、语言和提示类型？哪些可走同进程回调，哪些只能做到“仅提醒本人”？先认证哪些逐版本的单次按键映射和回执？
- 哪个受支持接口能把外部请求接入同一权限策略及 Watchdog，而不是伪造 DSH 内部工具调用？哪些命令参数必须脱敏；披露不完整时如何向人说明无法远端允许？
- 当 CLI 被卸载，历史元数据入口放在哪里？如何刷新已安装清单而不启动 CLI 或发消息？
- 插件专属主区是否足够？是否允许无消息的模型探测或按会话授权读取精确 transcript？仅支持启动时选模型时，显式新建是否可接受？

## 复刻依据

采用已安装 DSH 0.2.2-rc.3 Web 源码而非用户正在使用的界面截图，以免采入私人对话。白色消息画布、浅灰侧栏、文字与分隔色取自 design-platform tokens；宽栏 280 px、rail 56 px，使用系统字体。插件新增项参考宿主现有控件，但不冒充原生 Session。约束依据：[设计提案](../headed-cli-sessions.md)、[开发交接说明](../headed-cli-dev-prompt.md)（此次只修订设计，不执行开发步骤）。

源码定位（rc.3 的 `node_modules/@deepseek-ai/` 下）：侧栏尺寸见 `dsh-client-ui-layout/src/client/columns.ts`、`dsh-client-ui-sidebar/src/client/SidebarRoot.module.css`；会话的标题、消息栏和输入区域参照 `dsh-client-ui-conversation/src/client/skeleton/{ConversationRoot,InputBar}.module.css` 与 `dsh-client-ui-chat/src/client/chat/MessageItem.module.css`；文件夹和弹层参照 `dsh-client-ui-workspace/src/client/WorkspacePicker.module.css`。PNG 由临时独立配置的 headless Chromium 打开本地 HTML 生成，未访问真实 DSH、CLI 或用户浏览器配置。每屏 ID 对应 `png/<id>.png`，另附 [索引截图](png/index.png)。