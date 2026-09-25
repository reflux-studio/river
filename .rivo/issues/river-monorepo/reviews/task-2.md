# river-monorepo 实施任务审阅 · task 第 2 轮

- **审阅对象**：`.rivo/issues/river-monorepo/task.md` 第二稿，共 543 行，`shasum` 为 ffb94761…。对照的是 `plan.md` 按 plan-2 小修后的版本，`shasum` 为 9b251f1c…。
- **核对范围**：逐条核对 task-1 的 B1 和 N1–N11 是否落实，并检查这次修订有没有引入新问题。这一轮到代码里复核了：
  - `initDb` 的签名（`db/index.ts:127`）；
  - `test/table-helpers.ts` 的导出（`harness`、`drive`、`seeded` 都存在）；
  - `apps` 根 `tsconfig.json` 的结构；
  - `design/export-icons.py`；
  - `src/shared/currency.ts`；
  - STREET 的使用方。
- **结论：通过。** 没有阻塞问题。task-1 的全部问题都已处理，B1 的处理和 plan 的验收要求一致。新发现 5 个非阻塞问题，其中 M1、M2 影响实施者照着做的结果，建议开工前顺手改掉，改完不需要再审一轮。

## task-1 问题的处理

| 编号 | 处理位置 | 结论 |
| --- | --- | --- |
| B1 真实模型检查回复语言；选完语言立即生效 | 整体验证第 3 项（第 541 行）；T4 手动验证（第 304 行） | 已落实。真实联调的范围、证据保存位置和 mock 测试的局限都写清楚了 |
| N1 `systemLocale` 缺省为 `'zh'` | T4 第 258 行 | 已落实，但写的签名和代码不符，见 M1 |
| N2 拆开差分测试中的 `disp` | T2 第 123 行 | 已落实 |
| N3 updater 懒加载、通过 `AppInfo` 注入、修改位置补上 `index.ts` | T7 第 401、422–423 行；T4 第 247 行 | 已落实。T4 改了 `Bootstrap` 的 `packaged`，`ipc` 和 `AppInfo` 也要跟着改，这一点没写明，但 typecheck 会报出来，影响很小 |
| N4 新写 runner 压测，主进程 rg 检查 | T5 第 360、364 行 | 已落实，`harness`、`drive`、`seeded` 在代码中都存在。`src/shared` 没有被覆盖，见 M4 |
| N5 统一用 `rg '\p{Han}'` | 共同约定、T6 第 389 行 | 已落实 |
| N6 引导的结束路径以实际按钮为准 | T4 第 286、303 行 | 已落实 |
| N7 删除或迁移的使用方、`PersonaSeed`、`feltOf`、拆分 `RichText` | T4 第 240–246 行；T3 第 165–166 行 | 已落实。STREET 的使用方漏了 `Replays.tsx:8`，但第 244 行的 rg 命令能扫出来 |
| N8 T8 依赖 T5，补齐验证 | T8 第 457、498–500 行 | 已落实 |
| N9 `export-icons` 和 README 的路径 | T1 第 82 行 | 部分落实，见 M3 |
| N10 工具链在根目录声明，各包补 `typecheck` 和 `test` 脚本 | 共同约定 | 已落实，但引入了新的歧义，见 M2 |
| N11 T7 串行、基线截图、`environment: github-pages` | 任务顺序；T1 第 81 行；T9 第 523 行 | 已落实 |

## 新发现的问题（都不阻塞）

### M1 `initDb` 的签名写成了代码里不存在的形式

- **位置**：T4 第 258 行：`initDb(path, systemLocale = 'zh')`，“新增第二个参数”。
- **证据**：实际签名是 `initDb(opts: { url; encrypt; decrypt })`，只有一个参数，是选项对象（`db/index.ts:127`）。20 多处测试的调用写法都是 `initDb({ url, ...crypto })`。
- **后果**：照着写，实施者要么把选项对象改成位置参数，连带修改所有调用方；要么自己决定另一种写法。第 259 行又写着“作为 `initDb` 的新参数传入”，两处说法并不一致。
- **建议**：改为 `opts.systemLocale?: string`，缺省为 `'zh'`。

### M2 “各包的 typecheck 为 `tsc -p tsconfig.json`”如果套用到 desktop，desktop 的类型检查会失效且不报错

- **位置**：共同约定中的“工具链”一条。
- **证据**：
  - desktop 根目录的 `tsconfig.json` 是 `files: []` 加上 references，只作为 shadcn 的入口，本身不包含任何文件。
  - 现在的脚本是分别对 `tsconfig.node.json` 和 `tsconfig.web.json` 各执行一次 `tsc -p`。
  - 如果 desktop 也改成 `tsc --noEmit -p tsconfig.json`，这条命令什么都不检查，却会返回成功。
  - ADR-007 的守卫“主进程误引 ui 主入口时 typecheck 报错”靠的正是 `tsconfig.node.json` 这次检查。
- **次要问题**：只在根目录声明 typescript、vitest、`@types/node` 还不够：
  - ui 做类型检查还需要 `@types/react`、`@types/react-dom`；
  - 官网的 `astro check` 需要 `@astrojs/check`。
  - 这些由谁声明，没有写。
- **建议**：
  - 写明这条规定只适用于 `packages/*`，desktop 保留现有的 typecheck 脚本；
  - 写明 ui 和 site 各自额外需要的类型包和检查工具。

### M3 两处基线和路径的描述不完整

- **基线截图的顺序**：T1 第 81 行的第 4 步写“迁移前先保存基线截图”，但它排在第 1 步“迁移文件”之后。建议挪到第 1 步，或者注明在 1ece50c 上操作。
- **`export-icons.py` 只改了一处**：第 82 行只把 `build` 改到 `apps/desktop/build`。这个脚本的第 14 行还会写 `ROOT/src/renderer/public`，也要改成 `apps/desktop/src/renderer/public`，否则会在根目录新建 `src/` 目录。

### M4 两次中文检查都没有覆盖 `src/shared`

- **证据**：
  - T5 只检查 `apps/desktop/src/main`，T6 只检查 `renderer/src`。
  - `src/shared/currency.ts:4-12` 中币种的 `name`、`unit` 都是中文，T6 要求“币种名称从字典取”。
  - T7 在 T6 之后才修改 `Settings.tsx`，整体验证里也没有再跑一次检查。
- **后果**：`shared` 中残留的中文，以及 T7 新写的中文，都不会被检查发现。
- **建议**：
  - T6 的检查路径加上 `apps/desktop/src/shared`，其中 `shared/personas.ts` 的 `BLINDS` 没有中文，不受影响；
  - 整体验证第 1 项加一条：对 `apps/desktop/src` 整体再跑一次 `rg '\p{Han}'`，只能命中注释。

### M5 真实联调指定了 DeepSeek

整体验证第 541 行写的是“用真实提供方（DeepSeek）”。

- 如果 DeepSeek 是用户手头已有的提供方，这样写没有问题；
- 如果只是举例，建议改成“任一真实提供方（例如 DeepSeek）”，免得因为没有这个 key 卡住验收。

## 其他核对（没有发现问题）

- **任务顺序**：T4 → T5 → T6 → T7 串行；T8 依赖 T3、T5；T9 依赖 T1、T8。和各任务写明的前置依赖一致，也能执行。
- **`lastActs` 的规则**：第 115–119 行的规则、第 126 行的性质检查，和 plan 小修后“只有全下的盲注记为 allin”的口径一致。
- **`completeOnboarding`**：直接调用 `updateSettings`，守卫放在 ipc 里，和 plan 第 332 行一致。
- **hoisted 写法**：T1 第 87 行和 plan 第 528 行统一写成在 `pnpm-workspace.yaml` 中设置 `nodeLinker: hoisted`。
- **用户的方向和限制**：没有因为这次修订而改变，范围没有扩大。

## 检查限制

- 只读了代码，没有运行构建和测试。
- pnpm 11 在 workspace 包里执行脚本时，是否会把根目录的 `node_modules/.bin` 加进 PATH，还没有核实。这决定根目录声明的 `tsc`、`vitest` 能不能被各个包直接调用；如果不能，要按 M2 的建议补上各包自己的声明。
- 没有逐区块对照 `River Site v2.dc.html`，沿用第 1 轮的结论。
