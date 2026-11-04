# 三修复联合本地交付（2026-11-04）

## 组合边界

基于前次交付 `20d9db02388a118fee004c5cb5c3829a66df715b`，在独立分支 `delivery/2026-11-04-fixes` 只精确 cherry-pick：

| 原始提交 | 本地整合提交 | 功能 |
|---|---|---|
| `04864f57faddd47b2af7f6f362b63532caf71b5e` | `b0a6da6` | Allow own-request不再另发虚假Reject通知；保留延迟补发 |
| `79366b0bcd54c359e93551db87f43aa0240541c4` | `cf71c02` | start_session可指定目标model/effort，不更改默认或Fishball选择 |
| `dfdb5a64fb8521b36a92f29a10ebce9221a74494` | `17046b6` | model Save从成功HTTP response确认状态，不依赖SSE及时到达 |

整合生产代码 SHA 为 `17046b61ecc6dfa62b4b87f2a713850b2690ccc2`。cherry-pick无冲突，不合入仍在进行的 `feature/model-list-refresh`，也不改前次pile/disclosure实现。

## 测试与独立审查

- 6个受影响生产模块 `node --check` 及 `git diff --check` 通过。
- 三领域+pile/disclosure的16文件聚焦原始运行：195 entries，194通过、1文件加载失败，退出1；缺少主仓库本身不安装的DSH peer依赖，8个own notice unit cases没有在该入口运行，不是行为断言失败。
- 经明确许可，在精确 `17046b6` 的独立detached worktree创建未跟踪 `node_modules` 符号链接，指向现有rc.3依赖（不安装、复制或修改宿主），同一own notice测试文件 **8/8通过，退出0**。故两个互补运行共验证 **202个相关行为case通过**；不将原始聚焦命令标成全绿。
- 全量原始运行 `/opt/homebrew/bin/node test/run.mjs`：**2307 entries，2298通过、6失败、3跳过，294 suites，退出1**。失败为4项现有PTC嵌套macOS sandbox不可用、1项npm cache EPERM、1项上述peer加载失败。没有跳过或弱化检查；已记录原始日志并单独复核加载失败。
- 独立只读reviewer审查完整三提交差异、官方rc.3 API、测试修改，无确认的阻塞性correctness/security finding。审批分支互斥、target-model首消息前持久化/idle并发、HTTP确认只合并模型字段均通过审查。测试未增加skip/only或放松断言。

不声称动态覆盖：pending期间较新不同model/session先到SSE、随后旧POST返回的所有反序组合；这些保护经静态核验。HTTP/SSE无共享revision，POST后旧SSE晚到仍可短暂回退，这是原修复已记录边界。本次不做transport重设计。

## 安装约束与验收

本地tgz使用 `--ignore-scripts` 打包，安装分别使用官方rc.3 wrapper、显式两个DSH_HOME、web profile和 `--ignore-scripts`。本轮新备份集为 `.runtime/delivery-backup-20261104T021115Z`，不得覆盖前次20261104-1344备份。

安装后只追加一条命名本轮交付SHA的注释到每个profile patch，以触发官方HMR；先cp -p备份并检查精确字节等于该备份加唯一后缀。逐文件SHA256对照tgz检查两套安装。不得重启DSH、push或publish，不读取token/凭据。

**两套原页面安装完成后都需要 Cmd+Shift+R 强制刷新。** 上次普通刷新后composer仍锁定，不能承诺HMR已更新现存前端状态。日志无错误不等于后端重组已被正向确认；真实已认证GUI/视觉验收仍由原页面确认。
