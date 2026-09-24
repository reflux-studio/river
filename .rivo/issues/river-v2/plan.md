# River v2：技术方案

状态：依据 `discussion.md` 第 5 轮（审阅 1–3 见 `reviews/design-1..3.md`，第 5 轮已处理审阅 3 的全部发现）。用户 2026-09-24 批准方向并授权“其余由 AI 决定、一口气做完”。决策记录 `adr/004`（去掉 Mastra 存储）、`adr/005`（自签证书 + electron-updater）。

## 目标

1. 实现设计稿 `River v2.dc.html` 的交互与视觉改动（note“v1 → v2 差异”表、discussion §9 处理清单）。
2. 对手每回合一次 `act` 调用；公屏只读；无托管，失败即停下可重试（U1、U2、A1）。
3. 教练成为对局类型：教练局每步先听教练、一手结束亮全部底牌并复盘；自由局只有概率面板（U3、A3、A4、A8）。
4. 自研引擎改为 `Table` 类并修正三处规则（A5）。
5. 真实 token 用量与 models.dev 价格（A6）。
6. 自签证书 + electron-updater 全平台自动更新（A9）。

## 模块变化

```
src/main/engine/eval.ts      牌型评估、equity、outs（自 poker.ts 拆出，算法不变）
src/main/engine/table.ts     Table 状态机（新）；poker.ts 删除
src/main/agents/opponent.ts  单次 act；schema 宽松；规范化在 runner
src/main/agents/coach.ts     speak（流式、无工具）、ask（流式、带本桌历史）、recap（工具 recap）
src/main/agents/llm.ts       Agent 构造（maxRetries）、调用封装、用量回调（取代 mastra.ts/queue.ts/tools.ts/intents.ts/leak.ts）
src/main/models/prices.ts    价格快照 + 运行时刷新 + 查价
src/main/table/runner.ts     重写：对局类型、stalled、教练互斥、abortHand、角色快照、用量归属
src/main/table/view.ts       TableView 裁剪（新字段）
src/main/table/text.ts       handLog → 中文文案、局面文本（给 agent）
src/main/db/index.ts         迁移 v2：角色表、记忆、用量、价格缓存、WAL；去掉 Mastra 相关
src/main/updater.ts          electron-updater 接线（新）
src/renderer/...             牌桌 v2、各页面 v2（见任务）
build/prices.json            CI 生成的价格快照（仓库内提交一份初始快照，CI 覆盖）
```

## 共享契约（`src/shared/types.ts`）

```ts
type Mode = 'coach' | 'free'
interface Settings { speed: 0|1|2; coachPersona: 0|1|2; level: 'novice'|'pro'; hard: boolean;
  felt: 'green'|'blue'|'wine'|'graphite'|'paper'|'custom'; feltCustom: string; back: 'red'|'blue'|'black'|'green'; fx: 'full'|'lite'|'off';
  models: { opponent?: ModelRef; coach?: ModelRef } }
interface Lobby { size: 2..6; blinds: 0|1|2; picks: string[]; mode: Mode }
interface TableStart { size; blinds; picks; mode: Mode; guided: boolean }
interface Persona { id; name; tag; ini; hue; desc; prompt; builtin: boolean; edited: boolean }   // 数据库下发，含覆盖
interface ChatMessage { id; kind: 'sys'|'act'|'msg'; from?: string; text?: string; act?: string; cards?: Card[]; at: number }
interface SeatViewPublic { name; personaId?; tag; ini; hue; stack; bet; isDealer; isSB; isBB; folded; out; allin;
  status; statusTone: 'muted'|'blue'|'green'|'dark'|'red'; thinking; winner; cards?: Card[]; mucked?: boolean; hasCards; bubble? }
interface CoachEntry { id; kind: 'user'|'answer'|'speak'|'recap'; text; handNo: number;
  recap?: { headline; good; improve; tip }; status: 'pending'|'done'|'failed'|'skipped' }
interface TableView { mode; title; bb; handNo; street; board; pot; seats; hero: { legal; toCall; isTurn; defaultRaiseTo; presets };
  done; result; heroBust; nums;
  stalled: { name: string; error: string; settings: boolean } | null;
  coach: { busy: 'speak'|'ask'|'recap'|null; locked: boolean; canNext: boolean } | null;   // 自由局为 null
  guided; cost: { usd: number; tokens: number; unpriced: number } }
```

命令：删 `chat.send`、`table.resume`、`table.retryModels`、`persona.setPrompt`、`persona.resetPrompt`；新增 `table.retry`、`coach.skip`（「不等了」「跳过」）、`coach.retry`（复盘重试）、`persona.save`、`persona.delete`、`persona.restore`、`persona.reset`、`usage.summary`、`usage.reset`、`update.install`；`coach.ask(text)` 不再带 requestId。
事件：删 `coach:delta`、`coach:done`、`agent:last`；新增 `coach:upsert`（整条 CoachEntry，流式时每段更新一次）、`personas`（角色表变化）、`usage:changed`、`update:ready`（`{ version }`）。

## 关键流程

**对手回合**（discussion §2）：`opponentAct(ctx)` 一次 `generate`，工具 `act` 宽松 schema；返回 `{ ok, act?, error?, usage }`。runner 规范化后 `actionTaken`；补足最短显示时长；公屏一条（行动 + 发言）；`note` 暂存，一手结束时每角色取最后一条写入记忆。失败 → `stalled`。

**教练互斥**（discussion §3、§14）：runner 持有 `coachBusy: 'speak'|'ask'|'recap'|null` 与当前调用的 `AbortController`。`busy === 'ask'` 时 `loop()` 不推进；轮到玩家时若 `busy` 为空立即 `speak`，否则等 `ask` 结束后开始；一手结束时同理开始 `recap`。`coach.skip` 中止当前 `speak`/`recap`（状态记 `skipped`），`ask` 不可跳过。`canNext = done && busy !== 'recap'`。

**stalled**：`{ seat, error, settings }`；`table.retry` 重新发起该座位决策；离桌时 `table.abortHand()`，不落库。

**用量**：`llm.ts` 在每次调用结束时回调 `{ purpose, providerKind, modelId, usage?, aborted }`，runner 附上 `tableId`、`handNo` 写 `river_usage`，并累计本桌花费（显示时用当前价格）。

**自动更新**：`app.isPackaged` 时启动 10 秒后与每 6 小时 `autoUpdater.checkForUpdates()`，`autoDownload: true`，`update-downloaded` → `update:ready`；`update.install` 仅在无牌桌时调用 `quitAndInstall`（有桌时返回错误）。

## 存储（迁移 v2）

见 discussion §8。实现要点：`river_personas` 新列 `name, tag, ini, hue, desc, builtin, deleted`（旧行只有 prompt 覆盖，迁移保留）；`river_memory(id, owner_id, text, at)`；`river_usage(id, at, table_id, hand_no, purpose, provider_kind, model_id, input, output, cached)`；价格缓存放 `river_kv` 的 `prices` 键；手牌记录 JSON 增字段，无需改表。

## 验证

- 引擎：规则用例 + 随机压测（已在 T2 完成）。
- runner：假 agent 测试对手单次调用、规范化、stalled/重试/离桌作废、教练互斥（提问暂停、speak/recap 顺序、skip）、亮全部底牌只到玩家视图、用量归属、角色快照。
- agents：mock 模型计次测试 `maxRetries`、宽松 schema、流式 speak/ask、recap 工具。
- 数据：迁移测试（旧库 → v2）。
- 界面：真实 Electron 应用截图（Linux 本地），覆盖教练局、自由局、stalled、统计、对手编辑、回放。
- CI：T1 已验证自签签名与价格；T8 在正式构建中断言签名身份。

## 风险

见 discussion §11。另：Linux 本地截图字体与 macOS 不同，只验证布局与流程。
