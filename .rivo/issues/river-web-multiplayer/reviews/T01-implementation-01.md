# T1 共享契约与权威核心：审阅

模式、技术方案版本、代码版本：逐任务；已确认技术方案 v1.0；起点 `55198ddaa9d2355cbd6530b87536a77ac828c652`，当前为共享工作树未提交改动。

## 结论

**通过。** 首轮 R1–R4 与增量 R6 均已关闭；没有剩余 P0/P1。协议包类型检查及真实恢复/运行验证仍受环境与范围限制，详见 R5 和“实际验证”。

## 问题

| 编号 | 级别 | 问题与后果 | 依据与位置 | 建议 |
| --- | --- | --- | --- | --- |
| R1 | 已关闭 | `randomInt` 现在对 uint32 样本使用拒绝采样；Table、Deck 和模拟 equity 通过注入源取数，engine 不再读取 `globalThis` 或调用默认 `Math.random`。 | `packages/engine/src/eval.ts`、`table.ts`、`deck.ts`。代码审阅确认有界抽样逻辑，宿主 CSPRNG 接入留在后续桌面/服务任务。 | 无 |
| R2 | 已关闭 | TableState/DeckState 现在检查版本、座位与行动游标、完整 52 张牌分区、烧牌/发牌顺序、牌面唯一、筹码分项和结算关系；非法快照会在实例返回前拒绝。 | `packages/engine/src/table.ts` `Table.importState`、`packages/engine/src/deck.ts` `Deck.importState`。静态核对覆盖不变量路径，尚无恢复运行测试。 | 无 |
| R3 | 已关闭 | 协议包补齐 Room/Hand/Effect/Chat、Agent observation/result、FundingEntry、个人手牌/场次变化、分页和 head schema，并对有绑定命令按 type 校验 payload。协议 v1 明确丢弃未知对象字段，扩展需升级协议。 | `packages/protocol/src/` 与协议附件的结构核对。Zod/TS 实际编译因依赖目录问题未完成，列为 R5。 | 无 |
| R4 | 已关闭 | 底池及层池用安全整数累加；摊牌先生成并验证全部 awards 与余额后一次性写入，超界不会留下部分 stack 更新。 | `packages/engine/src/table.ts` 的 `showdown`、`pots()`、`totalPot()`。静态检查确认所有关键求和使用安全边界。 | 无 |
| R5 | P2 | 新协议包尚未完成 TypeScript 5.9/Zod 编译。失败安装清空了工作树中的二进制链接，且本机离线镜像缺少 `@a2a-js/sdk` metadata；对 engine 源码以本机缓存的 TS 4.9 显式等价参数运行了只读编译，结果通过，但不替代仓库要求的 TS 5.9 package typecheck。 | 直接检查命令见本轮；`git diff --check` 通过。根和 desktop `tsc` 链接仍不存在。 | 后续恢复受支持依赖工具链后运行全部 typecheck/build。 |
| R6 | 已关闭 | 新增活动手 `adjustStack`，只改变可用 stack 与资金调整净额；拒绝 all-in/out、非法金额和全桌总额溢出，不改变 bet、totalIn、fold/all-in/out 标志或行动游标。abortHand 保留已确认的资金变化，pendingStack 仍归 runtime。 | `packages/engine/src/table.ts` `adjustStack`、`abortHand` 和 `TableState`。静态检查覆盖状态变更和导出恢复字段。 | 无 |

## 实际验证

- 独立阅读了 T1 改动、engine 原有实现与 `assets/protocol.md`、`assets/state-storage.md`，静态核对方案职责与不变量。增量复核确认 R1–R4、R6 关闭；没有剩余 P0/P1。
- `git diff` 显示 lockfile 仅新增 `packages/protocol` importer；`package.json` 与 `pnpm-workspace.yaml` 未变。
- 执行者运行的离线冻结安装失败并清空根及 `apps/desktop` 的二进制链接；后续一次仅筛选 engine 的离线安装也因同一 `@a2a-js/sdk` metadata 错误失败。未再尝试安装。根目录新增 `.pnpm-store/`。本审阅未运行测试或构建。
- engine 源码以缓存的 TypeScript 4.9.5 直接编译（显式等价的 ES2022/strict/node 模块解析参数），通过；该工具低于仓库 TS 5.9，不能替代 package typecheck。`git diff --check` 通过。
- 结论是 T1 代码静态审阅通过，不代表协议编译、状态恢复、服务端 CSPRNG 集成或真实牌局验证通过。
