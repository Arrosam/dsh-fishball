# Messenger 短消息气泡宽度修复

## 原因与来源（只读调查）

本次截图中的两字中文逐字换行，来源是Messenger额外包装的cross-axis shrink-to-fit链：

1. `.fbm-mine` 是column flex且 `align-items:flex-end`，于是其直接子项DSH用户行不会stretch到消息可用宽度。
2. rc.3原生用户行内部还有column flex内容stack，受 `max-width:min(calc(var(--dsh-chat-content-width,748px) * .702),82%)` 限制；bubble再受max-width100%、pre-wrap和break-word控制。
3. 当原生用户行也以内容收缩时，该百分比上限以已经很窄的行作为包含块，短CJK可能被二次挤窄并在字符间换行。

危险的外层end-alignment规则来自Messenger初版 `82ce1c186f958c5f71d2de4a9ae91c2340f244cd`（2026-10-31）。`git blame`及原始文件确认；后续去You标签提交保留它。`c03cb931aeb3` 仅修改主客户端pile/disclosure及测试，未修改Messenger气泡文件，所以不是该pile对齐提交引入。修复前repo及两个live Messenger文件SHA256相同：`01efc96571fde1bd94dc9f433afc09c1f4011a4b85cb5ab6d83b49cde5613046`。这证明危险规则早于本次交付，而非声称曾在旧版宿主真实复现过像素现象。

## 最小修复

只在Fishball自身own-message wrapper内，让直属原生用户行stretch到可用lane，并保持min-width0。DSH自己的stack/bubble依然负责按内容自然宽度、长文max-width和正常换行；不把bubble设为100%，不nowrap、不拆字插换行、不设固定气泡宽度，也不更改内容或会话行为。匹配主机现有类后缀，约束不扩散到incoming/reply/普通会话、转发卡、composer或pile。主client.js未修改，pile的composer居中/宽度约束保留。

## 验证与边界

独立测试代理从需求编写43个新case：7个CSS契约、36个公开slot内容集成，覆盖短CJK（含“等等”）、短Latin、长CJK/Latin/token、混合Unicode、作用域及生命周期。与旧Messenger布局/表格36case和pile状态26case共 **105/105通过**。用已交付 `312ff11` Messenger脚本运行新MBW-C01，按预期因缺少确定包含宽度/cross-axis stretch契约失败（1fail，exit1）；这是样式契约红测，不是浏览器像素复现。

沿用既有离线VM/style harness，无layout engine，测试只能证明渲染/内容/stylesheet契约，不把声明存在当作真实像素宽度或单行证明。最大宽度阈值±1px、实际行数/窄屏overflow、原生焦点/键盘/动画仍待原认证GUI视觉验收。独立源码/测试review检查真实rc.3宿主结构、只改直属userRow的作用域及旧helper默认语义，不将附件/时间未直接修改误称为几何验收。

本修复与三修复包 `312ff1175005` 分开提交；本轮不打包、不安装该气泡修复，不restart/push/publish。
