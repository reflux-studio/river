# T1 牌局契约与反馈：审阅

模式：逐任务。技术方案：plan.md v1.0。代码：工作树 /Users/suziming/Documents/personal/river，起点 2b7047c19465f5607be3695130a9cae999c9e623，当前未提交改动。
审阅者：独立子代理 implement_notifications，未参与 T1 的后端、共享类型或测试实现。本轮不审阅本人实现的 T3 通知代码。

## 结论

通过，没有发现 P0、P1 或 P2 问题。本结论仅覆盖 T1 契约与主进程事件生成，不代表声音、系统通知、renderer 同步或真实牌局听感已验收。

## 问题

| 编号 | 级别 | 问题与后果 | 依据与位置 | 建议 |
| --- | --- | --- | --- | --- |
| 无 | — | 本次检查未发现需要修改的问题 | 见检查范围 | — |

## 检查范围

核对了 shared/types.ts、main/table/runner.ts、main/table/view.ts、main/db/index.ts、main/ipc.ts、test/feedback.test.ts、table-helpers.ts、db.test.ts 的实际改动及关联引擎行为，按批准方案和任务 T1 检查：

- 实际成功的玩家和 AI 行动按引擎日志生成语义事件，All-in 替代普通动作，return 不伪造下注；公共牌数量由相邻街差值产生，收注扣除返还后判断，每手结算合并为一次 payout，并携带玩家净收益。
- hero.canAct、主进程操作门控和 ReadyDecision 使用严格就绪条件；新 heroKey 建立前不开放操作，教练只有 spokenKey 对应当前决策且 busy=null 才就绪。首次过渡广播、问答恢复和失败重试不重复 turn。
- table:view 使用含 null 离桌的 revision 包装，revision 跨手与换桌不重置；反馈 seq 跨手递增、换桌重置。snapshot 不产生新事件，bootstrap 在异步读取之后同步捕获视图及两种水位。renderer 如何使用这些水位属于 T4，不在本轮结论内。
- 声音设置默认 true/50，旧字段缺失或非法存量回默认，写入拒绝非法布尔值、非有限或越界音量，成功配置沿原 kv 链路持久化。app.setTableVisible 只接受布尔值并交注入钩子处理。
- 通知观察者异常被隔离，不阻塞牌局；离桌广播 null 决策，旧手待发反馈和决策身份随生命周期清理。只评价对外钩子契约，不评价 T3 内部策略。

## 实际验证

独立运行：

```sh
cd /Users/suziming/Documents/personal/river/apps/desktop
node ../../node_modules/vitest/vitest.mjs run test/feedback.test.ts test/runner.test.ts test/db.test.ts test/english.test.ts
```

结果：4 个文件、89 个测试通过，退出码 0，耗时 19.85 秒。覆盖本次新增反馈/声音设置与既有牌局、存储、英文回归。

执行者报告的先红后绿过程未由本审阅者重演；本轮通过结论依据当前代码和上述独立运行。未启动 Electron、播放声音、发送真实系统通知、测量后台调度或验证跨平台安装包。尚需 T2/T4 集成及整体审阅覆盖端到端链路。

仅写入本报告，未修改代码或其他文档。
