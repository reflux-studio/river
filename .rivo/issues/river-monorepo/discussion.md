# River monorepo 与官网 — 方案讨论

日期：2026-09-25　基线：`main` @ 1ece50c（v0.2.1）

## 起因（用户原话要点）

1. 把官网和 app 放进同一个仓库，改成 monorepo。设计稿是 claude.ai/design 项目 `2a5400ca…` 里的 `River Site v2.dc.html`（依赖 `poker.js`、`river-site.js`、`support.js`、`river-icon.png`），快照在 `design-source/`。
2. 看看 electron 有没有现成的 monorepo 脚手架。
3. 引擎、UI 组件、Agent 等按合理边界拆包，让模块解耦。
4. 牌桌、卡片等组件由 app 和官网共用，不写两套。
5. （讨论中追加）i18n：官网和 desktop 都做中英双语。只有固定内容做双语，动态内容不做。语言在首次进入的引导页选择。
6. （讨论中追加）设置页支持手动检查更新。

## 查证到的现状

- 单包项目：electron-vite 5、React 19、Tailwind 4、shadcn，pnpm 11。目录 `src/{main,preload,renderer,shared}`，代码约 7.4k 行，测试在 `test/`。
- `src/main/engine/{eval,table}.ts` 是纯 TS，只依赖 `shared/types` 中的 `Card`、`Street`，随机数通过 `Rng` 注入，没有 Node 依赖，浏览器可以直接运行。
- `test/engine.test.ts:448` 用 `vm` 加载 `.rivo/issues/river-desktop/design-source/poker.js`，和引擎做差分对照。
- 渲染层的叶子组件与全局 store 耦合：
  - `PlayingCard.tsx:71` 的 `CardBack` 从 `useRiver` 读 `settings.back`。
  - `Seat` 的类型是 `SeatViewPublic`（`shared/types.ts:161`），它由主进程的 `table/view.ts` 算好后推给界面。
  - 牌桌舞台（桌面椭圆、底池、公共牌、下注筹码、座位、特效层）直接写在 `pages/Table.tsx` 的 `Screen` 里，同一个组件里还有公屏、外观弹层和操作栏。
  - `useTableFx` 只依赖 `felt.ts` 和 `TableView` 中的少数字段，不读 store。
- `agents/*` 依赖 `db`（`settingsCache`）和 `models/resolve`，使用方只有主进程。
- 设计稿是中英双语的单页落地页，由这些部分组成：自动对局演示桌、牌友（8 个人设加提示词）、教练与复盘示意、外观（牌桌色、牌背、特效档位）、费用统计示意、下载（取 GitHub 最新 release）、FAQ。
  - 演示桌用的是设计稿自带的 `poker.js`（规则 + 启发式 `decide`）。
  - `river-site.js` 里的 `viewReal` 注明“与应用 Seat.tsx 一致”。
  - 牌桌色、牌背、筹码的取值与 `lib/felt.ts` 相同。
- electron-vite 没有官方 monorepo 模板，官方脚手架只生成单包。社区模板有 buqiyuan/electron-vite-monorepo（Vue）和 ccpu/electron-vite-tailwind-monorepo-template（React），两者都用 pnpm + Turborepo。
- electron-vite 5 在 main/preload 中会把 `dependencies` 里的包 externalize；`devDependencies` 中的包或 `build.externalizeDeps.exclude` 列出的包会被打进 bundle。
- electron-builder 从 `dependencies` 收集运行时包。libsql 是原生模块，靠 `asarUnpack` 解包。

## 用户决定

| 问题 | 决定 |
| --- | --- |
| 官网框架 | Astro + React 岛；以后加使用文档时接 Starlight |
| 拆包范围 | 拆 `@river/engine`、`@river/ui`；追加 i18n 后再加 `@river/i18n`；Agent 暂不拆 |
| 部署 | GitHub Pages |
| 交付范围 | 一个需求交付完：迁移、拆包、官网 |
| 官网双语 | `/` 中文、`/en/` 英文两条路由（AI 建议，用户采纳） |
| 演示桌动效 | 复用 app 的 `useTableFx`（AI 建议，用户采纳） |
| 仓库与 Pages | 仓库是公开的；由用户在合并前开启 Pages（来源设为 GitHub Actions） |
| 不用脚手架和 Turborepo | 只用 pnpm workspace 编排（AI 建议，用户确认） |
| 外观区的全下展示 | 从 ui 导出特效函数，app 和官网共用（AI 建议，用户采纳） |
| i18n 范围 | 官网和 desktop 都做中英双语（用户追加） |
| 固定与动态 | 只有固定内容做双语：界面文案、主进程按模板拼出的展示文字、系统提示词和局面描述。动态内容不做：对手预设（选定后）、用户自己写的内容、模型输出、历史记录。动态内容就是生成时的快照（用户决定） |
| 语言入口 | 首次进入时在引导页选择，按系统语言预选；之后可以在设置页随时切换，设置页不会重新走引导（用户决定。2026-09-26 纠正：AI 曾误解为设置页不能切换）。老用户默认中文，也可以切换 |
| 对手预设 | 名称和提示词只在引导页按所选语言写入一次；之后无论怎么切换语言都不变，“恢复默认”也恢复到引导时的语言（用户决定，2026-09-26 澄清） |
| 系统提示词 | 属于固定内容，按语言准备两份，并在提示词里写明“请用中文回复 / Reply in English”（用户决定） |
| 手动检查更新 | 设置页“版本”一行加“检查更新”按钮（用户追加） |
| 默认币种 | 引导页选英文的新用户默认美元，选中文仍默认人民币；设置页可以改（AI 建议，用户采纳） |
| i18n 实现 | 新增 `@river/i18n`，自写类型化字典，不依赖第三方库（AI 建议，用户采纳）。这一项取代“拆包只拆 engine 和 ui”的决定，也取代“官网人设文案自存一份” |

## 方案

### 目录与包

```
river/
├─ apps/
│  ├─ desktop/     原 src、test、build、electron-builder.yml、electron.vite.config.ts、components.json 等整体移入（git mv）
│  └─ site/        Astro 官网
├─ packages/
│  ├─ engine/      @river/engine
│  ├─ ui/          @river/ui
│  └─ i18n/        @river/i18n
├─ .rivo/  design/  README.md  .github/
├─ package.json          根：private，只放编排脚本
└─ pnpm-workspace.yaml   packages: [apps/*, packages/*]，保留现有 allowBuilds、minimumReleaseAgeExclude

依赖方向（只能向下）：
  apps/desktop main/shared ─► @river/engine、@river/i18n
                           └► @river/ui/types（仅类型，纯 .ts 无 JSX/React）
  apps/desktop renderer ───► @river/ui ─► @river/engine（Card 类型与 fmt）
                          └► @river/i18n
  apps/site ───────────────► @river/ui、@river/engine、@river/i18n
  @river/i18n ─► @river/engine（只用 HandCat、Street 等类型）
```

- **不用 Turborepo**：只有 2 个应用、2 个库，库都不需要构建，`pnpm -r` 和 `--filter` 就能完成编排。以后库需要构建产物，或者 CI 时间明显变长，再考虑引入。
- **库以 TS 源码形式发布**：`package.json` 中写 `"exports": { ".": "./src/index.ts" }`，没有构建步骤，由使用方的 Vite 或 electron-vite 编译。
- **desktop 把 workspace 包写进 `devDependencies`**，这样 electron-vite 会把它打进 main/renderer 的 bundle，electron-builder 也不会把符号链接带进 asar。运行时依赖清单保持原样。
- 桌面包的 `name`、`productName`、`appId`、`version` 保持不变，自动更新和 userData 目录不受影响。版本号仍以 `apps/desktop/package.json` 为准，CI 取 tag 的逻辑不变。

### @river/engine

- 内容：`eval.ts`、`table.ts`，从 `shared/types` 移来的 `Card`、`Street` 类型，从 `shared/format.ts` 移来的筹码金额格式化 `fmt`、`signed`，以及新增的 `lastActs(log, street)`。`lastActs` 从引擎日志中按座位算出本街最后一个动作（`fold/check/call/bet/raise/allin`）。desktop 的 `view.ts` 和官网的映射都调用它，避免同一段推导写两份。
  - `lastActs` 的契约：
    - 跳过无人跟注被退回的记录（`return`）；
    - 盲注记为没有动作；
    - 有 `allIn` 标记的动作一律记为 `'allin'`，包括短码玩家交盲注时全下。
  - 用现有的随机压测逐手对照 `lastActs` 和旧写法的结果。
  - `fmt`、`signed` 留在 engine，因为主进程和 ui 都要用，而 engine 是两边都能引用的唯一位置；ADR 里写明这个理由。
  - `disp`、`txt`、`cardsText` 是牌面文字的展示函数，留在 desktop 的 `shared/format`。
  - desktop 的 `shared/types` 和 `shared/format` 改为从 engine 重新导出，所以主进程其余代码的 import 不变。
- 测试：`engine.test.ts` 中只测 eval 和 table 的部分移到包内，测 `table/text` 的部分留在 desktop。差分对照继续读 `.rivo/issues/river-desktop/design-source/poker.js`，只改相对路径。官网 v2 用的 `poker.js` 与这份快照是同一套规则：`sbI`/`bbI`、`runoutStep`、`decide`、`startStack` 都能对上，所以不另存一份。
- 官网的启发式机器人（从设计稿 `decide` 移植，基于 engine 的 `legal` 和 `equity`）放在 `apps/site`。它只有官网一个使用方，放进 engine 反而会让 engine 背上与规则无关的职责。

### @river/ui

- 只放**纯展示组件**：数据全部走 props，不 import `lib/river`，不接触 IPC 和 store，不包含文案。组件里需要的文字由调用方从 `@river/i18n` 取好后传入。
- 内容：
  - `PlayingCard`、`CardBack`、`EmptyCard`、`MiniCards`、`Suit`
  - `Avatar`、`Seat`（带 `Bubble`）、`BetChip`、`ChipStacks`
  - `felt.ts`：`FELTS`、`BACKS`、`DENOM`、筹码函数、`feltOf`、`backOf`。`FELTS` 中不再带名称，名称按 key 放在 `@river/i18n` 的 `common` 里。
  - **`TableStage`**：从 `pages/Table.tsx` 的 `Screen` 中抽出牌桌舞台（桌面椭圆、底池、公共牌、下注筹码、座位、特效层）。
  - `useTableFx`
  - `tokens.css`：`index.css` 中 `@theme` 与 `:root` 的颜色、圆角、字体变量。
- 牌背的传递方式：
  - `TableStage` 和 `Seat` 通过 props 接收 `back`。
  - `MiniCards` 等深层组件只用牌面，不需要牌背。
  - 除 `CardBack` 外，有需要牌背的深层组件时再补一个 context；实施时先按 props 传。
- **类型归属**：ui 的展示类型放在 `packages/ui/src/types.ts`，它是纯 TS，不含 JSX，也不 import React，通过子路径 `@river/ui/types` 导出。内容包括 `SeatView`（由 `SeatViewPublic` 改名而来）、`Felt`、`Back`、`Fx`。
  - desktop 的 `shared/types` 以 type-only 方式重新导出这些类型，`Settings`、`TableView` 的结构不变。
  - 主进程和 `tsconfig.node.json` 因此只会加载这个纯 TS 文件，不会碰到 TSX。
  - 主进程只允许 import `@river/ui/types`，这条规则写进 ADR。
- **`SeatView` 契约改动**（从根上解决特效靠匹配中文文案触发的问题）：
  - 新增结构化字段 `lastAct?: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'`，两边都用 engine 的 `lastActs` 赋值。
  - `useTableFx` 的加注特效改为按 `lastAct` 是 `bet` 或 `raise` 且 `status` 有变化来触发，不再用 `/^(加注|下注)/` 匹配文案。
- **`TableStage` props**：
  - 牌局数据：`seats: SeatView[]`、`board: Card[]`、`pot`、`done`、`handNo`（发牌动效依赖它）。
  - 玩家本人：`heroSeat: number | null`。app 传 0；官网演示桌全是机器人，传 null，这时所有座位都按对手样式显示。`heroTurn` 用来给本人座位加高亮。
  - 外观：`felt`（`feltOf` 的结果）、`back`、`fx`。
  - 文案：`labels: { pot, sb, bb }`，都是必填。
  - `children` 渲染在舞台根节点里，位于桌面之上，app 用它放“公屏”按钮和“桌面外观”浮层。
- **`Seat` props**：`isHero` 改为由调用方传入，不再写死 `i === 0`；小盲、大盲的文案来自 `labels`。
- **`useTableFx`**：
  - 入参收窄为 `TableStage` 已有的数据，由 `TableStage` 在内部调用。
  - 坐标换算按 `getBoundingClientRect().width / offsetWidth` 求出缩放系数再补偿。这样舞台在官网被 `transform: scale` 缩放时，筹码飞行和光环的位置依然正确，app 里缩放系数是 1，行为不变。
  - **缩放只能加在 `TableStage` 外层的包裹元素上**：全下时的震屏动画会在舞台根节点上改写 `transform`。
  - 各个特效（全下、加注、筹码飞行、光环、标签）拆成 ui 导出的函数，例如 `playAllIn(root, layer, seatEl)`。`useTableFx` 负责对比前后视图，再调用这些函数；官网“外观·动效”区的小牌桌每 2.8 秒直接调用一次 `playAllIn`。
- `avatarBg` 从 `renderer/lib/format.ts` 移到 ui（那个文件依赖 store），`fmt` 从 `@river/engine` 引入。`RichText` 只有教练面板用，留在 desktop。`MiniCards` 移到 ui。
- ui 的 `package.json` 中，`react`、`react-dom` 写成 `peerDependencies`；`exports` 同时列出 `.`、`./types`、`./tokens.css` 三项。
- 主进程只引用 `@river/ui/types` 这条约束，实际靠 `tsconfig.node.json` 不开 `jsx` 来保证：误引 ui 的主入口会在 typecheck 时报错。ADR 里写明这一点，以后要改 `tsconfig.node` 的 jsx 设置，必须先改用其他守卫方式。
- 样式：ui 用 Tailwind 类名，自身不打包 CSS。两个应用都要：
  - 引入 `@river/ui/tokens.css`；
  - 用 `@source` 指令扫描 `packages/ui/src`。
- 留在 desktop 的：shadcn `ui/*`、`Segmented`（依赖 radix toggle-group）、`ActionBar`、`ChatPanel`、`CoachPanel`、`Appearance`、`TopBar` 和各页面。这些都带状态或 IPC；官网上对应的只是静态示意，内容也不同，由官网用 ui 的叶子组件自己拼。
- `cn`：ui 直接依赖 `cn` 包（与 desktop 现在的写法相同）。

> **2026-09-26 修订**：本节中关于“设置页不能切换语言”“`settings.update` 拒绝 locale”“对手种子跟随 `settings.locale`”的内容已经被用户纠正，以 `plan.md` 的“语言入口：引导页与设置页”“对手预设”两节为准：设置页可以切换语言，对手预设按 `presetLocale` 在引导时快照。

### @river/i18n 与 desktop 双语

**原则：只有固定内容做双语，动态内容不做。**

| 内容 | 分类 | 处理 |
| --- | --- | --- |
| 界面文案（renderer） | 固定 | 按语言取字典 |
| 主进程按模板拼出的展示文字：状态行（思考中… / 赢得 X · 牌型）、行动标签、街道、位置、结果横幅、桌名、下注档位、玩家称呼（你 / You）、IPC 抛给界面的错误信息、提供方类型名（如“OpenAI 兼容接口”）、更新和报错弹窗 | 固定 | 按语言取字典 |
| 系统提示词：对手和教练的框架提示词、教练的 3 种风格、`COACH_ASKS`、`text.ts` 生成的局面描述与摘要标题、`thread.ts` 和 `runner.ts` 里的摘要与工具结果文字、工具的 description 和 zod `.describe()` | 固定 | 按语言取字典，并写明“请用中文回复 / Reply in English” |
| 渲染进程的格式化：日期（现在写死 `'zh-CN'`）、`<html lang>`、币种名称 | 固定 | 按语言选取 |
| 对手预设（内置 8 个的名称、标签、介绍、提示词） | 选定前固定，选定后动态 | 按引导页选的语言确定，之后当作用户数据 |
| 用户写的内容：自建和修改过的对手、提问 | 动态 | 原样保存和显示 |
| 模型输出：对手发言、教练讲解、复盘、长期印象 | 动态 | 原样保存和显示 |
| 历史记录：公屏、手牌记录（`label`、`pos`、`handName`）、往手摘要 | 动态 | 生成时是什么语言就存什么语言，是快照，不重新渲染 |

**语言入口**：
- `Settings` 新增 `locale: 'zh' | 'en'`，并写进 `DEFAULT_SETTINGS`（否则 `pick()` 会丢掉存下的值）。
- **预选值由主进程算好**：加载设置时，如果库里没有 `locale`，已完成引导的老用户取 `zh`，未完成引导的新用户取 `resolveLocale(app.getLocale())`。所以界面拿到的 `settings.locale` 一定有值，就是预选值。
- **语言页只在未完成引导时出现**：引导 Dialog 的第一页是语言页；从设置页或大厅重新打开“规则介绍”时，已经完成引导，不再出现语言页。
  - 在语言页切换选项时，界面立即用所选语言渲染后面的引导卡片，但先不写库。
- **写入与生效**：`onboarding.done` 改为 `onboarding.done(locale)`。点“完成”、点“跳过”、按 Esc，所有结束引导的路径都带上当前选中的语言（没动过就是预选值）。这样英文系统的新用户直接跳过，也会得到英文。
  - 主进程写入 `locale` 和 `onboarded`。如果 `locale` 为 `en` 且币种仍是默认的 `cny`，就改成 `usd`，并把 `fxRate` 置空。然后按新语言重建对手缓存，并返回新的 `settings` 和 `personas`，界面立即切换。
- 引导最后一页的“去配置”和“带我打一手”要先 `await` `onboarding.done`，再执行跳转，否则可能在人设按新语言重建之前就开桌。
- **写入守卫**：`settings.update` 拒绝修改 `locale`，只有 `onboarding.done` 能写入，而且只在未完成引导时生效。
- **启动失败弹窗**：这时可能读不到数据库，按 `app.getLocale()` 选语言。
- 少见情况：没完成过引导、但已经改过对手的老用户选了英文，改过的字段保留原文，没改过的字段变成英文，同一个对手会中英混杂。这种情况发生在引导完成之前，影响很小，接受。
- 因为语言不会在运行中变化，牌局锁定、中途切换、历史重新渲染这些问题都不存在，也就不做。

**包内容**（`@river/i18n`，纯 TS，没有第三方依赖，主进程、渲染进程和官网都可以引用）：

| 模块 | 内容 |
| --- | --- |
| `locale.ts` | `type Locale = 'zh' \| 'en'`；`resolveLocale(tag)`，`zh*` 返回 `zh`，其他返回 `en` |
| `dict.ts` | `zh` 字典和 `en: typeof zh`，漏翻的词条会在编译时报错；带参数的词条写成函数 |
| `poker.ts` | 扑克术语：街道、牌型（按 `HandCat` 取值）、行动、位置、小盲/大盲/底池；界面、主进程展示文字和局面描述共用这一份 |
| `presets.ts` | 8 个内置对手预设的中英两份（name、tag、ini、desc、prompt），两种语言的 id 必须相同（数据库按 id 保存改动）；英文初稿取自设计稿；hue 等非文本字段不分语言 |
| `prompts.ts` | 对手和教练的框架提示词、教练风格、`COACH_ASKS` 的中英两份，每份都写明回复语言 |

字典按使用方分命名空间：`common`、`poker`、`desktop`、`prompt`。牌桌色和牌背的名称按 key 放在 `common` 里，`FELTS` 中不再带名称。官网的营销文案放在官网自己的字典里。

**引擎改动**：
- `handName()` 改名为 `handCat()`，返回牌型 key `HandCat`，不再返回中文。取值有 `highCard`、`pair`、`twoPair`、`trips`、`straight`、`flush`、`fullHouse`、`quads`、`straightFlush`、`royalFlush`，翻牌前另有 `pocketPair`、`suitedHole`。
- 这是必须的改动：状态行里的“赢得 X · 同花”是模板文字，英文界面要显示 Flush。
- 相关调用方随之改动：`winners()[].handName` 和 `TableView.nums.handName` 改为 `handCat`；`view.ts`、`runner.ts`、`text.ts` 在生成文字时翻译。
- 写入手牌记录时，`handName` 仍然存翻译好的文字（快照），记录格式不变。
- `engine.test.ts` 中断言中文牌型的用例改为断言 key。与 `poker.js` 的差分对照在测试文件里放一张本地的 key→中文映射表，不引用 i18n，避免循环依赖。

**对手预设**：
- 数据库仍然只保存用户的改动，没改的字段为空，读取时用种子值补齐。改动点是“种子值”从 `shared/personas.ts` 的中文，改为 `presets[settings.locale]`。
- 保存时和同一语言的种子值比较；“恢复默认”就是把字段置空，恢复到这个语言的预设。
- 语言选定后不会再变，所以这等同于“引导页选好语言后把预设写进去”，但不用复制数据、不用迁移。现有用户的 `locale` 是 `zh`，种子值和现在一样。

**公屏系统消息加类型字段**（修复根因）：
- 现在 `runner.newChat` 用中文正则 `/^第 \d+ 手 · |重新买入/` 挑出“第 N 手”分隔和重新买入消息，交给 Agent。
- 英文用户的公屏写的是英文，这个正则就会失效，Agent 会分不清发言属于哪一手，而且不会报错。
- 改为在 `ChatMessage` 上新增 `sysKind?: 'hand' | 'rebuy' | 'street' | 'seat' | 'win'`，`newChat` 按这个字段判断。runner 写公屏系统消息的 5 处都能对上这些类型。
- 同类隐患：`needsSettings` 的正则里有中文“解密”，这是一个死分支（中文解密错误只出现在 `provider.test` 的返回值里），删掉即可。正则的其余部分匹配的是模型 SDK 抛出的英文错误，不是我们自己的文案，保持不变。
- 消息文字仍然按用户的语言生成（快照），不做结构化渲染。

**官网**：牌友区直接用 `presets.ts` 的两份预设，演示桌的状态文字和术语也从 i18n 取。设计稿里的 `PERSONAS`、`PROMPT_ZH/EN` 不再复制。

### 手动检查更新

- 设置页“版本”一行加一个“检查更新”按钮。
- 新增 IPC 命令 `update.check`，返回以下四种结果之一：
  - `{ state: 'latest' }`：已是最新版本；
  - `{ state: 'downloading', version }`：发现新版本，正在下载；
  - `{ state: 'ready', version }`：已下载，可以重启更新；
  - `{ state: 'error', message }`：检查失败。
- 手动检查时，结果和错误都要明确告诉用户；后台定时检查仍然静默，不打扰用户。
- 已经处于 `ready` 时直接返回，并让顶栏的“重启更新”保持现状。
- 开发版本（未打包）没有更新源，`Bootstrap` 新增 `packaged: boolean`，界面据此把按钮置灰并说明原因。
- `downloading` 的判定：`checkForUpdates()` 返回的 `isUpdateAvailable` 为 true，且还没到 `ready`。electron-updater 本身会合并同时发起的检查和下载，所以重复点击不会重复下载；界面在请求进行中禁用按钮。
- 返回 `downloading` 之后下载失败：`update.check` 返回 `downloading` 时，设置一个状态位 `manualDownloading`；下载完成或出错时清除。只有这个状态位为真时，updater 的 `error` 事件才推送新事件 `update:error`（加进 `Events`），界面提示“下载失败，稍后自动重试”。检查阶段本身的失败只由 `update.check` 返回 `error`，不会重复提示。后台检查的失败仍然静默。
- 显示给用户的错误信息用本地化的短句，原始错误只写日志。
- 测试：用替身 updater 为 `update.check` 的四种结果、下载失败，以及“检查失败时不推送 `update:error`”各写一条单元测试。
- 复用 `updater.ts` 中现有的 `autoUpdater` 实例，不另外创建，避免和后台检查重复下载。

### apps/site（Astro）

- 结构：Astro 静态输出。落地页中的交互区块（演示桌、外观切换、教练档位、币种切换、FAQ 展开、下载平台切换）写成 React 岛，其余部分输出静态 HTML。
- 语言：`/` 是中文，`/en/` 是英文，两页用同一组组件，由 `lang` 参数区分，文案字典放在官网里。设计稿原本在客户端切换语言并存入 localStorage；改为两条路由后，每种语言都有可被索引的静态页。语言切换改成链接跳转。
  - 浏览器语言不是中文的访客打开 `/` 时，不自动跳转，只在页顶显示一条 “English →” 提示，可以关闭；关闭状态存在 localStorage。
- 演示桌的数据来源：`@river/engine` 的 `Table` 加上官网的机器人，经过官网自己的 `toSeatView` 映射（对应设计稿的 `viewReal`，状态文案按语言生成，并填写 `lastAct`）得到数据，交给 `@river/ui` 的 `TableStage` 渲染（`heroSeat = null`）。
  - 动效用 app 的 `useTableFx`，不用设计稿的 `sim.events` + `animateNew`，两边的动效因此完全一致。
  - 设计稿里的暂停/继续、气泡台词（`LINES`）和“当前轮到谁”状态行都保留，由官网实现。
- 下载链接：运行时请求 GitHub API 获取最新 release，按访客平台高亮对应条目；请求失败时退回 `/releases/latest`，与设计稿一致。按文件名匹配安装包依赖 `apps/desktop/electron-builder.yml` 中的 `artifactName`，两处都加注释互相指向。
- 人设文案：来自 `@river/i18n`，见上一节。官网只保留设计稿中与人设无关的台词（`LINES`）。
- 部署：新增 `.github/workflows/site.yml`。
  - 触发条件：`main` 分支上 `apps/site/**`、`packages/**`、`pnpm-lock.yaml` 有变动，或手动触发。
  - 流程：先跑全仓 typecheck 和 test，通过后构建，再发布到 GitHub Pages。
  - 地址：先用项目页 `reflux-studio.github.io/river`（Astro `base: '/river'`）；以后换自定义域名，只需要改 `site`/`base` 并添加 CNAME。
  - **需要用户手动操作**：合并前在仓库 Settings → Pages 中把来源设为 “GitHub Actions”（仓库是公开的，不涉及付费）。

### 脚本与 CI

- 根目录的 `package.json` 命名为 `river-monorepo`（private），和桌面包的 `river` 区分开。脚本如下，因为桌面包名保持 `river`，所以按路径过滤：
  - `dev` 对应 `pnpm --filter ./apps/desktop dev`；
  - `dev:site`；
  - `test`、`typecheck` 对应 `pnpm -r`；
  - `build:site`。
- `build.yml`：各步骤的工作目录改到 `apps/desktop`，产物路径改为 `apps/desktop/dist/*`，`scripts/prices.mjs` 随 desktop 一起移动。
- 新增 `ci.yml`：PR 和 `main` push 时跑 `pnpm -r typecheck` 和 `pnpm -r test`。现在只有打 tag 时才跑测试。
- 每个包都有自己的 `tsconfig.json` 和 `typecheck` 脚本；site 用 `astro check`。
- `.gitignore`：现有规则已经覆盖子目录，只需要补上 `.astro/`。
- 文档：更新 `.rivo/knowledge/README.md` 中的系统结构图和路径；新增 ADR 记录包边界与依赖方向，包括主进程只能引用 `@river/ui/types`、Agent 暂不拆包及其理由。

### 实施顺序

i18n 要改动的主要是界面、主进程展示文字和提示词中的约 420 行含中文源码，等于在迁移之外又做一次全仓改动。所以先完成迁移、拆包和打包验证（验证 1 到 3），这时 desktop 行为和迁移前完全一致；然后做 `@river/i18n` 和 desktop 双语；最后做官网。每个阶段结束时，desktop 都能测试通过、正常打包。

### 验证

1. **打包先行（最高风险）**：在 pnpm workspace 中，electron-builder 能否正确收集 libsql 原生模块、asar 解包是否生效，需要在本地实际打包 mac 版并启动，确认读写 `river.db` 和 userData 目录名正常。如果 pnpm 的隔离布局导致缺包，退回方案是在 `.npmrc` 设 `node-linker=hoisted`（只影响安装布局），并在 plan 中记录。
2. desktop：`pnpm typecheck`、`pnpm test` 全部通过；`pnpm dev` 的牌桌外观与迁移前一致（截图对比牌桌舞台）。
3. ui：TableStage 抽出后，app 牌桌行为不变。逐项检查这些情形：全下、加注、下注被退回、弃牌飞牌、赢家延时收筹码、气泡，以及 `lite`、`off` 两档特效。
4. i18n：
   - 新用户分别选中文和英文走一遍：引导页、界面、状态文字、对手预设、对手发言、教练讲解和复盘，都是所选语言；
   - 用 v0.2.1 的老数据库启动：不出现引导页，语言是中文，改过的对手保持原样；
   - `en: typeof zh` 通过 typecheck（只能发现字典缺词）；
   - 自动检查残留的中文：英文模式下用现有的随机压测跑若干手（教练局和自由局都跑），在测试的 mock 模型入口截取发给模型的全部内容（包括工具定义的 description 和参数说明，mock 目前只记录了工具名称，要补上），再加上整个 `TableView` 和公屏的系统消息，断言其中没有汉字；
   - 新增 `newChat` 的英文用例：英文模式下，“第 N 手”分隔和重新买入消息照样喂给 Agent；
   - 测试默认用中文，已有断言不用大面积改动。
   - 引导：英文系统的新用户分别用“完成”、“跳过”、Esc 结束引导，三种方式都得到英文；从设置页重新打开规则介绍，不出现语言页；选完语言后，大厅和对手页不用重启就是新语言；引导完成后调用 `settings.update({ locale })` 会被拒绝。
   - 检查更新：打包版本下手动检查，“已是最新”和“检查失败”（断网）两种结果都能正确提示；开发版本下按钮不可用。
5. site：`astro build` 生成的 `/` 与 `/en/` 能正常离线打开；演示桌自动跑满若干手不报错；在浏览器里和设计稿逐区块对比。
6. CI：合并前在分支上用 workflow_dispatch 手动触发一次 build.yml，三个平台都要产出安装包；ci.yml 在 PR 上通过。
7. 官网发布只能在合并后验证：第一次 site.yml 跑完后访问线上的 `/` 和 `/en/`。发布失败或页面异常不影响 app 的发布链路；修复后重新手动触发即可，不需要回滚代码。

### 回退

迁移集中在一个分支上完成。由于 `apps/desktop` 保留了原有的 name、appId、版本号和发布配置，已安装用户的自动更新链路不受影响。验证 1 到 6 任何一步失败都不合并。官网发布是否成功，不影响 app 的发布。

### 本期不做

Agent 拆包、Turborepo、中英以外的语言、使用文档（Starlight）、官网深色模式（app 也只有浅色）、自定义域名。
