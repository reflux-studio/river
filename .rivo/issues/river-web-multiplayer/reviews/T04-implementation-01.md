# T4 房间 runtime 与 Node/SQLite 服务：审阅

模式：逐任务独立静态审阅。技术方案：已确认 v1.0，含用户确认的 D31、`closeReason/closeOutcome` 扩展。代码版本：`55198dd` 基线加当前未提交的 T1/T2/T4 工作树；本报告以 2026-11-02 最后一次读取的工作树为准。

## 结论

**不通过。** 房间队列、候选状态提交、join 的 CAS 与回执/裁剪投影同事务、管理性弃牌、手级牌面权限和新手发牌事件的主要路径已在源码中形成。下列数据库故障与大投影路径仍违反已确认契约。P0 应交回修复；本结论不等于运行时、真实 WS/SQLite 或产品验收结果。

## 问题

| 编号 | 级别 | 问题与后果 | 依据与位置 | 建议 |
| --- | --- | --- | --- | --- |
| R1 | P0 | 运行中数据库读取失败不会使 `readyz` 降为 503。`load`、`findCommand`、`findBootstrap` 等直接读取，只有写队列失败才把 `healthy` 置为 false。若整体读故障发生在启动后，服务仍报告 ready，并继续接受新 WS 升级；房间命令实际报错，健康状态误导流量路由。 | `apps/server/src/sqlite-room-store.ts:39-59,84-87,143-155`；`apps/server/src/index.ts:47,51-55`；`assets/state-storage.md:71` | 将运行时读故障纳入存储健康熔断；区分单房坏快照隔离与数据库整体不可用，并让 readiness 反映后者。 |
| R2 | P0 | 存储已不健康后，已绑定 WS 的消息路径仍可进入 `runtime.submit`。健康检查仅在 upgrade 时执行；服务没有对现存连接拒单或关闭的路径。这与“数据库整体失败则拒绝新命令”不符，故障恢复后的行为也取决于仍存活的旧连接。 | `apps/server/src/index.ts:51-55,68-120`；`apps/server/src/sqlite-room-store.ts:152-156`；`assets/state-storage.md:71` | 在已绑定消息入口实行同一故障 gate，并定义恢复/重新开放接单条件。 |
| R3 | P0 | 超过 1 MiB 的投影直接断开连接，没有先裁剪聊天并设置 `chatTruncated`。协议允许每条消息最多 500 字符和最近 300 条；大量需要 JSON 转义的合法文本、长昵称及牌局字段可推高完整投影。此时所有接收者可能因公屏内容失去牌局连接，重连后仍会收到同一超大投影。 | `packages/runtime/src/projection.ts:132-145`；`apps/server/src/index.ts:140-146`；`assets/protocol.md:167` | 在提交前按接收者和字节上限裁剪最旧聊天、标记 `chatTruncated`，保持牌局权威字段与投影 schema 完整；超过上限的其他字段单独报错。 |

## 实际验证

只执行了 `rg`、`nl`、`sed`、`cat`、`git status` 等只读静态检查；核对了方案 v1.0 的 F2/F3/F6/F7/F8/F9、`assets/protocol.md`、`assets/state-storage.md`、D31、T4 实施安排，以及 `packages/runtime/`、`apps/server/`、`packages/storage/src/room.ts`、相关 engine 方法和 lockfile。未修改源码或其他共享文件。

静态复核确认：每房 `enqueue` 串行；命令以 clone 候选并在 SQLite CAS 成功后替换内存/投递；join 的 bootstrap receipt、状态与其他在线端已裁剪事件同事务；`forceFold` 使非 actor、可 check 的离桌者立即失去争池资格；`handSeatOwners` 避免 waiting 中复用座位映射到旧牌；手级 `handVisibility` 防止规则变更追溯公开上一手底牌，playing/showing 新加入者登记为本手观众、waiting 新加入者不读保留旧手；开手同步盲注后 stack 并生成 `deal`，board 只生成公开牌事件。T6 Agent 控制和 T7 个人历史、closed archive 与 equity worker 在实施安排中明确尚未交付，本报告未把接口占位视为这些功能已经完成。

遵照实施安排，未新增或运行测试；当前 TS/依赖环境未能提供可信的 typecheck、build 或服务启动结果。真实 WS、SQLite 崩溃恢复、并发和故障注入均未验证；上述“确认”仅指当前源码路径的静态判断。
