# River 项目知识

本页记录 River（桌面应用与官网）的**当前实现**，以及以后改动时要守住的约束。内容已对照代码与测试核实。
- 仓库结构与包边界、i18n、系统结构、打包与发布四节核实于 2026-09-26，对应 `feat/monorepo-site-i18n` @ 05395c3（river-monorepo T1–T8）。
- 信息隔离、Agent 运行规则两节核实于 2026-09-25，对应 `main` @ 3ba346c，加上 unified-agent 的改动；文件已随迁移移到 `apps/desktop/src/main/`，规则未变。
- 其余各节核实于 2026-09-24，对应 v0.1.0。

方案推导见交付材料：
- v1：[river-desktop](../issues/river-desktop/)
- v2：`../issues/river-v2/`
- 统一 Agent 上下文：`../issues/unified-agent/`
- monorepo、官网与中英双语：`../issues/river-monorepo/`

## 仓库结构与包边界

pnpm workspace（`pnpm-workspace.yaml`：`apps/*`、`packages/*`），不用 Turborepo，编排只靠 `pnpm -r` 与 `--filter`：

```
apps/desktop     Electron 应用（包名仍是 river，appId/版本/发布配置未变）
apps/site        官网，Astro 静态站 + React 岛
packages/engine  @river/engine  规则、牌型评估、lastActs、fmt/signed、Card/Street 等类型
packages/ui      @river/ui      TableStage、座位、卡牌、筹码、特效、felt、tokens.css；子路径 ./types
packages/i18n    @river/i18n    Locale、字典、扑克术语、对手预设、系统提示词

依赖只能向下（ADR-007）：
  desktop main/shared ─► engine、i18n、@river/ui/types（仅类型）
  desktop renderer    ─► ui、i18n、engine
  site                ─► ui、i18n、engine
  ui ─► engine        i18n ─► engine（仅类型）        engine ─► 无
```

- **包没有构建步骤**：`exports` 直接指向 `src/*.ts`，由使用方的 Vite / electron-vite 编译。desktop 把三个包写在 `devDependencies`（`workspace:*`），electron-vite 把它们打进 bundle，electron-builder 的运行时依赖清单不受影响。
- **边界**：ui 只放纯展示组件（不碰 IPC、store，不写文案）；i18n 只放固定内容；engine 只放规则。官网演示桌的机器人在 `apps/site/src/sim/`，不属于 engine。
- **主进程只能引用 `@river/ui/types`**：守卫是 `apps/desktop/tsconfig.node.json` 不开 `jsx`，误引 ui 主入口时 typecheck 报错。要给它开 jsx，先换守卫（ADR-007）。
- **根脚本**（根 `package.json` 只放编排，保留 `packageManager: pnpm@11.22.0` 供 CI 的 `pnpm/action-setup` 取版本）：`dev`、`dist`（`--filter ./apps/desktop`）、`dev:site`、`build:site`、`typecheck`/`test`（`pnpm -r`）。每个包都有 `typecheck` 与 `test`；desktop 分别检查 `tsconfig.node.json`、`tsconfig.web.json`，官网用 `astro check`。

## i18n

- **语言只选一次**：新用户在引导页第一页选择（预选值按系统语言，`zh*` 为中文，否则英文），`onboarding.done(locale)` 写入；之后 `settings.update` 带 `locale` 会被拒绝（`apps/desktop/src/main/ipc.ts`）。从设置页重看规则介绍时没有语言页。已完成引导但库里没有 `locale` 的老用户固定为 `zh`（`db/index.ts`）。选英文且币种仍是人民币时改为美元。
- **固定内容双语**，都在 `@river/i18n`：界面文案、主进程模板文字、系统提示词与局面描述（提示词写明回复语言）、对手预设种子。取字典用 `dict(locale)`；`en` 的类型是 `typeof zh`，缺词在 typecheck 时报错。
- **动态内容保持生成时的快照**，不随语言翻译：选定后的对手预设、用户写的内容、模型输出、历史记录。
- **官网**：中文 `/`、英文 `/en/`，文案在 `apps/site/src/i18n/site.ts`，术语与预设同样取自 `@river/i18n`。

## 系统结构

River 是单人对 AI 的德州扑克教学应用，基于 Electron，分主进程和界面两部分（下列路径相对 `apps/desktop/src/main/`；规则引擎在 `packages/engine/src/`）：

```
Renderer（React + shadcn/ui）         只持有 UI 状态，展示主进程推送的 TableView
   │  preload：window.river.invoke(命令) / on(事件)
Main（Node，ESM）
   ├ @river/engine       table.ts 规则引擎（发牌、下注轮、边池、摊牌）；eval.ts 牌型评估、随机牌胜率（蒙特卡洛）、改进牌
   ├ table/runner.ts     TableRunner：牌局与各 Agent thread 的唯一写入者，负责调度、落库、赛后发言
   ├ table/text.ts       按视角生成给模型的文字（局面、往手摘要、复盘摘要）与落库记录
   ├ table/view.ts       引擎状态 → TableView（按玩家视角裁剪）
   ├ agents/llm.ts       唯一的模型调用入口：每次新建一个无记忆的 Mastra Agent
   ├ agents/thread.ts    每个 Agent 的本桌对话线（ADR-006）
   ├ agents/opponent.ts  对手：act（出牌）、talk（赛后发言）
   ├ agents/coach.ts     教练：讲解、回答（流式），recap（复盘）
   ├ models/resolve.ts   用户配置的提供方 → 模型；连接测试记录是否支持强制调用工具
   ├ db/index.ts         river_* 业务表与缓存，river.db 唯一写入方（ADR-004）
   └ updater.ts          electron-updater：仅打包版运行，每 6 小时后台检查并自动下载；设置页可手动检查（update.check）
        ↓
 <userData>/river.db     只有业务层读写；旧版遗留的 mastra_* 表不读也不删
```

- **userData 位置**：打包版是 `~/Library/Application Support/River`；开发（`pnpm dev`）是 `River-dev`。开发时的数据不会进入正式目录。
- **进程间契约**：命令和事件的名称与负载都定义在 `apps/desktop/src/shared/types.ts` 的 `Commands`、`Events` 里。
  - 界面要先注册事件监听，再调用 `app.bootstrap`。
  - 牌桌状态只经 `table:view` 推送。

## 信息隔离（必须由代码保证）

这些规则由代码强制执行，不依赖提示词：

- **界面**：TableView 和手牌记录只包含玩家本人的底牌、摊牌时未弃牌者的底牌，以及教练局一手结束后亮出的全部底牌（`holeAfter`，只给玩家界面、回放和教练）。API key 只在主进程解密。
- **给模型的文字**：全部由 `table/text.ts` 按视角生成。
  - 对手看到的是 `situation(t, seats, 自己的座位)`、`opponentSummary`、`publicHandResult`：只有自己的底牌和公开信息，摊牌亮出的牌算公开信息，不读 `holeAfter`。
  - 教练看到的是玩家视角：`situation(..., { you: false })` 和 `heroHandSummary`，包括 `holeAfter`。
- **称呼**：玩家座位的显示名是「你」，写给模型时一律改为「玩家」；「你」只指观察者自己。
- **原则**：Agent 的观察等于同一视角下人类玩家在牌桌上能看到的全部信息。可推导的精确事实（位置、当前牌型、本手累计投入、所需胜率）直接算好给出；随机牌胜率、改进牌只给界面上的人看，不给模型。界面上新增可见信息时，要同步加进观察。

## Agent 运行规则

- **每个 Agent 一条本桌 thread**（`agents/thread.ts`，ADR-006）。key 是 personaId，教练是 `'coach'`；只存在内存里，离桌清空。
  - 本手的消息按组原样保留：一次成功调用写一组。文本组是 user → assistant；工具组是 user → assistant tool-call → tool tool-result。
  - 出牌 `act`、赛后发言 `talk`、复盘 `recap` 一律记成真实的工具调用。
  - 往手由代码压缩成「摘要 + 自己的动作」，保留 5 手，放在本手第一条 user 的【往手回顾】里。
  - 压缩是惰性的：某个 Agent 在新一手第一次被调用、或者写入下一手摘要时才压缩上一手，同时中止它上一手还在进行的赛后发言。
- **写入契约**：
  - 只写成功的调用，失败、中止、跳过都不写。例外：教练讲解或回答在界面上已经显示了文字的，写入时加「（被打断）」。
  - 写入时核对 `thread.hand`，手号已经变了的结果直接丢弃。
  - 写入的 observation 必须是 `messagesFor` 返回的最后一条 user 原文。
- **观察**：公屏只给增量的新发言（`kind === 'msg'`，不含自己说的，最多 8 条；夹带公屏上的「第 N 手」分隔和重新买入，让模型分得清哪句话属于哪一手），用 `chatSeen` 记位置，写入成功后才推进。教练提问时，只有局面变了才重新附上局面。
- **对手**：
  - 出牌失败会停下牌局，横幅提示重试。
  - 赛后发言只有入过池的对手会发起，不阻塞下一手，失败就当没说；公屏显示时带「[第 N 手赛后]」前缀。
- **教练**：讲解、提问、复盘用同一份 system，由 `coachBusy` 保证互斥。讲解失败后可以在原决策点重试。回放页的复盘不读 thread。
- **长期印象**：写在 `river_memory`，每个角色保留最近 10 条（`MEMORY_KEEP`）。来源有两个：对手 `act` 的 note 在一手结束时写入，`talk` 的 note 在返回时写入；教练 recap 的 note 写到 `hero` 名下。每次调用时重新读取，放在 system 里。
- **强制调用工具**：只在提供方支持时用 `toolChoice: 'required'`，否则用 auto。是否支持由连接测试实测得出，任何报错都会被判为不支持。

## 工程约束（实测）

- **libsql 的 SQLITE_BUSY**：
  - 业务层是唯一的写入方（ADR-004），但客户端是连接池，读写之间仍可能出现 BUSY。
  - 不设 `busy_timeout`（它会阻塞主线程），改为异步退避重试。
  - v1 时期实测过「BUSY 之后静默丢写」（@libsql/client 0.18），升级 libsql 后要复测写入。
- **外键级联不生效**：连接池下 `ON DELETE CASCADE` 靠不住，删除手牌时要在同一批操作里显式删除复盘。
- **Mastra 1.69 的实测行为**：
  - `generate` 走的是 `doGenerate`。
  - 被中止的调用返回 `finishReason: 'aborted'`，不抛错。
  - 模型出错时可能返回 error，而不是抛出。
  - 消息数组里的 AI SDK `tool-call` / `tool-result` 会原样传给模型。本次调用没注册工具时也照传，所以部分提供方（如 Anthropic）可能拒绝这种请求（ADR-006）。
- **ESM 与路径**：主进程是 ESM。`app.getPath` 不能在模块顶层求值，否则开发环境改用 `River-dev` 的切换会失效。

## 打包与发布

- **打包配置**：`apps/desktop/electron-builder.yml`，按宿主平台出包，产物在 `apps/desktop/dist/`。
  - macOS：arm64 dmg + zip（zip 供自动更新）。本地构建 ad-hoc 签名；CI 用固定自签证书 `River Self Signed` 签名（river-v2 ADR-005），关闭 hardened runtime。
  - Windows：x64 nsis。
  - Linux：x64 AppImage。
- **libsql 原生模块**：需要 `asarUnpack`。它只按宿主平台安装，所以不能交叉打包，每个平台都在自己的 GitHub Actions runner 上构建（`.github/workflows/build.yml`）。
- **CI**（`.github/workflows/`）：
  - `ci.yml`：PR 和推送到 `main` 时，在 ubuntu 上根目录执行 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test`。
  - `build.yml`：推送 `v*` 标签或手动触发。根目录安装与测试；打包步骤在 `apps/desktop` 下执行，版本号取自标签（手动触发时取 `apps/desktop/package.json`），macOS 从 Secrets `MAC_CERT_P12`/`MAC_CERT_PASSWORD` 导入证书并断言签名身份；上传 `apps/desktop/dist/*` 的安装包、blockmap、`latest*.yml`。标签触发时发布为正式 Release（非草稿，electron-updater 看不到草稿）。
  - `site.yml`：推送到 `main` 且改动命中 `apps/site/**`、`packages/**`、`pnpm-lock.yaml`，或手动触发。全仓 typecheck、test 后 `pnpm build:site`，把 `apps/site/dist` 发布到 GitHub Pages（需在仓库 Settings → Pages 把来源设为 GitHub Actions）。
- **官网**：`https://reflux-studio.github.io/river/`（`astro.config` 的 `site` + `base: '/river'`，换自定义域名时改这两项并加 CNAME）。下载区运行时请求 GitHub Releases 的 latest，按 `apps/site/src/lib/store.ts` 的 `ASSET` 匹配安装包名，改 `artifactName` 时要同步。官网发布失败不影响 app 发版。
- **macOS 签名的坑**：`identity: null` 会留下残缺的签名，带下载隔离标记时系统直接提示“已损坏”，而且没有放行入口。ad-hoc 签名走的则是可以手动放行的“无法验证开发者”流程。ad-hoc 签名再加 hardened runtime，会让库校验拦下 libsql 的 `.node` 文件。
- **pnpm 11**：必须用默认的 isolated 布局。hoisted 布局下，electron-builder 26 收集依赖时会装错嵌套版本。

## 未验证与已知限制

- **Windows、Linux 安装包未实测**。Linux 上 `safeStorage` 依赖系统钥匙串。
  - 这两个平台的窗口用 `titleBarStyle: 'hidden'` 加 `titleBarOverlay`（底色与 `--topbar` 同步），打包版去掉默认菜单，顶栏右侧按 `env(titlebar-area-*)` 留白。这些同样没有在实机上验证过。
- **脚本化的真实模型验收未执行**：原计划用真实模型脚本化打 10 手，逐项核对记忆写入与熔断。实际是用户在打包版里手动配置模型并试玩确认。
- **已知小问题，暂不处理**：
  - 统计页逐手读取已改为一次读取；
  - 刷新页面后，失败的教练回答不显示；
  - 880px 宽展开公屏时，座位会被裁切。

## 依据

- monorepo：[plan](../issues/river-monorepo/plan.md)、[task](../issues/river-monorepo/task.md)、[ADR-007 包边界](../issues/river-monorepo/adr/007-monorepo-package-boundaries.md)；自动更新与签名：[river-v2 ADR-005](../issues/river-v2/adr/005-self-signed-auto-update.md)

- 交付材料：[plan](../issues/river-desktop/plan.md)、[task 各任务结果](../issues/river-desktop/task.md)、[调查笔记](../issues/river-desktop/note.md)
- ADR：[001 引擎在主进程](../issues/river-desktop/adr/001-engine-in-main-process.md)、[002 不用 Workflow](../issues/river-desktop/adr/002-no-mastra-workflow.md)、[003 单文件 SQLite](../issues/river-desktop/adr/003-single-sqlite-storage.md)
- 审阅记录：[reviews/](../issues/river-desktop/reviews/)
