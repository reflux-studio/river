# T2 跨端 Client 与存储协议：审阅

模式、技术方案版本、代码版本：逐任务；已确认技术方案 v1.0；起点 `55198ddaa9d2355cbd6530b87536a77ac828c652`，包含 T1 未提交改动及本轮 T2 未提交改动。

## 结论

**通过。** 增量复核确认 R1–R4 已关闭，没有剩余 P0/P1。TypeScript 5.9 检查与真实 WebSocket/存储恢复仍未验证，详见 R5 和“实际验证”。

## 问题

| 编号 | 级别 | 问题与后果 | 依据与位置 | 建议 |
| --- | --- | --- | --- | --- |
| R1 | 已关闭 | Transport 与 Client 通过单调物理连接 generation 区分消息和状态；新连接 hello/welcome 后自动 resume 或回放单个 pending bootstrap，获得 Bound/reset 后才允许重放命令及历史追赶。旧 generation 事件被忽略。 | `packages/client/src/transport.ts`、`client.ts`。静态路径核对确认适配约束明确，WS/Electron adapters 后续需实现 generation。 | 无 |
| R2 | 已关闭 | `ConnectionStore.listPendingBootstraps()` 和 `recoverPendingBootstrap(commandId?)` 让应用在刷新/重启后发现并选择未确认 create/join，按原 commandId 和凭证重发；Bound 后用原子接口保存 credential 并删除 pending。多个待处理请求不会猜测选择。 | `packages/storage/src/player.ts`、`packages/client/src/client.ts`。 | 无 |
| R3 | 已关闭 | 握手 Reject 以 `HandshakeRejectedError` 结束 welcome/ready waiter并发布 reject；retryable 请求保留，永久失败调用原子 `terminatePendingBootstrap`，resume 永久失败保留本地凭证供显式重试。 | `packages/client/src/client.ts`、`packages/storage/src/player.ts`。 | 无 |
| R4 | 已关闭 | Bound 先校验身份、再持久化 credential，成功后才建立本地 binding 并允许 reset projection；失败会拒绝 waiter、标记 generation 并忽略该代 projection，pending bootstrap 保留。 | `packages/client/src/client.ts`。静态复核覆盖身份不匹配与存储拒绝路径。 | 无 |
| R5 | P2 | T2 TypeScript 5.9/协议依赖类型检查未执行。此限制来自前序离线安装失败，不能据此推断代码通过编译。 | `packages/client`、`packages/storage` typecheck scripts；当前依赖目录无可用 `tsc`/Zod 链接。 | 在工具链恢复后执行两包及依赖包 typecheck。 |

## 实际验证

- 独立检查 `packages/client`、`packages/storage` 全部源码、包导出、锁文件增量，并对照 F1/F2/F4、`assets/protocol.md` 与 `assets/state-storage.md`。增量复核确认 R1–R4 已关闭。
- `git diff --check` 通过；执行者报告新增 JSON 配置解析和 TypeScript 语法转译检查通过，但未执行完整类型检查或测试。
- 未运行测试、构建或真实 WebSocket/IndexedDB/SQLite 集成。报告结论只覆盖静态审阅。
