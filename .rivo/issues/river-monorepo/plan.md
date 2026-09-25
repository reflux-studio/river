# River monorepo、官网与中英双语：技术方案

讨论过程与各轮决定：`discussion.md`；审阅记录：`reviews/design-1..7.md`；重要选择：`adr/007-monorepo-package-boundaries.md`；设计稿快照：`design-source/`。

基线：`main` @ 1ece50c（v0.2.1）。

## 需求与本期范围

**为什么做**：River 目前是单包 Electron 应用，还没有官网。用户希望把官网和 app 放进同一个仓库，改成 monorepo，并满足以下要求：

- 引擎、UI 组件等按合理的边界拆包；
- 牌桌、卡牌等组件由 app 和官网共用，不写两套；
- 官网和 app 都支持中英双语；
- 设置页可以手动检查更新。

官网设计稿是 claude.ai/design 项目中的 `River Site v2.dc.html`。它是一个中英双语的单页落地页，包含以下区块：自动对局演示桌、牌友（8 个对手预设）、教练与复盘示意、外观（牌桌色、牌背、特效档位）、费用统计示意、下载、FAQ。

**本期功能点**：

1. **monorepo 迁移**：现有 app 整体移到 `apps/desktop`，行为、包名、appId、版本号和发布配置都不变。
2. **拆出三个共享包**：`@river/engine`（规则）、`@river/ui`（纯展示组件）、`@river/i18n`（固定内容的双语字典）。Agent 暂不拆。
3. **官网 `apps/site`**：用 Astro 加 React 岛实现设计稿，`/` 为中文、`/en/` 为英文，发布到 GitHub Pages。演示桌用 `@river/engine` 和 `@river/ui` 渲染，外观和动效与 app 一致。
4. **desktop 双语**：只有固定内容做双语，动态内容不做。语言在首次进入的引导页选择，之后不能改。
5. **手动检查更新**：设置页“版本”一行加一个“检查更新”按钮。
6. **CI**：新增 PR 检查（`ci.yml`）和官网发布（`site.yml`），`build.yml` 适配新目录。

**关键规则**：

- **固定内容与动态内容**：固定内容是写在代码里的文字，包括界面文案、主进程按模板拼出的展示文字、系统提示词和局面描述，这些都做双语。动态内容是用户写的、模型生成的，或者已经落库的历史记录，都按生成时的语言保存，不翻译。这条原则由用户提出。
- **语言只在引导页选一次**：选定后不能再改；已完成引导的老用户是中文。
- **对手预设**：引导页选好语言后，内置对手就用这个语言的预设；从此它们就是用户数据。

**明确不做**：拆 Agent 包；引入 Turborepo；支持中英以外的语言；设置页切换语言；翻译历史记录和模型输出；使用文档（Starlight）；官网深色模式；自定义域名。

**验收**：“验证与发布”一节中的场景全部通过。

## 现状与总体方案

**现状**：

- **项目**：单包项目，基于 electron-vite 5、React 19、Tailwind 4、shadcn、pnpm 11。目录为 `src/{main,preload,renderer,shared}`，测试在 `test/`，代码约 7.4k 行。
- **引擎**：`src/main/engine/{eval,table}.ts` 是纯 TS，只依赖 `shared/types` 中的 `Card`、`Street`，随机数通过 `Rng` 注入，可以直接在浏览器中运行。
- **渲染层与 store 的耦合**：
  - `CardBack` 从 `useRiver` 读取牌背设置；
  - 牌桌舞台和公屏、外观弹层、操作栏写在同一个 `pages/Table.tsx` 里；
  - `useTableFx` 靠正则 `/^(加注|下注)/` 匹配中文状态文字来触发加注特效。
- **写死中文的地方**：
  - 引擎 `handName()` 直接返回中文牌型；
  - `runner.newChat` 用中文正则 `/^第 \d+ 手 · |重新买入/` 挑出要交给 Agent 的系统消息；
  - 界面、主进程展示文字和提示词中，含中文的代码约 420 行。
- **Agent 的依赖**：`agents/*` 依赖 `db`（`settingsCache`）和 `models/resolve`，使用方只有主进程。
- **electron-vite 与 electron-builder**：
  - electron-vite 没有官方 monorepo 模板；
  - 在 main/preload 中，`dependencies` 里的包会被 externalize，`devDependencies` 里的包会被打进 bundle；
  - electron-builder 26 自带 pnpm 模块收集器，libsql 靠 `asarUnpack` 解包。
- **自动更新**：`updater.ts` 只在打包版本中运行。后台每 6 小时检查一次，并自动下载，出错时静默；下载完成后在顶栏提示“重启更新”。

**总体方案**：

```
river/
├─ apps/
│  ├─ desktop/     原 src、test、build、scripts、electron-builder.yml、electron.vite.config.ts、components.json（git mv）
│  └─ site/        Astro 官网
├─ packages/
│  ├─ engine/      @river/engine   规则、牌型评估、lastActs、fmt、Card/Street/HandCat
│  ├─ ui/          @river/ui       TableStage、Seat、卡牌、筹码、特效函数、felt、tokens.css；子路径 ./types
│  └─ i18n/        @river/i18n     Locale、字典、扑克术语、对手预设、系统提示词
├─ .rivo/  design/  README.md  .github/
├─ package.json          name: river-monorepo（private），只放编排脚本
└─ pnpm-workspace.yaml   packages: [apps/*, packages/*]；保留现有 allowBuilds、minimumReleaseAgeExclude

依赖方向（只能向下）：
  desktop main/shared ─► engine、i18n、ui/types（仅类型）
  desktop renderer    ─► ui、i18n、engine
  site                ─► ui、i18n、engine
  ui ─► engine        i18n ─► engine（仅类型）        engine ─► 无
```

**选择理由**（完整比较见 ADR-007）：

- 只有出现第二个使用方的代码才拆成包。
- 库不做构建，以 TS 源码形式发布，由使用方的 Vite 或 electron-vite 编译。
- desktop 把 workspace 包写进 `devDependencies`，由 electron-vite 打进 bundle，运行时依赖清单保持原样。
- 只有 2 个应用和 3 个库，`pnpm -r` 和 `--filter` 就能完成编排，所以不用 Turborepo。

**实施顺序**：分三个阶段，每个阶段结束时 desktop 都能通过测试、正常打包。

1. 迁移和拆包（engine、ui），并完成打包验证。这一阶段结束时，desktop 的行为和迁移前完全一致。`handCat` 改名要依赖 i18n，放在第二阶段。
2. 新建 `@river/i18n`，实现 desktop 双语和手动检查更新。
3. 官网和 CI。

## 包的结构与发布形式

每个库的 `package.json` 形式如下（以 ui 为例）：

```json
{
  "name": "@river/ui",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts",
    "./tokens.css": "./src/tokens.css"
  },
  "peerDependencies": { "react": "^19.3.0", "react-dom": "^19.3.0" },
  "dependencies": { "cn": "^0.4.0", "@river/engine": "workspace:*" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run --passWithNoTests" }
}
```

- engine 和 i18n 只有 `.` 一个导出，没有 peerDependencies。
- desktop 的 `package.json` 在 `devDependencies` 中加入三个库（`workspace:*`），`dependencies` 保持不变。
- 桌面包的 `name` 仍是 `river`，`productName`、`appId`、`version` 都不变，userData 目录和自动更新不受影响。
- desktop 的 `shared/types`、`shared/format` 改为从各库重新导出，主进程其余代码的 import 不用改。
- **主进程只能引用 `@river/ui/types`**：`types.ts` 是纯 TS，不含 JSX，也不 import React。这条约束靠 `tsconfig.node.json` 不开 `jsx` 来保证：误引 ui 主入口时，typecheck 会报错（ADR-007）。
- **样式**：ui 使用 Tailwind 类名，自身不打包 CSS。desktop 和官网的入口 CSS 都要做两件事：引入 `@river/ui/tokens.css`，并用 `@source "../../packages/ui/src"`（按各自的相对路径）扫描 ui 的源码。

## @river/engine

**内容**：

| 导出 | 来源 | 说明 |
| --- | --- | --- |
| `Table`、`Legal`、`LogEntry`、`ActionType` 等 | `src/main/engine/table.ts` | 原样迁移 |
| `best`、`equity`、`outs`、`FULL`、`shuffle`、`Rng` | `src/main/engine/eval.ts` | 原样迁移 |
| `handCat` | 由 `handName` 改名而来 | 返回牌型 key，不再返回中文 |
| `Card`、`Street` | 从 `shared/types` 迁入 | desktop 从 engine 重新导出 |
| `HandCat` | 新增 | 牌型 key 的联合类型 |
| `fmt`、`signed` | 从 `shared/format` 迁入 | 主进程和 ui 都要用，而 engine 是两边都能引用的唯一位置 |
| `lastActs` | 新增 | 按座位计算本街最后一个动作 |

`disp`、`txt`、`cardsText` 属于牌面文字的展示函数，留在 desktop 的 `shared/format` 中。

**`HandCat` 的取值**：

| key | 原中文 |
| --- | --- |
| `highCard` | 高牌 |
| `pair` | 一对 |
| `twoPair` | 两对 |
| `trips` | 三条 |
| `straight` | 顺子 |
| `flush` | 同花 |
| `fullHouse` | 葫芦 |
| `quads` | 四条 |
| `straightFlush` | 同花顺 |
| `royalFlush` | 皇家同花顺 |
| `pocketPair` | 口袋对子（翻牌前） |
| `suitedHole` | 同花底牌（翻牌前） |

引擎内部的 `winners()[].handName` 改名为 `handCat`。改名的目的是让英文界面的状态行能显示 “Won 1,200 · Flush”；调用方在生成文字时再翻译。

**`lastActs(log: LogEntry[], street: Street): Map<number, LastAct>`**，其中 `type LastAct = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'`：

- 只统计传入街道的记录。引擎先切换街道，再写入发牌记录，所以手牌进行中，这里取的范围和 `view.ts` 现在用的“最后一条发牌记录之后”相同。
- 传入 `'showdown'` 时，按 `'river'` 统计。摊牌只会发生在河牌圈打完之后，所以结果和现有写法一致（T2 审阅 F1：用 15,920 个状态点核对过）。调用方直接传入引擎的当前街，不需要各自做特判。
- 跳过无人跟注、被退回的记录（`return`）。
- 盲注不算动作。
- 带 `allIn` 标记的动作一律记为 `'allin'`，包括短码玩家交盲注时全下。
- desktop 的 `view.ts` 和官网的映射都调用这个函数，同一段推导只写一份。

**测试**：

- `engine.test.ts` 中只测 eval 和 table 的用例移到包内；测 `table/text` 的用例留在 desktop。
- 断言中文牌型的用例改为断言 key。
- 和 `poker.js` 的差分对照继续读取 `.rivo/issues/river-desktop/design-source/poker.js`，只调整相对路径。测试文件里放一张本地的 key→中文映射表，不引用 i18n，以免形成循环依赖。官网 v2 用的 `poker.js` 和这份快照是同一套规则：`sbI`/`bbI`、`runoutStep`、`decide`、`startStack` 都能对上。
- 新增 `lastActs` 的测试：
  - 手写用例覆盖以下情形：被退回的下注、短码玩家全下交盲注、换街后清空；
  - 另用现有的随机压测做性质检查：每一步里，每个座位的结果都等于该座位本街最后一条有效记录对应的动作。有效记录不包括退回记录，也不包括没有全下的盲注；全下的盲注计为 `allin`。

## @river/ui：牌桌舞台与展示组件

**原则**：只放纯展示组件。数据全部通过 props 传入，不引用 `lib/river`，不接触 IPC 和 store，也不包含文案。特效标签 `ALL IN` 和庄家标记 `D` 是视觉符号，两种语言都一样，不算文案（T3 审阅 F5）。

**内容**：

| 导出 | 来源 | 说明 |
| --- | --- | --- |
| `PlayingCard`、`CardBack`、`EmptyCard`、`MiniCards`、`Suit` | `components/PlayingCard.tsx` | `CardBack` 改为用 prop `back` 接收牌背，不再读 store；`RichText` 留在 desktop |
| `Avatar`、`avatarBg` | `components/Avatar.tsx`、`lib/format.ts` | `avatarBg` 从依赖 store 的 `format.ts` 中移出 |
| `Seat`、`BetChip`、`ChipStacks` | `components/table/Seat.tsx` | 见下文 `Seat` 的改动 |
| `TableStage` | 从 `pages/Table.tsx` 的 `Screen` 中抽出 | 桌面椭圆、底池、公共牌、下注筹码、座位、特效层 |
| `useTableFx` 与特效函数 | `components/table/useTableFx.ts` | 见下文 |
| `FELTS`、`BACKS`、`DENOM`、`feltOf`、`backOf`、筹码函数 | `lib/felt.ts` | `FELTS` 中去掉名称，名称放进 i18n |
| `tokens.css` | `renderer/src/index.css` | `@theme` 和 `:root` 中的颜色、圆角、字体变量 |

**留在 desktop 的**：shadcn `ui/*`、`Segmented`（依赖 radix toggle-group）、`ActionBar`、`ChatPanel`、`CoachPanel`、`Appearance`、`TopBar` 和各页面。这些组件都带状态或 IPC；官网上对应的区块只是静态示意，内容也不同，由官网用 ui 的叶子组件自己拼。

**`@river/ui/types`**：

| 类型 | 说明 |
| --- | --- |
| `SeatView` | 由 `shared/types` 的 `SeatViewPublic` 改名迁入，desktop 以 type-only 方式重新导出 |
| `Felt` | 牌桌色 key，从 `shared/types` 迁入 |
| `Back` | 牌背 key，从 `shared/types` 迁入 |
| `Fx` | 特效档位，从 `shared/types` 迁入 |

**`SeatView` 新增字段**：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `lastAct` | `LastAct \| undefined` | 本街最后一个动作；desktop 的 `view.ts` 和官网的映射都用 engine 的 `lastActs` 赋值 |

`SeatView` 的其他字段不变。`TableView` 的结构不变，只有 `nums.handName` 改为 `nums.handCat`（见 i18n 一节）。

**`TableStage` 的 props**：

| prop | 类型 | 说明 |
| --- | --- | --- |
| `seats` | `SeatView[]` | 座位数据 |
| `board` | `Card[]` | 公共牌 |
| `pot` | `number` | 底池 |
| `done` | `boolean` | 这一手是否结束 |
| `handNo` | `number` | 手数，发牌动效依赖它 |
| `heroSeat` | `number \| null` | 玩家本人的座位；app 传 0，官网演示桌传 null（所有座位都按对手样式显示） |
| `heroTurn` | `boolean` | 是否轮到玩家本人 |
| `felt` | `ReturnType<typeof feltOf>` | 牌桌色 |
| `back` | `Back` | 牌背 |
| `fx` | `Fx` | 特效档位 |
| `labels` | `{ pot: string; sb: string; bb: string }` | 必填，由调用方从 i18n 取值 |
| `children` | `ReactNode` | 渲染在舞台根节点内、桌面之上；app 用它放“公屏”按钮和“桌面外观”浮层 |

**`Seat` 的改动**：`isHero` 改为由调用方传入，不再写死为 `i === 0`；小盲、大盲的文字来自 `labels`。

**特效**：

- 全下、加注标签、光环、筹码飞行、弃牌飞牌、赢家收筹码拆成 ui 导出的函数，例如 `playAllIn(root, layer, seatEl)`。
- `useTableFx` 只负责对比前后两次视图，再调用这些函数，由 `TableStage` 在内部调用。拆分后判断顺序保持不变：
  - 发牌后提前返回；
  - `lite` 档在气泡之后返回；
  - 全下和加注二选一；
  - 下注筹码飞行、弃牌飞牌、筹码收回的条件和顺序不变；
  - 赢家延时 700ms 收筹码的定时器仍然由 hook 持有。
- **加注特效的触发条件**：本座位的下注额增加、`lastAct` 为 `bet` 或 `raise`、`status` 有变化，三者同时满足。和现在（`useTableFx.ts:161`）相比，只是把正则 `/^(加注|下注)/` 换成了 `lastAct`，其余两个条件保留，所以英文界面也能触发，也不会在加注者再次思考、轮到自己或赢下这一手时误触发。
- **缩放补偿**：坐标换算时，用 `getBoundingClientRect().width / offsetWidth` 求出缩放系数，再做补偿。官网用 `transform: scale` 缩放舞台时位置依然正确；在 app 里系数为 1，行为不变。
- 缩放只能加在 `TableStage` 外层的包裹元素上，因为全下的震屏动画会改写舞台根节点的 `transform`。

## @river/i18n 与 desktop 双语

### 固定内容与动态内容

| 内容 | 分类 | 处理 |
| --- | --- | --- |
| 界面文案（renderer） | 固定 | 按语言取字典 |
| 主进程的展示文字：状态行、行动标签、街道、位置、结果横幅、桌名、下注档位、玩家称呼（你 / You） | 固定 | 按语言取字典 |
| 主进程的提示文字：IPC 返回给界面的错误信息、提供方类型名（如“OpenAI 兼容接口”）、更新弹窗、报错弹窗 | 固定 | 按语言取字典 |
| 系统提示词：对手和教练的框架提示词、教练的 3 种风格、`COACH_ASKS` | 固定 | 按语言取字典，并写明“请用中文回复 / Reply in English” |
| 发给模型的其他固定文字：`text.ts` 生成的局面描述和摘要标题 | 固定 | 按语言取字典 |
| 发给模型的其他固定文字：`thread.ts` 和 `runner.ts` 里的摘要与工具结果文字 | 固定 | 按语言取字典 |
| 发给模型的其他固定文字：工具的 description 和 zod 的 `.describe()` | 固定 | 按语言取字典 |
| 渲染进程的格式化：日期（现在写死为 `'zh-CN'`）、`<html lang>`、币种名称 | 固定 | 按语言选取 |
| 对手预设：内置 8 个对手的名称、标签、介绍、提示词 | 选定语言前固定，之后动态 | 按引导页选的语言决定，之后视为用户数据 |
| 用户写的内容：自建或改过的对手、提问 | 动态 | 原样保存和显示 |
| 模型输出：对手发言、教练讲解、复盘、长期印象 | 动态 | 原样保存和显示 |
| 历史记录：公屏、手牌记录中的 `label`、`pos`、`handName`，往手摘要 | 动态 | 按生成时的语言保存，不重新渲染 |

语言在运行期间不会变化，所以不存在牌局中途切换、历史记录重新渲染这类问题。

### 包内容

`@river/i18n` 是纯 TS 包，没有第三方依赖，主进程、渲染进程和官网都可以引用。

| 模块 | 内容 |
| --- | --- |
| `locale.ts` | 定义 `type Locale = 'zh' \| 'en'`；`resolveLocale(tag: string): Locale` 对 `zh*` 返回 `zh`，其余返回 `en` |
| `dict.ts` | `zh` 字典，以及类型为 `typeof zh` 的 `en` 字典，漏翻的词条在编译时报错；带参数的词条写成函数 |
| `poker.ts` | 扑克术语：街道、`HandCat`、行动、位置、小盲、大盲、底池，界面、主进程展示文字和局面描述共用这一份 |
| `presets.ts` | 8 个内置对手预设的中英两份，字段有 name、tag、ini、desc、prompt；两种语言的 id 必须相同，因为数据库按 id 保存改动；hue 等非文本字段不分语言；英文初稿取自设计稿 |
| `prompts.ts` | 对手和教练的框架提示词、教练风格、`COACH_ASKS` 的中英两份，每一份都写明回复语言 |
| `index.ts` | `dict(locale)` 返回对应语言的字典 |

- 字典按使用方分成 `common`、`poker`、`desktop`、`prompt` 四个命名空间。
- 牌桌色和牌背的名称按 key 放在 `common` 里。
- 官网的营销文案放在官网自己的字典中，不放进这个包。

字典写法示例：

```ts
export const zh = {
  poker: { street: { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌' } },
  desktop: { status: { thinking: '思考中…', won: (amount: string, cat?: string) => `赢得 ${amount}${cat ? ' · ' + cat : ''}` } },
  // …
}
export const en: typeof zh = {
  poker: { street: { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' } },
  desktop: { status: { thinking: 'Thinking…', won: (amount, cat) => `Won ${amount}${cat ? ' · ' + cat : ''}` } },
  // …
}
```

主进程通过 `dict(settings.locale)` 取字典。渲染进程用一个 React context 提供 `t`，它的值随 `settings.locale` 变化。

### 语言入口：引导页

**`Settings` 新增字段**：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `locale` | `'zh' \| 'en'` | 见下文“预选值” | 必须写进 `DEFAULT_SETTINGS`，否则 `pick()` 会丢掉存下的值 |

**预选值**：界面拿到的 `settings.locale` 总是有值，确定方式如下：

- `DEFAULT_SETTINGS.locale` 为 `'zh'`。
- `getKv` 读出的设置已经合并了默认值，无法据此判断库里有没有存 `locale`。所以 `loadCaches` 要读取原始的 kv 值来判断。
- 原始值里没有 `locale` 时：已完成引导的老用户取 `zh`；还没完成引导的新用户取 `resolveLocale(systemLocale)`。程序不会主动把预选值写库；现有的 `updateSettings` 每次写入整份设置，预选值可能被顺带存进去，这不影响结果。
- `systemLocale` 由 `index.ts` 在 app ready 之后读取 `app.getLocale()`，再作为 `initDb` 的新参数传入。

**命令与返回值的变化**：

| 名称 | 旧 | 新 |
| --- | --- | --- |
| `onboarding.done` | `() => void` | `(locale: Locale) => { settings: Settings; personas: Persona[] }` |
| `settings.update` | 接受 `Partial<Settings>` 中的任意字段 | 补丁中含 `locale` 时抛错拒绝；只有 `onboarding.done` 能写入语言 |
| `Bootstrap` | — | 新增 `packaged: boolean`，供“检查更新”按钮使用 |

**引导流程**：

- 引导 Dialog 的第一页是语言页，只在还没完成引导时出现；从设置页或大厅重新打开“规则介绍”时，不再显示语言页。
- 在语言页切换选项后，后面的引导卡片立即换成所选语言，但这时还不写库。
- 点“完成”、点“跳过”、按 Esc，所有结束引导的方式都调用 `onboarding.done(当前选中的语言)`，没改动过就是预选值。所以英文系统的新用户直接跳过，得到的也是英文。
- 最后一页的“去配置”和“带我打一手”要先 `await onboarding.done`，再跳转。否则可能在对手缓存按新语言重建之前就开桌。

**主进程处理 `onboarding.done`**：逻辑写在 db 模块里，导出为 `completeOnboarding(locale)`，因为它要直接写 `settingsCache`、`personasCache`，并调用模块内部的 `loadPersonas`。`ipc.ts` 只负责转发。

```ts
// main/db/index.ts
export async function completeOnboarding(locale: Locale) {
  if (await getOnboarded()) return { settings: settingsCache, personas: personasCache } // 只在未完成引导时生效
  const patch: Partial<Settings> = { locale }
  if (locale === 'en' && settingsCache.currency === 'cny') Object.assign(patch, { currency: 'usd', fxRate: null })
  await updateSettings(patch)          // 直接调用 db 现有的函数；拒绝修改 locale 的守卫在 ipc.ts 的 settings.update 处理函数里，这里不受影响
  await setOnboarded(true)
  personasCache = await loadPersonas() // 按新语言的预设重建
  return { settings: settingsCache, personas: personasCache }
}
```

**启动失败弹窗**：这时可能读不到数据库，按 `app.getLocale()` 选择语言。

**默认币种**：选英文的新用户，如果币种还是默认的人民币，就改成美元。选中文的用户币种不变，仍然可以在设置页修改。

### 对手预设

- 数据库仍然只保存用户改过的字段，没改过的字段为空，读取时用种子值补齐。
- 种子值从 `shared/personas.ts` 中的中文改为 `presets[settings.locale]`。
- 保存时和同一语言的种子值比较，“恢复默认”就是把字段清空，恢复成这个语言的预设。
- 语言选定后不会再变，所以效果等同于“引导页选好语言后把预设写进去”，但不需要复制数据，也不需要迁移。
- 老用户的 `locale` 是 `zh`，种子值和现在完全一样。
- 少见情况：没完成过引导、但已经改过对手的老用户选择英文时，改过的字段保留原文，没改过的字段变成英文，同一个对手会中英混杂。这只发生在引导完成之前，接受这个结果。
- `shared/personas.ts` 中的 `COACHES`、`STREET` 分别移到 i18n 的 `prompts.ts` 和 `poker.ts`，`BLINDS` 留在 desktop。

### 公屏系统消息的类型字段

**问题**：`runner.newChat` 用中文正则挑出“第 N 手”分隔和重新买入消息交给 Agent。英文用户的公屏写的是英文，正则会失效，Agent 就分不清发言属于哪一手，而且不会报错。

**做法**：在 `ChatMessage` 上新增一个字段，`newChat` 按这个字段判断。

| 字段 | 类型 | 取值与写入位置 |
| --- | --- | --- |
| `sysKind` | `'hand' \| 'rebuy' \| 'street' \| 'seat' \| 'win' \| undefined` | 只在 `kind === 'sys'` 时有值；runner 写系统消息的 5 处分别对应这 5 个值 |

- 消息文字仍然按用户的语言生成（快照），不改成结构化渲染。
- 同类隐患：`needsSettings` 的正则里有中文“解密”，这是一条死分支（中文的解密错误只出现在 `provider.test` 的返回值里），直接删掉。正则的其余部分匹配的是模型 SDK 抛出的英文错误，保持不变。

## 手动检查更新

设置页“版本”一行加一个“检查更新”按钮。

**新增命令和事件**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `update.check` | 命令，签名 `() => UpdateCheck` | 手动检查更新 |
| `UpdateCheck` | `{ state: 'latest' } \| { state: 'downloading'; version: string } \| { state: 'ready'; version: string } \| { state: 'error'; message: string }` | 检查结果 |
| `update:error` | 事件，负载 `{ message: string }` | 手动检查返回 `downloading` 之后，这次下载失败时推送 |

**主进程逻辑**（复用 `updater.ts` 中已有的 `autoUpdater` 实例）：

```ts
async function checkNow(): Promise<UpdateCheck> {
  if (ready) return { state: 'ready', version: ready }
  try {
    const r = await updater.checkForUpdates()
    if (!r?.isUpdateAvailable) return { state: 'latest' }
    // autoDownload 已开启，downloadPromise 就是这次检查触发的下载；只跟踪它，后台检查的失败不会误报
    r.downloadPromise?.catch((e) => { console.error('updater', e); emit('update:error', { message: t.update.downloadFailed }) })
    return { state: 'downloading', version: r.updateInfo.version }
  } catch (e) {
    console.error('updater', e)
    return { state: 'error', message: t.update.checkFailed }   // 界面显示本地化的短句，原始错误只写日志
  }
}
// update-downloaded 事件沿用现有的 update:ready；updater 的 error 事件仍然只写日志
```

- 检查阶段本身失败时，只通过 `update.check` 返回 `error`，不推送 `update:error`，所以同一次失败不会提示两次。
- **设置页的显示**：“版本”一行显示当前版本号，右侧是“检查更新”按钮；结果用 toast 展示。

  | 结果 | 提示（中文 / 英文） |
  | --- | --- |
  | `latest` | 已是最新版本 / You're up to date |
  | `downloading` | 发现新版本 {v}，正在后台下载 / Downloading {v} in the background |
  | `ready` | 新版本 {v} 已就绪，可在顶栏重启更新 / {v} is ready — restart from the top bar |
  | `error` | 检查更新失败，请稍后再试 / Couldn't check for updates |
  | `update:error` | 下载失败，稍后自动重试 / Download failed, will retry later |
- electron-updater 会合并同时发起的检查和下载，重复点击不会重复下载。界面在请求进行中禁用按钮。
- 开发版本（`packaged` 为 false）没有更新源，按钮置灰，并说明原因。
- 后台定时检查的行为不变：静默运行，下载完成后在顶栏提示“重启更新”，只在不在牌桌上时安装。

## 官网 apps/site

- **结构**：Astro 静态输出。
  - 交互区块写成 React 岛：演示桌、外观切换、全下展示、教练档位、币种切换、FAQ 展开、下载平台切换。
  - 其余部分输出为静态 HTML。
- **语言**：
  - `/` 是中文，`/en/` 是英文。两个页面用同一组组件，靠 `lang` 参数区分，语言切换是链接跳转。
  - 浏览器语言不是中文的访客打开 `/` 时，不自动跳转，只在页顶显示一条可以关闭的 “English →” 提示，关闭状态存在 localStorage。
  - 营销文案放在官网自己的字典里；对手预设、扑克术语、牌桌色名称从 `@river/i18n` 取。
- **演示桌**：
  - 数据来源：`@river/engine` 的 `Table` 加官网自己的启发式机器人。机器人移植自设计稿的 `decide`，使用 engine 的 `Table.legalActions()` 和 `equity`，放在 `apps/site`。
  - 映射：官网的 `toSeatView`（对应设计稿中的 `viewReal`）按语言生成状态文字，并用 `lastActs` 填写 `lastAct`。
  - 渲染：交给 `TableStage`，`heroSeat` 传 null。
  - 缩放：加在外层包裹元素上。
  - 保留设计稿中的暂停/继续、气泡台词（`LINES`），以及“当前轮到谁”的状态行。
- **外观区的全下展示**：小牌桌每 2.8 秒直接调用一次 ui 的 `playAllIn`。
- **下载**：
  - 运行时请求 GitHub API，取最新 release，按访客的平台高亮对应条目；请求失败时退回到 `/releases/latest`。
  - 按文件名匹配安装包，依赖 `apps/desktop/electron-builder.yml` 中的 `artifactName`，两处都加注释互相指向。
- **部署**：见“验证与发布”。

## 影响面与外部协同

**受影响的调用方**：

- **主进程**：`view.ts`（`lastActs`、`handCat`、状态文字取字典）；`runner.ts`（`sysKind`、`newChat`、记录写入时翻译牌型）；`text.ts`、`thread.ts`、`agents/*`（提示词和局面描述取字典）；`ipc.ts`（`onboarding.done`、`settings.update` 守卫、`update.check`）；`db`（`locale` 默认值、种子值按语言选取）；`updater.ts`；`index.ts`（启动失败弹窗）。
- **渲染进程**：所有页面和组件的文案；`Onboarding.tsx`（增加语言页，所有结束路径都写入语言）；`Settings.tsx`（检查更新）；`Table.tsx`（改用 `TableStage`）。
- **测试**：原测试随代码迁到 `apps/desktop/test` 和 `packages/engine`。测试默认使用中文，已有断言基本不用改。

**兼容性**：

- 老用户数据库没有 `locale`，读出来是 `zh`，行为和现在一样。
- 手牌记录的格式不变。
- `ChatMessage` 只新增可选字段，公屏消息不写入数据库。
- 桌面包的 name、appId、版本号和发布配置都不变，已安装用户的自动更新链路不受影响。

**外部协同**：

- **GitHub Pages**：合并前由用户在仓库 Settings → Pages 里把来源设为 “GitHub Actions”。仓库是公开的，不涉及付费。
- **官网地址**：先用项目页 `reflux-studio.github.io/river`，Astro 配置 `base: '/river'`。以后换自定义域名时，改 `site` 和 `base`，并加上 CNAME。

**文档**：

- 更新 `.rivo/knowledge/README.md` 中的系统结构图和路径；
- 新增 ADR-007。

## 验证与发布

**脚本与 CI**：

| 项 | 内容 |
| --- | --- |
| 根 `package.json` | 必须保留 `packageManager: pnpm@11.22.0`，`pnpm/action-setup` 靠它确定 pnpm 版本 |
| 根 `package.json` 脚本 | `dev`：`pnpm --filter ./apps/desktop dev`（桌面包名仍是 `river`，所以按路径过滤） |
| | `dist`：`pnpm --filter ./apps/desktop dist`（README 中写的本地打包命令保持可用） |
| | `dev:site`、`build:site` |
| | `test`、`typecheck`：`pnpm -r` |
| 各包的 typecheck | 每个包有自己的 `tsconfig.json` 和 `typecheck` 脚本；官网用 `astro check` |
| `build.yml` | test job 在根目录执行 `pnpm typecheck` 和 `pnpm test`；打包相关步骤（prices、读取版本号、构建、electron-builder、codesign 断言中的 `dist/mac-arm64/River.app` 路径）的工作目录改为 `apps/desktop`；上传路径改为 `apps/desktop/dist/*` |
| `ci.yml`（新增） | PR 和推送到 `main` 时，运行 `pnpm -r typecheck` 和 `pnpm -r test` |
| `site.yml`（新增） | 触发条件：`main` 分支上 `apps/site/**`、`packages/**` 或 `pnpm-lock.yaml` 有变动，或手动触发 |
| | 步骤：全仓 typecheck 和 test → `astro build` → 发布到 Pages |
| `.gitignore` | 增加 `.astro/`，其他现有规则已经覆盖子目录 |

**验证场景**：

1. **打包先行（风险最高，放在第一阶段）**：
   - 在 pnpm workspace 下，本地打出 mac 包并启动，确认 libsql 原生模块能加载、`river.db` 能读写、userData 目录名不变。
   - 如果 pnpm 的隔离布局导致缺包，退回做法是改用 hoisted 布局（只改变安装布局）：pnpm 11 在 `pnpm-workspace.yaml` 中写 `nodeLinker: hoisted`，实施时以 pnpm 文档为准。结果写回本方案。
2. **desktop 迁移**：
   - `pnpm typecheck`、`pnpm test` 全部通过；
   - `pnpm dev` 下牌桌的外观和迁移前一致（截图对比牌桌舞台）。
3. **TableStage 与特效**：app 牌桌的行为不变，逐项检查以下情形：
   - 全下、加注；
   - 加注者再次行动、玩家本人加注后又轮到自己、加注后直接赢下时，都不出现加注特效；
   - 下注被退回、弃牌飞牌、赢家延时收筹码；
   - 气泡；
   - 特效档位切到 `lite` 和 `off`。
4. **i18n**：
   - **新用户全流程**：新用户分别选择中文和英文，完整走一遍。检查引导页、界面、状态文字、对手预设、对手发言、教练讲解和复盘，都应是所选语言。
   - **结束引导的方式**：英文系统的新用户分别用“完成”、“跳过”、Esc 结束引导，三种方式都应得到英文。
   - **引导的重复打开与即时生效**：从设置页重新打开规则介绍时，不出现语言页。选完语言后，大厅和对手页不用重启就是新语言。
   - **语言写入守卫**：引导完成后调用 `settings.update({ locale })` 会被拒绝。
   - **老数据库**：用 v0.2.1 的老数据库启动，不出现引导页，语言是中文，改过的对手保持原样。
   - **默认币种**：选英文的新用户币种为美元；选中文的是人民币。
   - **字典完整性**：`en: typeof zh` 能通过 typecheck。这只能发现字典缺词。
   - **残留中文的自动检查**：
     - 在英文模式下用现有的随机压测跑若干手，教练局和自由局都要跑。
     - 在测试的 mock 模型入口截取发给模型的全部内容，包括工具定义的 description 和参数说明。mock 目前只记录工具名，需要补齐。
     - 连同整个 `TableView` 和公屏的系统消息，断言其中没有汉字。
   - **`newChat` 英文用例**：英文模式下，“第 N 手”分隔和重新买入消息照样交给 Agent。
5. **检查更新**：
   - 用替身 updater 做单元测试，覆盖 `latest`、`downloading`、`ready`、`error` 四种结果，以及“`downloading` 之后下载失败推送 `update:error`”“检查失败时不推送 `update:error`”两种情形。
   - 打包版本手动测试：“已是最新”和“检查失败”（断网）都有正确提示。
   - 开发版本下按钮不可用。
6. **官网**：
   - `astro build` 生成的 `/` 和 `/en/` 能离线打开；
   - 演示桌自动跑若干手不报错；
   - 在浏览器里和设计稿逐区块对比；
   - 手机宽度下没有横向滚动。
7. **CI**：
   - 合并前在分支上用 workflow_dispatch 手动触发一次 `build.yml`，三个平台都要产出安装包；
   - `ci.yml` 在 PR 上通过。
8. **官网上线（只能在合并后验证）**：第一次 `site.yml` 跑完后，访问线上的 `/` 和 `/en/`。

**发布与回滚**：

- 所有改动在一个分支上完成。第 1 到 7 项有任何一项没通过，就不合并。
- 合并后按现有流程打 tag 发版。desktop 保留了原来的发布配置，已安装用户照常收到自动更新。
- 官网发布失败不影响 app 的发布链路：修复后重新手动触发 `site.yml` 即可，不需要回滚代码。
- 如果 app 发版后出现问题，只能向前修复：发布一个版本号更高的修复版。electron-updater 默认不会降级，已经升级的用户不能回退到旧 tag。
- 如果修复版回退了本期代码（例如回退到 v0.2.1 的实现再加版本号），旧代码保存设置时会丢掉 `locale`（`pick` 只保留它认识的字段）。之后英文用户再升级到新版本，会被当成已完成引导的老用户，语言变成中文。这时只能在修复说明里告知用户。

## 待决问题与依据

**已批准延后验证的事项**：

- **打包布局**：第一阶段已经实测（T1，`evidence/T1/commands.md`）。pnpm 默认的 isolated 布局可行：迁移前后 `app.asar` 的文件列表完全相同，`app.asar.unpacked` 中的 libsql 文件也一致，所以不需要 hoisted。
- **官网上线**：只能在合并后验证。失败只影响官网，不影响 app。

**AI 建议、沿用现有行为的规则**：已完成引导的老用户语言为中文（这一点已在 plan 中向用户说明，用户回复“可以，开干吧”）。

**依据**：

- 讨论与用户决定：`discussion.md`；
- 设计审阅：`reviews/design-1.md` 至 `design-7.md`；
- ADR-007；
- 设计稿快照：`design-source/River Site v2.dc.html`、`river-site.js`，规则对照使用 `../river-desktop/design-source/poker.js`；
- 相关旧决定：river-desktop ADR-001、003，river-v2 ADR-005（自动更新），unified-agent ADR-006（Agent 本桌 thread）。
