# 任务审阅 2：River 桌面版实施任务（第 2 轮）

## 被审对象与依据

| 项 | 版本 / 位置 |
| --- | --- |
| 任务 | `task.md` 第 2 轮快照（504 行，修改时间 2026-09-24 00:40，T1–T9） |
| 方案 | `plan.md`（592 行，第 4 轮审阅通过版） |
| 用户决定 | `discussion.md` §1 |
| 前轮报告 | `reviews/task-1.md`（6 条中优先级 M1–M6，13 条低优先级 L1–L13） |
| 其他 | `design-source/River.dc.html`（原型 `canned` 第 376–381 行、`nextHand` 第 415–423 行、`aiAct`/`resume`/`heroAct` 第 443–492 行、`onHeroTurn` 第 506–518 行、泄牌 第 589–590 行、`onHandEnd` 第 612–631 行）；`mastra-probe` 中 `@mastra/core` 类型声明 |

## 结论：通过

前轮 6 条中优先级都已处理，处理方式与 plan 一致，没有替用户改变已批准的决定。13 条低优先级中 12 条已处理，L9 基本处理。本轮修订没有引入契约冲突，也没有偏离 plan。

新发现 8 条，都是低优先级：影响范围局限在单个函数或单条规则，改法明确。其中 N1（`needsKey` 不清除）和 N2（新桌沿用旧 `heroKey`）会造成用户可见的错误，建议实施 T4、T5 时一并补上。它们不影响任务拆分、依赖顺序或跨任务契约，因此不阻塞实施。

## 前轮问题处理情况

### 中优先级

| # | 前轮问题 | 本轮处理（task 行号） | 结果 |
| --- | --- | --- | --- |
| M1 | 泄牌过滤没有接入公屏 | 351 行：`commitOpponent` 在写公屏前先经 `leak.ts`（泄牌整句丢弃，超过 40 字截断）；352 行：decide、chat、win 三条路径都必须经过过滤；374 行：chat 结果同样过滤；417 行：新增三种模式的泄牌测试 | 已处理 |
| M2 | 教练熔断、提问、复盘规则缺失 | 356 行：proactive 成功清零；超时或抛错计数；被 ask 抢占或因离桌中止不计。359 行：ask 使用 `requestId` 与 `askId`，被抢占时返回 `interrupted`，只由当前这次提问清除 `askInFlight`。360 行：熔断后 ask 立即返回 `breaker`。363 行：复盘去重，成功后 `saveReview`；失败、中止或被 `Dropped` 时都推送 error。418 行：新增对应测试 | 已处理（遗留两处小缺口，见 N4） |
| M3 | 恢复牌局后重复发起 proactive | 356 行：`heroKey` 未变时直接返回，与原型第 509 行一致；418 行：新增“resume 后不再调用教练”的测试 | 已处理（新桌时的边界情况见 N2） |
| M4 | 信息隔离的实现归属不清，测试测的是替身 | 160–172 行：`views.ts` 由 T4 负责，提供 `SeatView`、`buildSeatView`、`publicHandResult`；173–177 行：`TableQuery` 由 T5 调用这些函数；295 行：用 T2 的真实引擎状态测试，覆盖摊牌、弃牌、全下 | 已处理 |
| M5 | safeStorage 验证被降为不阻塞 | 64 行：在打包产物中安装后保存 key，修改版本号重新打包、覆盖安装，再解密；75–76 行：失败时回到方案讨论，由用户决定 | 已处理，与 plan 第 579、590 行一致 |
| M6 | T9 验收范围缩小 | 496 行：第 2–4 步都在安装后的打包产物中进行，开发环境只作预演；498 行：6 人桌至少 10 手 | 已处理 |

### 低优先级

| # | 本轮处理（task 行号） | 结果 |
| --- | --- | --- |
| L1 | 348 行：`canned` 按原型概率抽取，托管和本地引擎都可能不说话；372 行：赢家选择不说话就不说，只在失败、熔断或被丢弃时取预设台词，与 plan 第 394 行一致 | 已处理 |
| L2 | 330 行：`useLLM` 只求值一次；346 行：统一 `Say` 结构 | 已处理（结构映射的缺口见 N3） |
| L3 | 333–335 行：计时器在 `queue.run` 之前启动，并用 `AbortSignal.any` 合并 | 已处理 |
| L4 | 140 行：新增 `setSupportsRequired`；`needsKey` 为主进程内存标记，由 `listProviders(needsKeySet)` 合并返回 | 已处理（清除时机见 N1） |
| L5 | 254、259 行：注入 `decrypt`，数据取自 T3 的同步缓存 | 已处理 |
| L6 | 124 行：T3 定义 `HandRecord` | 已处理 |
| L7 | 172、193 行：不含 `rec.hero` 和未亮出的底牌；295 行：测试包含玩家弃牌、未亮牌的手 | 已处理 |
| L8 | 285 行：`coachReview(handId, handRecord, signal)` | 已处理 |
| L9 | 289 行：`onCall` 转成 `agent:last` 和 `lastCall`；361 行：`coachThread`；362 行：`coach:alert` 在下一手清空，与原型第 422 行一致 | 基本处理（`coachThread` 和 `leaveSignal` 没有列入 314 行的状态表，见 N6） |
| L10 | 403 行：`table.start` 先退回原桌筹码；`before-quit` 先 `preventDefault`，`await leave()` 后再退出 | 已处理 |
| L11 | 88 行：补充导出 `progress/dealStreet/showdown/best`；125 行：`p` 映射为 `profile` | 已处理 |
| L12 | 74、501 行：文件名统一为 `River-<version>-arm64.dmg`，与 plan 第 586 行一致 | 已处理 |
| L13 | 353 行：`resume` 提交需满足 4 个条件；354 行：`heroAct` 的校验与转换规则 | 已处理 |

## 跨任务契约核对

| 契约 | 核对结果 |
| --- | --- |
| T4 `views` 与 T5 `viewFor` | T5 的 `TableQuery.viewFor(seat)` 内部调用 `buildSeatView`，`view_hero` 等于 `viewFor(0)`，签名一致。`SeatView.players[].tag` 满足 plan 第 326 行“对手只含公开信息与角色标签”。`equityFor` 只用本人底牌，没有隔离风险 |
| `publicHandResult` 两处复用 | `hand_history` 与每手结果消息（368 行）共用。`HandRecord.players[].hole` 对玩家总是非空（原型第 626 行），所以“是否亮牌”必须按 `showdown && !folded` 判断，不能按 `hole != null` 判断。295 行的测试已覆盖“玩家未亮牌”，能发现这个错误 |
| `Say` 与 `IntentCollector.say` | 结构不一致，见 N3。`IntentCollector.say` 缺少 `source`，TypeScript 类型检查会报出，但应在任务中写明映射方式 |
| `canned` 返回 null | 341–342 行把 `say` 为 null 的情况按“只有行动”处理（`kind:'act'`）；`resume` 提交挂起结果时 `say` 同样可能为 null，一致。赢家的 `canned` 返回 null 时不说话，符合原型概率规则 |
| `AbortSignal.any` / `AbortSignal.timeout` | `timeout` 自 Node 17.3 起可用，`any` 自 Node 20.3 起可用。Electron 29 及以上内置 Node ≥ 20.9，任务要求“最新稳定版”，满足。本机 Node 24.19 两者都可用。但任务写的“Node ≥ 20”不严谨，vitest 在 Node 20.0–20.2 上会缺少 `any`；另外 `AbortSignal.timeout` 不受 vitest 假定时器控制，见 N5 |
| 熔断事件 | 401 行 `breaker {opponent,coach}` 与 plan 第 536 行的布尔负载一致；状态中另有计数，不冲突 |
| T3 仓储与 T4 解析 | `settingsCache`、`providersCache` 与 `resolveModel` 的同步读取对得上；`deleteProvider` 清空 models，与 plan 第 523 行一致 |
| 依赖顺序 | 与首轮相同，可行：T2、T3 并行 → T4 → T5 → T6/T7/T8 → T9 |

## 新发现（低优先级，实施时顺手处理）

| # | 问题 | 证据 | 后果 / 建议 |
| --- | --- | --- | --- |
| N1 | `needsKey` 只有置位规则，没有清除规则 | 140 行（T4 置位）；260 行（`modelReady` 遇 `needsKey` 返回 false） | 钥匙串变化后，用户按设置页提示重新输入 key，`needsKey` 仍在，该提供方直到重启都按“未配置”处理，而 plan 第 425 行暗示重新输入即可恢复。建议：`provider.save` 带新 `apiKey` 时从 `needsKeySet` 删除该 id |
| N2 | 新桌开始时没有重置 `heroKey` | 314、356 行；原型 `nextHand` 在第 420 行执行 `heroKey = null` | 手号在新桌从 1 重新开始。如果在教学牌局第 1 手轮到玩家时离桌，再重开教学牌局，key 同样是 `1-<log.length>`。`onHeroTurn` 会直接返回：不计算概率，不发起教练提醒，默认加注额也沿用旧值。建议在 `nextHand`（或 `table.start`）中清空 `heroKey` |
| N3 | `Say` 与 `IntentCollector.say` 缺少映射 | 179 行 `say` 没有 `source`；337 行 `say = res.intents.say`；351 行 `triggers` 依赖 `say.source === 'llm'` | 如果为了通过类型检查只做类型断言，decide 模式下的 free 发言将永远不会引起回应，违反用户决定的“主动发言引起回应”。建议在 337 行写明 `{ ...res.intents.say, source:'llm' }`；chat 和 win 路径同样处理 |
| N4 | 教练规则还有两处小缺口 | 359 行没写 ask 成功后清零 `breaker.coach`（plan 第 190 行规定“任一次成功清零”）；360 行只写了熔断后的处理，没写教练模型未配置时 ask 返回什么 | 前者会让“提问成功、主动判断失败”交替出现时计数不清零，提前熔断。后者由界面兜底（教练栏显示“配置模型后可用”），但主进程应返回 `coach:done {ok:false}`。建议各补一句 |
| N5 | 超时测试在 vitest 中难以执行 | 333 行使用 `AbortSignal.timeout(10_000)`；409 行测试“假 agent 延迟 11 秒 → 托管，连续 3 次 → 熔断” | `AbortSignal.timeout` 使用 Node 内部定时器，vitest 的 `useFakeTimers` 控制不了它。真实等待需要 33 秒以上，超过 vitest 默认 5 秒的用例超时。建议改用 `AbortController` + `setTimeout`（可以被假定时器控制），或把时限作为参数注入；同时把 Node 下限写为 ≥ 20.3 |
| N6 | 状态表与伪代码的字段不一致 | 314 行 `pendingAI {seat,intents,autopilot}`，341 行实际是 `{seat,hand,logLen,action,say,autopilot}`；335 行的 `leaveSignal` 以及 361 行的 `coachThread`、`askId` 没有列入状态表 | 以伪代码为准即可。需要注意：`leaveSignal` 一旦中止就不能复用，`table.start` 时必须新建，否则新桌的所有调用一开始就被中止，全部进入托管。建议在状态表中补上这些字段，并写明 `leaveSignal` 在每次入座时重建 |
| N7 | 403 行的 `coach.ask` 描述与 359 行矛盾 | 403 行写“结束 `askInFlight=false`”；359 行写“只有 `askId === requestId` 时才清除” | 这是前轮修订后残留的旧文字。以 359 行和 418 行的测试为准；建议删除 403 行中的这一句 |
| N8 | 赢家发言晚到时没有做过期检查 | 369 行 | 赢家发言最长 8 秒，自动下一手在 4.5 秒后开始。如果下一手该对手的决策抢占了赢家发言，就会走预设台词分支，在新一手的公屏里出现“赢牌”台词。建议在赢家发言返回时检查 `runId` 与手号，已经过期就丢弃（不补预设台词） |

## 已核对无问题的部分

- 泄牌规则（246 行）与原型第 589–590 行一致：T 视为 10；数字按非数字边界匹配；字母按非字母边界匹配，且前一字符不能是“老”。
- `canned` 的概率映射（0.08/0.22/0.45）与原型第 377 行的三档数值一致，把全局话痨设置换成角色健谈度，符合用户“靠人设”的决定。
- `resume` 的提交条件（353 行）比原型第 472 行多了手号和行动序号的校验，更严格，与 plan 的 `stillValid` 一致。
- `heroAct` 的规则（354 行）与原型第 479–490 行一致。
- 托管时丢弃已收集的 `say`（340 行覆盖为 `canned`），与 plan 第 279 行一致。
- 本地引擎模式不标托管（340 行 `!useLLM` 分支 `autopilot=false`），与 plan 第 428 行一致。
- `before-quit` 重入：`leave()` 完成后已经无桌，再次调用 `app.quit()` 不会再次 `preventDefault`，不会死循环。
- Mastra 的 `memory.listThreads({ filter: { resourceId } })` 与 `@mastra/core` 类型声明（`memory.d.ts` 第 144 行）一致。
- 用户决定没有被改动：托管标记、限一层回应、工具声明发言类型、赢家发言会引起回应、健谈度、不用 Workflow、单一 SQLite、首发 macOS arm64。

## 检查限制

- 只阅读了文档、原型 HTML 和 Mastra 的 `.d.ts`，没有运行代码。
- 仍然没有 `poker.js` 原文（由 T1 拉取），T2 导出的函数名以 plan 和任务的描述为准。
- Electron 各版本内置的 Node 版本凭已知发布信息判断，本机没有安装 Electron，无法实测。`AbortSignal.timeout` 不受 vitest 假定时器控制，同样是基于 Node 与 sinon fake-timers 的已知行为判断，没有写用例验证。
- 没有重新核对 `stopWhen`、`readOnly`、`PROVIDER_REGISTRY` 等 Mastra 接口，沿用前轮的核对结论。
