# River v2：实施任务

依据 `plan.md`。用户 2026-09-24 授权“一口气干完”。每个任务完成后由独立审阅代理审阅（`reviews/T*-*.md`），证据放 `evidence/T*/`。共同约定沿用 river-desktop：牌局状态只在主进程；对手读不到未公开的底牌；注释只写“为什么”；类型契约在 `src/shared/types.ts`。

```
T1 CI 前置验证 ──────────────────────────────────────────────┐
T2 引擎 ─┐                                                    │
T3 数据层 ┼─► T4 智能体 ─► T5 Runner/IPC ─┬─► T6 牌桌页 ──┐   │
         │                                └─► T7 其他页面 ┼─► T8 自动更新与 CI ─► T9 验收
```

## T1：CI 前置验证

目标：在 GitHub Actions 上验证 ADR-005 的前提与 models.dev 价格字段。
修改：`.github/workflows/spike-v2.yml`（验收后删除）。
验收：自签证书受信任后 electron-builder 能签名；0.0.2 满足 0.0.1 的 designated requirement；ad-hoc 对照不满足；models.dev 有 `cost` 字段。
结果：见下。

## T2：引擎改写

目标：`Table` 类（plan §模块、discussion §4），三处规则修正。
修改：`src/main/engine/eval.ts`、`table.ts`；`test/engine.test.ts`。`poker.ts` 在 T5 删除。
验收：规则用例（不完整加注、累计重开、单挑、边池、未跟注退还、余数、弃牌结束、短码大盲、abortHand、pots/totalPot）与 3000 手随机压测通过；牌型评估与原型对照一致。

## T3：数据层

目标：迁移 v2 与去掉 Mastra 存储（ADR-004）。
修改：`src/main/db/index.ts`、`src/main/index.ts`（启动顺序）、`package.json`（删 `@mastra/memory`、`@mastra/libsql`）、`test/db.test.ts`、删 `test/db-mastra.test.ts`。
内容：Settings/Lobby 新字段与默认值；角色表 CRUD（内置种子合并覆盖、自建、删除/恢复）；记忆（追加、每 owner 保留 10 条、清空）；用量（写入、汇总、按手、清零）；价格缓存；显式 WAL；保留写链。
验收：迁移测试（v1 库 → v2，旧提示词覆盖保留）；CRUD 与汇总测试。

## T4：智能体

目标：`llm.ts`、`opponent.ts`、`coach.ts`、`models/prices.ts`（discussion §2、§3、§6）。
修改：删 `agents/mastra.ts`、`queue.ts`、`tools.ts`、`intents.ts`、`leak.ts`、`views.ts` 中工具查询部分；`models/resolve.ts` 去掉 Mastra 存储依赖。
验收：mock 模型测试 `maxRetries` 计次（2 次重试 = 3 次调用）、宽松 `act` 解析、speak/ask 流式与历史、recap 工具、用量回调（含中止）；价格查询（快照 + 缓存）。

## T5：Runner、IPC、共享类型

目标：`runner.ts` 重写、`view.ts`、`text.ts`、`ipc.ts`、`shared/types.ts`、`shared/personas.ts`、`preload`、`renderer/lib/river.ts` 的数据层。
验收：runner 测试覆盖 plan §验证 所列场景；typecheck 通过（界面在 T6/T7 调整，T5 中保证能编译即可）。

## T6：牌桌页

目标：设计稿牌桌区（桌布/牌背/动效、筹码堆、座位样式、盲注徽标、气泡、发牌/翻牌/筹码/加注/全下/弃牌/赢家动效、公屏只读带牌面、操作区全下红色按钮、停下横幅、教练锁定态与「不等了」、结果区复盘中与「跳过」、教练栏按对局类型、复盘卡、桌面外观浮层、顶栏本桌花费）。
验收：真实应用截图（2/3/6 人、教练局、自由局、stalled、摊牌亮弃牌）；动效三档可切换。

## T7：其他页面

目标：大厅（对局类型、最近手牌牌面、入座前置检查）、AI 对手（新建/编辑/删除/恢复/恢复默认、头像色）、回放（牌面、每街公共牌、结构化复盘、教练局亮出的底牌）、统计（用量与花费）、设置（删减项、牌桌外观组、思考速度说明）、引导文案。
验收：截图；typecheck；相关测试。

## T8：自动更新与 CI 发布

目标：`updater.ts`、更新提示 UI、`electron-builder.yml`（publish、mac zip、删 identity、forceCodeSigning）、`build.yml`（版本注入、价格快照、macOS 钥匙串与证书、非草稿发布、签名断言）、README（证书生成与 Secrets 配置）、删 `spike-v2.yml`。
验收：workflow 语法与步骤自检；本地 `electron-builder --dir` 可打包（Linux）；证书步骤在未配置 Secret 时给出明确失败信息。

## T9：验收与收尾

目标：全量测试、typecheck、构建；真实应用走一遍主要流程并截图；README 更新；最终独立审阅；推送。
