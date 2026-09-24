# 任务审阅 3：River 桌面版实施任务（第 3 轮，复审）

## 被审对象与依据

| 项 | 版本 / 位置 |
| --- | --- |
| 任务 | `task.md` 第 3 轮快照（511 行，修改时间 2026-09-24 01:34） |
| 方案 | `plan.md`（592 行，第 4 轮审阅通过版） |
| 用户决定 | `discussion.md` §1（另查第 96–101、154–158 行的调度与赢家发言原文） |
| T1 结论 | `note.md` “T1 实测结论”段；`reviews/T1-1.md`；`evidence/T1/`；`src/main/{index,spike}.ts` |
| 前轮报告 | `reviews/task-2.md`（通过，低优先级 N1–N8） |

## 结论：通过（T2–T8 可继续）；T9 第 6 步须在执行 T9 前改写

N1–N8 都已落实。T1 的发现（pnpm 布局、`memory:{thread,resource}`、`toolCalls` 结构、开发环境 userData 隔离、`ELECTRON_RENDERER_URL`、spike 去留）也都写进了对应任务。T4/T5 的契约仍然一致。`deadline()` 在 `queue.run` 之前启动，所以 2 秒抢占等待计入 10 秒时限，与 plan 第 249 行和 discussion 第 101 行一致。

新发现 1 条中优先级（P1）：T9 第 6 步的清理步骤时机前后矛盾、表述有歧义，按字面执行可能清掉验收时产生的正式数据，或者让已保存的 API key 无法解密。它只影响 T9，不阻塞 T2–T8。另外有 8 条低优先级。

## 前轮问题处理情况（N1–N8）

| # | 本轮处理（task 行号） | 结果 |
| --- | --- | --- |
| N1 `needsKey` 清除 | 264 行：`provider.save` 带新 key 且保存成功后清除 | 已处理。清除动作写在 T4 `resolve.ts` 的注释里，但实际要在 T5 的 IPC 处理函数中执行，见 L5 |
| N2 新桌 `heroKey` | 360 行：新桌入座与 `nextHand()` 时清空 | 已处理，与原型第 420 行一致 |
| N3 `Say` 映射 | 341 行 `{ ...res.intents.say, source:'llm' }`；chat 和 win 的 `triggers` 由 375、380 行直接指定，不依赖 `source` | 已处理 |
| N4 教练两处缺口 | 365 行：ask 成功后清零；未配置时返回 `not_configured` | 已处理（顺序和事件时机见 L4） |
| N5 超时可测、Node 下限 | 7 行改为 Node ≥ 20.3；334、337 行：`this.limits.decide` 加 `deadline()`（AbortController + setTimeout），能被假定时器控制 | 已处理（`limits` 缺少 win，见 L3） |
| N6 状态表 | 318 行补上 `pendingAI` 的完整字段、`askId`、`coachThread`、`leaveController`、`limits`、`lastCall`；360 行：每次入座新建 `leaveController` | 已处理 |
| N7 `coach.ask` 旧描述 | 409 行改为“规则见上文” | 已处理 |
| N8 赢家发言过期 | 378 行：`runId` 或手号变化时丢弃，不补台词 | 已处理，但与同段第 375 行和 plan 原文有出入，见 L1、L2 |

## T1 发现的落实

| T1 发现 | 本轮落实（task 行号） | 结果 |
| --- | --- | --- |
| pnpm 默认 isolated 布局，配置写在 `pnpm-workspace.yaml` | 68、80 行 | 已落实 |
| 最短发布时长豁免（A3）、postinstall、preload `.cjs`、vite ^7 | 80 行 | 已落实 |
| 被中止的 generate 也必须传 `memory:{thread,resource}` | 295 行 | 已落实，与 `spike.ts` 第 101–117 行的实测一致 |
| `toolCalls` 结构 | 216、295 行按 `c.toolName` 判断 | 已落实。证据只证明了 `toolName` 在顶层（`stopWhenStoppedAfterFirstStep`），没有证明 `args` 字段名；任务里没有用到 `args`，不影响执行 |
| 开发与打包共用 userData（A2） | 146 行：开发环境改用 `River-dev` | 已落实（ESM 导入提升的风险见 L6） |
| `ELECTRON_RENDERER_URL`（Q2） | 409 行：仅在 `!app.isPackaged` 时使用 | 已落实 |
| spike 的去留（A1） | 81 行；T9 第 6 步 | 去留已写明；清理步骤有问题，见 P1 |
| Gatekeeper 安装路径（E2） | T9 第 5 步没有写 | 未落实，见 L8 |
| preload 注释（S1） | 未提及 | T5 会重写 preload，自然消除，可以忽略 |

## 跨任务契约核对（T4/T5 为重点）

| 契约 | 结果 |
| --- | --- |
| T4 时限表与 T5 `limits` | 时限表中 decide 10s、chat 8s、proactive 12s、ask 30s、review 45s 与 `limits {decide,chat,proactive,ask,review}` 对得上。win 8s 在 `limits` 里没有对应键（L3） |
| `deadline` 与抢占等待 | 337 行在 `run` 之前启动，并通过 `AbortSignal.any` 合并传入 `fn`。被抢占的旧任务最多等 2 秒，这段时间计入时限，与 plan 第 249 行一致。proactive 和 ask 同样在 run 之前启动（362、365 行） |
| 超时判定 | 295 行“看计时器是否触发”：`deadline()` 返回的信号可以用 `.aborted` 判断。342 行用 `leaveSignal.aborted` 排除离桌造成的中止。每个 persona 只有自己的 decide 会抢占自己的 decide，正常流程下不会出现，计数没有歧义 |
| `IntentCollector.say` 与 `Say` | 映射已写明（341 行），一致 |
| `opponentDecide(ctx, signal)` 签名 | 与 339 行的调用一致 |
| `onCall` 与 `lastCall`、`agent:last` | 293、318、409 行一致 |
| `views.ts` 与 `TableQuery` | 与上轮一样，没有变化 |
| 依赖顺序 | 没有变化，可行 |

## 新发现

### 中优先级

| # | 问题 | 证据 | 后果 | 建议 |
| --- | --- | --- | --- | --- |
| P1 | T9 第 6 步的清理步骤时机矛盾、表述有歧义、无法照做 | 508 行：这一步放在“验收通过后”，括号里却写“验收前先备份并清空”；“钥匙串条目 River Safe Storage 以外的测试数据”既可以理解为“保留钥匙串”，也可以理解为“连同钥匙串一起清理”；“清空 T1 写入的 spike 数据”在 `river.db` 内无法按条目区分（spike 写的是 `spike-thread`/`spike-user` 记忆、44 张 mastra 表，另外还有 `spike-key.bin` 和 `spike-result.json`） | ① 如果在验收后按字面“清空”`~/Library/Application Support/River`，会删掉第 2–4 步产生的余额、手牌、复盘和记忆，也就是交给用户的正式数据。② 如果删掉钥匙串条目，正式版已保存的 API key 全部无法解密，全部进入 `needsKey`（spike 与正式版用的是同一个 “River Safe Storage” 密钥）。③ 如果验收前不清理，验收时会带着 spike 残留，`~/Applications/River-spike/River.app` 与新装的 River 同名、同 bundle id，打开的可能是旧的 0.1.1 版本 | 拆成两步写清楚。**第 5 步安装前**：退出所有 River 进程；删除 `~/Applications/River-spike/`；把 `~/Library/Application Support/River` 整个目录移到备份位置。从 T3 起开发环境改用 `River-dev`，所以此时这个目录里应该只有 T1 的产物，移动前请用户确认。**保留**钥匙串条目 “River Safe Storage”。**第 6 步验收后**：只移除 `spike.ts` 及其入口，然后重新打包，不再动 userData 和钥匙串 |

### 低优先级

| # | 问题 | 证据 | 建议 |
| --- | --- | --- | --- |
| L1 | 赢家发言规则在同一段中前后矛盾 | 375 行“成功且有 say → …；**否则**取预设 win 台词”；378 行“选择不说话时就不说话，不补预设台词” | 把 375 行的“否则”改为“调用失败、熔断或被队列丢弃时”，与 378 行和 plan 第 394 行一致 |
| L2 | 过期检查与“被丢弃时补台词”的先后没有写明，并且在“被下一手抢占”这种情况下与 plan、discussion 原文不同 | 378 行；plan 第 249 行、discussion 第 101 行写的是“赢家发言被丢弃时改用预设台词” | 写明先做过期检查（下一手已开始就直接丢弃）。这一点收窄了 plan 的行为（避免新一手的公屏出现“赢牌”台词），应在 T5 结果中记录为对 plan 的偏差，或同步修订 plan 第 249 行 |
| L3 | `limits` 缺少 win | 318 行 `limits` 有五个键；375 行 win 8s | 补上 `win`，或写明“win 与 chat 共用 `limits.chat`” |
| L4 | `coach.ask` 未配置或已熔断时，处理顺序和事件发出时机没有写 | 365–366 行：先 `paused=true`、`askInFlight=true`，才写“未配置时立即返回”；`coach:done {ok:false,error:'not_configured'}` 没有 `requestId`；事件可能在 `invoke` 返回 `requestId` 之前就到达 Renderer | 写明先检查“未配置 / 已熔断”，这两种情况下不暂停、不设置 `askInFlight`；事件带上 `requestId`，并在命令返回之后再推送（或者直接通过返回值告知）。否则熔断后提问，牌局会被暂停，教练栏可能一直显示“正在看牌” |
| L5 | `needsKey` 清除的执行位置 | 264 行写在 T4 `resolve.ts` 注释中；T3 的 `saveProvider` 拿不到 `needsKeySet` | 在 T5 的 `provider.save` 行写明：保存成功后调用 T4 提供的清除函数 |
| L6 | 开发环境 userData 隔离可能因 ESM 导入提升而失效 | 146 行要求在 `whenReady` 前调用 `setPath`；T3 的修改位置不含 `src/main/index.ts`；ESM 会先执行所有被导入模块的顶层代码，再执行 `index.ts` 的函数体 | 写明：`setPath` 放在 `index.ts` 最先导入的独立模块中，或者要求 `db/index.ts`、`agents/mastra.ts` 不在模块顶层调用 `app.getPath`（在 `whenReady` 之后按需创建）。否则开发数据仍会写入正式目录 |
| L7 | T7 “把对手时限设 1ms 验证” 没有入口 | 474 行；`limits` 只在测试中注入 | 写明是临时改代码，或者通过开发环境变量覆盖 `limits` |
| L8 | Gatekeeper 首启路径（T1-1 的 E2）没有进入 T9 | T9 第 5 步只写了“安装” | 补充：从 dmg 拖到 `/Applications`，带 quarantine 属性首次启动，并记录用户需要进行的放行操作（未签名应用） |

## 已核对无问题的部分

- `resume` 的提交条件、`heroAct` 的校验、泄牌过滤覆盖三条路径、`canned` 的概率，都与上轮一致，没有被改动。
- `leaveController` 每次入座新建，`table.leave` 和 `before-quit` 都通过它中止调用；离桌中止不计失败（342、354 行）。
- 熔断事件的负载、`breaker` 的计数字段与 plan 第 190、536 行一致。
- 用户决定没有被改动：托管标记、限一层回应、工具声明发言类型、赢家发言会引起回应、健谈度、不用 Workflow、单一 SQLite、首发 macOS arm64。L2 是在实现层面收窄了 plan 的一处调度细节，没有改动 §1 的决定。

## 检查限制

- 只阅读了文档和 T1 的现有代码与证据，没有运行测试，也没有重新打包。
- `toolCalls` 元素中 `args` 字段名没有证据支持（只核实了 `toolName`）；任务没有用到这个字段。
- 钥匙串条目由正式版和 spike 共用，是根据 Electron safeStorage 按应用名命名条目的已知行为推断的，没有查看钥匙串验证。开发环境的应用名是否也是 “River”（从而共用同一条目）也没有验证。
- 检查时本机存在 `~/Library/Application Support/River`；`~/Applications/River-spike` 仍然存在。
