# River 桌面版：实施任务

## 目标与共同约定

依据：`plan.md`（第 4 轮独立审阅通过 reviews/plan-4.md；赢家发言修订经 reviews/plan-5-task-5.md 复审通过）。用户已批准方案，并授权按 Rivo 流程一直做到实施（2026-09-23）。任务不改变方案；发现方案缺口时停止受影响任务，回到方案讨论。

项目根目录：`/Users/suziming/Documents/AI/river`（新建，git init）。平台：macOS arm64。包管理：pnpm。Node ≥ 20.3（`AbortSignal.any`）；Electron ≥ 29。

版本基线（首个任务锁定到 `package.json`）：`@mastra/core` 1.69.x、`@mastra/memory` 1.31.x（与 core 匹配的最新版）、`@mastra/libsql` 最新、`zod`、`electron`（最新稳定版）、`electron-vite`、`electron-builder`、`react` 19、`tailwindcss` 4、shadcn/ui（`pnpm dlx shadcn@latest`）、`vitest`。

所有任务共同遵守：

- 牌局状态只在主进程 TableRunner 中修改；Renderer 只收裁剪后的 `TableView`，未摊牌的对手底牌不得离开主进程。
- agent 工具只读局面或写意图（`act`、`say`、`hint`、`pause_game`），不直接改牌局；TableRunner 在调用返回、校验未过期后应用意图。
- API key 只在主进程解密，任何 IPC 不返回明文。
- 代码注释只写“为什么”（用户全局规则）；不为一次性代码建抽象。
- 共享类型定义在 `src/shared/types.ts`，任务间以它为契约；修改其中已被其他任务使用的类型，需在本文件对应任务“结果”中记录。

公共契约（完整字段见各任务；以下为跨任务核心）：

```ts
// src/shared/types.ts（摘要）
type Card = string                       // 'As' 'Td'，与原型一致
type Street = 'preflop'|'flop'|'turn'|'river'|'showdown'
interface Settings { engine:'llm'|'local'; speed:0|1|2; coachOn:boolean; coachPersona:0|1|2;
  level:'novice'|'pro'; hard:boolean; autoNext:boolean;
  models:{ opponent?:{providerId:string;modelId:string}; coach?:{providerId:string;modelId:string} } }
interface Lobby { size:2|3|4|5|6; blinds:0|1|2; picks:string[] }
interface ChatMessage { id:string; kind:'sys'|'act'|'msg'; from?:string; text?:string; act?:string;
  autopilot?:boolean; replyTo?:string; triggers:boolean; at:number }
interface Persona { id:string; name:string; tag:string; ini:string; hue:number; desc:string;
  profile:{tight:number;aggr:number;bluff:number;call:number}; talk:number; prompt:string;
  lines:Partial<Record<'raise'|'call'|'check'|'fold'|'win'|'chat',string[]>> }
```

## 任务顺序

```
T1 技术验证与脚手架 ──┬─► T2 牌局引擎 ──────────┐
                      └─► T3 数据层与共享定义 ───┼─► T4 智能体与工具 ─► T5 TableRunner 与 IPC ─┬─► T6 应用骨架与非牌桌页面
                                                  │                                          ├─► T7 牌桌页
                                                  │                                          └─► T8 回放与统计
                                                  └──────────────────────────────────────────────► T9 整体联调、打包与验收
```

T2、T3 可并行；T6、T7、T8 可并行（共用 T6 产出的主题与 shadcn 组件，T7/T8 在 T6 完成 `components/ui` 与主题后开始）。T1 是门槛：失败则停止并回到方案讨论。

## 任务 T1：技术验证与脚手架

目标与范围：建立可运行、可打包的 electron-vite 工程，并证明方案的四个未验证前提成立。

前置依赖：无。需要 DesignSync 读取权限（已登录）。

修改位置：
- 新建 `river/` 工程：`package.json`、`electron.vite.config.ts`、`electron-builder.yml`、`tsconfig*.json`、`src/main/index.ts`、`src/preload/index.ts`、`src/renderer/`（Vite React 模板）、`.gitignore`。
- `.rivo/issues/river-desktop/design-source/poker.js`（从设计项目 `2a5400ca-ac09-4130-865d-820403b275ac` 读取 `poker.js` 原文写入）。
- `scripts/spike.ts` 或主进程启动参数 `--spike`：验证代码，验收后删除或保留为 `test/spike.test.ts`（能在 vitest 的 Node 环境跑的部分）。

实施步骤：
1. 用 DesignSync `get_file` 拉取 `poker.js` 原文，逐字写入 `design-source/poker.js`。
2. 创建 electron-vite React-TS 工程；主进程输出 ESM（`package.json` `"type": "module"` 或 electron-vite 的 ESM 输出配置），`contextIsolation: true`、`nodeIntegration: false`。
3. 安装 Mastra 依赖。主进程启动时：`new LibSQLStore({ id:'river', url:'file:'+join(app.getPath('userData'),'river.db') })`；创建带 `Memory({ storage, options:{ workingMemory:{ enabled:true, scope:'resource' } } })` 的 Agent，`model` 为函数，按 `RequestContext` 返回配置（验证时可用 AI SDK mock 模型或环境变量中的真实 key）；注册一个 `createTool` 工具；执行一次 `generate`，`activeTools` 含 `updateWorkingMemory`、`stopWhen` 自定义条件、`abortSignal`。
4. 断言：工具被执行；`agent.getMemory()` 的工具集中存在名为 `updateWorkingMemory` 的工具；`river.db` 中出现 `mastra_` 表；`@mastra/core/llm` 的 `PROVIDER_REGISTRY` 可读取。
5. safeStorage 验证在打包产物上做：安装 dmg，启动后 `safeStorage.encryptString` 写入 `userData/spike-key.bin`；修改版本号重新打包、覆盖安装后启动，能 `decryptString` 还原。
6. electron-builder 配置：mac target `dmg`、arch `arm64`、`asarUnpack: ['node_modules/@libsql/**','node_modules/libsql/**']`，不签名（`mac.identity: null`）。打包、安装后启动能读写 `river.db`。

工程注意事项：
- libsql 为 Neon/N-API 原生模块（`@libsql/darwin-arm64/index.node`），必须 asarUnpack。pnpm 使用默认 isolated 布局（实测 hoisted 下 electron-builder 26 收集依赖出错）；pnpm 11 的设置写在 `pnpm-workspace.yaml`。
- Mastra 要求 ES2022 模块；CommonJS 会失败。
- 被中止的 `generate` 返回 `finishReason: 'aborted'` 而不抛错。

验证与完成标准：
- `pnpm dev` 打开空窗口；主进程日志输出四项断言全部通过。
- 打包出的 `dist/River-<version>-arm64.dmg` 安装后启动成功，`~/Library/Application Support/River/river.db` 存在且包含 `mastra_` 表。
- 打包产物覆盖安装后 safeStorage 解密成功。
- 任一前提失败（含 safeStorage）：停止，记录证据，回到方案讨论（Mastra 相关备选：`utilityProcess` 承载；safeStorage 失败时由用户决定是否接受“重装后需重新输入 key”）。

结果：已完成（2026-09-24）。独立审阅 reviews/T1-1.md 通过。证据 evidence/T1/。
- 四个前提在开发与打包产物中均通过（9 项断言；safeStorage 在 0.1.0→0.1.1 覆盖安装后解密成功；44 张 mastra_ 表；PROVIDER_REGISTRY 208 项）。
- 偏差（均有证据，已采纳）：pnpm 默认布局替代 hoisted；设置在 `pnpm-workspace.yaml`（含 `allowBuilds`，以及 pnpm 11 最短发布时长保护对 `@mastra/core` 1.69.0、`electron` 44.4.5 的豁免）；`postinstall: install-electron`；preload 输出 `.cjs`（sandbox 要求）；vite ^7（electron-vite 5 限制）；typescript ~5.9。
- `src/main/spike.ts` 由 `--spike` 或 `RIVER_SPIKE=1` 触发，保留到 T9 验收，发布前移除（见 T9）。


## 任务 T2：牌局引擎

目标与范围：`src/main/engine/poker.ts`，行为与原型 `poker.js` 一致，附单测。

前置依赖：T1（工程与 `design-source/poker.js`）。

修改位置：`src/main/engine/poker.ts`、`test/engine.test.ts`。

输入输出：导出原型 `window.RiverPoker` 的全部函数 `newGame, startHand, legal, apply, runoutStep, decide, equity, outs, handName, pot, disp, txt, fmt, inHand, canAct`，另导出内部的 `progress, dealStreet, showdown, best` 供测试与对照（与原型同名同义）。类型：

| 类型 | 字段 |
| --- | --- |
| `Player` | `id, personaId?, name, isHero, stack, hole, bet, contrib, folded, allin, acted, last, out, startStack, handName?, score?` |
| `Game` | `hand, sb, bb, dealer, sbI, bbI, board, deck, log, done, street, toAct, currentBet, minRaise, winners, showdown, runout, players` |
| `LogEntry` | `street, id?, board?, label, autopilot?` |
| `Legal` | `toCall, canCheck, minTo, maxTo, canRaise, bet, stack` |
| `Action` | `{ type:'fold'|'check'|'call'|'raise', to?:number }` |
| `Profile` | `{ tight, aggr, bluff, call }` |

实施步骤：
1. 逐函数移植，保持算法与常量（`eval5` 计分、`equity` 洗牌方式、`decide` 系数）不变。
2. 所有随机点接受注入的 `rng`（`newGame(cfg, rng?)`、`startHand(g)` 使用 `g.rng`、`equity(..., rng?)`、`decide(..., rng?)`）。
3. `apply` 返回行动标签（“弃牌”“过牌”“跟注 x”“加注至 x”“下注 x”“全下 x”），与原型文案一致；`LogEntry.autopilot` 由调用方设置。

验证与完成标准（vitest）：
- 牌型：皇家同花顺、同花顺、A-5 顺子、葫芦对比、同花比较踢脚、两对踢脚。
- 边池：三人全下额 100/300/600 且牌力不同，分配正确，余数给第一位赢家。
- 单挑：庄家为小盲且翻前先行动。
- runout：全员全下后 `runout = true`，`runoutStep` 逐张发至摊牌。
- 纠正：`toCall > 0` 时 `check` → `call`；不可加注时 `raise` → `call/check`；`to` 被夹在 `[minTo, maxTo]`。
- 固定种子下 `decide` 与 `equity` 结果可复现。
- 与原型对照：用同一种子序列，在 Node 中加载 `design-source/poker.js`（把 `window` 换成全局对象）跑 200 手随机局面，`legal/apply/showdown` 结果与移植版一致。

结果：已完成（2026-09-24）。独立审阅 reviews/T2-1.md 通过，收尾复审 reviews/T2-2.md 通过。证据 evidence/T2/。
- 移植与原型逐步对照（200 手，每步整体状态比较）一致；`Card`、`Street` 从 `src/shared/types.ts` 导入；`Legal`、`Profile`、`Rng` 暂留引擎（T5 需要时迁移到 shared）。
- `newGame` 为满足类型补了发牌前初值，`startHand` 后与原型完全一致。
- `Game.rng` 是函数字段：`Game` 不能 structuredClone、JSON 序列化或经 IPC 发送；T5 构造 `TableView`、`HandRecord` 时从字段取值。
- `tsconfig.node.json` 已包含 `test/**/*`，`pnpm typecheck` 覆盖测试；临时探针不要放在 `test/` 下。


## 任务 T3：数据层与共享定义

目标与范围：SQLite 业务表、仓储函数、角色与教练定义、共享类型。

前置依赖：T1。

修改位置：`src/shared/types.ts`、`src/shared/personas.ts`、`src/main/db/index.ts`、`test/db.test.ts`；`src/main/index.ts` 中开发环境 `setPath('userData', …River-dev)` 的最小改动。

输入输出：
- `types.ts` 定义共享类型：`Settings`、`Lobby`、`Persona`、`ChatMessage`、`HandRecord`、`HandSummary`、`ProviderPublic`（字段见“目标与共同约定”与下文）。`HandRecord`：`hand, sb, bb, net, pot, showdown, hero: Card[], board: Card[], players: {id, personaId?, name, hole: Card[]|null, folded, handName, won, net}[], log: {street, board, name, label, autopilot?}[], vpip, pfr`（`hole` 仅玩家与摊牌者非空）。
- `personas.ts`：8 个角色（阿狸、老K、小白、教授、石头、阿May、牛仔、禅师），字段取自原型 `PERSONAS`（设计稿第 299–308 行：name/tag/ini/hue/desc/p/prompt/lines，其中原型字段 `p` 映射为 `profile`），新增 `talk` 健谈度：li 0.6、k 0.15、bai 0.85、prof 0.35、rock 0.05、may 0.5、cow 0.6、zen 0.25。通用台词 `LINES`、3 个教练 `COACHES`（温和老师/直白教练/数据派，文案取原型）、`BLINDS = [[10,20],[50,100],[100,200]]`、`STREET` 中文名。
- 业务表（启动时按 `PRAGMA user_version` 迁移，版本 1）：

```sql
CREATE TABLE river_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE river_personas (persona_id TEXT PRIMARY KEY, prompt TEXT NOT NULL);
CREATE TABLE river_hands (id INTEGER PRIMARY KEY AUTOINCREMENT, table_id TEXT NOT NULL,
  hand_no INTEGER NOT NULL, played_at INTEGER NOT NULL, net INTEGER NOT NULL, record TEXT NOT NULL);
CREATE TABLE river_reviews (hand_id INTEGER PRIMARY KEY REFERENCES river_hands(id) ON DELETE CASCADE, text TEXT NOT NULL);
CREATE TABLE river_providers (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
  base_url TEXT, api_key_enc BLOB, supports_required INTEGER);
```

- `river_kv` 键：`settings`（Settings JSON，默认 `{engine:'llm',speed:1,coachOn:true,coachPersona:0,level:'novice',hard:false,autoNext:true,models:{}}`）、`lobby`（默认 `{size:6,blinds:1,picks:['li','prof','bai','k','rock']}`）、`bankroll`（默认 100000）、`onboarded`（默认 false）。
- 仓储函数：`getSettings/updateSettings`、`getLobby/updateLobby`、`getBankroll/setBankroll`、`getOnboarded/setOnboarded`、`getPromptOverrides/setPrompt/resetPrompt`、`insertHand(tableId, record): id`、`listHands(): HandSummary[]`（倒序，`{id,handNo,playedAt,hero,net,showdown}`）、`getHand(id)`、`recentHands(n)`、`handsForPersona(personaId, n)`（record.players 含该 personaId 的最近 n 手）、`saveReview/getReview`、`clearHistory()`（删 hands 与 reviews，余额 100000）、`listProviders/saveProvider/deleteProvider/getProviderSecret`。
- 提供方：`saveProvider({id?,name,kind,baseUrl?,apiKey?})` 用注入的 `encrypt(text): Buffer` 加密；`kind !== 'openai-compatible'` 时忽略 `baseUrl`；`openai-compatible` 必须有 `baseUrl`，`apiKey` 可空。返回脱敏 `{id,name,kind,baseUrl?,keyTail,needsKey,supportsRequired}`；`keyTail` 在保存时从明文取末 4 位存入 kv（`provider_tail:<id>`），不从密文解出。`setSupportsRequired(id, bool)` 持久化测试结果。`needsKey` 是主进程内存标记（解密失败时由 T4 置位），`listProviders(needsKeySet)` 合并返回。`deleteProvider` 同时清空 settings.models 中引用它的角色。仓储提供同步内存缓存 `settingsCache`、`providersCache`，写入时同时更新，供 `resolveModel` 同步读取。

工程注意事项：开发环境（`!app.isPackaged`）在 `app.whenReady` 之前 `app.setPath('userData', <appData>/River-dev)`；数据库与 Mastra 的路径必须在函数内（初始化时）调用 `app.getPath`，不得在模块顶层求值，否则 ESM 导入先于 setPath 执行会使切换失效；避免开发数据写入正式目录（T1 实测两者默认共用 `~/Library/Application Support/River`）。`db/index.ts` 使用 `@libsql/client`，与 LibSQLStore 同一文件；加解密函数由调用方注入，便于在 vitest 中用明文替身测试。

验证与完成标准（vitest，使用临时 `file:` 数据库）：迁移可重复执行；默认值读取；settings 部分更新合并；hands 插入与倒序列表；`handsForPersona` 过滤；删除被引用提供方后 models 清空；`clearHistory` 后余额 100000 且 reviews 级联删除；脱敏结果不含明文。

结果：已完成（2026-09-24）。独立审阅 reviews/T3-1.md（需修改）→ T3-2.md（通过，R1 转本轮）→ T3-3.md（通过，F1/F2 小修复）→ T3-4.md（通过）。证据 evidence/T3/。衔接约定：
- `updateSettings` 对 `models` 按角色合并；清除某角色传 `{ models: { coach: undefined } }`（T5/T6 注意）。`getSettings()`、`getLobby()` 为同步函数。
- 外键级联不生效：任何删除 `river_hands` 的路径必须在同一批操作中显式删除 `river_reviews`。
- 业务写遇 SQLITE_BUSY/LOCKED 时重建业务 client 并异步退避重试（最长约 1.5 秒被拒）；最终失败后从库重载缓存。被拒绝的 settings/lobby 修改可能被后续写入带进库，界面不要把拒绝等同“一定没保存”。
- Mastra 必须用 `new LibSQLStore({ id: 'river', url })` 自建 client，与业务层同一 url，不得传入或共用业务 client（原因见 note“T3 实测结论”）。
- 启动顺序（T5）：`whenReady` 后先 `await initDb({ url, encrypt, decrypt })`，成功后再构造 LibSQLStore 与 Mastra，两者不并发；`initDb` 失败按启动失败处理。WAL 由 LibSQLStore 设置，业务层不设。
- 升级 `@libsql/client` 后必须重新验证静默丢写问题（test/db-mastra.test.ts）。


## 任务 T4：智能体、工具与队列

目标与范围：opponentAgent、coachAgent、工具、意图收集、泄牌过滤、AgentQueue、模型解析；可在无 Electron 的 vitest 中用 mock 模型测试。

前置依赖：T1（Mastra 可运行）、T2（equity/legal/handName）、T3（personas、仓储）。

修改位置：`src/main/agents/{mastra,queue,opponent,coach,tools,leak,intents,views}.ts`、`src/main/models/resolve.ts`、`test/agents.test.ts`、`test/views.test.ts`、`test/queue.test.ts`、`test/leak.test.ts`。

输入输出：

RequestContext 键：`role`、`mode`（`decide|chat|win|proactive|ask|review`）、`tableId`、`seat`、`personaId`、`intents`（IntentCollector）、`table`（只读访问 TableRunner 的查询接口 `TableQuery`）。

信息隔离的实现归本任务：`views.ts` 提供纯函数，T5 只调用它们，隔离测试用真实引擎状态覆盖真实代码。

```ts
interface SeatView {               // views.ts 定义并导出
  street: Street; sb:number; bb:number; handNo:number
  myCards: Card[]; board: Card[]; pot:number; toCall:number; myStack:number
  options: string[]                // 如 ['fold','call 200','raise 400~5000'] 或 ['check','raise ...']
  minTo:number; maxTo:number; canRaise:boolean
  players: { seat:number; name:string; tag:string; stack:number; bet:number; folded:boolean; allin:boolean; out:boolean; isYou:boolean }[]
  actions: string[]                // 本手行动记录：'【翻牌 A♠ 7♦ 2♣】'、'老K 加注至 400'
}
export function buildSeatView(g: Game, seat:number, nameOf:(id:string)=>string, tagOf:(pid?:string)=>string): SeatView
export function publicHandResult(rec: HandRecord, forPersonaId: string): string   // hand_history 与每手结果消息共用；只含摊牌亮出的牌，不含 rec.hero 与未亮底牌
interface TableQuery {            // T5 的 TableRunner 实现，内部调用上述函数
  viewFor(seat:number): SeatView
  chat(limit:number): ChatMessage[]
  equityFor(seat:number, iters:number): { eq:number; need:number; outs:number|null; handName:string; sugg?:string }
}
interface IntentCollector {
  act?: Action; say?: { text:string; kind:'free'|'reply'; replyTo?:string }
  hint?: string; pause?: string
}
```

意图取舍：`act`、`say` 各取第一个；`pause` 取第一个；无 `pause` 时 `hint` 取第一个（写入时若已有同类则忽略）。

工具（`createTool`，`execute(input, ctx)` 从 `ctx.requestContext.get(...)` 取身份）：

| 工具 | 输入（zod） | 行为 |
| --- | --- | --- |
| `view_table` | `{}` | `table.viewFor(seat)`：阶段、盲注、自己底牌、公共牌、底池、需跟注、可选行动与加注范围、各玩家名称/标签/筹码/本轮已下/弃牌/全下、本手行动 |
| `estimate_equity` | `{}` | 对手 200 次、教练 400 次模拟；返回胜率、所需胜率、出路、牌型（教练含规则建议） |
| `read_chat` | `{ limit?: number }` 默认 12 | `{id,from,text,at}[]`，from 为角色名或“你” |
| `hand_history` | `{ n?: number }` 默认 3，≤10 | `handsForPersona` 每手经 `publicHandResult`：摊牌亮出的牌、赢家与金额、自己盈亏；不返回 `record.hero` 及任何未亮底牌 |
| `recent_hands` | `{ n?: number }` 默认 5，≤20 | 玩家最近 n 手摘要 |
| `view_hero` | `{}` | `table.viewFor(0)` |
| `say` | `{ text: string, kind: 'free'|'reply', reply_to?: string }` | 写意图 |
| `act` | `{ action: 'fold'|'check'|'call'|'raise', to?: number }` | 写意图 |
| `hint` | `{ message: string }` | 写意图 |
| `pause_game` | `{ message: string }` | 写意图 |

各模式参数：

| 模式 | activeTools | toolChoice | maxSteps | 时限 |
| --- | --- | --- | --- | --- |
| decide | view_table, estimate_equity, read_chat, hand_history, say, act, updateWorkingMemory | required（提供方不支持时 auto） | 6 | 10s |
| chat | read_chat, hand_history, say, updateWorkingMemory | auto | 3 | 8s |
| win | read_chat, hand_history, say, updateWorkingMemory | auto | 3 | 8s |
| proactive | view_hero, estimate_equity, read_chat, recent_hands, hint, pause_game, updateWorkingMemory | auto | 4 | 12s |
| ask | view_hero, estimate_equity, read_chat, recent_hands, updateWorkingMemory | auto | 6 | 30s（stream） |
| review | recent_hands；`memory.options.readOnly: true` | auto | 6 | 45s |

decide 的 `stopWhen: ({ steps }) => steps.at(-1)?.toolCalls?.some(c => c.toolName === 'act')`。

Memory：两个 Memory 实例都显式传入与 Mastra 相同的 `storage`；`lastMessages: 40`；working memory `scope:'resource'`。模板：

对手 `OPPONENT_WM`：
```markdown
# 牌桌印象
## 玩家「你」
- 入池倾向：
- 诈唬倾向：
- 被我抓过的诈唬 / 诈唬过我的次数：
- 其他观察：
## 其他角色
- （角色名）：
## 我现在的状态
- 心情：
- 最近输赢：
```

教练 `COACH_WM`：
```markdown
# 学员档案
- 水平判断：
- 常见漏洞：
- 已讲过的概念：
- 近期进步：
```

resource / thread：对手 `opponent:<personaId>` / `table:<tableId>:<personaId>`；教练 `hero` / `coach:<tableId>`；复盘 thread `review:<handId>`。

instructions：
- 对手（函数，按 personaId 与 mode）：①“你在一张 PvE 娱乐德州扑克桌上扮演「{name}」。按人设决策，但别做明显送钱的离谱决定。”②角色提示词（`promptOverride ?? persona.prompt`）＋健谈度描述（talk < 0.2 “你话很少，大多数时候不说话”；< 0.5 “你偶尔说话”；否则“你爱说话”）③“发言不超过 20 字，中文口语；绝不透露或暗示自己的底牌：不得出现牌面点数（A、K、Q、J、数字）、花色或‘对子/口袋’等描述自己手牌的词。”④decide：“先用 view_table 了解局面、用 read_chat 看最近公屏，再调用 act。想说话就调用 say，必须声明 kind：自己起的话题用 free，回应别人用 reply 并带上 reply_to。需要更新对某人的印象或自己的心情时，与 act 在同一步调用 updateWorkingMemory。”⑤chat：“公屏有人说话，你可以回应也可以不说；想回应就调用 say。”⑥win：“你赢了这一手，可以说一句。”
- 教练：原型 `coachSystem()` 文案（设计稿第 521–524 行，人设与深度），加“你只知道玩家能看到的信息”；proactive：“现在轮到玩家决策。常规决策不打扰（不调用工具）；有值得提醒的点调用 hint；关键或高代价决策调用 pause_game。”教学牌局加“这是教学牌局：每一步都至少调用 hint，并解释现在该考虑什么。”；review：“赛后复盘，200 字内：做得好的一步、可以改进的一步、下次可用的原则。”

泄牌过滤 `leak.ts`（沿用原型第 589–590 行）：发言含本人底牌点数（数字按非数字边界，字母按非字母且前一字符不是“老”的边界匹配；T 视为 10）、任一 ♠♥♦♣、“口袋”“底牌是”“我有一对”“对子”时返回 null；超过 40 字截断。

模型解析 `resolve.ts`：

```ts
export const resolveModel = ({ requestContext }) => {
  const sel = settings.models[requestContext.get('role')]
  const p = providers.get(sel.providerId)
  const apiKey = p.apiKeyEnc ? decrypt(p.apiKeyEnc) : undefined   // decrypt 由 index.ts 注入 safeStorage.decryptString；测试注入替身
  return p.kind === 'openai-compatible'
    ? { providerId: p.id, modelId: sel.modelId, url: p.baseUrl, apiKey }
    : { id: `${p.kind}/${sel.modelId}`, apiKey }
}
// settings、providers 取自 T3 的同步缓存；settings.models 引用的提供方不存在时（例如删除后又被设回）视为未配置
export function modelReady(role): boolean  // 调用前检查：已配置、提供方存在、未 needsKey；解密失败时置 needsKey 并返回 false（不计熔断）（清除由 T5 的 `provider.save` 负责：带新 key 保存成功后调用 T4 导出的 `clearNeedsKey(providerId)`）
export async function testProvider(providerId, modelId): Promise<{ ok, supportsRequired, error? }>
  // 带单个工具、toolChoice:'required' 的最小调用；因 required 被拒则 auto 重试，成功记 supportsRequired=false
  // 开始时记下提供方的 kind/baseUrl；结束时若该提供方已被删除或 kind/baseUrl 已变，则不写回结果（避免旧端点结果写到新端点）
```

AgentQueue：

```ts
class AgentQueue {
  run<T>(task: { fn:(signal:AbortSignal)=>Promise<T>; preempt?:boolean; durable?:boolean }): Promise<T | Dropped>
}
```
- 同一时刻只运行一个任务。
- `preempt:true`：中止当前任务（durable 除外），等待其结束最多 2 秒，丢弃未开始的非 durable 任务（它们 resolve 为 `Dropped`），先执行排队中的 durable 任务，再执行本任务。
- 非抢占任务排队；非 durable 任务在队列长度 > 2 时被拒（`Dropped`）。
- 队列实例：每个 personaId 一个；教练一个；复盘一个。提供 `idle(): Promise<void>` 供重置记忆前等待。

对外调用函数（供 T5 使用）：

| 函数 | 返回 |
| --- | --- |
| `opponentDecide(ctx, signal)` | `{ ok:boolean; intents; aborted:boolean; error? }` |
| `opponentChat(ctx, mode:'chat'|'win', input, signal)` | 同上 |
| `coachProactive(ctx, signal)` | 同上 |
| `coachAsk(ctx, question, onDelta, signal)` | `{ ok, text, aborted, error? }` |
| `coachReview(handId, handRecord, signal)` | `{ ok, text?, error? }` |
| `appendThreadMessage(memory, threadId, resourceId, text)` | void（thread 不存在先 `createThread`，再 `saveMessages`） |
| `resetMemories()` | void：各 resource `listThreads({ filter:{ resourceId }, perPage:false })` → `deleteThread`；`updateWorkingMemory({ threadId:'reset', resourceId, workingMemory: 模板 })` |

每次 generate 结束（成功或失败）由本模块发出回调 `onCall({ role, modelId, ms, ok })`，T5 转为 `agent:last` 事件并记为 `lastCall`。

工程注意事项：超时由调用方计时器 abort；判断超时看计时器是否触发，不看异常。`getMemory()` 为异步。带 Memory 的 Agent 每次 generate（含被中止的）都必须传 `memory: { thread, resource }`，否则保存消息时报 “Thread ID is required”（T1 实测）。stopWhen 回调中 `steps[].toolCalls` 元素为 `{ toolCallId, toolName, args }`。

验证与完成标准（vitest，mock LanguageModel，临时 LibSQLStore）：
- decide：mock 依次调用 view_table、act → intents.act 存在，stopWhen 后不再调用模型；同步调用 say+act+updateWorkingMemory 时三者都执行，WM 写入 SQLite。
- 信息隔离（用 T2 真实引擎生成的各阶段状态，含摊牌、弃牌、全下）：`buildSeatView` 对每个座位的输出不含其他座位底牌；`view_hero` 只含座位 0 底牌；`publicHandResult` 在玩家弃牌、玩家未亮牌的手中不含玩家底牌，只含摊牌亮出的牌。
- 意图取舍：两个 act 取第一个；pause 优先于 hint。
- review 模式不暴露 updateWorkingMemory。
- 泄牌过滤：原型规则正反例（“我有 A”“老K说得对”“10 块钱”与底牌 T 的组合等）。
- AgentQueue：抢占等待被中止任务结束；超过 2 秒直接执行；未开始的非 durable 任务被丢弃；durable 保留并先执行；`idle()` 在清空后 resolve。
- resolveModel：内置提供方不传 url；兼容接口传 url；未配置时 `modelReady` 为 false。

结果：已完成（2026-09-24）。独立审阅 reviews/T4-1.md（需修改）→ T4-2.md（通过）。证据 evidence/T4/。
- 实际导出：`agents/mastra.ts`：`initMastra({ url, … })`、`closeMastra`、`rt()`（含 `opponentMemory`、`coachMemory`）、`callAgent`、`appendThreadMessage`、`resetMemories`、`MODE_TIMEOUT_MS`；`agents/opponent.ts`：`opponentDecide`、`opponentChat`；`agents/coach.ts`：`coachProactive`、`coachAsk`（流式，被中止时保留已输出文本）、`coachReview`；`agents/queue.ts`：`AgentQueue`、`Dropped`；`agents/views.ts`：`buildSeatView`、`publicHandResult`、`heroHandSummary`、`SeatView`、`TableQuery`；`agents/leak.ts`：`filterSay`；`models/resolve.ts`：`resolveModel`、`modelReady`、`needsKey`、`clearNeedsKey`、`supportsRequired`、`testProvider`。T5 以代码为准。
- 信息隔离：对手与教练 agent 各自只注册本角色工具（`opponentTools`、`coachTools`），专属工具内再校验 `role`；不依赖 Mastra 的 activeTools 过滤。
- 泄牌过滤先截断到 40 字再检查最终文本（与原型一致）。
- 共享类型修改：`HandLogEntry.board` 由 `Card[]` 改为 `boolean`（与原型、引擎一致）；T5 构造 `HandRecord.log` 时写 `board: !!x.board`。
- 偏差（已审阅接受）：教学牌局提示放在 proactive 输入而非 instructions（`CoachCtx.guided` 由 T5 传入）；队列“超过 2 个被拒”只计未开始任务；被越过的旧任务返回 `Dropped`，`idle()` 仍等待它结束；对手提示词修改在下一次调用即生效（满足“下一手生效”的上限承诺）；`testProvider` 每次尝试最多 20 秒、两次共约 40 秒（T6 显示进行中状态）；`initMastra` 的 `model` 参数仅供测试。
- 队列语义：当前任务为 durable 时，抢占不越过、等待其结束（task 正文“最多 2 秒”对 durable 当前任务不适用）；durable 任务必须是有界的本地写入，其等待计入调用方时限。T5 等待 `queue.run` 结果时与自身时限计时器赛跑，防止异常的 durable 任务卡住牌局。
- fn 开始前已被抢占时拿到的 `signal` 已是 aborted，不会再收到 abort 事件；自己监听 abort 的 fn 先检查 `signal.aborted`。
- `mastra.ts` 与 `opponent.ts`、`coach.ts` 存在循环 import，这些模块顶层不得使用对方导出的值。


## 任务 T5：TableRunner、公屏与 IPC

目标与范围：主进程完整牌局运行、公屏回应、教练调度、落库、IPC 命令与事件、preload API。完成后可在 vitest 中用假 agent 跑完整牌局，并能由 Renderer 驱动。

前置依赖：T2、T3、T4。

修改位置：`src/main/table/{runner,view,chat}.ts`、`src/main/ipc.ts`、`src/main/index.ts`、`src/preload/index.ts`、`src/shared/types.ts`（TableView、IPC 类型）、`test/runner.test.ts`、`test/chat.test.ts`。

输入输出：

TableRunner 状态：`tableId`（UUID）、`game`、`runId`、`paused`、`pendingAI {seat,hand,logLen,action,say,autopilot}`、`heroKey`（`${hand}-${log.length}`）、`thinking`、`autopilotCount`、`breaker {opponent:n, coach:n, trippedOpponent, trippedCoach}`、`guided`、`chat`（≤300 条）、`bubbles`（personaId → {text, until: now+5000}）、`askInFlight`、`winSpeechInFlight`、`askId`、`coachThread`、`leaveController`、`limits {decide,chat,win,proactive,ask,review}`（开发环境可由 `RIVER_LIMIT_DECIDE_MS` 覆盖 decide）、`lastCall`、`nums`（本地概率）。

主循环（伪代码）：

```ts
async loop() {
  const g = this.game, rid = this.runId
  this.broadcast()
  if (g.done) return this.onHandEnd()
  if (g.runout) return this.after(900, rid, () => { runoutStep(g); this.afterAction() })
  const seat = g.toAct, p = g.players[seat], persona = PERSONA[p.personaId]
  if (p.isHero) return this.onHeroTurn()
  if (this.paused) return
  this.thinking = p.personaId; this.broadcast()
  await sleep([1500, 900, 400][settings.speed]); if (rid !== this.runId) return
  const hand = g.hand, logLen = g.log.length
  const useLLM = this.useLLMForOpponents()          // 只求值一次；时限值 this.limits.decide（默认 10_000，测试可注入）
  let action: Action, say: Say | null, autopilot = false
  if (useLLM) {
    const timer = deadline(this.limits.decide)       // AbortController + setTimeout，在 queue.run 之前启动（2 秒抢占等待计入时限；可被 vitest 假定时器控制）
    const res = await this.queues[p.personaId].run({ preempt: true,
      fn: s => opponentDecide(ctx, AbortSignal.any([s, timer, this.leaveSignal])) })
    if (rid !== this.runId || g.hand !== hand || g.log.length !== logLen) return
    if (res.ok && res.intents.act) { this.breaker.opponent = 0; action = res.intents.act; say = res.intents.say ? { ...res.intents.say, source: 'llm' } : null }
    else { autopilot = true; if (!this.leaveSignal.aborted) this.countFailure('opponent') }
  }
  if (!useLLM || autopilot) { action = decide(g, seat, persona.profile); say = canned(persona, action.type) }
  if (this.paused) { this.pendingAI = { seat, hand, logLen, action, say, autopilot }; return }
  this.commitOpponent(seat, action, say, autopilot)
}
```

- `Say` 统一结构 `{ text, kind: 'free'|'reply', replyTo?, source: 'llm'|'canned' }`；预设台词为 `{ text, kind:'reply', source:'canned' }`（预设台词不触发回应）。
- `useLLMForOpponents()`：`settings.engine === 'llm' && modelReady('opponent') && !breaker.trippedOpponent`。
- `canned(persona, type)`：按原型规则随机取（概率由健谈度映射：talk<0.2→0.08，<0.5→0.22，否则 0.45；池为 `persona.lines[type] ?? LINES[type]`），本地引擎模式与托管都用它，可能不说话。
- 托管：`autopilot=true`、`autopilotCount++`，log 与公屏 act 标 `autopilot`，座位状态“托管 · {行动}”。
- `countFailure(role)`：+1；达 3 置 `tripped{Role}` 并发 `breaker` 事件；离桌或被主动中止的调用不计。
- `commitOpponent`：`apply` → 若 `say` 存在，**先经 `leak.ts` 过滤（泄牌整句丢弃、超 40 字截断）** → 公屏一条 `{kind: say?'msg':'act', from, text, act, autopilot, replyTo(存在于本桌公屏才保留), triggers: say.source==='llm' && say.kind==='free'}` → 气泡 → triggers 时 `triggerReplies(msg)` → `afterAction()`（街道变化插入系统消息“翻牌 A♠ 7♦ 2♣”，与原型一致）。
- 所有写入公屏的对手发言（decide、chat、win）都必须经过 `leak.ts`。
- `resume()`：`paused=false`；有 `pendingAI` 且 `game.hand === pendingAI.hand && game.log.length === pendingAI.logLen && game.toAct === pendingAI.seat && !game.done` 时提交，否则 `loop()`。
- `heroAct(type, to)`：非玩家回合、`runout`、`done`、`paused` 时忽略；`toCall===0` 时 fold 与 call 转为 check；raise 需 `canRaise`，`to` 夹在 `[minTo,maxTo]`。

新桌入座与 `nextHand()` 时清空 `heroKey`（与原型第 420 行一致），并为每次入座新建 `leaveController`（`leaveSignal = leaveController.signal`，离桌时 abort）。

onHeroTurn：`key = ${hand}-${log.length}`；若 `key === this.heroKey` 直接返回（与原型第 508–510 行一致：resume 后对同一决策点不再重复计算与触发教练）；否则记录 `heroKey`，计算默认加注额（原型第 511–514 行）与 `nums`（`equityFor(0,400)`，原型 `computeNums`），然后若 `coachOn && modelReady('coach') && !trippedCoach && !askInFlight`：`coachQueue.run({ preempt:true, fn: coachProactive })`（12s 计时器同样在 run 前启动），返回时 `heroKey` 未变才应用：`pause` → `paused=true` + `coach:alert {level:'pause'}`；否则 `hint` → `coach:alert {level:'hint'}`。成功清零 `breaker.coach`；超时/抛错计 `countFailure('coach')`；被 ask 抢占或离桌中止不计。

教练规则：
- `coach.ask(text)`：先检查教练模型已配置且未熔断，否则不暂停牌局，直接返回 `requestId` 并随后推 `coach:done {requestId, ok:false, error:'not_configured'|'breaker'}`（事件在命令返回后的下一个事件循环发送，Renderer 以 `requestId` 关联；Renderer 在命令返回前收到的同 id 事件先缓存）。检查通过后生成 `requestId`；`this.askId = requestId`；牌局未结束时 `paused=true`；`askInFlight=true`；`coachQueue.run({ preempt:true })`（30s）；流式 `coach:delta`；结束时推 `coach:done {requestId, ok, error?}`：被下一次提问抢占为 `error:'interrupted'`（不计失败），成功清零 `breaker.coach`；超时/抛错计 `countFailure('coach')` 并 `error:'failed'`；只有 `this.askId === requestId` 时才置 `askInFlight=false` 并检查自动下一手。
- 教练熔断后：proactive 与 ask 都不发起（ask 按上条返回 `error:'breaker'`）。
- `coachThread`：TableRunner 状态中保存本桌 `{role, text, requestId, interrupted?}[]`（提问与回答），供 bootstrap 返回。
- `coach:alert`：下一手开始时清空（教学牌局第 1 手保留开场提醒，与原型第 422 行一致）。
- 复盘 `hands.review(id)`：复盘队列 `run({})`（45s）；同一 handId 进行中重复请求忽略；成功 `saveReview` 并推 `review:done {handId, text}`；失败、中止或被队列拒绝（`Dropped`）都推 `review:done {handId, error}`。复盘不计入熔断。

onHandEnd（同一手只执行一次）：
1. 系统消息“{name} 赢得 x · 牌型”。
2. 构造 `HandRecord`（原型 `rec` + `players[].personaId`、`players[].net`、`log[].autopilot`），`insertHand`，推送给 Renderer（`hands:changed`）。
3. 对每个在座对手：`queues[pid].run({ durable:true, fn: () => appendThreadMessage(...) })`，文本如“第 12 手结束：摊牌，你亮出 A♠ K♦，玩家亮出 Q♥ Q♣ 赢得 2,400；你本手 −1,200”（未亮牌不写他人底牌）。
4. 赢家发言：非玩家赢家中赢得最多的一位；LLM 可用且未熔断 → `queues[pid].run({ fn: opponentChat(mode:'win', '你赢了这一手') })`（`limits.win` 默认 8s，不受冷却），未过期且成功有 say → 公屏 `triggers:true` 并 `triggerReplies`；未过期但调用失败 → 取预设 win 台词（`triggers:false`）；LLM 不可用或熔断 → 直接取预设 win 台词。
5. 自动下一手：`autoNext && hero.stack>0` 时 4.5s 后，若 `runId` 未变、`!paused`、`!askInFlight`、`!winSpeechInFlight` 则 `nextHand()`；ask 或赢家发言结束时若条件满足且 4.5s 已过则立即发下一手，未过则等满 4.5s。

赢家发言期间置 `winSpeechInFlight = hand`（记录手号，仿 `askId`），自动下一手等待其结束；无论成功、失败、过期或被队列拒绝，都在 `finally` 中仅当 `winSpeechInFlight === 本手号` 时清为 null；`nextHand()` 与离桌时重置为 null。返回时先做过期检查：若 `runId` 或手号已变（只会因玩家手动发下一手或离桌发生）则整体丢弃，不写公屏也不补台词（与 plan 一致）；未过期时，赢家选择不说话（未调用 say）就不说话，不补预设台词；只有调用失败、熔断或被丢弃时才用 `canned(persona,'win')`。

triggerReplies(msg)：对除发言者外在座、未弃桌（`!out`）、非 `thinking`、10 秒内未被触发过的对手，按 `persona.talk` 抽样；抽中者 `queues[pid].run({ fn: opponentChat(mode:'chat', …) })`（8s，非抢占）；结果 say 经 `leak.ts` 过滤后写公屏 `triggers:false`、`kind` 忽略。LLM 不可用或熔断时不触发。

命令（preload `window.river.*` → `ipcMain.handle`）：

| 命令 | 参数 | 返回 |
| --- | --- | --- |
| `app.bootstrap` | — | `{ settings, lobby, bankroll, onboarded, personas(含 promptOverride), providers(脱敏), hasTable, lastCall, coachThread, chat }` |
| `settings.update` | `Partial<Settings>` | Settings |
| `lobby.update` | `Partial<Lobby>` | Lobby |
| `persona.setPrompt` | `personaId, prompt` | void |
| `persona.resetPrompt` | `personaId` | void |
| `provider.save` | `{ id?, name, kind, baseUrl?, apiKey? }` | 脱敏 Provider |
| `provider.delete` | `id` | void |
| `provider.test` | `{ providerId, modelId }` | `{ ok, supportsRequired, error? }` |
| `provider.registry` | — | `{ kind, name, models[] }[]`（PROVIDER_REGISTRY + openai-compatible） |
| `table.start` | `{ size, blinds, picks, guided }` | void |
| `table.heroAct` | `{ type:'fold'|'call'|'raise', to? }` | void |
| `table.nextHand` `table.rebuy` `table.leave` `table.resume` `table.retryModels` | — | void |
| `chat.send` | `text` | void |
| `coach.ask` | `text` | `requestId` |
| `hands.list` | — | `HandSummary[]` |
| `hands.get` | `id` | `{ record, review? }` |
| `hands.review` | `id` | void |
| `data.clearHistory` | — | void |
| `data.resetMemory` | — | void（仅无桌时；先 `idle()` 所有队列） |
| `onboarding.done` | — | void |

事件（`window.river.on(event, cb)`）：`table:view`（TableView）、`chat:append`（ChatMessage）、`coach:alert`（`{level,message}|null`）、`coach:delta {requestId,text}`、`coach:done {requestId,ok,error?}`（`error:'interrupted'` 表示被新提问中断）、`review:done {handId,text?,error?}`、`breaker {opponent,coach}`、`bankroll`、`hands:changed`、`agent:last {role,modelId,ms,ok}`。

`table.start`：已有牌桌时先按离桌处理（退回原桌玩家筹码，同原型 `back`），再扣买入（`bb*100`），补位规则同原型（picks 不足时按 PERSONAS 顺序补齐），`tableId` 新 UUID；教学牌局：3 人、10/20、picks `['bai','zen']`、强制 `coachOn=true`、`level='novice'`，首个提醒为原型文案。`table.leave`：`runId++`、abort 所有进行中调用（不计失败）、余额加回玩家筹码。`table.rebuy`：玩家筹码置 `bb*100`，余额扣除。对手筹码为 0 时下一手前自动重新买入（系统消息，与原型一致）。`chat.send`：公屏 `{kind:'msg',from:'hero',triggers:true}` 后 `triggerReplies`。`coach.ask`：规则见上文“教练规则”。窗口加载：仅 `!app.isPackaged` 时使用 `ELECTRON_RENDERER_URL`，打包产物只加载本地文件。退出：`before-quit` 中若有桌则 `event.preventDefault()`，`await leave()`（余额写库完成）后再 `app.quit()`。`lastCall` 取自 T4 的 `onCall` 回调。

`TableView`：`title`、`handNo`、`street`、`board`、`pot`（不含本轮下注）、`seats[]`（`name, personaId?, tag, ini, hue, stack, bet, isDealer, folded, out, allin, status, statusTone('muted'|'blue'|'green'), autopilot, thinking, winner, cards?, hasCards, bubble?`；座位状态文案按原型第 697–704 行，托管时状态显示“托管 · {行动}”）、`hero {legal, toCall, isTurn, defaultRaiseTo, presets:[{label, to}]}`、`paused`、`done`、`result {text, sub, heroWon, net}`、`heroBust`、`nums {eq, need, outs, handName, sugg, stale}`、`coachLoading`、`autopilotCount`、`breaker`、`guided`。

验证与完成标准（vitest，假 agent 函数替换 T4 导出）：
- 6 人桌全 AI 决策跑 20 手无异常，筹码守恒（余额+桌上总额不变，除买入）。
- 假 agent 延迟 11 秒 → 托管并标记、公屏 act 带 autopilot；连续 3 次 → breaker 事件、后续不再调用；`retryModels` 恢复。
- 过期结果丢弃：决策期间离桌，返回后不 apply。
- 暂停挂起：决策返回时 `paused`，`resume` 后提交。
- 教练晚到：proactive 返回前玩家已行动 → 丢弃 pause。
- ask 进行中不发起 proactive；自动下一手等 ask 结束。
- 公屏触发表逐行：hero 触发；decide free 触发、reply 不触发；chat 不触发；win 触发；托管预设台词不触发；10 秒冷却生效。
- 每手结果消息 durable：下一手决策抢占时仍写入 thread。
- TableView 不含未摊牌对手底牌（遍历所有状态断言）。
- 泄牌：假 agent 在 decide/chat/win 中 say 含本人底牌点数 → 公屏不出现该句。
- 教练：proactive 返回 pause → resume 后同一决策点不再调用教练；教练连续 3 次失败 → breaker；连续两次 ask，第一次 `interrupted`、`askInFlight` 在第二次结束才清除；复盘失败与被拒都收到 `review:done` 带 error。
- 中途退出：模拟 before-quit，余额加回玩家筹码后才退出。
- 赢家发言回归：假 agent 赢家发言延迟 6 秒、开启自动下一手 → 发言写入公屏，下一手在发言返回后才开始；发言被队列拒绝时自动下一手仍在 4.5 秒后触发。

结果：已完成（2026-09-24）。独立审阅 reviews/T5-1.md（需修改：补测试）→ T5-2.md（通过）。证据 evidence/T5/（含真实主进程冒烟与退出落库验证）。
- 偏差（已审阅接受）：熔断后的本地决策也标“托管”并计数（落实 plan“本桌剩余时间全部托管”；用户选本地引擎或未配置模型时不标）；教练提醒应用时除 heroKey 不变外还要求当前仍是该玩家决策点；同一决策点只允许一次对手决策在途（避免恢复牌局时重复发起并误托管）；无需跟注时 fold/call 按原型转 check；加注金额为必填（`HeroAction` 联合类型，简化轮后不再有无金额回退）；无桌时 `coach.ask` 返回 `error:'failed'`；复盘未配置或手牌不存在返回 `not_configured`/`not_found`；本地引擎模式也把每手结果写入对手记忆。
- 契约补充：`TableView.runout`；离桌推送 `table:view` 为 null；`hands.get` 查不到返回 null；`app.bootstrap` 返回后主进程补发当前 `table:view`、`coach:alert`、`breaker`。
- 给 Renderer（T6/T7/T8）的约定：先用 `window.river.on` 注册监听，再调用 `app.bootstrap`；公屏快照与之后的 `chat:append` 可能重叠，按消息 id 去重；`table.start` 之后事件只追加，入座前自行清空本地公屏与教练对话；教学牌局会改写 settings（`coachOn`、`level`）但不推送，入座后重新读取设置；`coach.ask` 返回 requestId，同 id 事件可能先于返回到达，需缓存。
- 技术债：`Legal` 在 `src/shared/types.ts` 与引擎各有一份相同定义（修改引擎文件被权限拦下）；待用户允许后改为引擎引用共享类型。
- 待 T9 观察：退出时不等最后一手落库与对手记忆写入（通常毫秒级）；如 T9 发现最后一手丢失，在离桌后加有上限的等待。


## 任务 T6：应用骨架与非牌桌页面

目标与范围：Renderer 主题、shadcn 组件、顶栏导航、大厅、AI 对手、设置（含模型提供方）、规则引导（6 页）。

前置依赖：T5（IPC 与 bootstrap）。可先对着 `src/shared/types.ts` 用假数据开发，T5 完成后接通。

修改位置：`src/renderer/{main.tsx,App.tsx,index.css}`、`src/renderer/components/ui/*`（shadcn 生成）、`src/renderer/lib/river.ts`（IPC 封装与 React hooks：`useBootstrap`、`useEvent`）、`src/renderer/pages/{Lobby,Opponents,Settings}.tsx`、`src/renderer/components/{TopBar,Onboarding,ProviderDialog,Avatar}.tsx`。

实施要点：
- shadcn 初始化（Tailwind v4），安装：button、toggle-group、switch、slider、textarea、input、dialog、alert-dialog、card、badge、scroll-area、tooltip、sonner、select、label。
- 主题变量（`index.css`）：背景 #fbfbfa、前景 #1d1d1f、边框 #ebebe9、弱文字 #86868b、强调蓝 `oklch(0.6 0.17 255)`、赢绿 `oklch(0.55 0.14 155)`、输红 `oklch(0.56 0.2 25)`、主按钮黑底白字、圆角 10–16px；字体栈同原型。只做浅色。
- 顶栏：52px，macOS `titleBarStyle:'hiddenInset'`（主进程设置，留出红绿灯区域，拖拽区域 `-webkit-app-region: drag`）；“River”+ 导航（大厅、牌桌（有桌时）、AI 对手、手牌回放、数据统计、设置）；牌桌页右侧显示桌名（窗口 ≥1200px）、“第 N 手”、离桌；其他页显示“筹码 {余额}”。
- 大厅：按设计稿第 155–186 行布局与文案：三个预设桌（新手桌/常规桌/单挑，配置同原型第 800–804 行，选中描边）；人数 2–6、盲注三档（Toggle Group）；“买入 x（100 个大盲）”；对手胶囊多选（超出人数时保留最近选的）；“已选 n / m 位，其余随机补位”；教练开关与“{人设} · {深度}”；“入座 · 买入 x”。右栏：回到牌桌卡片（有桌时）、“第一次玩德扑？”（规则介绍、教学牌局）、最近 5 手。
- 教学牌局入口：教练模型未配置时弹 AlertDialog：“去配置”（跳设置页）/“仍然开始（无教练讲解）”。
- AI 对手：设计稿第 188–204 行：卡片网格 minmax(320px)，倾向条四项（紧度、攻击性、诈唬、健谈度），提示词 Textarea（失焦调用 `persona.setPrompt`），“加入下一桌 / ✓ 已加入下一桌”（规则同原型第 832 行），有修改时“恢复默认”。
- 设置：分组与文案：
  - 模型提供方：列表（名称、kind、keyTail、needsKey 警示、测试状态），“添加提供方”Dialog：类型 Select（`provider.registry`）、名称、API key（密码框）、base URL（仅 openai-compatible 显示且必填）；删除需确认。
  - AI 对手：决策引擎（LLM / 本地引擎；未配置对手模型时 LLM 禁用并提示）、对手模型（提供方 Select + 模型 ID 输入，datalist 提示注册表模型，“测试连接”显示 ok/supportsRequired/错误）、思考速度（慢/中/快）。
  - 教练：教练模型（同上）、主动提醒、人设、讲解深度、硬核模式。
  - 牌局与数据：自动下一手、最近调用（`agent:last`：角色、模型、耗时、成功）与本桌托管次数、规则介绍（打开）、清空记录（二次确认）、重置 AI 记忆（二次确认；有桌时禁用并提示先离桌）。
- 规则引导 Dialog：原型 5 页文案（设计稿第 894–911 行，牌型表与流程胶囊）+ 第 6 页“配置模型”（简述对手与教练需要模型；按钮“去配置”“稍后再说”）；首启自动弹出，完成后 `onboarding.done`；末页“带我打一手”走教学牌局入口。

验证与完成标准：`pnpm dev` 下逐页与设计稿截图目测对照（大厅、AI 对手、设置、引导 6 页）；添加一个 openai-compatible 提供方后重启应用仍在且 key 只显示末 4 位；删除被引用提供方后对应模型选择清空；窗口宽 880px 无横向滚动。

结果：已完成（2026-09-24）。独立审阅 reviews/T6-1.md（通过，3 处小修）→ T6-2.md（通过）。证据 evidence/T6/（6 页截图、880/1280 宽）。
- 实际目录为 `src/renderer/src/`；`lib/river.ts` 提供全局 store（`useRiver`、`useBootstrap`、`useEvent`）与动作函数，遵守 T5 给 Renderer 的约定；`lib/format.ts` 提供格式化与着色；T7/T8 覆盖 `pages/{Table,Replays,Stats}.tsx`。
- 偏差（已审阅接受）：根 `tsconfig.json` 加 `paths` 供 shadcn CLI；引导第 6 页按钮为“稍后再说 / 去配置 / 带我打一手”并显示模型配置状态，替代原末页“直接开始”；AI 对手页说明改为四项倾向的文案；“4 秒后自动发牌”沿用原型文案（实际 4.5 秒）；编辑提供方时锁定类型；renderer 产物未压缩；shadcn 在 devDependencies。
- 待 T9：原生红绿灯位置在打包产物中目测确认；River-dev 开发数据可在 T9 前清理。
- 已知小问题（不修）：`coach.ask` 本身抛错时 early 缓存要等下一次成功提问才清空。


## 任务 T7：牌桌页

目标与范围：牌桌页全部交互：公屏、椭圆桌与座位、操作区、结果区、暂停遮罩、教练栏、熔断横幅、快捷键。

前置依赖：T5、T6（主题与组件）。

修改位置：`src/renderer/pages/Table.tsx`、`src/renderer/components/{PlayingCard,CardBack,Seat,BetChip,ChatPanel,ActionBar,ResultBar,CoachPanel,ProbPanel,BreakerBanner}.tsx`、`src/renderer/lib/hotkeys.ts`。

实施要点（布局与文案按设计稿第 41–153 行）：
- 布局：左公屏（宽 288px，窗口 <1100px 时 248px；窗口 <1280px 默认收起，收起状态由 Renderer 本地保存）｜中间 main（min-height 540px）｜右教练栏（344px，<1100px 时 296px）。
- 牌桌：椭圆底（left/right 14%、top 16%、bottom 17%）；座位按 `ang = 90° + i·360°/n`，位置 `(50+40cos, 50+37sin)%`；下注筹码 `(50+24cos, 50+21sin)%`；底池胶囊与 5 张公共牌（空位虚线框）。座位：头像（hue 取色）、名称、标签、筹码、庄家 D、牌背/亮牌（玩家 52×72 倾斜 ±4°，其他 44×62）、气泡（最长 200px，5 秒）、状态胶囊（思考中蓝、赢绿、其他灰；托管状态额外显示“托管”小标签）；弃牌/旁观 45% 透明度；轮到或思考时蓝色描边光晕，赢家绿色。
- 公屏：系统消息居中“— x —”；只有行动的消息缩进灰字；发言消息头像+名字+行动标签+正文；托管行动带“托管”标签；输入框 Enter 发送（IME 组合中不发送）；收起后左上角悬浮胶囊显示最近一条发言。
- 操作区：预设 ⅓ 池、½ 池、¾ 池、满池、全下（选中高亮，计算同原型第 724–728 行，由 `hero.presets` 提供）；弃牌 F、跟注/过牌/全下 C（文案规则原型第 732 行）、加注额 −/+（步长 bb，夹在 minTo/maxTo）、加注/下注/全下 R；非玩家回合或暂停时 40% 透明且不可点；右侧状态文字（原型第 737 行）。
- 结果区：结果标题与副标题（“本手 ±x · 4 秒后自动发下一手 / 准备好了就发下一手”），下一手 N（或空格），破产时“重新买入 x”。
- 暂停遮罩：“教练暂停了牌局，先看看右侧的提醒 / 我看完了，继续”。
- 熔断横幅：牌桌顶部“对手模型连续失败，已托管 · 重试”/“教练模型连续失败，已停用 · 重试”。
- 教练栏：头像“师”、“教练 · {人设} ▾”（点击循环切换）、副标题（主动提醒开启/关闭文案）、开关；讲解深度分段；暂停条；提醒卡（hint 蓝底“教练提醒”，pause 黄底“教练暂停了牌局”）；概率面板（胜率/所需胜率、+EV/−EV 判断、进度条与所需标记、当前牌型/出路/规则建议、“本地计算 · 胜率按对手随机手牌估算[ · 数据来自你上一次决策]”）；硬核模式隐藏概率并显示提示；对话气泡（玩家右黑、教练左灰，流式追加，“已中断”标记）；“教练正在看牌…”；空状态文案；快捷问题（新手/进阶两组，原型第 795 行）；输入框 +“暂停并提问”；硬核模式开关。教练模型未配置时教练栏显示“配置模型后可用”与跳转按钮，概率面板照常。
- 快捷键：焦点不在输入框时 F/C/R；牌局结束时 N 或空格下一手。

验证与完成标准：`pnpm dev` 用真实或本地引擎打 5 手：座位布局 2–6 人正确；快捷键生效；暂停遮罩与恢复；托管标记在座位与公屏显示（开发环境下以环境变量 `RIVER_LIMIT_DECIDE_MS=1` 启动，T5 在 `!app.isPackaged` 时读取它覆盖 `limits.decide`）；公屏收起/展开；教练提问流式显示；与设计稿截图目测对照。

结果：已完成（2026-09-24）。独立审阅 reviews/T7-1.md（通过，F1/O1/O4 小改）→ T7-2.md（通过）。证据 evidence/T7/（2–6 人座位、880/1440 宽、托管与熔断、暂停遮罩、快捷键）。
- 契约补充：`TableView.bb`（加注步进与重新买入金额使用）。
- 复用：`PlayingCard`（牌桌与回放共用，`w`/`h` 控制尺寸）、`Segmented`（新增 `full`）；`BreakerBanner`、`ResultBar`、`ProbPanel` 合并在所属文件中，未单独成文件。
- 偏差（已接受）：熔断横幅为牌桌顶部通栏；座位只在状态文字显示“托管 · {行动}”；未做公屏头部健谈度分段（用户已删除该设置）；暂停遮罩只在玩家回合出现；加注 −/+ 按最新值计算。
- 已知小问题（不处理）：熔断状态有 `TableView.breaker` 与 `breaker` 事件两个来源，前端只用事件；刷新页面后失败的教练回答不显示；880px 展开公屏时座位被裁（窄窗口默认收起公屏）。
- 待 T9：教练流式回答与“已中断”、破产后重新买入需真实模型或实际场景验证。


## 任务 T8：手牌回放与数据统计

目标与范围：回放页（含教练复盘）与统计页。

前置依赖：T5、T6。

修改位置：`src/renderer/pages/{Replays,Stats}.tsx`。

实施要点（设计稿第 206–250 行）：
- 回放：左 300px 列表（`hands.list`，倒序，“#手号 底牌 ±盈亏”着色，默认选最新）；右详情（`hands.get`）：标题“第 N 手”、盈亏、“盲注 · 底池 · 摊牌”；公共牌；玩家行（头像、名字、底牌或“已弃牌/未亮牌”、赢得/牌型）；按街道分组的行动胶囊（托管项加“托管”标记）；教练复盘卡：有复盘显示文本，否则按钮“让教练复盘这一手”（教练模型未配置时禁用并提示），加载中“教练正在回看这一手…”，`review:done` 带 error 时显示“复盘失败，稍后再试”并可重试。`hands:changed` 时刷新列表。
- 统计：KPI 6 项（全部手牌）：已打手数（副文案改为“全部手牌”）、净盈亏（着色）、赢下的手牌比例、VPIP、PFR、摊牌胜率（“共摊牌 n 次”）；每手盈亏柱状图取最近 40 手（算法同原型第 865–866 行）。空数据显示“—”。

验证与完成标准：打 3 手后回放列表与详情正确；复盘成功保存、重开应用仍在；KPI 与手工计算一致。

结果：已完成（2026-09-24）。独立审阅 reviews/T8-1.md（通过，F1 小修）→ T8-2.md（通过，探针验证乱序与失败分支）。证据 evidence/T8/。
- 偏差（已接受）：统计副标题为“基于全部 N 手记录”；空数据净盈亏显示“—”；复盘加载/失败状态只在页面内；回放列表在手号下显示日期时间，区分不同牌桌的同号手牌（主代理按用户“设计稿只是参考”的授权补充）。
- 技术债（玩具项目不处理）：统计页逐手调用 `hands.get`（1,000 手约半秒量级）；卸载后失败仍可能弹一次提示；详情读取失败无重试入口。
- 待 T9：复盘成功保存与重开仍在、托管标记实际显示，需真实模型。


## 整体验证与交接（T9）

目标：对照 plan 的验收完成组合验证并交付安装包。

前置依赖：T1–T8。

步骤与标准：
1. `pnpm test` 全部通过；`pnpm typecheck` 无错误。
以下第 2–4 步均在**安装后的打包产物**中进行（数据目录 `~/Library/Application Support/River/`）；开发环境可先预演，但不作为验收证据。

2. 真实联调（用户提供 key 或本机已有的提供方；无 key 时先请用户配置，此步需要用户参与）：6 人常规桌至少 10 手：对手按人设行动与发言；玩家公屏发言引起回应，回应不再引出回应；赢家发言；教练静默/提醒/暂停/提问/复盘；检查 `river.db` 中 `mastra_resources` 的对手与教练 working memory 已写入。
3. 断网（或填错 key）：对手托管且标记；第 3 次失败后横幅出现；恢复网络点“重试”恢复。
4. 退出重开：余额、手牌、统计、复盘、角色印象、教练档案仍在；中途退出时玩家筹码按离桌退回。
5. 在第 2 步之前：删除 `~/Applications/River-spike/`；经用户确认后把 `~/Library/Application Support/River` 整个移到备份目录（如 `~/Library/Application Support/River.bak-<日期>`）；保留钥匙串条目 “River Safe Storage”（正式版与 spike 共用，删除会使已存 key 无法解密）。然后 `pnpm build && pnpm dist` 生成 `River-<version>-arm64.dmg`，从 dmg 拖入 `/Applications`（保留下载隔离属性），首次启动走 Gatekeeper 放行路径（系统设置“隐私与安全性”中允许），记录步骤截图。
6. 验收通过后：只移除 `src/main/spike.ts` 及其入口并重新打包、覆盖安装、启动确认正常；不再改动数据目录与钥匙串。
7. 在 `.rivo/issues/river-desktop/` 记录验证证据（命令输出、截图路径），交用户验收。

发布：本地 dmg，不签名、不自动更新；回退为安装旧版本（业务表迁移只做加法）。
