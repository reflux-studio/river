# River 桌面版：技术方案

状态：第 4 轮独立审阅通过（reviews/plan-4.md），已并入该报告的低优先级补充（依据用户批准的讨论结论 `discussion.md` 第 3 轮，及 2026-09-24 用户对发言类型与赢家发言的补充决定）

## 需求与本期范围

River 是一个单人对 AI 的德州扑克教学桌面应用。设计原型（claude.ai/design 项目 `2a5400ca-ac09-4130-865d-820403b275ac` 的 `River.dc.html` + `poker.js`）已经验证了玩法与界面：每位 AI 对手有自己的性格和说话方式，教练站在玩家身后给出提醒、暂停和讲解。原型把所有 LLM 能力放在前端直接调用，用正则解析 JSON；本期把它做成可发布的桌面应用，并把对手与教练做成真正的智能体。

本期功能：

- 设计稿全部页面：大厅、牌桌、AI 对手、手牌回放、数据统计、设置、规则引导与教学牌局。
- 保留交互细节：快捷键 F/C/R/N/空格、下注预设（⅓、½、¾、满池、全下）、加注步进、硬核模式、自动下一手（4.5 秒）、收起公屏、重新买入、离桌。
- 对手与教练是独立的 Mastra Agent：各自的 agent loop、工具调用和持久记忆。
- 模型提供方由用户配置，对手与教练各选一个模型。
- 数据存本地 SQLite。

关键规则（用户决定）：

| 规则 | 内容 |
| --- | --- |
| 形态 | Electron 桌面应用，首发 macOS arm64 |
| 超时 | 对手超时或出错时回退本地引擎，座位与公屏明确标“托管” |
| 公屏 | 全局共享记录，玩家、对手、教练都能读；玩家可随时发言，不要求回复；对手可随时回应 |
| 回应层级 | 只有玩家发言和对手的主动发言会引起回应；回应不再引起回应 |
| 发言类型 | 对手发言时通过工具参数自己声明是“自由发言”还是“接话” |
| 赢家发言 | 算一次主动发言，会引起回应 |
| 话痨 | 不设全局话痨程度，靠人设（落实为角色“健谈度”） |
| 台词 | 赢牌由 agent 发言；托管出牌用预设台词 |
| Workflow | 本期不用（ADR-002） |

相对设计稿的变化：

| 设计稿 | 本期 |
| --- | --- |
| 设置“模型：Haiku/Sonnet” | 设置“模型提供方”“对手模型”“教练模型” |
| 设置“LLM 用量 x/15” | 删除；显示最近一次调用的模型、耗时和本桌托管次数 |
| 全局“话痨程度”（设置页、公屏标题栏） | 删除；角色新增“健谈度”，AI 对手页显示 |
| 公屏回复由一次调用扮演多角色 | 删除；各对手 agent 自己决定是否回应 |
| 赢牌台词取预设 | 赢家 agent 发言；失败时取预设 |
| localStorage 保留最近 60 手 | SQLite 保留全部；统计 KPI 用全部，柱状图取最近 40 手 |
| 无托管标记 | 托管出牌在座位状态与公屏行动旁标“托管” |
| 规则引导 5 页 | 第 6 页“配置模型”（可跳过） |

明确不做：多人联机、账户与云同步、自动更新、代码签名与公证、深色模式、Windows/Linux 安装包。

验收：在 macOS arm64 打包产物中，配置一个真实提供方，完成一张 6 人桌至少 10 手；对手按人设行动与说话，教练能静默、提醒、暂停、回答与复盘；断网时对手托管并在 3 次失败后熔断；关闭重开应用后手牌、统计、角色印象与教练档案仍在。

## 现状与总体方案

现状是一个设计原型：单文件 React 组件在浏览器中运行，`poker.js` 约 150 行纯函数实现规则、胜率估算和本地决策，LLM 通过 `window.claude.complete` 调用，持久化用 localStorage。原型已解决的规则问题（边池、单挑盲注、全下后自动发完、非法动作纠正、泄牌过滤、过期异步结果丢弃）直接沿用。

总体方案把应用拆成两个进程：

```
┌──────── Renderer（React + Tailwind v4 + shadcn/ui）──────┐
│ 页面：大厅/牌桌/AI 对手/回放/统计/设置/引导               │
│ 只持有 UI 状态（输入框、加注额、选中项、面板开合）         │
└─────────────┬───────────────────────────────────────────┘
              │ preload：contextBridge 暴露 window.river
              │ ↓ invoke 命令        ↑ 事件推送
┌─────────────▼──────── Main（Node，ESM）─────────────────┐
│ engine/      poker.ts：规则、胜率、本地决策（纯函数）     │
│ table/       TableRunner：唯一写入者；调度、暂停、托管    │
│ agents/      opponentAgent、coachAgent、工具、AgentQueue  │
│ models/      提供方配置与模型解析                          │
│ db/          LibSQLStore + river_* 表                      │
│ ipc/         命令注册与事件广播                            │
└─────────────┬───────────────────────────────────────────┘
              ▼
   ~/Library/Application Support/River/river.db
```

牌局状态只存在于主进程的 TableRunner（ADR-001）：对手与教练的工具在同一 Node 进程直接读取引擎，信息隔离由工具代码按调用者身份裁剪；Renderer 只收到按玩家视角裁剪的视图，未摊牌的对手底牌不会离开主进程。业务数据与 Mastra 数据共用一个 SQLite 文件（ADR-003）。

## 工程结构与技术栈

| 选择 | 内容 |
| --- | --- |
| 构建 | electron-vite（main、preload、renderer 三端，主进程输出 ESM） |
| UI | React 19、Tailwind CSS v4、shadcn/ui（Button、Toggle Group、Switch、Slider、Textarea、Input、Dialog、Tabs、Card、Badge、ScrollArea、Tooltip、Sonner） |
| Agent | `@mastra/core`、`@mastra/memory`、`@mastra/libsql`、zod |
| 数据 | `@libsql/client`（业务表）；Electron `safeStorage`（API key） |
| 测试 | vitest（engine、runner、tools 单测） |
| 打包 | electron-builder，mac arm64 dmg，`asarUnpack` 包含 `node_modules/@libsql/**` 与 `node_modules/libsql/**` |

```
river/
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ src/
│  ├─ shared/            # 两端共用：类型、常量、角色与教练定义
│  │  ├─ types.ts        # TableView、HandRecord、Settings、IPC 契约
│  │  └─ personas.ts     # 8 个角色、3 种教练、盲注档位
│  ├─ main/
│  │  ├─ index.ts        # 创建窗口、初始化 db 与 Mastra、退出处理
│  │  ├─ engine/poker.ts
│  │  ├─ table/runner.ts
│  │  ├─ table/view.ts   # 引擎状态 → TableView 裁剪
│  │  ├─ table/chat.ts   # 公屏、回应触发
│  │  ├─ agents/mastra.ts
│  │  ├─ agents/queue.ts
│  │  ├─ agents/opponent.ts
│  │  ├─ agents/coach.ts
│  │  ├─ agents/tools.ts
│  │  ├─ agents/leak.ts  # 发言泄牌过滤
│  │  ├─ models/resolve.ts
│  │  ├─ db/index.ts     # 建表与迁移、仓储函数
│  │  └─ ipc.ts
│  ├─ preload/index.ts
│  └─ renderer/
│     ├─ App.tsx         # 顶栏导航 + 页面切换
│     ├─ components/ui/  # shadcn 生成
│     ├─ pages/          # Lobby、Table、Opponents、Replays、Stats、Settings
│     └─ components/     # PlayingCard、Seat、ChatPanel、CoachPanel、ActionBar、Onboarding
└─ test/
```

## 牌局引擎

`poker.ts` 从原型 `poker.js` 逐函数移植为 TypeScript，行为保持一致：`newGame / startHand / legal / apply / progress / dealStreet / runoutStep / showdown / decide / equity / outs / handName / pot / disp / txt / fmt`。原文件在实施首个任务中从设计项目重新拉取，存入 `design-source/poker.js` 作为对照。

移植只做两处改动：

- 随机数改为可注入（`rng: () => number`），默认 `Math.random`，测试传固定种子。
- 状态类型化，`Player` 增加 `personaId`、`isHero`；删除挂在 `window` 上的导出。

`decide(g, i, profile)` 的 `profile` 为 `{ tight, aggr, bluff, call }`，用于托管与“本地引擎”模式。

## 牌桌运行：TableRunner

TableRunner 是牌局唯一写入者。Renderer 的命令、agent 的意图都经它校验后才改变状态，每次变化后广播 `table:view`。

### 状态

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `tableId` | string | 入座时生成的 UUID，用于 thread 命名 |
| `game` | Game | 引擎状态 |
| `runId` | number | 入座、离桌时自增，丢弃旧异步结果 |
| `paused` | boolean | 玩家提问或教练暂停时为真 |
| `pendingAI` | `{ seat, intent }` 或 null | 暂停时挂起的对手决策结果 |
| `heroKey` | string | 当前玩家回合标识 `${hand}-${log.length}` |
| `thinking` | personaId 或 null | 正在决策的对手 |
| `autopilot` | Set\<seat\> | 本手被托管过的座位（用于显示） |
| `breaker` | `{ opponent: number, coach: number, tripped: {opponent, coach} }` | 连续失败计数与熔断状态 |
| `guided` | boolean | 教学牌局 |
| `chat` | ChatMessage[] | 本桌公屏，最多保留 300 条 |
| `bubbles` | Map\<personaId, {text, until}\> | 座位气泡，5 秒消失 |

### 主循环

```ts
async loop() {
  const g = this.game, rid = this.runId
  this.broadcast()
  if (g.done) return this.onHandEnd()
  if (g.runout) return this.after(900, rid, () => runoutStep(g))
  const seat = g.toAct
  if (g.players[seat].isHero) return this.onHeroTurn()
  if (this.paused) return
  this.thinking = g.players[seat].personaId
  await sleep([1500, 900, 400][settings.speed])
  if (rid !== this.runId) return
  const intent = await this.decideOpponent(seat, rid)   // 见“对手决策”
  if (!this.stillValid(rid, g.hand, logLen)) return
  if (this.paused) { this.pendingAI = { seat, intent }; return }
  this.commitOpponent(seat, intent)
}
```

`stillValid` 同时检查 `runId`、手号与行动序号（`g.log.length`），任何一项变化都丢弃结果（沿用原型）。`commitOpponent` 调 `apply`，把行动与发言合并为一条公屏消息，按需触发回应（见“公屏”），然后 `loop()`。

### 暂停、离桌与退出

| 事件 | 处理 |
| --- | --- |
| 玩家提问 | `paused = true`（牌局未结束时）；中止教练进行中的主动判断 |
| 教练 `pause_game` 被采纳 | `paused = true`，教练栏显示暂停提醒，操作区覆盖“我看完了，继续” |
| `resume` | `paused = false`；有 `pendingAI` 则提交，否则 `loop()`；进行中的 ask 继续输出，不被中止 |
| 离桌 | `runId++`，中止所有 agent 调用，玩家剩余筹码退回余额（已入池部分作废） |
| 退出应用 | `before-quit` 中先执行离桌，保存设置后退出 |
| 自动下一手 | 一手结束 4.5 秒后，仍在同一 `runId`、未暂停、没有进行中的 ask、玩家筹码 > 0 时发下一手；ask 结束后若条件满足再计时 4.5 秒 |

### 超时、托管与熔断

对手每次决策：`maxSteps` 6，总时限 10 秒（由 TableRunner 计时器触发 `AbortController`）。被中止的 `generate` 正常返回 `finishReason: 'aborted'` 而不抛错，因此超时以计时器是否触发为准。

判为失败并托管的情形：超时、抛错、返回时没有 `act` 意图。托管时用 `decide()` 出牌，按原型规则随机取该角色的预设台词，公屏行动与座位状态标“托管”。

熔断只统计对手决策与教练主动判断/提问的失败；闲聊、赢家发言（win）的失败与被主动中止的调用不计入。任一次成功清零计数。连续 3 次失败后：

- 对手：本桌剩余时间全部托管，不再发起闲聊与赢家发言（改用预设台词）。
- 教练：停用主动判断与提问，教练栏提示。
- Renderer 显示横幅“对手模型连续失败，已托管 · 重试”（或教练对应文案），点击 `retryModels` 清零并恢复。

## 智能体

### 共同约定

Mastra 实例在主进程启动时创建：`new Mastra({ agents: { opponent, coach }, storage })`，其中 `storage = new LibSQLStore({ id: 'river', url: 'file:<userData>/river.db' })`。两个 Agent 的 `Memory` 构造时显式传入同一个 `storage`，TableRunner 直接写 thread 时使用这两个 Memory 实例，不依赖 agent 首次调用时的注入。

每次调用都传 `RequestContext`：

| 键 | 类型 | 含义 |
| --- | --- | --- |
| `role` | `'opponent' \| 'coach'` | 选择模型与工具视角 |
| `mode` | `'decide' \| 'chat' \| 'win' \| 'proactive' \| 'ask' \| 'review'` | 选择 instructions 片段与触发规则 |
| `tableId` | string | 当前牌桌 |
| `seat` | number | 调用者座位（教练为玩家座位 0） |
| `personaId` | string | 对手角色（教练为空） |
| `intents` | IntentCollector | 本次调用的意图收集器 |

工具从 `context.requestContext` 读取身份，只返回该身份可见的信息。工具不修改牌局，只向 `intents` 写入意图；调用返回后由 TableRunner 校验并应用：

| 意图 | 取舍规则 |
| --- | --- |
| `act` | 多个时取第一个 |
| `say` | 多个时取第一个 |
| `pause_game` / `hint` | 有 `pause_game` 取第一个，否则取第一个 `hint` |

各模式通过 `activeTools` 限定工具，都包含 Memory 注入的 `updateWorkingMemory`（1.x 默认工具名，首个任务断言），否则该模式不能更新记忆：

| 模式 | activeTools | toolChoice | maxSteps | 时限 |
| --- | --- | --- | --- | --- |
| 对手 decide | `view_table, estimate_equity, read_chat, hand_history, say, act, updateWorkingMemory` | `required` | 6 | 10 秒 |
| 对手 chat | `read_chat, hand_history, say, updateWorkingMemory` | `auto` | 3 | 8 秒 |
| 对手 win | `read_chat, hand_history, say, updateWorkingMemory` | `auto` | 3 | 8 秒 |
| 教练 proactive | `view_hero, estimate_equity, read_chat, recent_hands, hint, pause_game, updateWorkingMemory` | `auto` | 4 | 12 秒 |
| 教练 ask | `view_hero, estimate_equity, read_chat, recent_hands, updateWorkingMemory` | `auto` | 6 | 30 秒 |
| 教练 review | `recent_hands`（例外：不写记忆，调用传 `memory.options.readOnly: true`） | `auto` | 6 | 45 秒 |

提供方拒绝 `toolChoice: 'required'` 时（“测试连接”会检测并记在提供方配置上），该提供方的决策模式改用 `auto`，停止条件不变。

### 串行队列与中止

每个 agent 实例（每个 personaId、教练）有一个 `AgentQueue`，同一实例同一时刻只运行一个任务。原因：working memory 以整份 Markdown 覆盖写入，`@mastra/memory` 的锁只串行写入，不防止两个并发调用的读-改-写覆盖。

```ts
class AgentQueue {
  run(task, { preempt }): Promise<Result>
  // preempt=true：中止当前任务，等待其结束（≤2 秒），丢弃排队中未开始的可丢弃任务，再执行 task
  // preempt=false：排队；可丢弃任务在队列满（>2）时被拒
  // task.durable=true：不可丢弃（每手结果消息）；抢占与队列满都保留，且先于抢占任务执行
}
```

| 场景 | 行为 |
| --- | --- |
| 轮到某对手决策 | `preempt: true`；等待被中止的闲聊最多 2 秒（计入 10 秒时限），超过则直接发起决策，旧结果丢弃；未开始的闲聊（含赢家发言）丢弃，赢家发言改用预设台词 |
| 闲聊请求到达时该对手正在决策 | 直接丢弃 |
| 玩家提问 | 教练队列 `preempt: true` |
| 复盘 | 独立的“复盘队列”排队，不与教练队列互相抢占；复盘不开放 `updateWorkingMemory`，因此与教练队列并行不会覆盖 working memory |
| 每手结束写入结果消息 | 作为 `durable` 无 LLM 任务进入该对手队列，保证顺序且不被丢弃；下一手决策抢占时先执行它 |

### opponentAgent

一个 Agent 定义服务 8 个角色。instructions 为函数，按 `personaId` 与 `mode` 拼接：

1. 基础：你在一张 PvE 娱乐德州扑克桌上扮演「{name}」；按人设决策，但别做明显送钱的离谱决定。
2. 人设：角色提示词（用户在 AI 对手页的修改优先，下一手生效）；健谈度描述（例如“你话很少，大多数时候不说话”）。
3. 发言规则：不超过 20 字，中文口语；绝不透露或暗示自己的底牌（点数、花色、对子、口袋）。
4. decide 模式：先用 `view_table` 了解局面、用 `read_chat` 看最近公屏，再调用 `act`；想说话就调用 `say`，必须声明 `kind`：自己起的话题用 `free`，回应别人用 `reply` 并带上所回应消息的 `reply_to`；需要更新对某人的印象或自己的心情时，与 `act` 在同一步调用 `updateWorkingMemory`。
5. chat 模式：你看到公屏有人说话，可以回应也可以不说；想回应就调用 `say`（`kind` 固定按 `reply` 处理）。
6. win 模式：你赢了这一手，可以说一句（`kind` 按 `free` 处理）。

循环在调用了 `act` 的那一步结束后停止：`stopWhen: ({ steps }) => steps.at(-1)?.toolCalls?.some(c => c.toolName === 'act')`。同一步内的其他工具（`say`、`updateWorkingMemory`）会执行完（已用假模型验证）。

对手工具：

| 工具 | 输入 | 返回或意图 |
| --- | --- | --- |
| `view_table` | 无 | 阶段、盲注、自己的底牌、公共牌、底池、需跟注、可选行动与加注范围、各玩家名称/角色/筹码/本轮已下/是否弃牌或全下、本手行动记录 |
| `estimate_equity` | 无 | 对在手对手人数的随机手牌胜率（200 次模拟）、底池赔率、出路、当前牌型 |
| `read_chat` | `limit?`（默认 12） | 公屏最近消息：`{ id, from, text, at }` |
| `hand_history` | `n?`（默认 3，≤10） | 自己在座的最近 n 手公开结果：摊牌亮出的牌、赢家与金额、自己的盈亏；可跨牌桌 |
| `say` | `text`，`kind: 'free' \| 'reply'`（必填），`reply_to?` | 意图：发言；`kind` 决定是否引起回应；`reply_to` 为所回应消息 id，仅用于展示与上下文 |
| `act` | `action: fold\|check\|call\|raise`，`to?` | 意图：行动；非法动作按原型规则纠正（check→call、raise 不可时→call/check，`to` 夹在最小与最大之间） |

`reply_to` 应用时校验：不是本桌公屏已有消息 id 时丢弃该字段（`kind` 仍按声明生效）。决策超时或失败转托管时，本次调用已收集的 `say` 一并丢弃，改用预设台词。

`view_table` 永不包含其他玩家底牌；摊牌亮出的牌只经 `hand_history` 在手牌结束后提供。

`say` 的泄牌过滤在应用意图时执行（沿用原型规则）：发言含本人底牌的点数（按词边界匹配）、任一花色符号、“口袋”“底牌是”“我有一对”“对子”时整句丢弃；超过 40 字截断。

Memory 配置：

```ts
new Memory({
  storage, // 与 Mastra 实例同一个 LibSQLStore
  options: {
    lastMessages: 40, // 计数包含工具调用与结果，一次决策约 4–8 条，40 条约覆盖最近 5–8 次调用
    workingMemory: { enabled: true, scope: 'resource', template: OPPONENT_WM },
  },
})
```

| 项 | 值 |
| --- | --- |
| resource | `opponent:<personaId>`（跨牌桌） |
| thread | `table:<tableId>:<personaId>`（decide 与 chat 共用） |

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

每手结束时，TableRunner 向每个在座对手的 thread 写入一条 user 消息（`memory.saveMessages`，带 `threadId` 与 `resourceId`；thread 不存在时先 `createThread`），内容为本手公开结果与自己的盈亏，例如“第 12 手结束：摊牌，你亮出 A♠ K♦，玩家亮出 Q♥ Q♣ 赢得 2,400；你本手 −1,200”。

### coachAgent

instructions 拼接：教练人设（温和老师 / 直白教练 / 数据派，文本沿用原型）、讲解深度（新手 / 进阶，沿用原型）、只知道玩家可见的信息、不用 Markdown 标题和列表、一般不超过 120 字（复盘 200 字内）。

教练工具：

| 工具 | 输入 | 返回或意图 |
| --- | --- | --- |
| `view_hero` | 无 | 与对手 `view_table` 相同结构，但底牌为玩家底牌；对手只含公开信息与角色标签 |
| `estimate_equity` | 无 | 玩家胜率（400 次模拟）、所需胜率、出路、牌型、简单规则建议（沿用原型 `computeNums`） |
| `read_chat` | `limit?` | 同对手 |
| `recent_hands` | `n?`（默认 5，≤20） | 玩家最近 n 手的记录摘要（底牌、公共牌、行动、结果） |
| `hint` | `message` | 意图：提醒 |
| `pause_game` | `message` | 意图：暂停并提醒 |

| 场景 | 触发 | 输入 | 应用 |
| --- | --- | --- | --- |
| proactive | 轮到玩家且教练开启、未熔断，且没有进行中的 ask | “现在轮到玩家决策”；教学牌局附“每一步至少 hint” | 抢占上一次未结束的 proactive，但从不抢占 ask（有 ask 进行中则本次跳过；教学牌局中这一步因此可能没有 hint，玩家刚得到回答，可以接受）；返回时 `heroKey` 仍相同才应用；无意图即静默；失败不提示 |
| ask | 玩家在教练栏提问或点快捷问题 | 玩家问题 | 抢占 proactive 与上一次 ask；按 `requestId` 流式输出到教练栏；被新提问中止的回答保留已输出部分并标“已中断”（`coach:done { ok: false, error: 'interrupted' }`）；其他失败在该条回答处显示“教练暂时没连上，稍后再问” |
| review | 回放页“让教练复盘这一手” | 该手完整记录（含摊牌） | 进入复盘队列（同一手重复点击忽略）；成功存 `river_reviews`；失败、被中止或因队列满被拒时都推送 `review:done` 带 `error`，页面显示“复盘失败，稍后再试”且可重试 |

Memory：resource `hero`（跨牌桌），thread `coach:<tableId>`（proactive 与 ask 共用），复盘用 thread `review:<handId>`。

```markdown
# 学员档案
- 水平判断：
- 常见漏洞：
- 已讲过的概念：
- 近期进步：
```

右侧概率面板不依赖 LLM：轮到玩家时 TableRunner 本地计算并随 `table:view` 下发，硬核模式下隐藏（沿用原型）。

## 公屏与回应

公屏是本桌的全局聊天记录，Renderer 展示，对手与教练通过 `read_chat` 读取。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` | string | 消息 id |
| `kind` | `'sys' \| 'act' \| 'msg'` | 系统事件 / 只有行动 / 发言（可带行动） |
| `from` | personaId 或 `'hero'` 或空 | 发言者 |
| `text` | string | 发言或系统文本 |
| `act` | string | 行动标签，如“加注至 400” |
| `autopilot` | boolean | 托管出牌 |
| `replyTo` | string | 所回应的消息 id |
| `triggers` | boolean | 是否引起回应 |
| `at` | number | 时间戳 |

是否引起回应按来源判定：

| 来源 | triggers |
| --- | --- |
| 玩家输入 | 是 |
| 对手 decide 模式 `say`，`kind = free` | 是（主动发言） |
| 对手 decide 模式 `say`，`kind = reply` | 否 |
| 对手 chat 模式 `say`（无论 `kind`） | 否 |
| 对手 win 模式 `say`（赢家发言，无论 `kind`） | 是（主动发言） |
| 托管预设台词 | 否 |
| 系统消息 | 否 |

对 `triggers = true` 的消息，TableRunner 对其余在座、未熔断、不在决策中、10 秒内未被触发过闲聊的对手，按健谈度抽样；抽中者以 chat 模式调用（非抢占排队），由 agent 决定是否 `say`。发言写入公屏并显示 5 秒座位气泡。

角色健谈度初值：

| 角色 | 健谈度 |
| --- | --- |
| 阿狸 | 0.6 |
| 老K | 0.15 |
| 小白 | 0.85 |
| 教授 | 0.35 |
| 石头 | 0.05 |
| 阿May | 0.5 |
| 牛仔 | 0.6 |
| 禅师 | 0.25 |

一手结束时，赢得筹码最多的非玩家赢家（分池时只取一位；玩家独赢则无）以 win 模式发言一次，输入为“你赢了这一手”（本手结果已先写入其 thread）；不受 10 秒冷却限制；由它引起的回应照常按健谈度抽样。失败、熔断或被丢弃时取预设“赢牌”台词（此时 `triggers = false`）。

## 模型提供方

提供方配置：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` | string | 本地 id |
| `name` | string | 显示名称 |
| `kind` | string | Mastra 模型路由的提供方 key（如 `anthropic`、`openai`、`google`、`deepseek`）或 `openai-compatible` |
| `baseUrl` | string | 仅 `openai-compatible` 使用且必填；内置提供方不提供此输入（Mastra 在带 url 时会改走 OpenAI 兼容协议） |
| `apiKeyEnc` | blob 或空 | `safeStorage.encryptString` 密文；仅 `openai-compatible` 允许为空 |
| `supportsRequired` | boolean 或 null | 测试连接的结果 |

角色模型：`settings.models.opponent` 与 `settings.models.coach`，各为 `{ providerId, modelId }`。

```ts
// models/resolve.ts
export const resolveModel = ({ requestContext }) => {
  const sel = settings.models[requestContext.get('role')]
  const p = providers.get(sel.providerId)
  const apiKey = p.apiKeyEnc ? safeStorage.decryptString(p.apiKeyEnc) : undefined
  return p.kind === 'openai-compatible'
    ? { providerId: p.id, modelId: sel.modelId, url: p.baseUrl, apiKey }
    : { id: `${p.kind}/${sel.modelId}`, apiKey }
}
```

提供方下拉列表来自 `@mastra/core/llm` 导出的 `PROVIDER_REGISTRY`（1.69.0 实测 208 项），另加 `openai-compatible`；模型 ID 由用户填写，下拉提示取注册表中该提供方的模型列表。“测试连接”对所选模型执行一次带单个工具、`toolChoice: 'required'` 的最小调用：成功记 `supportsRequired = true`；因 `required` 被拒时改用 `auto` 重试，成功记 `false`；仍失败则显示错误。

API key 只在主进程解密，任何 IPC 都不返回明文（设置页只显示“已保存 ····末 4 位”）。每次调用前先检查角色模型是否已配置且可用；未配置（包括牌桌进行中删除了提供方）按“未配置”处理，不计入熔断。解密失败（例如系统钥匙串变化）时该提供方标记为 `needsKey`，设置页提示重新输入，调用按“未配置”处理。

未配置时：
- 对手模型未配置，或用户把“决策引擎”选为本地：对手用 `decide()`，不标托管（这是用户的选择）；不发起任何对手 LLM 调用，闲聊不发生，赢家发言与行动台词取预设台词（按原型概率）。
- 教练模型未配置：教练栏显示“配置模型后可用”，概率面板照常。
- 首次启动的规则引导第 6 页为“配置模型”，可跳过。未配置教练模型时点“教学牌局 / 带我打一手”，先弹出对话框：“去配置”或“仍然开始（无教练讲解）”。

## 数据

所有表位于 `river.db`。Mastra 自管 `mastra_*` 表。业务表由 `db/index.ts` 在启动时按 `PRAGMA user_version` 迁移。

```sql
CREATE TABLE river_kv (
  key   TEXT PRIMARY KEY,   -- 'settings' | 'lobby' | 'bankroll' | 'onboarded'
  value TEXT NOT NULL       -- JSON
);
CREATE TABLE river_personas (
  persona_id TEXT PRIMARY KEY,
  prompt     TEXT NOT NULL  -- 用户修改后的提示词；恢复默认即删除该行
);
CREATE TABLE river_hands (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id  TEXT NOT NULL,
  hand_no   INTEGER NOT NULL,
  played_at INTEGER NOT NULL,
  net       INTEGER NOT NULL,
  record    TEXT NOT NULL   -- HandRecord JSON
);
CREATE TABLE river_reviews (
  hand_id INTEGER PRIMARY KEY REFERENCES river_hands(id) ON DELETE CASCADE,
  text    TEXT NOT NULL
);
CREATE TABLE river_providers (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL,
  base_url          TEXT,
  api_key_enc       BLOB,        -- openai-compatible 可为空（如本地 Ollama）
  supports_required INTEGER
);
```

`HandRecord`（沿用原型 `rec` 结构并补充 `personaId`）：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `hand` | number | 本桌手号 |
| `sb` / `bb` | number | 盲注 |
| `net` | number | 玩家本手盈亏 |
| `pot` | number | 底池总额 |
| `showdown` | boolean | 是否摊牌 |
| `hero` | string[] | 玩家底牌 |
| `board` | string[] | 公共牌 |
| `players` | `{ id, personaId, name, hole, folded, handName, won, net }[]` | `hole` 仅玩家与摊牌者 |
| `log` | `{ street, board, name, label, autopilot }[]` | 行动记录 |
| `vpip` / `pfr` | boolean | 玩家翻前入池 / 加注 |

`Settings`：

| 字段 | 类型 | 默认 |
| --- | --- | --- |
| `engine` | `'llm' \| 'local'` | `'llm'` |
| `speed` | 0 \| 1 \| 2 | 1 |
| `coachOn` | boolean | true |
| `coachPersona` | 0 \| 1 \| 2 | 0 |
| `level` | `'novice' \| 'pro'` | `'novice'` |
| `hard` | boolean | false |
| `autoNext` | boolean | true |
| `models` | `{ opponent?, coach? }` | 空 |

“清空记录”删除 `river_hands`、`river_reviews`，余额重置 100,000。“重置 AI 记忆”只能在离桌时执行：先等待所有 AgentQueue 清空（离桌后剩余的 durable 结果写入执行完），再对每个 resource（`opponent:<personaId>` 与 `hero`）用 `memory.listThreads({ filter: { resourceId }, perPage: false })` 找出全部 thread 逐个 `deleteThread`，最后用 `memory.updateWorkingMemory({ threadId: 'reset', resourceId, workingMemory: 模板 })` 写回模板（resource 作用域下 `threadId` 不被使用；Mastra 1.69 没有删除 resource 的 API）。“清空记录”与“重置 AI 记忆”都需二次确认。

## 进程间契约

preload 通过 `contextBridge.exposeInMainWorld('river', api)` 暴露；`contextIsolation: true`，`nodeIntegration: false`。

命令（`ipcRenderer.invoke`）：

| 命令 | 参数 | 返回 |
| --- | --- | --- |
| `app.bootstrap` | 无 | `{ settings, lobby, bankroll, onboarded, personas, providers(脱敏), hasTable, lastCall, coachThread, chat }` |
| `settings.update` | `Partial<Settings>` | Settings |
| `lobby.update` | `Partial<Lobby>` | Lobby |
| `persona.setPrompt` / `persona.resetPrompt` | `personaId, prompt?` | void |
| `provider.save` | `{ id?, name, kind, baseUrl?, apiKey? }` | 脱敏 Provider |
| `provider.delete` | `id` | void |
| `provider.test` | `{ providerId, modelId }` | `{ ok, supportsRequired, error? }` |
| `table.start` | `{ size, blinds, picks, guided }` | void |
| `table.heroAct` | `{ type: 'fold'\|'call'\|'raise', to? }` | void |
| `table.nextHand` / `table.rebuy` / `table.leave` / `table.resume` / `table.retryModels` | 无 | void |
| `chat.send` | `text` | void |
| `coach.ask` | `text` | `requestId` |
| `hands.list` | 无 | `HandSummary[]`：`{ id, handNo, playedAt, hero, net, showdown }` |
| `hands.get` | `id` | `{ record, review? }` |
| `hands.review` | `id` | void（结果经事件推送） |
| `data.clearHistory` / `data.resetMemory` | 无 | void |
| `onboarding.done` | 无 | void |

`app.bootstrap` 中 `coachThread` 为当前牌桌的教练对话 `{ role, text, requestId }[]`，`chat` 为当前牌桌公屏；无桌时均为空。Renderer 重载后据此恢复教练栏与公屏。`table.setChatShown` 只影响 Renderer 布局，由 Renderer 本地保存，不经主进程。删除仍被角色模型引用的提供方时，同时清空该角色的模型选择。

事件（`webContents.send`）：

| 事件 | 负载 |
| --- | --- |
| `table:view` | `TableView`（见下） |
| `chat:append` | `ChatMessage` |
| `coach:alert` | `{ level: 'hint'\|'pause', message } \| null` |
| `coach:delta` | `{ requestId, text }` 流式片段 |
| `coach:done` | `{ requestId, ok, error? }` |
| `review:done` | `{ handId, text?, error? }` |
| `agent:last` | `{ role, modelId, ms, ok }` 最近一次调用信息（设置页显示） |
| `breaker` | `{ opponent: boolean, coach: boolean }` |
| `bankroll` | number |

`Lobby` 为 `{ size: 2..6, blinds: 0|1|2, picks: personaId[] }`。脱敏 `Provider` 为 `{ id, name, kind, baseUrl?, keyTail, needsKey, supportsRequired }`。`Persona`（shared/personas.ts）为 `{ id, name, tag, ini, hue, desc, profile: { tight, aggr, bluff, call }, talk, prompt, lines }`，Renderer 另收到 `promptOverride?`。

`TableView` 覆盖牌桌页所需的全部数据：`title`、`handNo`、`street`、`board`、`pot`、`seats[]`（name、personaId、tag、stack、bet、isDealer、folded、out、allin、status、statusTone、autopilot、thinking、winner、cards（仅玩家与摊牌者）、hasCards、bubble）、`hero`（`legal`、`toCall`、`isTurn`、`defaultRaiseTo`、`presets[]`）、`autopilotCount`（本桌累计托管次数，设置页与横幅使用）、`paused`、`done`、`result`（text、sub、heroWon、net）、`heroBust`、`nums`（eq、need、outs、handName、sugg、stale）、`coachLoading`。Renderer 只做排版与本地 UI 状态（加注额、输入框、选中项）。

## 页面实现要点

| 页面 | 组件与要点 |
| --- | --- |
| 顶栏 | 应用名、导航（大厅、牌桌（有桌时）、AI 对手、手牌回放、数据统计、设置）；牌桌页显示桌名、手号、离桌；其他页显示筹码余额。macOS 使用 `titleBarStyle: 'hiddenInset'` 保留原生红绿灯 |
| 大厅 | 预设桌 Card ×3；人数、盲注 Toggle Group；对手多选 Badge；教练 Switch；入座按钮；右栏：回到牌桌、新手引导、最近 5 手 |
| 牌桌 | 左 ChatPanel（ScrollArea + Input，可收起为悬浮胶囊）；中 椭圆桌与座位（按原型极坐标布局）、公共牌、下注筹码、气泡、状态胶囊、托管标记；底 ActionBar（预设、弃牌/跟注/加注步进/加注，快捷键）；结束态显示结果与下一手/重新买入；暂停遮罩；右 CoachPanel（人设切换、开关、讲解深度、提醒卡、概率面板、对话、快捷问题、输入、硬核模式） |
| AI 对手 | 8 张角色卡：头像、标签、描述、倾向条（紧度、攻击性、诈唬、健谈度）、提示词 Textarea（失焦保存）、加入下一桌、恢复默认 |
| 手牌回放 | 左列表（全部手牌，倒序）；右详情：公共牌、玩家行、按街道行动（托管项带标记）、教练复盘 |
| 数据统计 | 6 个 KPI（全部手牌）；每手盈亏柱状图（最近 40 手，纯 CSS 柱） |
| 设置 | 分组：模型提供方（列表、添加/编辑 Dialog、测试连接）、AI 对手（决策引擎、对手模型、思考速度）、教练（教练模型、主动提醒、人设、讲解深度、硬核模式）、牌局与数据（自动下一手、最近调用信息、规则介绍、清空记录、重置 AI 记忆） |
| 规则引导 | Dialog 6 页：原型 5 页 + 配置模型页 |

视觉沿用原型的浅色调（背景 #fbfbfa、文字 #1d1d1f、强调蓝 oklch(0.6 0.17 255)、赢绿、输红），写成 shadcn 主题的 CSS 变量；最小窗口宽 880px，窗口 < 1280px 时默认收起公屏（沿用原型响应式规则）。

## 影响面与外部协同

这是新建项目，不影响已有系统。外部依赖只有用户配置的模型提供方：需要用户自备 API key；应用对提供方的要求是支持工具调用（function calling）。未签名的 macOS 应用首次打开需在“隐私与安全性”中允许。

## 验证与发布

自动测试（vitest）：

| 对象 | 场景 |
| --- | --- |
| engine | 牌型比较（含 A-5 顺子、皇家同花顺）、边池分配（三人不同全下额）、单挑盲注与行动顺序、runout、非法动作纠正、固定种子下 `decide` 结果稳定 |
| TableRunner（假 agent） | 超时托管并标记；返回无 `act` 托管；过期结果丢弃；暂停挂起与恢复；离桌中止；连续 3 次失败熔断与重试；教练晚到的 `pause_game` 被丢弃 |
| AgentQueue | 抢占等待被中止任务结束；超 2 秒直接执行；排队任务在抢占时丢弃 |
| 工具 | 对手 `view_table` 不含他人底牌；教练 `view_hero` 只含玩家底牌；`hand_history` 只含摊牌亮出的牌 |
| 公屏 | `triggers` 判定表逐行；冷却与熔断时不触发 |
| 泄牌过滤 | 原型规则的正反例 |

首个实施任务是技术验证，失败则回到方案讨论：

1. 从设计项目拉取 `poker.js` 原文件存入 `design-source/`。
2. electron-vite 空壳中，主进程创建 `LibSQLStore` 与带 Memory 的 Agent，用动态 `model` 函数调用一个真实或 mock 提供方，完成一次带工具的 generate；断言工具名 `updateWorkingMemory`。
3. `safeStorage` 加密写入、应用重新构建后仍能解密。
4. electron-builder 打包 arm64 dmg，安装后能启动并读写 `river.db`。

失败时的备选：改用独立 Node 子进程（`utilityProcess`）承载 TableRunner 与 Mastra；职责划分不变，但需重新核对单进程串行队列前提。

真实联调（手动，按验收清单）：配置真实提供方完成 6 人桌 10 手；公屏发言引起回应且回应不再引出回应；教练三种调用；断网触发托管与熔断；重开应用后数据、角色印象、教练档案仍在。

发布：本地构建 `River-<version>-arm64.dmg`，不签名、不自动更新。数据在 `~/Library/Application Support/River/river.db`；回退即安装旧版本，业务表迁移只做加法，旧版本忽略未知列。

## 待决问题与依据

无影响方案成立的待决问题。以下事项在首个技术验证任务中确认，失败时回到方案讨论：libsql 原生模块在 Electron 打包后运行、主进程 ESM 加载 Mastra、`safeStorage` 在未签名应用中重新构建后的可用性、模型路由提供方注册表的读取方式。

依据：`discussion.md`（第 3 轮）、`note.md`、`adr/001-engine-in-main-process.md`、`adr/002-no-mastra-workflow.md`、`adr/003-single-sqlite-storage.md`、`reviews/design-1.md`～`design-3.md`、`design-source/River.dc.html`。
