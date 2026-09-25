# River monorepo、官网与中英双语：实施任务

## 目标与共同约定

- **方案依据**：`plan.md`（用户已批准，并授权实施）、`adr/007-monorepo-package-boundaries.md`、`discussion.md` 中的“用户决定”表。基线为 `main` @ 1ece50c（v0.2.1）。
- **分支**：所有改动在 `feat/monorepo-site-i18n` 分支上完成，每个任务至少提交一次；合并前要通过“整体验证”。
- **目录与包名**：
  - 根目录 `package.json` 的 `name` 为 `river-monorepo`（private）；`pnpm-workspace.yaml` 的 `packages: [apps/*, packages/*]`，原有的 `allowBuilds`、`minimumReleaseAgeExclude` 保留。
  - `apps/desktop` 的 `name`、`productName`、`appId`、`version` 和发布配置一律不改。
  - 共享包有 `@river/engine`、`@river/ui`、`@river/i18n`，官网在 `apps/site`。
- **包的发布形式**：
  - 各包直接以 TS 源码发布，没有构建步骤，`exports` 指向 `src/*.ts`。
  - `@river/ui` 另外导出 `./types`（纯 TS 文件，不含 JSX，也不 import React）和 `./tokens.css`；`react`、`react-dom` 放在 `peerDependencies`。
  - desktop 把三个包写进 **devDependencies**（`workspace:*`），`dependencies` 保持不变。
- **依赖方向**，违反即视为缺陷：
  - desktop 的 main/shared 只能引用 engine、i18n、`@river/ui/types`；
  - desktop renderer 和 site 可以引用 ui、i18n、engine；
  - ui 引用 engine；i18n 只引用 engine 的类型；engine 不引用任何包。
- **库的边界**：
  - ui 只放纯展示组件，不 import `lib/river`，不接触 IPC 和 store，不写文案；
  - i18n 只放固定内容；engine 只放规则。
- **i18n 原则**：
  - 固定内容做双语：界面文案、主进程的模板文字、系统提示词和局面描述，提示词里写明回复语言。
  - 动态内容保持生成时的快照：对手预设选定之后的内容、用户写的内容、模型输出、历史记录。
  - 语言只在引导页选择一次，之后不能再改；老用户固定为 `zh`。
- **测试默认中文**：已有断言不能因为本次改动而大面积改写。
- **工具链**：`typescript`、`vitest`、`@types/node` 在根 `package.json` 的 devDependencies 中统一声明，各包不再重复声明；`packages/*` 的 `typecheck` 脚本为 `tsc --noEmit -p tsconfig.json`；desktop 保留现有脚本（分别检查 `tsconfig.node.json` 和 `tsconfig.web.json`），因为它的根 `tsconfig.json` 是 `files: []` 加 references，直接检查会什么都不查，还会让 ADR-007 的守卫失效。官网为 `astro check`，`@astrojs/check` 由 site 自己声明；`@types/react` 由 ui 声明。如果 pnpm 在各包目录下执行脚本时找不到根目录的 `tsc` 或 `vitest`，就改由各包自己声明这些依赖。所有包都必须有 `typecheck` 和 `test` 脚本（没有测试的包用 `vitest run --passWithNoTests`），这样 `pnpm -r` 才能覆盖到。
- **中文检查命令**：统一用 `rg -n '\p{Han}' <路径> -g '*.ts' -g '*.tsx'`；macOS 自带的 grep 不支持 `-P`。
- **每个任务结束时都要满足**：
  - `pnpm -r typecheck` 和 `pnpm -r test` 全部通过；
  - desktop 能 `pnpm dev` 启动。

## 任务顺序

```
阶段一（迁移，行为不变）   T1 ─► T2 ─► T3
阶段二（双语与更新）       T4 ─► T5 ─► T6 ─► T7（T7 和 T5、T6 改动同几个文件，所以串行）
阶段三（官网与 CI）        T8（依赖 T3、T5）  T9（依赖 T1、T8）
最后                       整体验证
```

## 任务 1：workspace 骨架、desktop 迁移与打包验证

**目标**：仓库变成 pnpm workspace，现有应用整体迁到 `apps/desktop`，行为完全不变；pnpm workspace 下打出的 mac 包能正常运行。

**前置依赖**：无。

**修改位置**：
- `git mv` 到 `apps/desktop/`：`src`、`test`、`build`、`scripts`、`electron-builder.yml`、`electron.vite.config.ts`、`components.json`、`tsconfig*.json` 和原来的 `package.json`。
- 以下留在根目录：`.rivo`、`design`、`README.md`、`.github`、`.gitignore`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`。
- 新建根 `package.json`，内容如下：

```json
{
  "name": "river-monorepo",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.22.0",
  "scripts": {
    "dev": "pnpm --filter ./apps/desktop dev",
    "dev:site": "pnpm --filter ./apps/site dev",
    "build:site": "pnpm --filter ./apps/site build",
    "dist": "pnpm --filter ./apps/desktop dist",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test"
  }
}
```

**实施步骤**：
1. 迁移文件，检查所有相对路径：
   - `test/engine.test.ts` 读取 `.rivo/issues/river-desktop/design-source/poker.js` 的路径改为 `../../../.rivo/...`；
   - `electron-builder.yml` 的 `buildResources`；
   - `scripts/prices.mjs` 的输出路径；
   - `components.json` 中的 css 路径。
2. 在根目录执行 `pnpm install`，更新 lockfile。
3. `.gitignore` 增加 `.astro/`。
0. （第一步做）迁移前先保存基线截图，供 T3、T6 对比：在迁移前的 `main` 上运行 `pnpm dev`，截取大厅、牌桌（教练局、有下注时）、对手、设置四张图，存到 `evidence/T1/baseline/`。
5. 修正根目录路径：`design/export-icons.py` 的输出目录改为 `apps/desktop/build` 和 `apps/desktop/src/renderer/public`；README 中的打包输出路径改为 `apps/desktop/dist/`。
6. 在 `apps/desktop` 下执行 `pnpm build && pnpm exec electron-builder --mac --publish never`，打出 mac 包。
7. 启动打包后的应用：
   - 确认 libsql 能加载、`river.db` 能读写（打一手牌，然后查看回放）；
   - 确认 userData 仍然是 `~/Library/Application Support/River`。
   - 如果缺包，改用 hoisted 布局：pnpm 11 在 `pnpm-workspace.yaml` 中写 `nodeLinker: hoisted`，以 pnpm 文档为准。重新安装并验证，再把结论写回 `plan.md`“待决问题”一节。

**工程注意事项**：
- electron-builder 只从 `dependencies` 收集运行时依赖，libsql 靠 `asarUnpack` 解包，这两项配置都不要改。
- 桌面包名必须保持 `river`，因为 userData 目录和自动更新都依赖它。

**验证与完成标准**：
- `pnpm typecheck`、`pnpm test`（根目录）全部通过；
- `pnpm dev` 能启动；
- 打包后的应用能完成一手牌并写入回放；
- 在 `.rivo/issues/river-monorepo/evidence/T1/` 中记录打包命令、`codesign -dv` 的输出和手动验证的结果。

**结果**：（交付阶段填写）

## 任务 2：抽出 @river/engine

**目标**：规则代码迁入 `packages/engine`，desktop 改为从这个包引用；新增 `lastActs`。行为不变。

**前置依赖**：T1。

**修改位置**：
- 新建 `packages/engine/{package.json,tsconfig.json,src/index.ts,src/eval.ts,src/table.ts,src/types.ts,src/format.ts,src/last-acts.ts,test/*.test.ts}`。
- 删除 `apps/desktop/src/main/engine/`，所有 import 改为 `@river/engine`。
- `apps/desktop/src/shared/types.ts` 改为从 engine 重新导出 `Card`、`Street`；`shared/format.ts` 改为从 engine 重新导出 `fmt`、`signed`。`disp`、`txt`、`cardsText` 仍然留在 desktop。

**输入输出**：
- engine 导出 `Table` 及其类型、`best`、`equity`、`outs`、`FULL`、`shuffle`、`Rng`、`handName`（本任务不改名）、`Card`、`Street`、`fmt`、`signed`、`lastActs`、`LastAct`。
- `type LastAct = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'`
- `lastActs(log: LogEntry[], street: Street): Map<number, LastAct>` 的规则：
  - 只统计 `street` 这一街的记录；
  - 跳过 `return` 记录；
  - 盲注不算动作；
  - 带 `allIn` 的记录一律记为 `'allin'`，其余按 `type` 取值。

**实施步骤**：
1. 迁移 eval 和 table 两个文件，确认它们只依赖 `Card`、`Street` 类型。
2. 把 `engine.test.ts` 中只测 eval 和 table 的用例（包括 poker.js 差分对照，路径改为从 `packages/engine/test` 出发的相对路径）移到 `packages/engine/test`；测 `table/text` 的用例留在 desktop。差分用例（约第 454 行）在同一个循环里还断言了 `disp`，而 `disp` 留在 desktop，所以要拆开：规则对照移到 engine，`disp` 的断言留在 desktop 单独成一条用例。
3. 实现 `lastActs`，并补单元测试：
   - 手写用例覆盖被退回的下注、短码玩家全下交盲注、换街后清空；
   - 用随机压测做性质检查：每一步里，每个座位的结果都等于该座位本街最后一条有效记录对应的动作。有效记录不包括退回记录，也不包括没有全下的盲注；全下的盲注计为 `allin`。
4. desktop 的 `package.json` 在 devDependencies 中加入 `"@river/engine": "workspace:*"`。
5. `electron.vite.config.ts` 通常不用改，因为 devDependencies 默认会被打进 bundle。如果构建产物里出现了 `require('@river/engine')`，就加上 `build.externalizeDeps.exclude`。

**工程注意事项**：`tsconfig.node.json` 的 include 需要能解析 workspace 包的源码；每个包使用自己的 tsconfig。

**验证与完成标准**：
- 全仓 typecheck、test 通过；
- `out/main/index.js` 中不出现 `@river/engine` 的 require；
- `pnpm dev` 下能正常打牌。

**结果**：

## 任务 3：抽出 @river/ui 与 TableStage

**目标**：牌桌展示组件迁入 `packages/ui`，desktop 的牌桌改用 `TableStage`，外观和动效都不变。加注特效改为按 `lastAct` 触发；特效拆成可以单独调用的函数；支持被缩放的舞台。

**前置依赖**：T2。

**修改位置**：

| 新增文件 | 来源或内容 |
| --- | --- |
| `packages/ui/src/cards.tsx` | `PlayingCard`、`CardBack`、`EmptyCard`、`MiniCards`、`Suit` |
| `packages/ui/src/avatar.tsx` | `Avatar`、`avatarBg` |
| `packages/ui/src/seat.tsx` | `Seat`、`BetChip`、`ChipStacks` |
| `packages/ui/src/table-stage.tsx` | 新组件 `TableStage` |
| `packages/ui/src/fx.ts` | 特效函数和 `useTableFx` |
| `packages/ui/src/felt.ts` | 来自 `lib/felt.ts`，`FELTS` 去掉 `n` 字段 |
| `packages/ui/src/types.ts` | `SeatView`、`Felt`、`Back`、`Fx`、`LastAct`（重新导出） |
| `packages/ui/src/tokens.css` | `index.css` 中的 `@theme` 和 `:root` |
| `packages/ui/src/index.ts` | 统一导出 |

- desktop 删除上述组件的原文件，改为引用 `@river/ui`。
- `Table.tsx` 改为使用 `<TableStage>`，把原来的“公屏”按钮和外观浮层作为 `children` 传入。
- `index.css` 改为 `@import '@river/ui/tokens.css'`，并加上 `@source` 扫描 `packages/ui/src`。
- `shared/types.ts`：`SeatViewPublic` 改为 `export type { SeatView as SeatViewPublic }`，同时重新导出 `Felt`、`Back`、`Fx`；`SeatView` 新增 `lastAct?: LastAct`。
- `main/table/view.ts` 用 `lastActs` 给 `lastAct` 赋值（原来的状态文字计算不变）。
- `Appearance.tsx` 中的牌桌色名称，暂时在 desktop 本地用 key→中文的映射表提供，T6 再改成从 i18n 取。
- `feltOf` 的参数类型改为 `{ felt: Felt; feltCustom: string }`，不再引用 desktop 的 `Settings`。
- `PlayingCard.tsx` 需要拆分：卡牌组件移到 ui，`RichText` 留在 desktop（例如改名为 `components/RichText.tsx`），`CoachPanel` 改为从新位置引用。

**输入输出**：

`TableStage` 的 props（都是必填，只有 `children` 除外）：

| prop | 类型 |
| --- | --- |
| `seats` | `SeatView[]` |
| `board` | `Card[]` |
| `pot` | `number` |
| `done` | `boolean` |
| `handNo` | `number` |
| `heroSeat` | `number \| null` |
| `heroTurn` | `boolean` |
| `felt` | `ReturnType<typeof feltOf>` |
| `back` | `Back` |
| `fx` | `Fx` |
| `labels` | `{ pot: string; sb: string; bb: string }` |
| `children` | `ReactNode`，可选 |

其他组件的接口：
- `Seat` 增加 prop `isHero: boolean` 和 `labels`，不再写死 `i === 0`。
- `CardBack` 增加 prop `back: Back`。
- 特效函数的签名形如 `playAllIn(root: HTMLElement, layer: HTMLElement, seatEl: Element | null)`；加注、筹码飞行、光环、标签也按同样方式各导出一个函数。

**实施步骤**：
1. 迁移叶子组件，去掉对 store 的依赖，改用 props。
2. 从 `Screen` 中抽出 `TableStage`，desktop 传入 `heroSeat={0}` 和中文的 `labels`。
3. 把 `useTableFx` 拆成“对比前后视图”和“特效函数”两部分，拆分时保持原有的判断顺序：
   - 发牌后提前返回；
   - `lite` 在气泡之后返回；
   - 全下和加注二选一；
   - 下注飞筹码、弃牌飞牌、收回筹码的条件和顺序不变；
   - 赢家的 700ms 定时器由 hook 持有。
4. 加注的触发条件：本座位下注额增加（`cur.bets[i] > P.bets[i]`）、`lastAct` 是 `bet` 或 `raise`、`status` 发生变化，三者同时满足。只是把原来的正则换成 `lastAct`，其余两个条件保留。
5. 坐标换算时统一乘以缩放系数 `k = root.getBoundingClientRect().width / root.offsetWidth`，在各个特效函数内部完成。

**工程注意事项**：
- 缩放只能加在 `TableStage` 外层，因为震屏动画会改写舞台根节点的 `transform`。
- 从 ui 的主入口不能反向引用 desktop 的任何文件。
- 主进程只能引用 `@river/ui/types`；`tsconfig.node.json` 保持不开 jsx。

**验证与完成标准**：
- 全仓 typecheck 和 test 通过。
- 打开 `pnpm dev`，逐项检查：
  - 全下、加注；
  - 加注者再次行动、玩家本人加注后又轮到自己、加注后直接赢下时，都不出现加注特效；
  - 下注被退回；
  - 弃牌飞牌；
  - 赢家延时收筹码；
  - 气泡；
  - `lite` 和 `off` 两档。
- 和 `evidence/T1/baseline/` 中的牌桌截图对比，新截图保存到 `evidence/T3/`。
- 主进程误引 `@river/ui` 主入口时 typecheck 会失败：临时试一次，确认后撤回。

**结果**：

## 任务 4：@river/i18n、语言设置与引导页选语言

**目标**：新建 i18n 包；`Settings` 增加 `locale`；引导页第一页选语言，任何结束引导的方式都会写入语言；对手预设按语言提供种子；选英文时默认币种改为美元。

**前置依赖**：T2。

**修改位置**：
- 新增 `packages/i18n/src/{locale.ts,dict.ts,poker.ts,presets.ts,prompts.ts,index.ts}`。
  - 本任务先把 `poker`、`common`、`presets` 以及 `desktop` 中引导页用到的词条写全；
  - `prompt` 命名空间可以先放中文原文，英文在 T5 补上。
  - 类型 `en: typeof zh` 一开始就要成立，所以英文词条可以先用占位的英文，但不能留空。
- desktop：
  - `shared/types.ts` 中 `Settings` 增加 `locale`，`Bootstrap` 增加 `packaged`（T7 使用），`Commands['onboarding.done']` 改签名；
  - `main/db/index.ts`：`DEFAULT_SETTINGS`、加载设置时补预选值、种子改为 `presets[locale]`；
  - `main/ipc.ts`：`onboarding.done`，以及 `settings.update` 对 `locale` 的守卫；
  - `renderer`：`lib/river.ts` 提供 i18n context；`components/Onboarding.tsx` 增加语言页；
  - `shared/personas.ts` 删除 `PERSONAS` 和 `COACHES`，把 `STREET` 迁到 i18n，保留 `BLINDS`。同步修改使用方，保证 T4 结束时 typecheck 能通过：
    - `PERSONAS`：`main/db`；
    - `COACHES`：`main/agents/coach.ts`、`renderer/components/table/CoachPanel.tsx`、`pages/Settings.tsx`；
    - `STREET`：`main/table/{text,runner}.ts`。
    - 实施时先用 `rg -n 'PERSONAS|COACHES|STREET' apps/desktop/src` 列出全部使用方。
    - 本任务中，这些使用方只需改为从 i18n 取中文值（`dict('zh')` / `presets.zh`），T5、T6 再改为按 locale 取值。
  - `PersonaSeed` 类型在 i18n 中定义，desktop 从 i18n 引用。
  - `main/index.ts`：在 app ready 之后读取 `app.getLocale()`，传给 `initDb`。
  - `Bootstrap.packaged`：由 `ipc.ts` 从 `AppInfo` 取值，`AppInfo` 新增 `packaged` 字段，`index.ts` 传入 `app.isPackaged`。
  - `STREET` 的使用方还包括 `renderer/pages/Replays.tsx`，以 rg 结果为准。

**输入输出**：

| 名称 | 契约 |
| --- | --- |
| `Locale` | `'zh' \| 'en'` |
| `resolveLocale(tag)` | `zh*` 返回 `'zh'`，其余返回 `'en'` |
| `dict(locale)` | 返回该语言的字典；`en` 的类型是 `typeof zh` |
| `presets` | `Record<Locale, PersonaSeed[]>`，两种语言的 id 和顺序一致，字段有 id、name、tag、ini、hue、desc、prompt |
| `Settings.locale` | `'zh' \| 'en'`，写进 `DEFAULT_SETTINGS`（值为 `'zh'`） |
| `initDb({ url, encrypt, decrypt, systemLocale })` | 在现有的选项对象中新增可选字段 `systemLocale?: string`，缺省为 `'zh'`，保证现有测试默认中文 |
| 预选值 | `getKv` 会合并默认值，判断不出库里有没有 `locale`，所以 `loadCaches` 要读取原始 kv 值来判断。原始值里没有 `locale` 时：`onboarded` 为 true 取 `'zh'`，否则取 `resolveLocale(systemLocale)`，程序不会主动把预选值写库；它被 `updateSettings` 顺带存进库也不影响结果。`systemLocale` 由 `index.ts` 在 app ready 之后读取 `app.getLocale()`，再作为 `initDb` 的新参数传入 |
| `onboarding.done(locale)` | 签名为 `(locale: Locale) => { settings: Settings; personas: Persona[] }`，逻辑见下方伪代码 |
| `settings.update(patch)` | patch 中含 `locale` 时抛错（`'locale is fixed after onboarding'`，界面不展示这条错误） |

`onboarding.done` 的主进程逻辑写在 db 模块中，导出为 `completeOnboarding`，`ipc.ts` 只负责转发：

```ts
export async function completeOnboarding(locale: Locale) {
  if (await getOnboarded()) return { settings: settingsCache, personas: personasCache }
  const patch: Partial<Settings> = { locale }
  if (locale === 'en' && settingsCache.currency === 'cny') Object.assign(patch, { currency: 'usd', fxRate: null })
  await updateSettings(patch)          // db 现有函数；拒绝修改 locale 的守卫写在 ipc.ts 的 settings.update 处理函数里
  await setOnboarded(true)
  personasCache = await loadPersonas()
  return { settings: settingsCache, personas: personasCache }
}
```

**实施步骤**：
1. 建包并写好字典骨架；英文预设的初稿取自 `design-source/river-site.js` 的 `PERSONAS`（desc）和 `River Site v2.dc.html` 的 `PROMPT_EN`。
2. db：
   - `loadPersonas` 和 `savePersona` 中的“种子值”改为 `presets[settingsCache.locale]`，保存时和同一语言的种子值比较；
   - “是否改过”的判断逻辑不变。
3. 主进程实现 `onboarding.done` 和守卫。
4. 渲染进程：
   - 提供一个 `useT()` context，值来自 `settings.locale`。
   - 引导 Dialog 在 `!onboarded` 时才显示第一页“语言页”，预选值取 `settings.locale`；在语言页切换时，只修改本地状态，并让后面的卡片立即换成所选语言。
   - 所有结束引导的路径都要调用 `finishOnboarding(selected)`：“跳过”“稍后再说”“去配置”“带我打一手”、Esc，以及点击遮罩（后两者都会触发 `onOpenChange(false)`）。实施时以 `Onboarding.tsx` 中实际存在的按钮为准，逐一核对。
   - “去配置”“带我打一手”先 `await` 再跳转。
   - `finishOnboarding` 拿到返回值后，更新 store 中的 `settings` 和 `personas`。
5. 本任务只要求引导页本身是双语，其余界面在 T6 处理。

**工程注意事项**：
- 语言页不能出现在重新打开的“规则介绍”中。
- 没完成引导、但改过对手的老用户选择英文时，同一个对手可能中英混杂，这是方案已经接受的结果。

**验证与完成标准**：
- **单元测试（db 或 ipc）**：
  - 新库里 `locale` 等于 `resolveLocale` 的结果；
  - 老库（已完成引导、没有 `locale`）得到 `'zh'`；
  - `onboarding.done('en')` 会把 `cny` 改成 `usd` 并把 `fxRate` 置空，币种不是 `cny` 时不改；
  - 完成引导后，`settings.update({ locale })` 抛错，重复调用 `onboarding.done` 没有效果；
  - 英文下保存和种子值相同的字段存为空，“恢复默认”后回到英文预设。
- **手动**：
  - 英文系统下删掉 `River-dev` 目录，分别用“跳过”“稍后再说”“去配置”、Esc、点击遮罩结束引导，每种方式都得到英文预设；
  - 选完语言后不用重启，大厅和对手页立即显示新语言的对手预设；
  - 从设置页重新打开规则介绍时，没有语言页。

**结果**：

## 任务 5：主进程与 Agent 双语

**目标**：
- 主进程的展示文字、错误信息、弹窗、系统提示词、局面描述和工具说明，都按 `settings.locale` 取字典；
- 引擎返回牌型 key；
- 公屏系统消息加上 `sysKind`；
- 英文模式下，发给模型的内容和 `TableView` 里都没有汉字。

**前置依赖**：T4。

**修改位置**：
- `packages/engine`：`handName` 改名为 `handCat`，返回 `HandCat`；`winners()[].handName` 改为 `handCat`；测试中的中文断言改为断言 key，差分对照用一张本地的 key→中文映射表。
- `apps/desktop/src/main`：
  - `table/view.ts`、`table/text.ts`、`table/runner.ts`；
  - `agents/{opponent,coach,thread,llm}.ts`；
  - `models/resolve.ts`（提供方类型名、错误）；
  - `ipc.ts`（错误信息）、`updater.ts`、`index.ts`（启动失败弹窗）。
- `packages/i18n/src/{poker,prompts,dict}.ts`：补全英文。
- `shared/types.ts`：
  - `ChatMessage` 增加 `sysKind`；
  - `TableView.nums.handName` 改为 `handCat: HandCat`（渲染进程的教练面板用 `t` 翻译，本任务中先临时用中文映射，T6 再接入）。
- 测试：`apps/desktop/test/mock-model.ts` 记录工具定义（description 和参数 schema）；新增英文压测和 `newChat` 的英文用例。

**输入输出**：

| 名称 | 契约 |
| --- | --- |
| `HandCat` | `highCard \| pair \| twoPair \| trips \| straight \| flush \| fullHouse \| quads \| straightFlush \| royalFlush \| pocketPair \| suitedHole` |
| `ChatMessage.sysKind` | `'hand' \| 'rebuy' \| 'street' \| 'seat' \| 'win' \| undefined`，只在 `kind === 'sys'` 时设置 |
| 系统消息的写入点 | runner 中写系统消息的 5 处：第 N 手（`hand`）、发牌（`street`）、重新买入（`rebuy`）、入座（`seat`）、赢得（`win`） |
| `newChat` | 按 `sysKind === 'hand' \|\| sysKind === 'rebuy'` 判断，原来的中文正则删掉 |
| `needsSettings` | 删掉正则中的“解密”分支，其余英文部分保留 |
| 手牌记录 | `label`、`pos`、`handName` 按当前语言写入文字，字段结构不变 |
| 提示词 | 中英两份都在开头或结尾写明“请用中文回复。”/“Reply in English.” |

**实施步骤**：
1. 在 engine 中改名为 `handCat`，并修改各调用方：生成文字的地方写 `dict(locale).poker.hand[cat]`。
2. 把 `view.ts`、`text.ts`、`runner.ts`、`thread.ts`、`agents/*` 中写死的中文逐一换成字典词条。主进程在调用时读取 `settingsCache.locale`，因为语言在运行期间不会变化，读全局值即可。
3. 工具的 description 和 zod 的 `.describe()` 按 locale 生成，需要把工具定义改成函数或按语言建两份。
4. 加上 `sysKind`，并改写 `newChat`。
5. 补全英文字典和英文提示词（参考现有中文提示词逐条翻译，保持语义不变）。
6. 启动失败弹窗用 `resolveLocale(app.getLocale())`。

**工程注意事项**：
- 历史记录只写快照，不做任何重新渲染。
- `COACH_ASKS` 和教练风格从 `prompts.ts` 取。
- unified-agent 的 ADR-006（本桌 thread 的行为）不能因为本任务而改变。

**验证与完成标准**：
- 现有测试（中文）全部通过。
- **新增“英文无汉字”测试**：
  - runner 层目前没有随机压测，需要新写：以 `table-helpers.ts` 的 `harness`、`drive` 为基础，用 `seeded` 随机数和 mock 模型随机出牌，设置 `locale = 'en'`，教练局和自由局各跑至少 20 手；
  - 收集 mock 模型收到的全部 messages 和工具定义，再加上每次推送的 `TableView` 和公屏的系统消息；
  - 断言这些内容都不匹配 `/[一-鿿]/`。
- 新增 `newChat` 的英文用例：“第 N 手”分隔和重新买入消息仍会交给 Agent。
- 主进程其余固定文字的静态检查：执行 `rg -n '\p{Han}' apps/desktop/src/main -g '*.ts'`，结果只能命中注释。覆盖 ipc 错误、提供方类型名、updater、启动失败弹窗等测试跑不到的地方。
- engine 测试通过，差分对照也通过。

**结果**：

## 任务 6：渲染进程界面双语

**目标**：renderer 中所有固定文案、日期格式、`<html lang>`、币种名称和牌桌色名称，都按 `settings.locale` 显示。

**前置依赖**：T4、T5（`handCat` 已经加入 `TableView`）。

**修改位置**：
- `apps/desktop/src/renderer/src/**` 中所有含中文的页面和组件，包括 shadcn 组件里写死的中文（如果有）。
- `packages/i18n/src/dict.ts` 的 `desktop` 和 `common` 命名空间。
- `TableStage` 的 `labels`、牌桌色和牌背名称、`Appearance`、`CoachPanel`（牌型改用 `t.poker.hand[nums.handCat]`）、`Replays`（显示存下的文字，不翻译）。

**实施步骤**：
1. 逐个文件把中文换成 `t.*`，词条统一放进 `dict.ts`。
2. 日期格式化用 `locale === 'zh' ? 'zh-CN' : 'en-US'`；启动时根据 `settings.locale` 设置 `document.documentElement.lang`。
3. 币种名称从字典中取。
4. 删掉 T3 中临时加的牌桌色名称映射。

**工程注意事项**：用户数据（对手名称和提示词、提问、模型输出、回放内容）原样显示，不翻译。

**验证与完成标准**：
- `rg -n '\p{Han}' apps/desktop/src/renderer/src -g '*.ts' -g '*.tsx'` 只能命中注释；
- 在英文模式下 `pnpm dev`，走一遍大厅、牌桌（教练局）、对手、回放、统计、设置，截图保存到 `evidence/T6/`；
- 中文模式下的截图和 `evidence/T1/baseline/` 一致。

**结果**：

## 任务 7：手动检查更新

**目标**：设置页“版本”一行增加“检查更新”按钮，结果都能正确提示。

**前置依赖**：T4（需要 `Bootstrap.packaged` 和字典）。

**修改位置**：`main/updater.ts`、`main/ipc.ts`、`main/index.ts`（接线）、`shared/types.ts`（`Commands`、`Events`、`UpdateCheck`）、`renderer/src/pages/Settings.tsx`、`lib/river.ts`（订阅 `update:error`）、新增 `test/updater.test.ts`。

**输入输出**：

| 名称 | 契约 |
| --- | --- |
| `update.check` | `() => UpdateCheck` |
| `UpdateCheck` | `{ state: 'latest' } \| { state: 'downloading'; version } \| { state: 'ready'; version } \| { state: 'error'; message }` |
| `update:error` | 事件，负载为 `{ message: string }` |
| `Bootstrap.packaged` | 等于 `app.isPackaged` |

**实施步骤**：
1. 在 `updater.ts` 中实现 `checkNow()`，复用现有的 `autoUpdater`：
   - 已经 `ready` 时，直接返回 `ready`；
   - 否则调用 `checkForUpdates()`：
     - `isUpdateAvailable` 为假时，返回 `latest`；
     - 为真时，给 `r.downloadPromise` 挂上 `.catch`，在里面写日志并推送 `update:error`，然后返回 `downloading`；
     - 抛异常时返回 `error`，`message` 取本地化的短句，原始错误写入日志。
2. `update-downloaded` 继续沿用现有的 `update:ready` 事件；updater 的 `error` 事件仍然只写日志（后台检查保持静默）。
3. 只跟踪手动检查触发的 `downloadPromise`，这样后台检查的失败不会被误报为下载失败。
4. 为了能写单元测试：
   - `updater.ts` 在模块顶层取 `autoUpdater`，会触发 electron-updater 读取 electron，测试一 import 就可能报错。所以把真实 updater 的获取挪进 `initUpdater` 内部（懒加载）；`initUpdater` 和 `checkNow` 都接收一个可以注入的 updater。
   - `ipc.ts` 中的 `update.check` 沿用现有的 `AppInfo` 注入方式接线（和 `installUpdate`、`readyVersion` 相同），`runner.test` 等测试不受影响。
5. 界面：
   - `packaged` 为假时，按钮置灰，并显示“开发版本不检查更新”；
   - 请求进行中禁用按钮；
   - “版本”一行显示当前版本号；结果用 toast 展示，文案如下：

     | 结果 | 中文 | 英文 |
     | --- | --- | --- |
     | `latest` | 已是最新版本 | You're up to date |
     | `downloading` | 发现新版本 {v}，正在后台下载 | Downloading {v} in the background |
     | `ready` | 新版本 {v} 已就绪，可在顶栏重启更新 | {v} is ready — restart from the top bar |
     | `error` | 检查更新失败，请稍后再试 | Couldn't check for updates |
     | `update:error` | 下载失败，稍后自动重试 | Download failed, will retry later |

**工程注意事项**：
- 后台定时检查的行为不变：静默运行、自动下载，只在不在牌桌上时安装（river-v2 ADR-005）。
- electron-updater 会合并同时发起的检查，所以不需要自己加锁。

**验证与完成标准**：
- 用替身 updater 写单元测试，覆盖以下情形：
  - `latest`；
  - `downloading`；
  - 已 `ready`；
  - 检查抛错时返回 `error`，且不推送 `update:error`；
  - 返回 `downloading` 后 `downloadPromise` 失败，推送 `update:error`；
  - updater 触发 `error` 事件（后台检查）时不推送。
- 手动：开发版本下按钮不可用；打包版本下“已是最新”能正确提示，断网时显示“检查失败”（结果记录到 `evidence/T7/`）。

**结果**：

## 任务 8：官网 apps/site

**目标**：用 Astro 加 React 岛实现设计稿 `River Site v2`，提供 `/` 中文和 `/en/` 英文两个页面。演示桌用 `TableStage` 自动对局，对手预设和术语来自 `@river/i18n`。

**前置依赖**：T3、T5（演示桌的英文状态文字需要 T5 提供的 `handCat` 和英文术语）。

**修改位置**：
- `apps/site/{package.json,astro.config.mjs,tsconfig.json}`；
- `src/pages/index.astro`、`src/pages/en/index.astro`；
- `src/components/*`，包括各区块和 React 岛；
- `src/sim/{bot.ts,sim.ts,to-seat-view.ts}`；
- `src/i18n/site.ts`（营销文案）；
- `public/river-icon.png`；
- `src/styles/site.css`（引入 `@river/ui/tokens.css`，并用 `@source` 扫描 ui）。

**输入输出**：
- Astro 配置：`site: 'https://reflux-studio.github.io'`，`base: '/river'`，`output: 'static'`，集成 `@astrojs/react` 和 Tailwind（`@tailwindcss/vite`）。
- `bot.ts`：从 `river-desktop/design-source/poker.js` 移植 `decide`，改用 engine 的 `Table.legalActions()` 和 `equity`；人设参数（tight、aggr、bluff、call）取自 `river-site.js` 的 `PERSONAS[].p`，按预设 id 对应。
- `sim.ts`：对应设计稿的 `createSim`，包括节奏、`LINES` 气泡台词、暂停/继续、筹码归零后重新买入。
- `to-seat-view.ts`：对应设计稿的 `viewReal`，按语言生成状态文字，用 `lastActs` 填写 `lastAct`，`heroSeat` 为 null。

**实施步骤**：
1. 用 Astro 组件照设计稿逐区块实现：页头导航、首屏加演示桌、牌友、功能（教练、复盘、外观、费用）、模型、下载、FAQ、结尾 CTA、页脚。设计稿中的文案全部移到 `site.ts`，按 zh/en 各一份。
2. 做成 React 岛的部分：演示桌、外观切换（牌桌色、牌背、特效档位）、全下展示（每 2.8 秒调用一次 `playAllIn`）、教练档位和提问、币种切换、下载平台切换、FAQ 展开。
3. 演示桌外层用包裹元素做 `transform: scale` 自适应，`TableStage` 本身不加 transform。
4. 牌友区使用 `presets[lang]`（name、tag、desc、prompt、hue）。
5. 下载区：
   - 在客户端请求 `https://api.github.com/repos/reflux-studio/river/releases/latest`，按 `artifactName` 规则匹配各平台的文件；
   - 请求失败时，链接退回 `…/releases/latest`；
   - 在 `electron-builder.yml` 的 `artifactName` 旁边加注释，指向官网的匹配代码，官网这边也注释指回去。
6. `/` 页：浏览器语言不是 zh 时，页顶显示一条可以关闭的 “English →” 提示，关闭状态存进 localStorage（读写都用 try/catch 包住）。
7. 设置 `<html lang>` 和 meta（title、description、og），取自设计稿的 `<helmet>`，按语言各一份。

**工程注意事项**：
- 不要复制设计稿中的 `PERSONAS` 和 `PROMPT_ZH/EN`；
- 不要实现设计稿的 `sim.events` 和 `animateNew`（动效统一用 `useTableFx`）；
- 手机宽度下不能出现横向滚动。

**验证与完成标准**：
- `pnpm build:site` 成功，`astro check` 通过；
- 用 `astro preview` 打开 `/river/` 和 `/river/en/`：
  - 演示桌连续跑 20 手，控制台没有报错；
  - 暂停/继续、外观切换、全下展示都正常；
  - 逐区块和设计稿对比，截图保存到 `evidence/T8/`；
- 375px 宽度下没有横向滚动；
- 下载区：断网或屏蔽 api.github.com 时，链接退回到 `…/releases/latest`；
- 浏览器语言设为英文时打开 `/river/`，出现 “English →” 提示；关闭后刷新不再出现；
- 语言切换链接能在 `/river/` 和 `/river/en/` 之间往返，并带上 `base`。

**结果**：

## 任务 9：CI、发布与文档

**目标**：PR 上有检查，`main` 自动发布官网，app 发版流程适配新目录，项目知识同步更新。

**前置依赖**：T1、T8。

**修改位置**：`.github/workflows/{build.yml,ci.yml,site.yml}`、`.rivo/knowledge/README.md`。

**实施步骤**：
1. `build.yml`：
   - 各 job 的安装仍在根目录执行（`pnpm install --frozen-lockfile`）；
   - test job 执行 `pnpm typecheck && pnpm test`；
   - 打包相关步骤加上 `working-directory: apps/desktop`，包括 prices、版本号读取 `apps/desktop/package.json`、`pnpm build`、electron-builder，以及 codesign 断言中的 `dist/mac-arm64/River.app`；
   - 根 `package.json` 保留 `packageManager`，`pnpm/action-setup` 靠它确定 pnpm 版本；
   - 上传路径改为 `apps/desktop/dist/*`。
2. 新建 `ci.yml`：在 `pull_request` 和推送到 `main` 时触发，执行 `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test`，只在 ubuntu 上运行。
3. 新建 `site.yml`：
   - 触发条件：推送到 `main`，且改动路径命中 `apps/site/**`、`packages/**`、`pnpm-lock.yaml`，或者手动触发（`workflow_dispatch`）；
   - job 流程：安装 → typecheck、test → `pnpm build:site` → `actions/upload-pages-artifact`（`apps/site/dist`）→ `actions/deploy-pages`；
   - 权限：`pages: write`、`id-token: write`；deploy job 配置 `environment: github-pages`，以 GitHub Pages 官方示例为准。
4. 更新 knowledge README：写入目录结构、包边界（引用 ADR-007）、i18n 原则、新的文件路径，并注明核实时间和对应的提交。

**验证与完成标准**：
- 用 `actionlint` 检查 workflow（如果本地没有 actionlint，就逐项核对语法）；
- 推送分支后 `ci.yml` 通过；
- 在分支上手动触发一次 `build.yml`，三个平台都产出安装包（结果链接记录到 `evidence/T9/`）；
- `site.yml` 只在合并后验证（见整体验证）。

**结果**：

## 整体验证与交接

1. **全仓检查**：根目录下 `pnpm typecheck`、`pnpm test` 全部通过，`pnpm build:site` 能成功构建；`rg -n '\p{Han}' apps/desktop/src -g '*.ts' -g '*.tsx'` 只能命中注释（包括 `shared/currency.ts` 等 `shared` 目录下的文件，以及 T7 改过的 `Settings.tsx`）。
2. **打包**：mac 包能正常运行（T1 的结论）；分支上 `build.yml` 在三个平台都产出安装包。
3. **中英双语全流程**：
   - 新用户选中文走一遍：引导、教练局、复盘、对手页、统计、设置、检查更新；
   - 新用户选英文，再走一遍同样的流程。
   - **模型回复语言**（真实联调）：用任一真实提供方（例如 DeepSeek）开一桌教练局。中文和英文各跑至少 2 手，检查对手发言、教练讲解、复盘的语言是否和所选语言一致，把截图和摘录记录到 `evidence/overall/`。mock 测试只能证明发出去的提示词没有汉字，证明不了模型会用所选语言回答。
4. **老用户兼容**：用 v0.2.1 的老数据库启动，不出现引导页，界面是中文，改过的对手保持原样，老回放能正常显示。
5. **官网**：`/` 和 `/en/` 与设计稿逐区块一致；演示桌和 app 牌桌的外观、动效一致。
6. **交接用户**：
   - 合并前需要用户在 Settings → Pages 中把来源设为 GitHub Actions；
   - 合并后第一次 `site.yml` 跑完，访问线上的 `/river/` 和 `/river/en/` 确认页面正常。
