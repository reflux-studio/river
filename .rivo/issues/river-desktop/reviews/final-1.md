# 最终审阅 final-1

## 审阅方式与范围

| 项 | 内容 |
| --- | --- |
| 模式 | 最终审阅，独立审阅者。没有派发子代理，没有修改实现，只写了本报告 |
| 版本 | HEAD `1369867`，tag `v0.1.0` 指向它。作者信息改写前的 `29c320f` 仍在本地，`git diff 29c320f 1369867` 为空，两者代码树相同 |
| 依据 | `discussion.md` §1–§2、`plan.md`（“需求与本期范围”“相对设计稿的变化”、验收）、`task.md` 各任务的结果段、`note.md`、`adr/`、`reviews/`（含 simplify-1、simplify-2） |
| 另查 | 未提交的 `.rivo/knowledge/README.md`（知识库初稿） |
| 标准 | 用户已说明这是玩具项目，设计稿只是视觉参考。本次只看核心逻辑与体验、架构是否清晰、有没有复用，不因边角体验给阻塞意见 |

## 结论：需补充（不需要改核心逻辑）

用户决定的各项玩法都已实现，端到端链路在代码里是闭合的，四层契约（main、preload、shared、renderer）一致，没有死代码或断开的调用。简化轮之后的改动（加注金额必填、ad-hoc 签名、三平台 CI、图标、删除 spike）也都干净。安装、类型检查、测试和构建全部通过。

要补的主要是**记录**：

- T9 的结果段还没写。
- 简化轮改过的契约没有同步回 task.md 各任务的结果段。
- 本期范围有两处变化（出 Windows/Linux 安装包、改为 ad-hoc 签名），与 plan 里“明确不做”的条目冲突，但没有记为用户决定。

代码方面只有一条中等风险 F1：在 Windows 和 Linux 上，窗口很可能没有最小化、最大化和关闭按钮。它只影响新增的两个平台，不影响用户已经确认能玩的 macOS 版。

## 命令结果

| 命令 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过，依赖已是最新（pnpm 11.22.0） |
| `pnpm typecheck` | 通过，node 与 web 两个 tsconfig 都检查了 |
| `pnpm test` | 10 个文件、111 个用例全部通过 |
| `pnpm build` | 通过：main 82 kB，preload 0.4 kB，renderer JS 1.15 MB |

输出保存在 scratchpad 的 `final-cmds.txt`，没有写进仓库。

## 发现

### F1（中，推断，未实测）Windows/Linux 上窗口很可能没有标题栏按钮

`src/main/index.ts` 对所有平台都设置了 `titleBarStyle: 'hiddenInset'` 和 `trafficLightPosition`。按 Electron 的行为，在 Windows 和 Linux 上只要 `titleBarStyle` 不是 `default`，窗口就会变成无边框；这时如果没有设置 `titleBarOverlay`，最小化、最大化、关闭这些系统按钮都不会显示。另外，`TopBar` 为 macOS 红绿灯留出的 `pl-[88px]` 空白在其他平台也会出现。

影响：这些平台上窗口能拖动（顶栏是 drag 区域），但只能用 Alt+F4 这类快捷键关闭或最小化。这不是边角体验，但只涉及新增平台。

建议（二选一，都很小）：

- 只在 `process.platform === 'darwin'` 时传 `titleBarStyle` 和 `trafficLightPosition`，其他平台用系统默认标题栏；顶栏左侧留白也按平台处理。
- 其他平台加上 `titleBarOverlay`。

如果这次不修，至少要在 README 中把 Windows/Linux 标为“未实测”（见 F3）。

### F2（中）过程材料与最终代码不一致

**范围变化没有记录。** plan 的“明确不做”包括“代码签名与公证”和“Windows/Linux 安装包”，discussion §2 也写了“首发只验证 macOS arm64”。现在的交付是：

- mac 做了 ad-hoc 签名；
- CI 会产出 Windows nsis 和 Linux AppImage 两种安装包；
- 这些安装包会发布到 Releases，README 的下载说明也把它们列为正式下载项。

这两处变化应该在 T9 结果中写成用户决定，并注明“未实测”。它们是否得到过用户认可，本次审阅无法从材料里确认。另外，ad-hoc 签名不是公证，与“不做代码签名”在本意上并不冲突，但仍应写清楚。

**task.md 各任务结果段已过期**（简化轮 simplify-1/2 的改动只回写了 heroAct 这一条）：

| 位置 | 现在写的 | 实际代码 |
| --- | --- | --- |
| T5 结果“契约补充” | bootstrap 返回后主进程补发 `table:view`、`coach:alert`、`breaker` | bootstrap 直接返回 `view`。`coach:alert` 和 `breaker` 事件已经删除，提醒和熔断状态都放进了 `TableView.alert` / `TableView.breaker`，只通过 `table:view` 推送 |
| T5 结果“给 Renderer 的约定” | `coach.ask` 返回 requestId，同 id 的事件可能先到，需要缓存 | `coach.ask(requestId, text)` 由 renderer 生成 id，先写入待回答条目再发命令，不再需要缓存。无桌、未配置或熔断时由 `ask` 同步推送 `coach:done` |
| T5 结果“给 Renderer 的约定” | 教学牌局改写 settings 后不推送，入座后要重新读取 | `table.start` 和 `provider.delete` 直接返回新的 `Settings` |
| T5 结果“技术债” | `Legal` 在 shared 和引擎里各有一份 | 已解决，引擎从 `shared/types` 引入 |
| T6 结果 | `lib/river.ts` 提供 `useBootstrap`；“`coach.ask` 抛错时早到事件的缓存…” | `useBootstrap` 已删除，早到事件的缓存机制也已经没有了 |
| T7 结果“已知小问题” | 熔断状态有两个来源，前端只用事件 | 只剩 `TableView.breaker` 一个来源 |
| T8 结果“技术债” | 统计页逐手调用 `hands.get` | `HandSummary` 已带上 `vpip`/`pfr`，统计页只调用一次 `hands.list` |
| T1 结果 | `spike.ts` 保留到 T9 | 已在 `1369867` 删除 |

**T9 结果段缺失**，要补的内容见文末。另外，spike 删除提交的说明写的是“T9 期间已在打包产物上验证”，但 `evidence/` 下没有 T9 目录。

### F3（低）用户 README 和知识库初稿有几处不准确

用户 README（`README.md`）：

- 只说安装包没有签名，没有说明 **Windows、Linux 版未实测**。
- 没有提到 Linux 上 API key 的加密依赖系统钥匙串。没有钥匙串时，Electron 会退回到 `basic_text` 后端，这只是混淆，不是真正的加密；而且后端变化后已保存的 key 会解不开，这时设置页会提示重新输入（`needsKey` 路径）。建议加一行说明。

知识库初稿（`.rivo/knowledge/README.md`）大体准确。已核对：信息隔离、意图提交、队列、熔断、公屏只延续一层、记忆作用域、libsql 两个 client、打包配置，都与代码一致；没有把没实现的东西写成现状。需要改的有以下几处：

1. 写的是“对应 tag `v0.1.0`（提交 `29c320f`）”，作者信息改写后应为 `1369867`。
2. “已知小问题，暂不处理”里列了“统计页逐手读取已改为一次读取”。这一项已经修好，放在这个标题下自相矛盾，应该删掉。
3. 链接全部指向 `../archive/river-desktop/`，这个目录现在还不存在，材料仍在 `.rivo/issues/river-desktop/`。归档时要确认目录真的移动了，也要同步修改根 README 最后一行的路径。
4. “userData 位置”只写了 macOS。Windows 是 `%APPDATA%\River`，Linux 是 `~/.config/River`，可以补一句。
5. 可以在“未验证与已知限制”里加上 F1。

### F4（低，已知）退出时不等最后一手的记忆写入

`guardQuit` 只等 `leave()` 把余额写进库。一手结束时，`insertHand` 和写入对手 thread 的 durable `appendResult` 都没有被等待（`runner.ts` 的 `onHandEnd`）。如果一手刚结束就立即退出，理论上可能丢掉最后一条对手记忆消息，最后一手的记录也有很小概率丢失。

T5 把这一点列为“待 T9 观察”，但 T9 没有给出观察结论。玩具项目可以接受，在 T9 结果中写一句“未观察到 / 接受”即可。

### 观察（不需处理）

- `closeMastra` 只有测试在用，生产代码没有调用。这是有意为之，保留即可。
- 依赖 `cn@0.4.0` 是 shadcn 官方包（仓库 `shadcn-ui/cn`），用来替代 clsx + tailwind-merge，不是可疑依赖。
- renderer 产物 1.15 MB 未压缩，在 T6 已被接受。

## 逐项对照

### 1. 原始目标与用户决定（discussion §1、plan 范围）

| 决定 | 落实情况 |
| --- | --- |
| Electron 桌面应用，引擎在主进程 | 是。`TableRunner` 是唯一写入者（ADR-001） |
| 对手、教练都是独立 agent（有 loop、工具、记忆） | 是。见 `agents/opponent.ts`、`agents/coach.ts`、`tools.ts`；working memory 作用域是 resource |
| 不用 Workflow | 是（ADR-002） |
| SQLite 存储 | 是。Mastra 表与 `river_*` 业务表在同一文件，各用一个 client（ADR-003、note） |
| 模型提供方由用户配置，对手和教练各选一个模型 | 是。`resolveModel` 从注册表读取 208 个提供方，另支持 OpenAI 兼容接口；测试连接会检测 `required` |
| 超时或出错时托管，并明确标记 | 是。座位状态、公屏和手牌记录都标“托管”；连续 3 次失败熔断并显示横幅，可以重试 |
| 公屏是全局记录，任何人都能读、随时发言 | 是。有 `read_chat` 工具，`chat.send` 可以随时发 |
| 只有主动发言会引起回应，且只延续一层 | 是。`triggers` 的判定与 plan 的对照表一致（decide 中 `kind=free`、赢家发言、玩家发言会触发；chat、reply、预设台词不会） |
| 发言工具带参数声明发言类型 | 是。`say` 工具有 `kind: free/reply`、`reply_to` |
| 赢家发言算一次主动发言 | 是。`winnerSpeech → postSay(..., true)` |
| 不设全局话痨程度，靠人设 | 是。角色有 `talk` 属性，AI 对手页显示“健谈度” |
| 赢牌由 agent 说，托管时用预设台词 | 是 |
| 相对设计稿的变化（plan 表中 8 项） | 都已实现：设置页的模型提供方和模型选择、最近一次调用与托管次数、删掉全局话痨设置、删掉多角色合并调用、赢家由 agent 发言、SQLite 保留全部手牌且图表取最近 40 手、托管标记、引导第 6 页 |

偏离项与认可情况：

| 偏离 | 认可情况 |
| --- | --- |
| T5–T8 结果段里列出的偏差（熔断后也标托管、引导页按钮、回放列表显示日期等） | 都已在各轮审阅中接受；回放日期依据的是“设计稿只是参考”的授权 |
| 加注金额改为必填 | simplify-2 F1 的推荐做法，已落实 |
| Windows/Linux 安装包、ad-hoc 签名 | 属于 plan“明确不做”的范围，**材料中没有用户认可的记录**（F2） |
| plan 的验收：打包版 10 手、断网熔断、重开后数据仍在 | 没有按脚本执行，只有用户手动试玩确认“可以玩了”（见“未验证范围”） |

### 2. 端到端链路

```
whenReady ─► initDb(url, safeStorage) ─► initMastra(url)  自建 LibSQLStore，不与业务层并发
          ─► runner.init()  读余额 ─► registerIpc ─► guardQuit ─► createWindow
                             （任一步失败 → 弹错误框并 exit(1)）

table.start ─► leave 旧桌 ─► 扣买入 ─► nextHand ─► loop
  loop ─► 轮到玩家：onHeroTurn → 本地概率 + coachProactive（抢占式，12 秒）→ view.alert
       ─► 轮到对手：deciding 去重 → opponentTurn
            ├ 用 LLM：guarded(队列抢占, 10 秒) → opponentDecide
            │    成功且有 act → normalizeAct；say 保留
            │    其他情况     → 托管 + countFailure（离桌除外）→ 3 次后熔断
            └ 本地或熔断：decide() + canned()
          ─► 暂停中 → 记为 pendingAI；否则 commitOpponent
               → 泄牌过滤 → 公屏 → triggers 为真时 triggerReplies → chatReply（8 秒）
  onHandEnd（endKey 保证只执行一次）
       ─► 系统消息 → insertHand → hands:changed
       ─► 每个对手：durable appendResult，写入 thread
       ─► autoNext 定时器 → winnerSpeech（win 模式，8 秒）→ maybeAutoNext
coach.ask(id, text) ─► 暂停 → 流式 coach:delta → coach:done
hands.review ─► 独立的复盘队列（45 秒，readOnly）→ saveReview → review:done
回放 / 统计 ─► hands.list（带 vpip/pfr）/ hands.get
退出 ─► before-quit：有桌时 preventDefault → leave（余额写库）→ quit
```

整条链在代码里是闭合的。契约的四层逐一对照过：

- `Commands` 与 `Events` 各有 24 个命令、8 个事件，与 `commandHandlers` 和 renderer 的 `listen()` 一一对应。
- preload 只做泛型转发。
- 已删除的 `coach:alert`、`breaker` 事件，以及 `hasTable`、`useBootstrap` 都没有残留（simplify-2 做过 grep，本轮抽查一致）。
- `heroAct` 的唯一调用方 `ActionBar` 在加注时总会传 `to`。

### 3. 发布与兼容

| 项 | 结论 |
| --- | --- |
| pnpm 版本 | `pnpm/action-setup@v4` 没有写 version，会读取 `packageManager: pnpm@11.22.0`，版本一致 |
| 锁文件 | 所有 job 都使用 `--frozen-lockfile` |
| libsql 各平台原生包 | 锁文件里有 `@libsql/darwin-arm64`、`linux-x64-gnu`、`win32-x64-msvc` 等（0.5.29），各平台 runner 安装本平台的包，配置合理 |
| asarUnpack | 包含 `@libsql/**` 和 `libsql/**`；`npmRebuild: false` 与 N-API 预编译包的做法一致 |
| mac 签名 | `identity: '-'`、`hardenedRuntime: false`，理由记在 note 里，合理 |
| Release | 只有 release job 有 `contents: write` 权限，发布为 draft，只用 `GITHUB_TOKEN`，合理 |
| Electron 安装 | Electron 没有加入 `allowBuilds`，改由根目录的 `postinstall: install-electron` 下载（T1 已知做法），CI 上也适用 |
| Windows 风险（未实测） | 未签名，会弹 SmartScreen 提示（README 已写）；标题栏问题见 F1；libsql msvc 包是否依赖 VC++ 运行库未验证 |
| Linux 风险（未实测） | safeStorage 依赖钥匙串（README 没写，见 F3）；标题栏问题见 F1 |

### 4. 过程材料一致性

见 F2。simplify 轮的契约变化中，只有“加注金额必填”写进了 T5 结果。其余几项（`coach.ask(requestId, text)`、breaker/alert 并入 TableView、bootstrap 返回 view、`HandSummary.vpip/pfr`、两个命令改为返回 Settings）都还没同步。

## 未验证范围

- **打包版的脚本化验收没有执行。** 以下各项目前只有用户手动试玩“可以玩了”作为证据：6 人桌 10 手、公屏回应只延续一层、赢家发言、教练的静默/提醒/暂停/提问/复盘、`mastra_resources` 中的 working memory 写入、断网后托管并在 3 次后熔断再重试、退出重开后余额/手牌/复盘/角色印象/教练档案仍在。
- T6、T7、T8 留给 T9 的事项没有给出结论：打包版红绿灯位置、教练流式回答与“已中断”、破产后重新买入、复盘保存后重开仍在。
- Windows、Linux 安装包从未运行过。
- CI 和 Release 的状态无法核实：本机没有 `gh`。另外 tag 在作者信息改写后强推过，是否重新触发了构建、draft Release 里的产物来自哪个提交（代码树相同，功能上等价）都不清楚。
- F1 是根据 Electron 的平台行为推断的，没有在 Windows/Linux 上验证。

## 建议在归档前补记

**T9 结果段**（`task.md` 的“整体验证与交接”）应记录：

1. 命令结果：typecheck 通过，111 个用例通过，build 通过（本报告）。
2. 验收方式的变化：原计划的脚本化 10 手验收**没有执行**；实际做法是用户在打包版中配置真实模型并手动试玩，确认“可以玩了”（写上日期）。第 2–4 步中哪些没有专门覆盖，要逐项列出（可以直接用“未验证范围”第一条）。
3. 第 5 步有没有执行：是否删除了 `~/Applications/River-spike`、是否备份了数据目录、钥匙串条目是否保留。
4. 打包的改动：`identity: '-'` 与 `hardenedRuntime: false` 修复了“已损坏”提示（引用 note 中的 T9 打包结论）；新增应用图标（源图和导出脚本在 `design/`）。
5. 范围变化，作为用户决定记录：GitHub Actions 三平台构建（mac arm64 dmg / win x64 nsis / linux x64 AppImage），推送 `v*` tag 时生成 draft Release。写明 Windows/Linux 未实测，已知风险有 F1 和 Linux 钥匙串。
6. 第 6 步：spike 已删除（`1369867`）。
7. 版本：`v0.1.0` 对应 `1369867`；作者信息已改写，原来的 `29c320f` 代码树与它相同。
8. T5 留下的“退出时不等最后一手落库与对手记忆写入”：写明观察结论或“接受”（F4）。
9. T6/T7/T8 留给 T9 的事项：逐条写明已验证、通过试玩覆盖，或未验证。

**其他同步：**

- 按 F2 的表格更新 T1、T5、T6、T7、T8 的结果段，或者在 T9 中加一段“简化轮后的契约变化”统一说明，并在各段标注“以此为准”。
- 修正知识库初稿的 5 处（F3），并在根 `README.md` 中注明 Windows/Linux 未实测、Linux 需要钥匙串。
- F1 可以选择现在修（改动很小），也可以作为已知限制写入 README 和知识库。
