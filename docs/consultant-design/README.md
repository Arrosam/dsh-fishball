# Fishball 顾问：设计走查（任务 B）

**顾问只回答问题，Fishball 决定怎么办。** 例如，用户要复核数据库迁移顺序，顾问可以指出一次回滚验证，但不能读取数据库、执行迁移或批准操作。请先看[发送前的披露卡](preview/chat-approval.html)和[回到主对话的建议](preview/chat-result.html)。当前 connector **不能**保证这一边界；[缺少保证时的拒绝画面](preview/missing-guarantee.html)才是对当前 staging 的预期。本文、HTML、截图均是评审材料，没有实现插件。

## 一、从已有 board 追到顾问应放的位置

1. **认出一个成员。** [fishball-board 的包清单](../../packages/fishball-board/package.json)声明独立的 fishball-board@1.0.0-alpha.1、服务端入口和 DSH bundle patch。它在 packages/fishball-board，不是 fishball-taskboard。顾问应对应同仓的 **packages/fishball-consultant/**，不是塞进 board、Taskboard、core 或另开仓库。同仓原因是共用 amenities 发行与实例放置协议；独立性来自自己的包、补丁、工具、私有事件、设置、数据、测试与 tgz，不靠分仓。
2. **声明与注册不是一件事。** [集合清单](../../packages/fishball-amenities/package.json)的 dependencies 钉住 board 精确版本、bundleDependencies 使其随离线包交付。[集合补丁](../../packages/fishball-amenities/cordis.patch.yml)再按包名插入 board 行。单装用[board 自己的补丁](../../packages/fishball-board/cordis.patch.yml)。顾问按此机制对齐两种归属；同一安装只激活一个插入来源。依赖声明不会自行注册工具。
3. **看子实例实际发现了什么。** dsh-instance 顶层清单只认 amenities 与 core；不是扫描名字以 fishball- 开头的目录。源码模式跟随集合中严格同版本的 bundled 成员。board 的文件边界是 package.json 加 files 中的图标、index.js、src/、cordis.patch.yml、README.md、LICENSE；不会整仓复制或替顾问推断漏掉的客户端模块。放入子 profile 的 vendor 及 node_modules，重启会刷新。打包模式则安装两个顶层包，必要时从离线 tgz 安装，board 从集合获得。两条路径、兼容检查、行覆盖及源码行号见[安装追踪 §1–2](amenity-placement.md)。
4. **加载到正确作用域。** DSH 读已启用 bundle 的 patch，按行加载成员。board 自带 shared，通过 instance-follower 跟随兼容的 core 实例；board 自身不需目标 connector。顾问也可独立安装且在无 core 时不挂 manager 工具。只有要咨询时才需要兼容 core、选定目标和已证明的私有 connector 能力。[宿主依赖表](host-contract.md)区分通用挂载接口与仍须提供的接口。不接另一个项目的监听器、设置或私有事件。
5. **卸载后还剩什么？** 暂停咨询可看记录；停用行只卸载该作用域；无集合持有时可卸载独立包。**按“集合内成员也可单独移除”的交付目标，不能只用行停用通过验收。** 须用[安装追踪 §4](amenity-placement.md)的可选成员安装清单与独立 tgz 改变运行时归属，并持久记住明确移除。重启、升级、断网后都不能补回；检查 board、heartbeat、taskboard、core 及 shared 仍正常。保持现有嵌入包方式只能作为兼容模式，必须明示不可单删。独立制品可单装/单发，随集合交付的修订仍需同批版本和新的集合/实例制品。

## 二、按用户操作走一遍

打开[画面目录](preview/review.html)。18 个产品状态及 1 个评审目录各有浏览器原型和同名 PNG。编号是走查顺序，不表示每一步都会发生；批准与拒绝、成功与各类错误是不同分支。所有目标、模型、任务及数字均为样例。

| 步骤 | 操作、结果与边界 | 查看 |
|---|---|---|
| 1. 首次配置 | 在插件设置中打开「Fishball 顾问」；配置与顾问线程是同一插件的两个页签。目标 DSH、端点代次及专用空间是本例已有的绑定，不是默认目标。启用行不代表已经选模型或同意付费。 | [HTML](preview/index.html) · [PNG](screenshots/index.png) |
| 2. 选择模型 | 点「请选择模型」查看该目标的目录；一次选中供应商和模型的完整路由。同名模型不能混用，灰色项目不可选。这里只改顾问，不改 Fishball 自用模型。 | [HTML](preview/model-picker.html) · [PNG](screenshots/model-picker.png) |
| 3. 选择推理强度 | 该路由公布了 medium，故另有「推理强度」。未设置只省略强度，不省略模型；目录没有力度选项时隐藏控件。不允许自填未公布值。 | [HTML](preview/effort-picker.html) · [PNG](screenshots/effort-picker.png) |
| 4. 保存设置和预算 | 示例保存 demo/review-v1 与 medium。填两个正整数并点「保存上限」；分别控制单主题累计与整个档案每日提问次数，空值、小数、非正数不能保存。收紧只阻止未来派发，不撤销已发请求。静态页只演示反馈，不持久保存。 | [HTML](preview/settings-ready.html) · [PNG](screenshots/settings-ready.png) |
| 5. 在主对话核对简报 | T7 是本地编号，不外发。检查接收方、问题、证据和用量；这次是首问，无历史。点「允许发送这份简报」仅推进 R1；不等于允许执行。若需改字先不发，修改后重新核对。普通 ask_user 可用于澄清，但它的卡号不是披露凭证。 | [HTML](preview/chat-approval.html) · [PNG](screenshots/chat-approval.png) |
| 6. 继续主对话 | R1 从本地待授权推进到目标已受理，绑定 S7；占 1 个名额。保持输入可用，可以继续处理不相关事项，不再问一遍，也不让用户去远端取回答。 | [HTML](preview/chat-pending.html) · [PNG](screenshots/chat-pending.png) |
| 7. 区分建议与决定 | 看 R1 的私有回执及来源，再看 Fishball 自己的答复。先扩展字段是建议；是否做回滚演练是 Fishball 的判断，尚未执行。「查看线程」打开该主题的记录而非远端终端。 | [HTML](preview/chat-result.html) · [PNG](screenshots/chat-result.png) |
| 8. 浏览顾问线程 | 按稳定主题标识区分 T7 与独立话题 P4，而不是按标题归并。只显示已用/预留与状态，不在列表铺开简报。在 T7 行打开详情。 | [HTML](preview/threads.html) · [PNG](screenshots/threads.png) |
| 9. 检查同题追问 | R1/R2 在同一个 S7。「查看 R1 回执」看第一问，「查看 R2 状态」核对第二问。追问须重新授权新问题及本轮会重放的完整旧简报与建议。token 或费用未提供就显示未知。 | [HTML](preview/thread-detail.html) · [PNG](screenshots/thread-detail.png) |
| 10. 核对不确定投递 | R2 可能已送达，不能拿 R1 填空或拆成第三问。在原端点按 R2 查询不计新问；可返回线程或进入清理，没有“自动再试”。 | [HTML](preview/thread-status.html) · [PNG](screenshots/thread-status.png) |
| 11. 弃用前确认 | 核对目标、活动请求和保留范围。「取消」回到仍开放的线程；确认先封锁发问，再停止并申请归档。离线只显示待清理，不能凭点击确认就显示成功。 | [HTML](preview/discard.html) · [PNG](screenshots/discard.png) |
| 12. 查看归档 | 仅在原目标证明处置后显示此页。T7/S7 只读，不恢复会话，不抹去历史。重新打开任务不重新咨询；有新问题可点「以全新话题重新开始」。 | [HTML](preview/archived.html) · [PNG](screenshots/archived.png) |
| 13. 另起话题 | P8 是另一个标识：0 次、无历史、无现成顾问会话或授权。查看旧记录只是导航；真正提问仍须全套预检和披露授权。 | [HTML](preview/reopen-fresh.html) · [PNG](screenshots/reopen-fresh.png) |
| 14. 未选择模型 | CONFIGURE_MODEL：去顾问设置显式选择。不继承 DSH 默认或申请重放旧问题；用户仍可请 Fishball 自己判断。 | [HTML](preview/configure-model.html) · [PNG](screenshots/configure-model.png) |
| 15. 模型暂不可用 | UNAVAILABLE：展示保存的路由，检查目标供应商连接。恢复后重新确认，不删除选择、不悄悄换路由。完整目录明确删除路由则要求重新配置。 | [HTML](preview/model-unavailable.html) · [PNG](screenshots/model-unavailable.png) |
| 16. 达到任一上限 | T7 已 3/3，即使当天总数 6/10 仍拒绝第四问。查看线程使用已有建议，不新建“同题”以绕过额度。本页是单独的边界样例，不是 R2 的下一步。 | [HTML](preview/limit-reached.html) · [PNG](screenshots/limit-reached.png) |
| 17. 连接器缺保证 | 目标“已连接”也不够；未验证首轮及每次唤醒的无执行能力时拒绝。无创建、无外发、无推理。不能用提示词或普通工人会话替代。 | [HTML](preview/missing-guarantee.html) · [PNG](screenshots/missing-guarantee.png) |
| 18. 选择不发送 | 第 5 步的另一个分支：「不发送」、跳过或不回答都不外发、不占次数。Fishball 用已有事实继续，不催问或在后台建会话。 | [HTML](preview/chat-declined.html) · [PNG](screenshots/chat-declined.png) |
| 19. 走查目录 | 跳到任一画面；页脚“所有画面／下一画面”只供评审，不是拟新增的产品入口。所有页均为本地静态样例。 | [HTML](preview/review.html) · [PNG](screenshots/review.png) |

## 三、上线前需要什么证据？

| 必须成立 | 当前 staging 实际做了什么 | 最小放行证据 |
|---|---|---|
| 只发送获准简报 | 目录支持显式路由，但普通会话由宿主组装上下文，工作区挂接/接管异常不一定阻断首问 | 截获假模型的**真实首轮与追问请求**，验证目的地与已签收的简报、获准历史一致，无目录指令、文件、插件注入或无关对话。拒绝时零简报字节 |
| 本问建议回到 Fishball | turn-finished 修复了后台任务仍活跃时的轮次结束报告，不是按问次的回执；倒扫旧消息可能取出上一答 | 先一问有答、再一问为空或中止、重启及重复回执；只按本问游标及 owner 交一次私有终态，无旧答或公开广播 |
| 顾问不能执行 | 普通 managed 会话可有动态工具；显式模型、只读目录、请求许可卡均不是无工具证明 | 在发布前及每次 wake 封锁工具发现和执行、PTC、权限提升与子代理；模糊准入、冷恢复和动态注入均零副作用，未验证前零推理 |

来源：[connector 审计及验收矩阵](connector-audit.md)（5833930b）、[宿主契约](host-contract.md)（Fishball bdcccc66，DSH 0.2.2-rc.3）、[协议与生命周期](consultation-contract.md)。借鉴旧评审 eb74c115 的“执行者取第二意见”分工，不照搬供应商代传完整 transcript 的 advisor。没有以服务商调用或真实会话去“测试”隔离。

## 四、请评审者定下的取舍

| 问题 | 推荐默认与原因 |
|---|---|
| 安装后是否能马上咨询？目标如何选？ | **不能。** 初始模型为空。先由用户选已有配对目标和公布的中性工作区（本样例固定为一组），再选顾问模型；不沿用最近会话或 Fishball 默认模型。首版是否支持多套命名配置待定，建议只支持一套。 |
| 可以少确认几次吗？ | 首版每问一次性确认，含追问历史；不做长期自动披露白名单。可先用非阻塞问题卡细化材料。最终卡由宿主从不可变正文生成。 |
| 限次数还是限金额？ | 先试每题 3 次、每档案每天 10 次、零自动重试；建议按明确显示的 UTC 日结，同一请求的预留跨日不重扣。格式错误拒绝保存。若必须按金额硬停，在有可证明的费率和上界前不开放。 |
| 谁能结束和重开？ | 话题建议由用户显式新建/确认结束；任务只有可信宿主的终结记录才自动关闭，否则保留手动关闭。重开仅查看，另问须新 ID；不用沉默计时器猜测已结束。 |
| “丢弃”是否要求擦除？ | 默认停止并归档，保留可核对记录、已送达建议和预算账，不宣称删除。若要求永久擦除，需另定本地、远端、备份及供应商的保留期限、主体和可验证回执；未具备时不展示擦除按钮。 |
| 结果怎么呈现？ | 主对话区分来源清楚的顾问文字和 Fishball 决策；详情限档案所有者。建议有界显示、可标识截断，原文不足以确认追问历史则拒绝追问。 |
| 单独移除要不要保留同版本离线介质？ | 推荐保留安装源、缓存与只读历史，只移除活动 profile 的代码/依赖/行。把单成员物理卸载和兄弟存活验收列为发行前置；不要承诺从 tgz 里删字节。 |

**不在范围内**：第二个执行者、普通 worker 回退、直接给用户发消息的顾问、跨主题记忆、自动读文件/任务板、Taskboard 改版、聊天输入框选模型、通用权限或审批代理、真实扣费及发布。左侧会话/工作区是宿主定位，不是第二套顾问导航；真正的插件入口是顾问设置行。先评审这些画面、默认值与阻断条件，再决定实现。
