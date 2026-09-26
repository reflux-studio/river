# river-monorepo 实施任务审阅 · task 第 1 轮

- **审阅对象**：`.rivo/issues/river-monorepo/task.md` 首稿（未提交，521 行）。审阅期间文件在磁盘上被改过一次，改动在第 119、242、253 行，plan 的第 170、306、332、528、531 行也同步改了。本报告针对改动后的版本（`shasum` d57641a491667a974cb972d312c56048e2febf5b），这三处改动也一并看过。
- **对照材料**：`plan.md`（已批准；第二轮修订已同步）、`discussion.md` 的“起因”和“用户决定”、ADR-007、`reviews/plan-1.md`、`design-source/`。
- **核对的代码**（基线 `main` @ 1ece50c）：
  - 引擎：`src/main/engine/{table,eval}.ts`；
  - 主进程：`src/main/db/index.ts`、`ipc.ts`、`updater.ts`、`index.ts`、`table/{view,runner}.ts`；
  - 共享：`src/shared/{personas,format}.ts`；
  - 渲染进程：`components/{Onboarding,PlayingCard}.tsx`、`components/table/{Seat.tsx,useTableFx.ts}`、`lib/{felt,format,river,utils}.ts`、`pages/Table.tsx`；
  - 测试：`test/{engine,runner}.test.ts`、`test/{mock-model,table-helpers}.ts`；
  - 配置与其他：`package.json`、`pnpm-workspace.yaml`、`tsconfig*.json`、`electron.vite.config.ts`、`electron-builder.yml`、`.github/workflows/build.yml`、`scripts/prices.mjs`、`components.json`、`design/export-icons.py`、`README.md`；
  - 依赖源码：electron-updater 6.8.9 的 `main.js`、`AppUpdater.js`、`types.d.ts`。
- **结论：需修改。** 有 1 个阻塞问题：plan 中两条 i18n 验收场景没有任何任务承接，其中一条是唯一能证明“提示词写明回复语言”真正生效的真实模型检查。另有 11 个非阻塞问题，大多是实施者照着写会碰到的坑，补几句说明就能解决。拆分方式、依赖顺序、接口名称和用户决定基本忠实于 plan。

## 需求承接核对

| plan 要求 | 承接任务 | 结论 |
| --- | --- | --- |
| monorepo 迁移，桌面包的 name、appId、版本号不变，打包先行 | T1 | 已承接 |
| engine：迁移代码，新增 `lastActs`；`handCat` 放到第二阶段 | T2、T5 | 已承接，差分测试的拆分有缺口（N2） |
| ui：`TableStage`、特效函数、缩放补偿、加注特效的三个条件 | T3 | 已承接 |
| i18n 包、`locale` 字段、预选值、引导页语言页、`completeOnboarding`、守卫、默认币种 | T4 | 已承接，引导结束路径的名称和实际代码不符（N6） |
| 主进程与 Agent 双语、`handCat`、`sysKind`、`needsSettings`、启动失败弹窗 | T5 | 已承接，验证手段有缺口（N4） |
| 渲染进程双语、日期、`<html lang>`、币种、牌桌色名称 | T6 | 已承接 |
| 手动检查更新（4 种结果，另有 `update:error`、`packaged`） | T4、T7 | 已承接，测试能否加载模块有隐患（N3） |
| 官网 | T8 | 已承接，验证项有缺漏（N8） |
| CI、knowledge README | T9 | 已承接 |
| 验证场景 1–8 | 各任务与整体验证 | 验证 4 中有两条丢失，见 B1 |
| 明确不做的事项 | — | 没有私自增加范围 |

用户决定都保留了：只拆 engine、ui、i18n；不用 Turborepo；`/` 与 `/en/`；复用 `useTableFx`；语言只在引导页选一次；对手预设按语言；提示词写明回复语言；选英文的新用户默认美元。“已完成引导的老用户是中文”在共同约定中写作“老用户固定为 `zh`”（第 25 行），和 plan-1 N6 指出的措辞偏差相同。T4 的细则写对了，影响很小。

## 阻塞问题

### B1 plan 验收中的“模型输出语言”和“选完语言立即生效”两条没有任务承接

- **plan 的依据**：验证 4 写明：
  - 第 490 行：新用户选英文后，“对手发言、教练讲解和复盘”都应是所选语言；
  - 第 492 行：“选完语言后，大厅和对手页不用重启就是新语言”。
- **task 的现状**：
  - 整体验证第 3 项（第 514–516 行）只列出要走一遍的页面（引导、教练局、复盘、对手页……），没写要检查什么，也没写必须接真实模型；
  - T4 的手动验证（第 285–287 行）只检查三种结束引导的方式和“重新打开时没有语言页”；
  - T5 的“英文无汉字”测试用 mock 模型，只能证明**发给**模型的内容没有汉字，证明不了模型会用英文回复。
- **后果**：
  - 用户决定“提示词里写明回复语言”是否生效，只能靠真实模型确认。现在没有任何一步要求检查并记录，mock 测试通过很容易被当成已经联调。
  - “不用重启”对应的是 `completeOnboarding` 重建 `personasCache`、`finishOnboarding` 回写 store 这一段，是新流程里最容易漏的地方，现在也没有验证。
- **建议**：在整体验证第 3 项写明，英文流程要用真实的模型提供方完成至少一手教练局，检查对手发言、教练讲解、复盘都是英文，并把截图或摘录存进 `evidence/`。T4 的手动验证补一条：“选英文后不重启，对手页和大厅座位显示英文预设”。

## 非阻塞问题

### N1 预选值依赖 `initDb` 的新参数，但没规定测试和缺省时怎么取值，“测试默认中文”可能守不住

- **证据**：
  - 第 242 行要求 `systemLocale` 作为 `initDb` 的新参数传入。
  - 现有测试有 20 多处 `initDb` 调用都没有这个参数：`test/table-helpers.ts:54`、`test/db.test.ts` 多处、`test/resolve.test.ts:24`。
  - 这些测试库都是新库，没有完成引导，所以预选值等于 `resolveLocale(systemLocale)`。
- **后果**：
  - 如果缺省值取空串或 undefined，`resolveLocale` 会返回 `en`，所有测试都会用英文预设；T5 之后，中文断言会大面积失败。
  - 如果缺省值取运行环境的语言，本地中文系统和 CI 的 ubuntu（en-US）结果会不同，测试随环境变化。
- **建议**：写明 `systemLocale` 是可选参数，缺省为 `'zh'`（或者由 `tempDb` 统一传 `'zh'`）。英文用例显式传 `'en'`，或者调用 `completeOnboarding('en')`。
  - 注意：`updateSettings({ locale: 'en' })` 不会重建 `personasCache`，不能用它来切换测试的语言。

### N2 T2 迁移差分测试时，`disp` 的对照无法放进 engine

- **证据**：
  - `test/engine.test.ts:454-470` 的差分用例在同一个循环里同时断言 `handName` 和 `disp`（第 5 行从 `src/shared/format` 引入 `disp`）。
  - T2 第 116 行要求把 poker.js 差分整体移到 `packages/engine/test`，而 `disp` 按约定留在 desktop，engine 不能反向引用 desktop。
- **建议**：写明拆分方式：`handName`/`outs`/`equity` 的对照放进 engine；`disp` 的对照留在 desktop，两边各读一次 poker.js。

### N3 T7 的 updater 单元测试和 `update.check` 的接线方式没写清楚，照现有写法会在加载模块时出错

- **证据**：
  - `updater.ts:6` 在模块顶层执行 `const { autoUpdater } = electronUpdater`。这会触发 electron-updater 的懒加载 getter（`main.js:78-80`），创建 `MacUpdater`，进而调用 `require("electron").app`（`MacUpdater.js:16`、`ElectronAppAdapter.js:7`）。
  - 在 vitest（Node 环境）里，`require('electron')` 得到的是一个路径字符串，所以新的 `test/updater.test.ts` 一 import 这个模块就可能出错。T7 第 402 行说“默认用真实的 `autoUpdater`”，但注入默认值时这段代码已经执行了，注入解决不了这个问题。
  - 如果 `ipc.ts` 直接 import `updater.ts` 来处理 `update.check`，`test/runner.test.ts:3`（它 import `commandHandlers`）也会受影响。现有代码正是为此把 `update`、`install` 放进 `AppInfo`，由 `index.ts` 注入（`ipc.ts:14-19`）。
- **建议**：
  - 写明 `update.check` 沿用 `AppInfo` 注入：`AppInfo` 增加 `check` 和 `packaged`，在 `index.ts` 里接线。T7 的修改位置要补上 `main/index.ts`。
  - `updater.ts` 改为在函数内部取 `autoUpdater`，或者测试里 `vi.mock('electron-updater')`、`vi.mock('electron')`。
  - T4 让 `Bootstrap` 加上 `packaged` 之后，ipc 就必须返回这个字段，否则 typecheck 不通过。所以 T4 也要改 `AppInfo` 和 `index.ts`，它的修改位置同样缺 `main/index.ts`（`systemLocale` 的读取也在这个文件里）。

### N4 T5 的“英文无汉字”测试引用了不存在的压测，而且覆盖不到错误信息和弹窗

- **证据**：
  - 第 342 行要求“用现有的随机压测，教练局和自由局各跑至少 20 手”。但现有的随机压测只在引擎层：`engine.test.ts:412` 的 3000 手，以及 `runner.test.ts:482` 的 normalize 压测。两者都不经过 `TableRunner`，没有 mock 模型，也没有 `TableView`。runner 层的多手压测需要新写。
  - T5 的目标包括错误信息、弹窗和提供方类型名，但这些文字既不发给模型，也不在 `TableView` 里：
    - `ipc.ts:60` 的“至少保留一位对手”；
    - `ipc.ts:88` 的“OpenAI 兼容接口”（T5 第 306 行把它写在 `resolve.ts` 下，实际在 `ipc.ts`）；
    - `ipc.ts:124` 的“请先离桌再更新”；
    - `updater.ts` 的“没有已下载的新版本”；
    - `resolve.ts:81` 的解密错误；
    - `runner.ts:278` 的 stalled 文案；
    - `index.ts:53` 的启动失败弹窗。
  - T6 对渲染进程有 grep 检查，T5 对主进程没有。
- **后果**：主进程里残留的中文文案，自动检查发现不了。随机 20 手也不一定能覆盖重新买入、摊牌、`coach.ask`、复盘这些模板。
- **建议**：
  - 写明需要新写 runner 级的压测，驱动方式可以复用 `table-helpers` 的 `setup` 和 `scriptModel`，并显式触发一次重新买入、提问、复盘；
  - 另外对 `apps/desktop/src/{main,shared}` 做一次汉字检查，允许命中的只有注释。

### N5 T6 的 grep 命令在 macOS 上跑不了

第 370 行的 `grep -rnP ... --include=*.tsx`：

- macOS 自带的 BSD grep 不支持 `-P`，实测会报 `invalid option -- P`；
- 在 zsh 里，没加引号的 `--include=*.tsx` 会被当成 glob 展开，报 `no matches found`。

**建议**：改成 `rg -n '\p{Han}' apps/desktop/src/renderer/src -g '*.ts' -g '*.tsx'`（本机已安装 rg）。N4 建议的主进程检查也用这个写法。

### N6 T4 写的引导结束路径和实际按钮对不上

- **证据**：`Onboarding.tsx` 的最后一页没有“完成”按钮，只有“稍后再说”“去配置”“带我打一手”；页顶还有“跳过”；`onOpenChange` 在按 Esc 和点遮罩时都会触发。T4 第 269 行写的是“‘完成’‘跳过’、Esc 三条路径”。
- **后果**：实施者可能漏掉“稍后再说”或点遮罩这两条路径。现在这几条路径都经过 `finishOnboarding`，按“所有路径都经过 `finishOnboarding(selected)`”来实现就不会漏，但验收清单会和界面对不上。
- **建议**：按实际控件列出所有路径：跳过、稍后再说、去配置、带我打一手、Esc、点遮罩。或者直接写“`finishOnboarding` 的所有调用点”。

### N7 T4 删掉或迁走共享常量时，没有列出所有使用方

- **证据**：
  - `COACHES` 被 `agents/coach.ts:2`、`CoachPanel.tsx:8`、`Settings.tsx:14` 使用；
  - `STREET` 被 `table/text.ts:3`、`table/runner.ts:3`、`Replays.tsx:8` 使用；
  - `PERSONAS` 除了 `loadPersonas`、`savePersona`，还被 `deletePersona` 用来判断是不是内置对手（`db/index.ts:289`）。
  - T4 第 231 行只写了删除和迁移。按这几个文件的归属，它们原本在 T5 和 T6 的范围里；但 T4 结束时 typecheck 必须通过，所以 T4 就得先把这些引用改好（先取中文）。
- **另外两个同类问题**：
  - `PersonaSeed` 目前从 desktop 的 `Persona` 类型推出来。`presets` 放进 i18n 之后，i18n 不能引用 desktop 的类型，所以这个类型要在 i18n 里定义，desktop 反过来和它对齐。
  - T3 中，`lib/felt.ts:2` 的 `feltOf` 参数类型是 `Pick<Settings, ...>`，迁进 ui 时要改成 `{ felt: Felt; feltCustom: string }`。`PlayingCard.tsx` 里还有留在 desktop 的 `RichText` 和没列出的 `MiniCard`，所以第 152 行的“删除原文件”要改成“拆分原文件”。
- **建议**：在 T4 和 T3 的修改位置里补上这些使用方，写明需要临时处理的地方。

### N8 T8 的验证缺少下载区、英文提示条和语言切换，而且实际依赖 T5 的 `handCat`

- **验证缺口**：
  - plan 的官网一节要求：下载区按平台高亮，请求 GitHub API 失败时退回 `/releases/latest`；非中文访客看到可以关闭的 “English →” 提示条；语言切换通过链接跳转。
  - T8 的完成标准（第 471–476 行）一项都没有验证。“离线打开”（plan 验证 6）也被换成了 `astro preview`，而断网时正好会走到下载区的退回逻辑。
- **依赖问题**：
  - T8 的 `to-seat-view` 要按语言生成“Won 1,200 · Flush”这样的文字，需要 T5 改名后的 `handCat`。
  - 第 436 行只说“英文术语如果 T5 没完成就先用占位词条”。如果 T8 在 T5 之前开工，只能用返回中文的 `handName`，之后必须返工。
- **建议**：
  - 完成标准补上：屏蔽 api.github.com 后，链接退回 `/releases/latest`；接通网络时，按当前最新 release 的真实文件名能匹配到三个平台的安装包；英文提示条能关闭，刷新后保持关闭；中英页面的切换链接带上 `/river` 前缀。
  - 依赖关系改成 T8 依赖 T5，或者写明 T8 的状态文字必须用 `handCat`。

### N9 迁移后有两处根目录路径会失效

- **`design/export-icons.py`**：它留在根目录（第 48 行），但第 12–14 行向 `ROOT/build` 和 `ROOT/src/renderer/public` 写文件。迁移后这两个目录都在 `apps/desktop` 下，脚本会在根目录悄悄新建一个 `build/` 目录，不会报错。
- **`README.md`**：第 26 行写的是“打包到 `dist/`”，实际路径会变成 `apps/desktop/dist/`。T1 也没有验证根目录的 `pnpm dist` 能不能用。
- **建议**：T1 的修改位置补上这两处，并加一条验证：“根目录 `pnpm dist` 能打出安装包”。

### N10 各个包的工具链依赖没有指定

- **证据**：
  - 根 `package.json`（第 49–66 行）没有 devDependencies；plan 给出的包示例也只有 scripts。
  - `packages/*` 执行 `tsc`、`vitest` 需要各自声明 typescript、vitest；engine 的测试要用 `node:vm`、`node:fs`，需要 `@types/node`；ui 需要 `@types/react` 和开启 jsx、DOM 的 tsconfig。
  - `apps/site` 也没有写 `typecheck: astro check`（需要 `@astrojs/check`），所以 `pnpm -r typecheck` 和 CI 都不会检查官网。
- **建议**：写明这些依赖是放在各包的 devDependencies 里，还是放在根目录；另外写明 site 的 `typecheck` 脚本。

### N11 并行、基线截图和 Pages 部署的细节

- **并行冲突**：
  - T7 要改 `Settings.tsx`、`lib/river.ts`、`dict.ts`，T6 要改所有渲染进程文件；
  - T5 和 T7 都要改 `updater.ts`。
  - 第 35 行说 T7 可以和 T5、T6 并行。如果在不同工作树里同时做，必然产生冲突。建议写明 T7 排在 T6 之后，或者规定合并顺序。
- **基线截图**：T3（第 210 行）和 T6（第 372 行）都要“与迁移前对比”，但 T1 没要求先保存迁移前的截图。建议 T1 开始时在 1ece50c 上截图，存到 `evidence/T1/baseline/`。
- **Pages 部署**：`site.yml` 使用 `actions/deploy-pages` 时，通常要给 deploy job 配置 `environment: github-pages`，并且只允许默认分支部署。这是一般经验，本轮没有查文档核实。它只能在合并后验证，出错会拖到上线时才发现。建议第 496–499 行补上 environment 和 concurrency 的配置。

## 本轮审阅期间的改动核对

- **第 119 行**：`lastActs` 性质检查的口径改为“全下的盲注记为 allin”，和第 108–112 行的规则一致。
- **第 242 行**：“预选值可能被 `updateSettings` 顺带写入库”。已核实：`updateSettings` 写入的是整份 `settingsCache`（`db/index.ts:201-205`）。写入的值和预选值相同，下次启动时直接读到这个值，结果不变，所以这个说法成立。
- **第 253 行**：`completeOnboarding` 改为调用现有的 `updateSettings`，守卫放在 ipc。已核实 `updateSettings` 确实存在，并且会同步更新 `settingsCache`，所以之后调用 `loadPersonas` 能读到新的语言。这一行和 plan 第 332 行一致。

## 接口与名称核对（未发现问题）

- **引擎**：
  - `Table.legalActions()`、`winners(): PotWin[]`（字段是 `handName`）、`handLog()`、`roundOfBetting()` 都存在。
  - `LogEntry` 由行动记录 `{street, seat, type: blind|fold|check|call|bet|raise|return, amount, to?, allIn}` 和发牌记录 `{street, board}` 组成，按 `street` 过滤等价于 `view.ts` 中“最后一条发牌记录之后”的写法。
- **db**：
  - `getKv` 会把存下的值和默认值合并（第 184 行），`loadCaches` 是内部函数，`loadPersonas` 没有导出；`initDb` 接收一个选项对象；`getOnboarded`、`setOnboarded` 已导出。
  - task 的伪代码写在 db 模块内部，所以这些都能调用到。
- **更新**：`checkForUpdates(): Promise<UpdateCheckResult | null>` 的返回值包含 `isUpdateAvailable`、`updateInfo`、`downloadPromise`。并发的检查会合并，重复发起的下载会复用同一个 `downloadPromise`（`AppUpdater.js:257-260,441`）。`checkNow` 的写法成立。
- **mock 模型**：`test/mock-model.ts` 目前只记录工具名（`tools: string[]`）。T5 要求补上 description 和参数 schema，这一点符合事实。
- **加注特效**：原来的条件在 `useTableFx.ts:161`，三个条件都在。T3 只把正则换成 `lastAct`，和 plan 一致。
- **CI 与脚本**：
  - `build.yml` 中需要改的地方（test job 的命令、prices、版本号、打包、签名断言的路径、上传路径）都列全了；根 `package.json` 保留了 `packageManager`。
  - `scripts/prices.mjs`、`electron-builder.yml`、`components.json` 里的相对路径会随文件一起移动，不需要改。T1 只要求检查，没有问题。

## 检查限制

- 只读了代码，没有运行构建和测试。N3 中“加载模块时出错”是根据 electron-updater 源码的调用链推断的，没有实际运行验证。
- `deploy-pages` 需要 environment 这一点（N11）是一般经验，没有查文档核实。
- 没有逐区块对照 `River Site v2.dc.html` 和 T8 的区块清单，只核对了 `<section>` 的 id，以及 `createSim`、`viewReal`、`LINES`、`PROMPT_EN` 这几个符号确实存在。
- pnpm 11 在 workspace 中执行脚本时，是否会把根目录的 `node_modules/.bin` 加进 PATH（影响 N10 的严重程度），没有核实。
