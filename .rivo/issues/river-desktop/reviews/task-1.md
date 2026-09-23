# 任务审阅 1：River 桌面版实施任务（首稿）

## 被审对象与依据

| 项 | 版本 / 位置 |
| --- | --- |
| 任务 | `task.md` 首稿快照（466 行，T1–T9） |
| 方案 | `plan.md`（第 4 轮审阅通过并并入低优先级补充，592 行） |
| 用户决定 | `discussion.md` §1（第 5–30 行） |
| 其他 | `note.md`、`adr/001~003`、`reviews/plan-1~4.md`、`design-source/River.dc.html`（917 行） |
| 外部 API | `mastra-probe`：`@mastra/core` 1.69.0、`@mastra/memory` 1.31.0、`@mastra/libsql` 1.23.1 的类型声明 |

本轮是首轮，尚无实现。

## 结论：需修改

任务拆分和依赖顺序可行，plan 的大部分要求都有任务承接，引用的 Mastra 接口经核对都存在。但有 6 处需要在实施前补上：

- 泄牌过滤没有接入发言写入公屏的路径。
- 教练熔断、提问和复盘这三块的运行规则，在 T5 中基本空缺。
- 恢复牌局后会重复触发教练主动判断，可能反复暂停。
- 信息隔离的实现归属不清，T4 的隔离测试实际测的是替身。
- T1 把 safeStorage 从“失败即回到方案讨论”的门槛降成了“不阻塞”，验证方式也测不出真实风险。
- T9 缩小了 plan 规定的验收范围：打包产物中只要求打 2 手，plan 要求 10 手。

## 发现

### 中优先级（实施前需修改）

**M1 泄牌过滤没有接入公屏写入路径**

- 证据：plan 第 283 行规定“`say` 的泄牌过滤在应用意图时执行”。T4 只实现 `leak.ts`（task 第 233 行）。T5 的 `commitOpponent`（第 330 行）、赢家发言（第 338 行）和 `triggerReplies`（第 341 行）都把 `say` 直接写进公屏，没有调用过滤，也没有 40 字截断。T5 的验证清单里也没有相关测试。
- 后果：按任务实现后，泄牌过滤只是一个单测通过、但从未被调用的模块。对手发言会原样进入公屏和气泡，可能说出自己的底牌。
- 建议：在 T5 写明，三条发言路径都统一经过 `leak(text, 发言者底牌)`；返回 null 时按“无发言”处理，决策路径照常提交行动。T5 验证增加一条：发言包含自己底牌点数时，公屏只出现行动。

**M2 教练熔断、提问和复盘的运行规则缺失**

- 证据：plan 第 190–194 行规定，教练主动判断和提问的失败计入熔断，连续 3 次后停用。plan 第 336–337 行规定了提问的中断语义，以及复盘的去重、落库和失败推送。T5 只写了对手熔断的 `countFailure`（第 329 行），`onHeroTurn` 只检查 `trippedCoach`（第 332 行），没有写这个计数何时增加、何时清零。`hands.review` 只出现在命令表里（第 363 行），没有处理规则。`coach.ask` 也没有写教练未配置或已熔断时怎么返回。T5 的验证只覆盖对手熔断。
- 后果：
  - 教练熔断无法触发，plan 验收中“教练对应横幅”与“重试”无从实现。
  - 复盘被拒或被中止时，页面会一直停在“教练正在回看”（这正是 plan-4 P2 指出、plan 已补上的问题）。
  - 连续两次提问时，前一次提问在收尾时会执行 `askInFlight=false`，而此时后一次提问仍在进行，状态会错。
- 建议：在 T5 补一段“教练调度”：
  - proactive、ask 的超时和抛错计入 `breaker.coach`；被新提问中断或被离桌中止的调用不计入；任一次成功清零；达到 3 次时推送 `breaker` 事件。
  - `coach.ask` 在教练不可用时直接推送 `coach:done { ok:false, error }`。
  - `askInFlight` 按 `requestId` 判断，只由当前这次提问清除。
  - `hands.review` 的规则：同一手进行中时重复请求忽略；成功后 `saveReview`；失败、被中止、被 `Dropped` 时都推送 `review:done { error }`；离桌是否中止复盘要写明。
  - T5 验证补充：教练连续 3 次失败后熔断；复盘被拒时推送 error。

**M3 恢复牌局后重复发起教练主动判断，可能反复暂停**

- 证据：原型 `onHeroTurn` 第一行用 `heroKey` 去重（设计稿第 509 行：`if (this.heroKey === key) return`）。T5 只把 `heroKey` 列为状态（第 298 行），`onHeroTurn` 的描述（第 332 行）没有去重。plan 第 179 行规定，resume 时如果没有 `pendingAI` 就调用 `loop()`。
- 后果：教练在玩家回合暂停 → 玩家点“继续” → `loop()` → `onHeroTurn` 对同一个决策点再次调用 proactive。教练可能再次 `pause_game`，玩家因此一直无法行动。同一决策点还会重复消耗调用。
- 建议：T5 写明 `onHeroTurn` 在 `heroKey` 未变时直接返回，不重算，也不再调用教练。验证增加一条：教练暂停后 resume，不再发起第二次 proactive。

**M4 信息隔离的实现归属不清，T4 的隔离测试测的是替身**

- 证据：T4 的工具通过 `TableQuery.viewFor(seat)` 取视图，而 `TableQuery` 注明“由 T5 的 TableRunner 实现”（第 160 行）。`SeatView` 类型在任何任务中都没有定义。T4 却要验证“对手 `view_table` 不含其他座位底牌、`view_hero` 只含座位 0 底牌”（第 279 行）。T4 在 T5 之前完成，只能用自己写的假 `TableQuery` 来测。
- 后果：
  - 真正决定裁剪结果的 `viewFor` 在 T5 实现，T5 的验证里只有 `TableView` 不泄牌（第 383 行），没有覆盖 `viewFor`。
  - 按现在的写法，对手工具的信息隔离（ADR-001 的核心保证）没有任何测试覆盖真实实现。
  - `SeatView` 的字段由两个任务各自猜测。
- 建议：
  - 把 `viewFor(game, seat)` 和 `equityFor` 写成 T4 负责的纯函数，放在 `table/view.ts` 或 `agents/tools.ts`，由 T4 直接对真实 `Game` 测试。T5 只负责把它们挂到 `TableQuery` 上。
  - 在 `types.ts` 中定义 `SeatView`，字段取 plan 第 272 行。

**M5 T1 把 safeStorage 从阻塞门槛降为“不阻塞”，验证方式也测不出真实风险**

- 证据：plan 第 590 行把“`safeStorage` 在未签名应用中重新构建后的可用性”列为首个验证任务的确认项，写明“失败时回到方案讨论”。T1 第 75 行改成了“若失败，记录现象并按 plan 处理（提示重新输入 key），不阻塞”。另外，T1 第 5 步只做“重新 `pnpm build` 并启动”，也就是开发环境下的 Electron 二进制。
- 后果：
  - 这等于替用户接受了“每次重装或升级后都要重新输入 API key”这种产品结果，改变了已批准的处理方式。
  - 开发环境的 Electron 二进制签名不变。真正的风险出在打包产物：未签名或 ad-hoc 签名的应用，每次构建签名身份可能都会变，导致钥匙串拒绝解密。开发环境下重新构建必然能通过，无法区分正确与错误。
- 建议：
  - 验证改为在打包产物中进行：安装第 1 版 → 保存 key → 修改版本号后重新打包、覆盖安装 → 解密。
  - 失败按 plan 的规定处理：停下来，回到方案讨论，由用户决定是否接受“重装后重输 key”。

**M6 T9 缩小了 plan 规定的验收范围**

- 证据：plan 第 46 行的验收要求是“在 macOS arm64 打包产物中”配置真实提供方完成 6 人桌至少 10 手，并在其中验证断网熔断和关闭重开后数据仍在。T9 第 2–4 步没有说明在哪个环境进行（从顺序看是开发环境）；第 5 步只要求在打包产物中“重复第 2 步的前两手”。
- 后果：
  - 开发环境下 `userData` 路径和应用名不一定是 `River`，“重开后数据仍在”可能验证的是另一个目录。
  - 打包产物特有的问题（asar、原生模块、ESM、钥匙串）只经过 2 手检验，验收证据达不到 plan 的标准。
- 建议：T9 第 2–4 步明确在安装后的 dmg 产物中执行，并检查 `~/Library/Application Support/River/river.db`。开发环境只作为预演。

### 低优先级（实施时顺手处理）

| # | 问题 | 证据 | 后果 / 建议 |
| --- | --- | --- | --- |
| L1 | 托管时“强制取预设台词”与 plan 的“按原型规则随机取”不一致；赢家 agent 选择不说话时也取预设台词，plan 没有这条规则 | task 328、338 行；plan 188、394 行；原型 `aiAct` 失败时调用 `canned(id, type)`，不强制 | 改变了托管和赢家的发言频率。建议按 plan 和原型执行，或者写明这是有意调整并记录到方案 |
| L2 | 伪代码中 `say` 的类型不一致：预设台词是 string，LLM 返回的是 `{text,kind,replyTo}`；`useLLMForOpponents()` 在 await 前后各求值一次 | task 315–320 行 | 调用期间点“重试”或配置发生变化时，`res=null` 也会被计为失败。建议只求值一次并保存结果；`say` 统一使用一种结构 |
| L3 | 10 秒决策时限的计时起点不明：注释写在 `fn` 内，而 plan 要求等待抢占的 2 秒计入 10 秒 | task 315 行；plan 249 行 | 实际时限可能变成 12 秒。建议写明计时器在调用 `queue.run` 之前启动，并用 `AbortSignal.any` 合并队列 signal 与计时器 signal |
| L4 | `needsKey` 和 `supportsRequired` 在 T3 中没有写入途径：没有更新函数，也没有 needs_key 列 | task 138–139、246–248 行 | `testProvider` 的结果无法持久化，`needsKey` 无法通过 `listProviders` 返回。建议 T3 增加 `setSupportsRequired`；`needsKey` 写明是主进程内存标记，由 `listProviders` 合并返回 |
| L5 | `resolve.ts` 直接使用 `safeStorage`，与“T4 可在无 Electron 的 vitest 中测试”矛盾 | task 149、241、284 行 | 建议与 T3 一样注入 decrypt，或在测试中 `vi.mock('electron')`；同时写明 `settings`/`providers` 从哪份同步缓存读取 |
| L6 | `HandRecord` 类型没有指定由哪个任务定义，而 T3 和 T4 在 T5 之前就要用到 | T3 修改位置、T5 第 294 行 | 建议 T3 在 `types.ts` 中按 plan 第 467–480 行定义 `HandRecord` |
| L7 | `hand_history` 的数据来自 `river_hands.record`，其中 `record.hero` 和玩家的 `hole` 总是保存玩家底牌 | plan 478 行；原型 `rec` | 如果只按 `players[].hole` 过滤，玩家没有摊牌的底牌仍会通过 `record.hero` 泄露给对手。建议 T4 明确去掉 `hero` 字段，测试用例中包含玩家弃牌的一手 |
| L8 | `coachReview(handRecord, signal)` 拿不到 `handId`，无法用于 thread 命名；`readOnly` 下不保存消息 | task 271 行 | 建议签名改为接收 `handId` |
| L9 | T5 没有写明谁产生 `agent:last` 和 bootstrap 的 `lastCall`；`coachThread` 不在 TableRunner 的状态中；`coach:alert` 何时清空（原型在下一手清空）也没有写 | task 298、347、368 行 | 重载恢复和设置页的“最近调用”会各自猜测。建议补进 T5 的状态和规则 |
| L10 | `table.start` 在已有牌桌时没有写明退回原桌筹码（原型 `back`）；`before-quit` 中 `leave()` 是异步的，没有写明需要先 `preventDefault` 并等待写库完成 | task 370 行；原型 `startTable`；plan 181 行 | 可能导致余额丢失。建议补上这两条 |
| L11 | T2 导出列表缺少 `showdown/progress/dealStreet`，但对照测试要比较 `showdown`；T3 没有说明原型字段 `p` 映射为 `profile` | task 88、111、124 行 | 容易造成误解，建议补上 |
| L12 | 安装包文件名写法不一致：`River-<ver>` 与 plan 的 `river-<version>` | task 74、463 行；plan 586 行 | 统一一种写法即可 |
| L13 | `heroAct` 的校验（非玩家回合、暂停中拒绝；`toCall=0` 时 fold/call 转为 check）和 `resume` 的提交条件（`toAct` 仍为该座位且未结束）没有写进 T5 | 原型 `heroAct`、`resume`；plan 131、179 行 | 建议写入 T5 |

## 已核对无问题的部分

- plan 各节的承接情况：
  - 牌局引擎：T2。
  - 数据表与默认值：T3，与原型一致。
  - 模式参数表、工具表、Memory 模板和 resource/thread 命名：T4，与 plan 逐项一致。
  - 公屏 `triggers` 判定表：T5 第 330、338、341 行，与 plan 第 369–377 行一致，已体现用户决定的“发言类型由工具参数声明”和“赢家发言会引起回应”。
  - 页面：T6–T8，覆盖 plan 的页面表。
  - 规则引导第 6 页与未配置时的对话框：T6。
- 设计稿行号引用（41–153、155–186、188–204、206–250、299–308、511–514、521–524、589–590、697–704、724–728、732、737、795、800–804、832、865–866、894–911）都指向对应内容。教学牌局配置（3 人、盲注档 0、`['bai','zen']`）与原型第 817 行一致。
- Mastra API：
  - `agent.getMemory()`（异步）、`memory.listTools()`、`listThreads`、`deleteThread`、`updateWorkingMemory`、`saveMessages`、`createThread` 都存在。
  - `createTool` 的 `execute(inputData, context)` 中有 `context.requestContext`。
  - generate 选项 `maxSteps/toolChoice/abortSignal` 存在。
  - memory 选项 `readOnly` 存在。
  - `PROVIDER_REGISTRY` 从 `@mastra/core/llm` 导出，`ProviderConfig` 带 `name` 和 `models`，可以支撑 `provider.registry` 命令。
- 新增的 `hands:changed` 事件和 `provider.registry` 命令是 plan 能力的必要落地，不改变设计。
- 依赖顺序：T2、T3 并行 → T4 → T5 → T6/T7/T8 → T9，可行。T1 作为门槛。
- 保留了用户的方向与限制：不用 Workflow、单一 SQLite、主进程引擎、托管标记、健谈度、首发 macOS arm64。

## 检查限制

- 只阅读了文档和 Mastra 的 `.d.ts`，没有运行代码。`stopWhen` 在 1.69 generate 选项中的确切字段位置，沿用了 plan 中“已用假模型验证”的结论，这次没有重新核对。
- 没有获取 `poker.js` 原文（设计项目文件，由 T1 拉取），T2 的导出列表与原型函数名是否完全一致无法核对。
- 没有核实 DesignSync `get_file` 的调用名和参数。
- 健谈度映射（台词概率 0.08/0.22/0.45 的阈值，以及 instructions 中的三档描述）属于 AI 在委托范围内的填充，plan 只给出了示例。这次视为可以接受，没有作为问题提出。
