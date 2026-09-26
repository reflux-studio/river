# river-monorepo 技术方案审阅 · plan 第 1 轮

- **对象**：`.rivo/issues/river-monorepo/plan.md` 首稿（523 行，未提交）。对照了 `discussion.md` 的“起因”“用户决定”“查证到的现状”三节、ADR-007 和 `reviews/design-7.md`。
- **基线**：`main` @ 1ece50c。核对的代码：`src/shared/types.ts`、`src/main/updater.ts`、`src/main/db/index.ts`（`DEFAULT_SETTINGS`、`pick`、`getKv`、`loadCaches`、`loadPersonas`、`savePersona`、`getOnboarded`）、`src/main/ipc.ts`、`src/main/index.ts`、`src/main/table/{view,text,runner}.ts`、`src/main/engine/{table,eval}.ts`、`src/main/agents/{opponent,coach}.ts`、`src/renderer/src/components/{Onboarding,PlayingCard}.tsx`、`components/table/{Seat.tsx,useTableFx.ts}`、`lib/{river,felt,format,utils}.ts`、`test/mock-model.ts`、`package.json`、`pnpm-workspace.yaml`、`tsconfig*.json`、`electron.vite.config.ts`、`electron-builder.yml`、`.github/workflows/build.yml`、`README.md`；还有 electron-updater 6.8.9 的 `AppUpdater.js`。
- **结论：需修改。** 有 1 个阻塞问题（B1：加注特效的触发条件漏了“下注额增加”，照着写会让特效误触发，而且很频繁）。另有 11 个非阻塞问题。需求范围、用户决定和 design-7 的 N7-1 至 N7-4 都已忠实落实。B1 修改很小，改完不需要再整轮重审。

## 需求范围核对

| 需求或决定 | plan 位置 | 结论 |
| --- | --- | --- |
| monorepo 迁移，桌面包 name/appId/版本不变 | 功能点 1、“包的结构” | 一致 |
| 拆 engine、ui、i18n；Agent 不拆；不用脚手架和 Turborepo | 功能点 2、总体方案、ADR-007 | 一致 |
| 牌桌和卡片两边共用；演示桌复用 `useTableFx`；全下展示用 ui 导出的特效函数 | @river/ui、官网 | 一致 |
| 官网用 Astro + React 岛，`/` 与 `/en/`，部署到 GitHub Pages，由用户开启 Pages | 官网、外部协同 | 一致 |
| 固定内容与动态内容的划分；引导页选一次语言，不可切换；预设按语言；提示词写明回复语言；英文新用户默认美元 | i18n 各小节 | 一致。关键规则一句措辞有偏差，见 N6 |
| 手动检查更新 | 手动检查更新 | 一致。界面呈现有缺口，见 N8 |
| 本期不做 | 明确不做 | 一致，没有私自增删 |

没有发现悄悄减少功能，也没有发现未经同意的 AI 建议被写成定论。“已完成引导的老用户为中文”在“待决问题”中已标注为 AI 建议。验收里新增了“手机宽度下没有横向滚动”，属于合理的补充，不影响范围。

## 阻塞问题

### B1 加注特效的新触发条件漏了“下注额增加”，特效会频繁误触发

- **位置**：plan 第 233 行：“加注特效的触发条件：`lastAct` 为 `bet` 或 `raise`，并且 `status` 有变化。”
- **证据**：
  - 现有的条件是 `cur.bets[i] > P.bets[i] && /^(加注|下注)/.test(s.status) && s.status !== P.status[i]`（`useTableFx.ts:161`）。本来就有三个条件，正则只是其中之一。
  - `lastAct` 在同一街内保持不变。`status` 却会在很多情况下变化，此时下注额并没有增加：
    - 对手加注以后，下一次轮到他时，状态变成“思考中…”（`view.ts:77`）；
    - 玩家本人加注以后，别人再加注，玩家的状态变成“轮到你”（`view.ts:82`）；
    - 一手结束时，赢家的状态变成“赢得 X”（`view.ts:78`），而他本街最后一个动作可能就是加注。
- **后果**：按第 233 行实现，每次“加注者再次行动”或“加注后直接赢下”，座位上都会出现琥珀色光环，标签上显示的是“思考中…”“轮到你”“赢得 1,200”。每次有人再加注都会碰到，第一阶段声明的“desktop 行为完全一致”因此不成立，官网演示桌也会出现同样的错误。验证 3 只写了检查“加注”，不一定能覆盖“加注者再次行动”这种情形。
- **建议**：把条件写全：`cur.bets[i] > P.bets[i] && (lastAct === 'bet' || lastAct === 'raise') && s.status !== P.status[i]`。也就是只把正则换成 `lastAct`，其余两项保留。验证 3 补一条：“加注者再次行动、加注后直接赢下时，不出现加注特效”。

## 非阻塞问题

### N1 预选值“库里没有 `locale`”按现有读法无法判断，注入方式也没写

- **位置**：第 296–303 行。
- **证据**：
  - `loadCaches` 里是 `pick(DEFAULT_SETTINGS, await getKv('settings', DEFAULT_SETTINGS))`，而 `getKv` 会先做 `{ ...fallback, ...value }`（`db/index.ts:147,184`）。所以只要 `DEFAULT_SETTINGS` 里有 `locale`（plan 要求必须有），读出来的 `settingsCache.locale` 就总是有值，无法再判断库里原本有没有存。
  - plan 表格里 `locale` 的默认值写的是“见下文预选值”，但 `DEFAULT_SETTINGS` 是常量，放不下一条依赖 `onboarded` 和系统语言的规则。
  - db 模块拿不到 `app`（design-7 提过应通过 `initDb` 传入），plan 没有写。
  - 写库失败后，`write()` 会再调用一次 `loadCaches()`（`db/index.ts:115`）。如果预选逻辑不在 `loadCaches` 里，重载后新用户的预选值会退回默认值。
- **后果**：最容易想到的写法是 `DEFAULT_SETTINGS.locale = 'zh'`，再检查 `settingsCache.locale` 是否为空。这样判断永远不成立，英文系统的新用户会被预选成中文，而且不会报错。验证 4 的“跳过得到英文”能发现这个问题，但要到实施后才会暴露。
- **建议**：明确写出三点：
  - `DEFAULT_SETTINGS.locale = 'zh'`；
  - 在 `loadCaches` 中读取原始 kv，判断里面有没有 `locale`；没有时按 `onboarded` 决定取 `'zh'` 还是 `resolveLocale(systemLocale)`；
  - `initDb` 增加参数 `systemLocale: string`，由 `index.ts` 传入 `app.getLocale()`，测试可以注入。

### N2 `onboardingDone` 伪代码与 db 模块的真实接口对不上

- **位置**：第 322–331 行。
- **证据**：
  - 仓库里没有 `saveSettings`，实际函数是 `updateSettings`（`db/index.ts:201`）。
  - `loadPersonas` 没有导出（`db/index.ts:239`）。
  - `personasCache` 是 `export let`，在其他模块（比如 `ipc.ts`）里不能给它赋值，ES 模块导出的绑定对导入方是只读的。
- **后果**：如果照伪代码写在 `ipc.ts` 里，编译不通过；实施者就得自己决定放在哪里。
- **建议**：写明 `onboardingDone` 放在 db 模块，并导出，内部调用 `updateSettings` 和 `reloadPersonas`。ipc 只做转发。

### N3 `lastActs` 新旧算法对照测试没有定义怎么比较

- **位置**：第 168 行：“用现有的随机压测逐手比较新旧两种算法的结果。”
- **证据**：旧算法输出的是文案（`label(e, blinds)`，`view.ts:66`；`text.ts:16-31`），新算法输出枚举，而且两者的规则本来就不同：盲注在旧算法里记为“小盲/大盲 X”，在新算法里记为没有动作，全下的盲注记为 `allin`。
- **后果**：对照测试要么写不出来，要么由实施者自己定映射表，结果可能和契约不一致。
- **建议**：写明比较方法。例如由旧文案推出枚举：盲注记为 `undefined`；以“全下”开头的记为 `allin`；“加注至”记为 `raise`；“下注”记为 `bet`；其余按动词对应。然后逐座位断言新旧相等。

### N4 CI 迁移少了几处必要改动

- **位置**：第 451–459 行，以及“目录与包”中根 `package.json` 的描述。
- **证据**：
  - `build.yml` 用的是没有指定版本的 `pnpm/action-setup@v4`，它从根目录 `package.json` 的 `packageManager` 读取 pnpm 版本。plan 说根目录 `package.json` “只放编排脚本”，没有提到要保留 `packageManager: pnpm@11.22.0`。缺了这个字段，所有 workflow 都会在安装 pnpm 这一步失败。
  - `build.yml` 里还有两处写死了路径，plan 没有逐一列出：`test` job 的 `pnpm typecheck`/`pnpm test`，以及 macOS 签名断言中的 `dist/mac-arm64/River.app`。plan 只写了“工作目录改为 apps/desktop”和上传产物的路径。
- **后果**：验证 7 能在合并前发现这些问题，但会多跑几轮 CI。
- **建议**：写明根目录 `package.json` 保留 `packageManager`；`build.yml` 用 `defaults.run.working-directory: apps/desktop`，或者逐条列出要改路径的步骤，并把签名断言的路径也列进去。

### N5 本地打包命令和 README 没有跟着改

- **位置**：第 451–453 行的根脚本；第 440–443 行的文档。
- **证据**：README 第 23–26 行写的是在根目录运行 `pnpm dist` 打包，而 plan 给根目录定的脚本只有 `dev`、`dev:site`、`build:site`、`test`、`typecheck`，没有 `dist`。文档一节也只更新 `.rivo/knowledge/README.md`。
- **后果**：迁移后，照 README 在根目录运行 `pnpm dist` 会失败。验证 1 的“本地打出 mac 包”也没有写用哪条命令。
- **建议**：根目录加上 `dist: pnpm --filter ./apps/desktop dist`，文档一节补上仓库 `README.md` 的开发和发布命令。

### N6 关键规则中“老用户一律是中文”与细则冲突

- **位置**：第 30 行。
- **证据**：用户决定和 plan 第 302–303 行都只把“已完成引导的”老用户定为中文。还没完成引导的老用户会看到语言页，预选值取系统语言。
- **后果**：评审或测试的人只看关键规则，会误以为所有老用户都不会出现语言页。
- **建议**：改成“已完成引导的老用户是中文（AI 建议，沿用现有行为）”。

### N7 `pnpm` 布局的退回做法可能写错了配置位置

- **位置**：第 465 行、第 512 行：“在 `.npmrc` 里设置 `node-linker=hoisted`”。
- **证据**：仓库用的是 pnpm 11，现有配置（`allowBuilds`、`minimumReleaseAgeExclude`）都写在 `pnpm-workspace.yaml` 里。pnpm 10 以后，这类设置的推荐位置是 `pnpm-workspace.yaml`（`nodeLinker: hoisted`）。pnpm 11 是否还读取 `.npmrc` 里的非认证设置，我没有核实（见检查限制）。
- **后果**：如果 pnpm 11 忽略 `.npmrc`，退回做法会看起来已经生效，实际没有。
- **建议**：改写成在 `pnpm-workspace.yaml` 中设置 `nodeLinker: hoisted`，或者注明实施时先核实。

### N8 手动检查更新的界面呈现没写全，讨论中定下的提示文案也丢了

- **位置**：第 361–397 行。
- **证据**：
  - discussion 写明 `update:error` 到达时，界面提示“下载失败，稍后自动重试”，plan 里没有这一句。
  - `latest`、`downloading`、`error` 三种结果在设置页怎么显示（toast 还是版本行内的文字，停留多久），plan 没有说明，只在验证 5 里写了“有正确提示”。
- **后果**：可以开发，但验收时没有依据判断提示是否“正确”。
- **建议**：补一张表，列出每种结果在设置页的呈现方式和文案 key。可以照 discussion 写成：“下载失败，稍后自动重试”，用 toast 提示。

### N9 `manualDownloading` 作为全局状态位有误报的缝隙，可以改用 `downloadPromise`

- **位置**：第 376–391 行。
- **证据**：electron-updater 6.8.9 在检查失败时也会 emit `error`（`AppUpdater.js:271`）。手动下载进行中，如果每 6 小时一次的后台检查恰好失败（比如断网），`error` 事件会被当成下载失败，推送 `update:error`，并清除状态位。与此同时，`checkForUpdates` 返回的结果本身就带有这次下载的 `downloadPromise`（`AppUpdater.js:418-420`），重复的下载请求也会复用同一个 promise（`AppUpdater.js:441`）。
- **后果**：概率很低，出现时用户会看到一条错误的“下载失败”。
- **建议**（可选）：去掉状态位，改成 `r.downloadPromise?.catch(() => emit('update:error', …))`，这样只对应手动触发的那次下载，而且更简单。替身测试的用例不变。

### N10 回滚说明与自动更新的实际行为不符

- **位置**：第 506 行。
- **证据**：
  - electron-updater 默认不允许降级（`allowDowngrade` 为 false）。“回退到上一个 tag 重新发布”无法让已升级的用户装回旧版本。
  - 旧版本的 `pick(DEFAULT_SETTINGS)` 会丢掉 `locale`。旧版本一旦写入设置，库里的 `locale` 就会被清掉；再升级回来时，英文用户已经完成引导，会被当成中文老用户。
- **后果**：真的出问题时，照着文档操作无法完成回滚，而且会让英文用户变成中文。
- **建议**：改成“把问题提交 revert 掉，用更高的版本号发布”。并写明：手动装回旧版本的英文用户，再升级后会变成中文，接受这个结果。

### N11 实施阶段与契约改动的对应关系，以及少量引用错误

- **阶段**：第 87–91 行说第一阶段结束时“desktop 行为和迁移前完全一致”。但 `handCat` 改名写在 engine 一节，而 `handCat` 要翻译成文字，得依赖第二阶段才有的 i18n。
  - 建议写明 `handCat` 和 `sysKind` 在第二阶段做；第一阶段只做搬迁、`lastActs` 和 `TableStage`。
  - 如果 `handCat` 必须在第一阶段做，就先在 desktop 放一张临时的 key→中文映射表。
- **引用**：
  - 第 523 行写的“river-desktop ADR-005（自动更新）”，实际位置是 `issues/river-v2/adr/005-self-signed-auto-update.md`；
  - 官网机器人“使用 engine 的 `legal`”，实际 API 是 `Table.legalActions()`（`table.ts`）。

## 前轮问题的处理（design-7）

| 编号 | 要求 | plan 中的落实 | 结论 |
| --- | --- | --- | --- |
| N7-1 | `needsSettings` 保留英文正则，只删掉“解密” | 第 359 行 | 已落实 |
| N7-2 | `update:error` 只在已经返回 `downloading` 之后推送；`Events` 增加这个事件；补一条“检查失败时不推送”的测试 | 第 371、376–394、488 行 | 已落实。还有一处小缝隙，见 N9 |
| N7-3 | 结束引导后的跳转先 `await`，再执行 | 第 318 行 | 已落实 |
| N7-4 | 币种判定写成“`locale` 为 `en` 且币种为 `cny` 时改为 `usd`，`fxRate` 置为 null” | 第 326、336 行 | 已落实 |

## 其他核对（没有发现问题）

- **类型与契约**：
  - `Settings.locale`、`Bootstrap.packaged`、`onboarding.done` 的新签名、`update.check`/`UpdateCheck`、`update:error`、`ChatMessage.sysKind`、`SeatView.lastAct`、`TableView.nums.handCat`，都和 `shared/types.ts` 的现状一一对应。
  - `sysKind` 的 5 个值和 runner 中 `sys()` 的 5 处调用对得上（`runner.ts:125,196,203,244,544`）。
  - 现在渲染进程调用 `settings.update` 时只传补丁（Appearance、Settings、CoachPanel），所以拒绝 `locale` 的守卫不会误伤。
- **工程事实**：
  - electron-updater 6.8.9 的 `checkForUpdates()` 返回 `isUpdateAvailable`，会合并同时发起的检查和下载；未打包时返回 null。
  - 引擎先切换街道，再写入发牌记录（`table.ts:201-209`）。
  - `useTableFx` 只读 `TableView` 中的 `handNo`、`board`、`seats`、`done`，以及 `fx`、`back`，所以把入参收窄为 `TableStage` 的 props 是可行的。
  - 缩放补偿和“缩放只能加在外层”的约束与 `useTableFx.ts:160` 的震屏写法一致。
  - `tsconfig.node.json` 没开 `jsx`，这条守卫成立。
  - `PlayingCard` 不依赖 `disp`，把 `disp` 留在 desktop 不会卡住 ui。
- **阅读**：主题都在各自的小节里连续展开，字段表一行一个字段，伪代码、字段表和 JSON 示例描述的是同一套方案。

## 检查限制

- 只读了代码，没有运行任何构建或测试。
- 官网 v2 的 `poker.js` 不在 `design-source/` 快照里，所以“与 river-desktop 快照同一套规则”这一点没有复核，沿用前几轮的结论。
- pnpm 11 是否还读取 `.npmrc` 里的非认证设置（N7），没有查文档核实。
- 没有打开 `River Site v2.dc.html` 逐区块核对官网内容。
