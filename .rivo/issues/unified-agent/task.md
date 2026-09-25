# 统一牌桌 Agent 与本地数值：实施任务

## 目标与共同约定

- **依据**：`plan.md`（已通过审阅 reviews/plan-1、plan-2，建议项已落实）、`discussion.md`（用户决定）、`adr/006-unified-table-agent-context.md`。用户已批准方案，并授权在 task 审阅通过后直接实施。
- **基线**：`main` @ 3ba346c，加上工作区里未提交的改动：
  - 位置修复：`positions()`、`HandPlayer.pos`、3 条位置测试；
  - 讲解重试：`CoachState.retry`、`runner.retryCoach()`、`RetryButton`；
  - 过渡字段 `history`：由 T4 取代。
- **检查命令**：
  - `npx tsc --noEmit -p tsconfig.node.json`
  - `npx tsc --noEmit -p tsconfig.web.json`
  - `npx vitest run`

  每个任务完成时这三条都要通过。
- **公共接口**（T2 提供，T3、T4 使用）：

```ts
// src/main/agents/llm.ts
export type Msg =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | [{ type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }] }
  | { role: 'tool'; content: [{ type: 'tool-result'; toolCallId: string; toolName: string; output: { type: 'json'; value: unknown } }] }

// src/main/agents/thread.ts
export class Thread {
  hand: number | null
  chatSeen: string | null          // 上次成功观察时公屏最后一条消息 id（对手、教练）
  lastSituation: string | null     // 教练：上次写入的局面文本
  messagesFor(hand: number, observation: string, onCompress?: (hand: number) => void): Msg[]
  pushText(hand: number, observation: string, text: string, digest: string): boolean
  pushTool(hand: number, observation: string, tool: string, input: unknown, result: unknown, digest: string): boolean
  setSummary(hand: number, summary: string, onCompress?: (hand: number) => void): void
}
```

**语义**：

- `messagesFor`：如果 `this.hand !== hand`，先压缩（见 T2），并调用 `onCompress(旧手号)`，由 runner 中止该手的赛后发言。之后返回「已有各组 + 本次 user 观察」。如果本手还没有任何组，本次 user 的开头加「【往手回顾】…」。
- `push*`：只在 `this.hand === hand` 时写入并返回 true，否则丢弃并返回 false，这就是过期判定。`observation` 必须是 `messagesFor` 里用过的那段原文（如果是第一组，要包含往手回顾），否则前缀会不一致。
- `setSummary`：如果 `this.hand === hand` 就直接写入；如果 `this.hand` 为 null，就把 hand 设为这一手再写入；如果 `this.hand` 是更早的一手，先压缩（触发 `onCompress`），把 hand 设为这一手再写入；如果 `this.hand` 大于 hand，说明这是过期的摘要，直接忽略。

**不变的约束**：

- 信息隔离：对手看到的只有公开信息，摊牌时亮出的牌可以出现，`holeAfter` 不能出现。
- thread 只放在内存里，离桌时（`resetTable`）清空。
- runId 核对的写法与现有的一致。

## 任务顺序

| 任务 | 结果 | 依赖 |
|---|---|---|
| T1 | 局面文本（当前牌型、所需胜率、去掉胜率）与本地数值、概率面板 | 无 |
| T2 | `Msg` 扩展与 `Thread` 模块，含单元测试 | 无 |
| T3 | 对手接入 thread：`think`、观察、往手摘要、赛后发言 `talk` | T1、T2 |
| T4 | 教练接入 thread：统一 system、讲解/提问/复盘、打断写入 | T2；与 T3 改同一个 runner.ts，排在 T3 之后 |
| T5 | 加注额输入框 | 无 |
| T6 | Windows 顶栏 | 无 |
| T7 | 知识文档与整体验证 | T1–T6 |

## 任务 T1：局面文本与本地数值

**目标**：模型拿到的是精确事实，包括位置、当前牌型、所需胜率，不再有随机牌胜率和规则建议；面板只展示事实。

**修改位置**：
- `src/main/table/text.ts`
- `src/main/engine/eval.ts`
- `src/main/table/runner.ts`（`numsFor`、`heroSituation`、`equityFor` 的调用方）
- `src/main/table/view.ts` 和 `src/shared/types.ts`（`Nums`、`TableView.nums` 去掉 `sugg`）
- `src/renderer/src/components/table/CoachPanel.tsx`（`ProbPanel`）
- 测试：`test/engine.test.ts`，以及受影响的 runner 测试。

**步骤**：

1. 修改 `situation()`：
   - 视角那一行改为 `${你|玩家}的位置：X；底牌：…；当前牌型：${handName(底牌 + 公共牌)}`。
   - 底池那一行在需跟注大于 0 时加上 `所需胜率（底池赔率）：${(toCall / (pot + toCall) * 100).toFixed(1)}%`。
   - 删除 `o.equity` 选项和「参考：胜率约」这一行。
   - 第一行改为 `无限注 · 盲注 ${sb}/${bb} · ${seats.length} 人桌；第 N 手，阶段：…`（`t.stakes()`）。
   - 座位行在 `totalIn > 0` 时加一项「本手共投入 X（含本轮）」（引擎的 `seats()` 已经返回 `totalIn`）。
   - **对手视角的称呼**：`situation()` 的 `who()` 和 `logLines()` 在 seat ≠ 0 的视角下，把座位 0 写作「玩家」，因为它在 `seats` 里的名字是「你」。只有观察者自己写「你」。教练视角（`you: false`）保持现状：玩家写「玩家」。
   - 以上各项依据 plan 中「局面文本：人类玩家能看到的，Agent 都要知道」一节的对照表。
2. `heroSituation` 不再传「本地计算：…」这个 extra。
3. `numsFor`：
   - `iters` 改为 2500；
   - 删除 `sugg` 和 `fair`；
   - 对手决策处不再调用 `equityFor`：这一步在 T3 删除调用；T1 先保留，把它从 `situation` 参数中移除。
4. `outs(hole, board)` 改口径：
   - 定义 `rel(b) = looseCat(hole + b) − looseCat(b)`，其中 b 是公共牌；
   - 统计满足 `rel(board + c) > rel(board)` 的牌 c；
   - 只在公共牌 3 张或 4 张时计算，其余情况返回 null。
5. `ProbPanel`：
   - 删除「跟注 +EV / −EV / 可免费看牌」的文字和配色，以及进度条上的所需胜率刻度线；
   - 标题改为「对随机牌胜率」；
   - 胜率作为标题下的大字，统计区显示 3 项：所需胜率（底池赔率）（无需跟注时显示「—」）、当前牌型、改进牌（null 时显示「—」）；
   - 说明文字改为「本地计算 · 胜率按对手随机手牌估算 · 改进牌按牌型大类」。

**验证**：
- 改进牌的 7 个例子写成测试（逐条列在 plan「验证与发布」一节），放进 `engine.test.ts`。
- `engine.test.ts` 中「与原型对照」那条测试（约第 399 行）要删掉 `expect(outs(...)).toBe(P.outs(...))`：口径是有意改的，由 7 个例子接替覆盖；`import` 里没用到的名字也一并清理。
- 局面文本断言具体值：翻牌前小盲那一行是「本轮已下 50，本手共投入 50（含本轮）」；投入为 0 的座位不出现「本手共投入」；第一行包含「盲注 50/100」。
- 对手视角：观察文本里「你」只指该对手自己；玩家的座位行和行动都写成「玩家」，例如「玩家（枪口）」「玩家 跟注 100」。在 runner 测试里取某个对手的观察来断言。
- 胜率改为 2500 次，对手也不再调用 `equityFor`，这两项都会改变 runner 共用的 `this.rng` 的消耗量，所以同一个 seed 下之后各手的发牌会变化。这是预期内的。受影响的测试要改成断言「行为」，不准靠换 seed 过关。
- `situation` 的输出包含位置、当前牌型、所需胜率，不包含「胜率约」：在 runner 测试里给 `coachSpeak` 或 `opponentAct` 替身加断言。T3、T4 把替身输入改成 `messages` 之后，这条断言也要迁移为读最后一条 user 消息。
- 三条检查命令全部通过。

## 任务 T2：Msg 扩展与 Thread 模块

**目标**：提供共同接口里写明的 `Msg` 和 `Thread`，行为用单元测试固定下来。

**修改位置**：
- `src/main/agents/llm.ts`：`Msg` 类型；`callModel` 把 `o.messages` 原样传给 Mastra，删掉现有按角色的 map，必要时加一个 `as` 断言。
- 新增 `src/main/agents/thread.ts`。
- `test/mock-model.ts`：`calls` 增加 `prompt` 字段（非 system 消息原样保留），供 T2、T4 断言 tool-call 以及本次调用的工具列表。
- 新增 `test/thread.test.ts`；`test/agents.test.ts` 加一条：带 tool-call 历史调用时，mock 模型收到的 prompt 里有 `tool-call` 和 `tool-result`。

**实现要点**：

- 字段：
  - `past: string[]`：最多 5 条；
  - `hand`；
  - `groups: Msg[][]`；
  - `digest: string[]`；
  - `summary: string | null`；
  - `chatSeen`；
  - `lastSituation`；
  - `seq`：toolCallId 计数。
- 压缩：`past.push(\`[第 ${hand} 手] ${summary ?? ''}\n你本手：${digest.join('；') || '无'}\`)`，保留最后 5 条，然后清空 `groups`、`digest`、`summary`。
- `pushTool` 生成 `toolCallId = \`h${hand}-${++seq}\``，写入三条：user、assistant tool-call、tool tool-result（`output: { type: 'json', value: result }`）。
- `pushText` 写入两条：user、assistant。

**验证**（`thread.test.ts`）：
- 成功写入后组的形状（2 条、3 条）；
- 跨手压缩；
- 跳过一手：`summary` 缺失，压缩结果为 `[第 N 手] \n你本手：无`；
- 窗口只保留 5 手；
- 第一条 user 带往手回顾，之后严格按组排列；
- 手号不符时 `push*` 返回 false，不写入；
- `setSummary` 在三种 `hand` 状态下的行为，以及 `onCompress` 的回调参数。

三条检查命令全部通过。

## 任务 T3：对手接入 thread 与赛后发言

**目标**：对手在同一手内看得到自己之前的想法；往手以公开摘要呈现；入过池的对手在一手结束后异步发言。

**修改位置**：
- `src/main/agents/opponent.ts`
- `src/main/table/runner.ts`
- `src/main/table/text.ts`（对手摘要）
- `src/shared/types.ts`（`Purpose` 加 `'talk'`）
- `src/main/models/prices.ts`（`PURPOSES`）
- `src/renderer/src/pages/Stats.tsx`（`PURPOSE` 加 `talk: ['赛后发言', <颜色>]`，颜色与现有 4 种区分开）
- 测试：`test/agents.test.ts`、`test/runner.test.ts`、`test/table-helpers.ts`（`AgentDeps` 替身）。

**接口**：

```ts
// opponent.ts
export interface OpponentBase { name: string; prompt: string; memory: string[]; tag: UsageTag }
export function opponentAct(i: OpponentBase & { messages: Msg[] }, signal): Promise<CallResult<RawAct>>
export function opponentTalk(i: OpponentBase & { messages: Msg[] }, signal): Promise<CallResult<RawTalk>>
```

- `act` 的 schema 在最前面加 `think: z.string().optional().describe('你的真实盘算，一两句，只有你自己看得到')`。
- `talk` 的 schema 是 `{ say?: string（赛后说的话，不超过 30 字，不说留空）, note?: string（新观察，不超过 30 字） }`。
- `talk` 的调用参数：`purpose: 'talk'`、`maxRetries: 0`、`timeoutMs: 20_000`。
- system 使用 plan「对手 system」一节的原文，印象部分沿用现有格式。

**runner 改动**：

1. 新增字段：
   - `threads = new Map<string, Thread>()`：key 为 personaId，教练用 `'coach'`；
   - `talkCtrl = new Map<string, AbortController>()`。
   - `resetTable` 时清空两者，并 abort 所有 `talkCtrl`。
   - 删除 `results`。
2. 新增 `abortTalk(pid)`：abort 该 pid 的 `talkCtrl` 并删除，作为 `onCompress` 回调使用。
3. 对手决策（现有 `decide` 流程）：
   - 观察 = `situation(t, seats, seat, { chat })`；
   - `chat` 取公屏里 `thread.chatSeen` 之后、`kind === 'msg'`（只要发言，行动已经在「本手行动」里）且 `from !== pid` 的消息，过滤之后取最后 8 条；如果 `chatSeen` 为 null，或者那条消息已经被 `MAX_CHAT` 截掉找不到了，就从头取（仍然最多 8 条）；
   - `chatSeen` 只在 `pushTool` 成功后才推进，推进到观察那一刻 `this.chat` 最后一条消息的 id（不管这条是否被过滤掉）；调用失败后重试时，同一批公屏会重新出现；
   - `messages = thread.messagesFor(hand, obs, () => abortTalk(pid))`；
   - 成功后，在 `actionTaken` 之后调用：

     ```ts
     thread.pushTool(hand, obsWithRecap, 'act', r.args, { 实际: act, ...(say && { 公屏: say }) },
       `${STREET[street]} ${act}${think ? `（想：${think}）` : ''}${say ? `；说：${say}` : ''}`)
     ```

     其中 `obsWithRecap` 是 `messagesFor` 返回的最后一条 user 内容，直接取出来用，保证一致。
   - 删除对手决策时的 `equityFor` 调用和「本桌最近几手」。
4. 对手摘要：`text.ts` 新增 `opponentSummary(rec, pid)`，内容为：
   - `盲注 sb/bb`；
   - `位置：…`，来自 `rec.players[].pos`；名字规则与行动行相同（玩家写「玩家」，该对手自己写「你」）；
   - `行动：…`，来自 `rec.log`，按 `heroHandSummary` 的格式；名字这样写：座位 0 写「玩家」（记录里是「你」，不能照抄），该对手自己写「你」，其他人用公开名；
   - 最后接上 `publicHandResult(rec, pid)`。

   它不读 `holeAfter`。
5. `onHandEnd`：生成记录后：
   - 对本手在座的每个对手执行 `thread.setSummary(hand, opponentSummary(rec, pid), () => abortTalk(pid))`；
   - 对入过池的对手执行 `void this.talk(pid, seat, hand, rec)`。入过池的判定：`rec.log` 里有该座位在 preflop 的 call/bet/raise，或者 `rec.board.length >= 3` 且该座位不是在 preflop 弃牌的。
6. `talk()`：

   ```ts
   const ctrl = new AbortController(); this.talkCtrl.set(pid, ctrl)
   const obs = `${summary}\n\n第 ${hand} 手结束了，说一句赛后的话吧（调用 talk）。`
   const messages = thread.messagesFor(hand, obs, () => this.abortTalk(pid))
   const rid = this.runId
   const r = await agents.opponentTalk({ ..., messages }, AbortSignal.any([ctrl.signal, this.leaveCtrl.signal]))
   if (rid !== this.runId || this.talkCtrl.get(pid) !== ctrl) return
   this.talkCtrl.delete(pid)
   if (!r.ok || !r.args) return
   const say = r.args.say?.trim().slice(0, 40)
   if (!thread.pushTool(hand, 最后一条 user 内容, 'talk', r.args, say ? { 公屏: say } : {}, say ? `赛后说：${say}` : '赛后没说话')) return
   if (say) { this.push({ kind: 'msg', from: pid, text: `[第 ${hand} 手赛后] ${say}` }); 如果该座位还在桌上就 this.bubble(seat, say); this.broadcast() }
   const note = r.args.note?.trim().slice(0, 30)
   if (note) void addMemory(pid, note).catch((e) => console.error('addMemory failed', e))
   ```

   赛后发言期间不设 `thinking`，不改 `stalled`。
7. 对手决策前（`messagesFor` 的 `onCompress` 已覆盖新一手的情况），同一手内不会发生赛后发言，不需要额外处理。

**验证**（runner 和 agents 测试，使用替身）：
- 对手第二次决策时，messages 里包含第一次决策的 tool-call，其中有 `think`。
- 一手结束后，入过池的对手调用了 talk，翻牌前直接弃牌的对手没调用。
- talk 成功：公屏出现 `[第 N 手赛后]` 前缀；thread 里写入 talk 工具组；note 写入 `memory`（mock db 或替身）。
- talk 失败：牌局照常进行，没有横幅，thread 没有写入。
- 玩家点下一手、该对手还没被调用时返回的发言照常写入。
- 对手 A 第 N 手的赛后发言出现在对手 B 在第 N+1 手的观察里：在「新发言」里，带「[第 N 手赛后]」前缀。
- 该对手在新一手里第一次被调用时，在途的发言被中止，之后返回的结果不写入。
- 某个对手第 N 手的发言还在进行时，下一手结束写 `setSummary` 触发压缩，这条发言也被中止（例如它在第 N+1 手没被调用、直接结束的情况）。
- 替身 `AgentDeps.opponentTalk` 的默认值返回 `{ ok: true, aborted: false, text: '', args: {} }`，即不发言，避免干扰现有测试对公屏内容的断言。
- 现有的两条信息隔离测试（`runner.test.ts` 约第 287–338 行，读的是 `i.situation` 和「本桌最近几手」）迁移为读 `i.messages`。断言对象是本次观察（最后一条 user 消息里「【往手回顾】」之后的部分）以及其余各组。往手回顾里摊牌亮出的牌是合法信息，不能当成泄露。原来断言「本桌最近几手」出现的那条，改为断言往手回顾出现。
- 教练局一手结束后，对手 thread 里不含 `holeAfter` 信息。断言只看第 N 手相关的内容（第 N 手的观察和 talk 组，以及下一手往手回顾里 `[第 N 手]` 那一段），并匹配带上下文的字符串（例如「亮出 X」、弃牌者名字后面跟底牌），避免新一手的牌面碰巧相同造成误报。
- `opponentSummary` 的命名：对玩家写「玩家」，对自己写「你」，其他人用公开名；并且不出现「你」指代玩家的情况。
- `usage.summary` 的 purposes 里有 `talk`。

三条检查命令全部通过。

## 任务 T4：教练接入 thread

**目标**：讲解、提问、复盘都在同一条教练 thread 里；被打断时已显示的文字也会写入；复盘结合各家倾向。

**修改位置**：
- `src/main/agents/coach.ts`
- `src/main/table/runner.ts`
- 测试：`test/agents.test.ts`、`test/runner.test.ts`。

**接口**：

```ts
export function coachSpeak(o: CoachBase & { messages: Msg[] }, onDelta, signal)
export function coachAsk(o: CoachBase & { messages: Msg[] }, onDelta, signal)
export function coachRecap(o: CoachBase & { messages: Msg[] }, signal)
```

- 三者用同一份 `system(memory)`：现有内容，加上 plan「教练 system」一节的三种时刻说明。
- speak、ask、recap 的具体要求改由 runner 写进 user 观察：

| 用途 | user 观察 |
|---|---|
| 讲解 | `heroSituation(t)` 加 `\n现在轮到玩家决策。…`，沿用现有 guided / 非 guided 两种文案 |
| 提问 | `[第 N 手 <街>] <问题>\n回答一般不超过 150 字，除非玩家要求详细。`；如果 `heroSituation(t) !== thread.lastSituation`，前面加上 `当前局面（玩家视角）：\n…\n\n` |
| 复盘 | `heroHandSummary(rec)` 加 `\n这一手结束了，调用 recap 复盘。` |

- 讲解和带局面的提问写入后，`thread.lastSituation = heroSituation(t)`。
- 所有写入（`pushText`、`pushTool`）的 observation 一律用 `messagesFor` 返回的最后一条 user 内容，这条内容可能带着往手回顾。例如玩家这一手没有决策点时，复盘就是本手第一组，必须带上往手回顾。
- 教练的公屏：新发言作为独立的一段，拼在 `heroSituation` 之后（不并进局面文本，所以 `lastSituation` 的比较不受影响）。讲解和提问时，附上教练 `chatSeen` 之后的新发言（`kind === 'msg'`，来自对手，最多 8 条），规则与对手相同。`chatSeen` 在 `pushText` / `pushTool` 成功（包括「被打断」的写入）后才推进。
- `heroHandSummary` 的行动行里，玩家的名字统一写成「玩家」（记录里是「你」），和同一段里的「玩家底牌」一致。
- 回放页的 `review(handId)`：`messages = [{ role: 'user', content: heroHandSummary(rec) + 复盘要求 }]`，不经过 thread。

**runner 改动**：

1. 删除 `history`、`recent()`、`remember()`、`at()` 里用于历史的部分；教练的 thread 为 `threads.get('coach')`。
2. `speak`：
   - 结束时：如果 ok，`pushText(hand, obs, entry.text, \`讲解：${entry.text.slice(0, 60)}\`)`；
   - 如果被跳过或失败且 `entry.text` 不为空，`pushText(..., entry.text + '（被打断）', ...)`。
3. `runAsk`：规则同上，digest 为 `答玩家：…`。
4. `runRecap`：
   - 成功：`pushTool(hand, obs, 'recap', recap, { ok: true }, \`复盘：${headline}；下次记住：${tip}\`)`；
   - 在调用 recap 之前，先 `setSummary(hand, heroHandSummary(rec))`，放在 `onHandEnd` 里，与对手的 `setSummary` 在一起。
   - 复盘时 `hand` 仍是这一手，所以不会触发压缩。
5. 自由局没有教练，不创建教练 thread。

**验证**：
- 讲解之后提问：ask 的 messages 包含讲解的文本组。
- 讲解被 skip，而且已经有文字：之后的提问 messages 里有 `…（被打断）`。
- 讲解失败、而且没有文字：不写入；重试后 thread 里只有一组。
- 复盘之后在同一手提问：messages 里有 recap 的 tool-call，调用本身不带工具（替身能收到）。
- 下一手的第一次讲解：messages 只有一条 user，开头是「【往手回顾】」，包含上一手的 `heroHandSummary` 和 digest。
- 提问时局面没变：不重复附上局面。
- 回放页复盘：不读 thread。
- 玩家这一手没有决策点时（例如他是大盲、其他人全弃牌）：复盘就是本手第一组，写入的 observation 要带【往手回顾】；之后在同一手提问，messages 的第一组以【往手回顾】开头。
- 对手的发言出现在教练下一次讲解的观察里。

三条检查命令全部通过。

## 任务 T5：加注额输入框

**修改位置**：`src/renderer/src/components/table/ActionBar.tsx`。

**规则**：
- 中间显示数额的 `div` 改为 `<input inputMode="numeric">`，使用本地 `draft` 状态。
- `onChange`：只修改 `draft`。
- 回车、失焦：去掉逗号和空白后 `Number(...)`；结果不是有限数时回退到 `raiseTo`；否则 `setRaiseTo(clamp(Math.round(n)))`。回车后执行 `blur()`。
- Esc：`draft` 恢复为 `fmt(raiseTo)`，然后 `blur()`。
- `raiseTo` 变化时（±按钮、预设按钮、新的决策点重置），`draft` 同步为 `fmt(raiseTo)`；每次确认（回车、失焦）之后，不管 `raiseTo` 有没有变，都把 `draft` 重写为 `fmt(确认后的值)`。
- `!canRaise` 时 `disabled`，显示「—」。
- 样式沿用原来的 `min-w-[76px] text-center text-base font-semibold`，去掉边框和背景，获得焦点时加一个轻微的底色。

**验证**：
- 用 `pnpm dev`（Browser 或实机）检查：输入 1234 回车，加注额变为 1,234；输入超出全下的数值会夹到全下；输入 abc 回车回退到原值；Esc 回退；聚焦时按 F、C、R 不触发快捷键，失焦后恢复；不能加注时输入框禁用。
- web 类型检查通过。

## 任务 T6：Windows 顶栏

**修改位置**：`src/main/index.ts`、`src/renderer/src/components/TopBar.tsx`。

**规则**：
- `BrowserWindow` 的选项按平台区分：
  - `darwin`：保持 `titleBarStyle: 'hiddenInset'` 和 `trafficLightPosition`；
  - 其他平台：`titleBarStyle: 'hidden'`，`titleBarOverlay: { color: '#f7f7f5', symbolColor: '#1d1d1f', height: 52 }`。这里的颜色要与 `index.css` 中的 `--topbar` 同步，并在 `--topbar` 旁边加一条注释说明。
- 非 darwin 且 `app.isPackaged` 时，执行 `Menu.setApplicationMenu(null)`。
- `TopBar`：`const mac = navigator.userAgent.includes('Mac')`：
  - mac：保持 `pl-[88px] pr-4`；
  - 其他平台：`pl-4`，加上 `style={{ paddingRight: 'calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 16px)' }}`。

**验证**：
- macOS 上 `pnpm dev` 的顶栏与改动前一致（截图对比）。
- 两条类型检查都通过。
- Windows 打包版交给用户验证：没有系统标题栏和菜单；三个窗口按钮可用，底色一致；可以拖动；窗口宽度 880 时没有重叠。

## 任务 T7：知识文档与整体验证

**修改位置**：`.rivo/knowledge/README.md`。

**步骤**：

1. 按当前代码更新以下几处：
   - 系统结构图：删去 Mastra Memory、共用数据库文件，以及 `poker.ts`、`leak.ts` 等已经不存在的文件，改为实际的模块；
   - Agent 上下文：改为 Thread 机制；
   - 信息隔离。
2. 运行 `pnpm dev`，打开教练局和自由局，逐条执行 plan「实机验证」的第 1–4、6、7 条。第 5 条（Windows）交给用户。
3. 如果第 2 条（复盘之后提问）或「赛后发言始终不出现」失败，按 plan 的约定把 Thread 的渲染改为「只把本次注册的工具渲染成 tool-call」，并补测试。这一步要给 `messagesFor` 加一个参数 `tools: string[]`（本次注册的工具名），runner 的各个调用处跟着传入；写入契约不变。

**完成标准**：三条检查命令通过；实机各条都有记录（截图或日志），写在本节的「结果」下。

## 整体验证与交接

- 组合行为：教练局连续打 5 手以上，同时检查：位置和牌型准确，对手打法前后连贯，赛后发言出现在公屏上而且与它自己的想法相符，教练能接上讲解、结合倾向复盘，下一手按钮的节奏不受赛后发言影响。
- 兼容：旧的手牌记录在回放页可以正常打开和复盘；统计页显示 talk。
- 交付：列出改动文件、测试结果和实机证据，由用户决定是否提交。本任务不包含提交和发版。

## 实施结果（2026-09-25）

- **T1–T6**：均已实现。独立审阅记录见 reviews/T1-1、T1-2、T2-1、T2-2、T3-1～3、T4-1～3、T5-1、T6-1，结论均为通过。
- **T7 知识文档**：已按现状改写系统结构、信息隔离、Agent 运行规则三节，以及工程约束中与 Mastra 存储相关的部分。
- **终审**：reviews/final-1.md，代码层面通过。其中低严重度发现的处理：
  - F1：新发言夹带「第 N 手」分隔和重新买入，已修，并补测试、做了变异检查；
  - F2：删除未用的导入，已修；
  - F3：修正知识文档中失效的链接，已修；
  - F4：补了一条「本次请求不带工具时，历史里的 tool-call 照传」的 mock 测试，已修；
  - F5：往手回顾里手号重复，不修。`heroHandSummary` 在回放复盘中要单独使用，必须带手号，重复的只是几个 token。
- **检查**：两条 tsc 都通过；`npx vitest run` 共 132 条，全部通过。
- **未完成：实机验证**。用户拒绝了自动化控制 Electron 窗口，真实 DeepSeek 联调和 Windows 打包都交由用户验证，清单见 reviews/final-1.md「未完成的实机验证清单」。其中第 2 条（复盘后提问）或赛后发言始终不出现，任一失败，就按 plan 改为「只把本次注册的工具渲染成 tool-call」。
