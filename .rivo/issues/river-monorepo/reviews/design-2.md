# river-monorepo 方案审阅 · 第 2 轮

- 对象：修订后的 `.rivo/issues/river-monorepo/discussion.md`（全文重读）。
- 设计稿快照：新增 `design-source/river-site.js`（快照省略了 `view()`，文件中有说明）。
- 基线：`main` @ 1ece50c。
- 前轮审阅：`reviews/design-1.md`，其中 3 项阻塞、8 项非阻塞。
- **结论：通过。** 阻塞项已全部解决，本轮没有新的阻塞；另有 4 条新的非阻塞意见和 2 条小的遗留，建议在写 plan 时补上。

## 前轮问题处理结果

| 编号 | 处理 | 核对 |
| --- | --- | --- |
| B1 设计输入未落盘 | 已解决 | `river-site.js` 已落盘，包含 `PERSONAS`（8 人，中英文名、tag、ini、hue、描述、`p` 参数）、`LINES`、`createSim`、`viewReal`、`animateNew`。<br>差分测试沿用 `river-desktop/design-source/poker.js`。我逐行核对了 `river-site.js` 调用到的 v1 符号，全部存在：<br>• `sbI`/`bbI`（107–110 行）<br>• `startStack`（104 行）<br>• `runoutStep`（174 行）<br>• `decide(g,i,pp)`（195 行，读取 `pp.tight/aggr/bluff/call`，和 `PERSONAS[].p` 的字段一致）<br>• `toAct`/`runout`（116–117 行）<br>• `p.last`、`contrib`、`pot`、`winners`、`showdown` |
| B2 类型归属与依赖方向 | 已解决 | 类型放进纯 TS 的 `@river/ui/types`（`SeatView`、`Felt`、`Back`、`Fx`），desktop 的 `shared/types` 以 type-only 方式重新导出，依赖图也已同步。<br>`tsconfig.node` 只会加载这个 .ts 文件。另外，`tsconfig.node` 没有配置 `jsx`，主进程一旦误引 `@river/ui` 根入口，typecheck 就会失败，这本身起到了守卫作用，见 N-new-4。 |
| B3 TableStage / useTableFx 契约 | 已解决 | • 补上了 `handNo`。<br>• 新增 `lastAct` 字段，替代原来的中文正则。<br>• 新增 `heroSeat: number \| null`，`Seat` 的 `isHero` 改由调用方传入。<br>• 新增必填的 `labels: {pot, sb, bb}`。<br>• 外观相关的 `felt`/`back`/`fx`，以及 `children` 插槽，都已写明。<br>• 缩放补偿写明了。它有一个接入条件，见 N-new-1。 |
| N1 AI 自定的偏离 | 已解决 | 双语路由、动效复用 `useTableFx`、人设文案重复，三项都已由用户采纳并写进决定表；"不用 Turborepo"标为待确认。<br>还剩一个小点：设计稿原本按 `navigator.language` 自动选语言，改成两条路由后，英文访客落到 `/` 时要不要提示或跳转，方案没写（R1）。 |
| N2 filter 与包名 | 已解决 | 改成了 `--filter ./apps/desktop`。根 `package.json` 的 name 仍然没写（R2）。 |
| N3 ui 缺的依赖 | 已解决 | • `avatarBg` 移到 ui，`fmt` 改从 engine 引入。<br>• `RichText` 留在 desktop。我核实过，只有 `CoachPanel` 用到它。<br>• `MiniCards` 移到 ui。<br>• `react` 改为 peerDependencies。 |
| N4 CI 与 Pages | 已解决 | • 开启 Pages 已写成合并前由用户手动完成的操作。<br>• 新增 `ci.yml`（PR 和 main push 时运行）；site.yml 先跑测试再发布。<br>• 每个包都有自己的 tsconfig 和 typecheck，site 用 `astro check`。<br>• 路径过滤没有包含 `pnpm-workspace.yaml` 和根 `package.json`，影响很小。 |
| N5 发布验证与"失败不合并"的矛盾 | 已解决 | 新增验证第 6 条：官网发布只能在合并后验证；发布失败不影响 app，修复后手动重跑即可。 |
| N6 .gitignore | 已解决 | 只需补 `.astro/`。 |
| N7 下载区与 artifactName 耦合 | 已解决 | 两处加注释，互相指向。 |
| N8 知识库与 ADR | 已解决 | 知识库 README 的结构图和路径会更新，并新增一条包边界 ADR。 |

## 本轮检查的新问题（均为非阻塞）

### N-new-1 缩放不能加在 TableStage 根节点上，否则全下时的震屏会冲掉缩放

- `useTableFx` 在全下时会执行 `R.animate([{ transform: 'translate(...)' }, ...])`（`useTableFx.ts:163`），这里的 `R` 就是舞台根节点。
- 设计稿把 `transform: scale(sc)` 直接加在 `stageRef` 上（html 第 70 行），而这个 `stageRef` 正是被震动的节点。
- 如果官网照搬这种写法，Web Animations 的 transform 会在震屏的 380ms 里覆盖掉 scale，整个舞台会先跳回原尺寸再缩回去。设计稿自身也有这个问题。
- 方案提出按 `getBoundingClientRect().width / offsetWidth` 求缩放系数，这个办法本身没问题：`getBoundingClientRect` 的结果包含祖先节点的 transform，缩放加在外层包裹元素上时也能算对。
- 建议：在方案里写明"官网的缩放加在 TableStage 外层的包裹元素上"，再加一条：发牌动效里的位移同样要走补偿后的 `rel()`。

### N-new-2 设计稿"外观·动效"区的全下展示没有着落

- 设计稿第 238–247 行有一个独立的小牌桌（`allinRef`、`allinSeatRef`、`allinBoard`）。当 `fx === 'full'` 并且小牌桌在视口内时，每 2.8 秒调用一次 `allinBurst()` 来演示全下特效（第 501 行）。
- `useTableFx` 靠对比前后两次视图来触发动效，没有对外暴露"直接播放全下特效"的接口。方案说"动效用 app 的 `useTableFx`"，但没有提到这一块。
- 执行者会遇到三条路：
  - 在官网里再抄一份全下特效，违背"不写两套"；
  - 从 ui 导出全下特效的函数（例如把 `allIn`/`ring`/`tag` 抽成纯函数，由 `useTableFx` 和官网共用）；
  - 删掉这一块，等于缩小范围，需要用户同意。
- 需要在方案里定一种。

### N-new-3 `lastAct` 能从引擎日志算出来，但推导逻辑会写两份；另外 engine 开始承担展示格式化

- **可行性已核实。**
  - 引擎的 `LogEntry`（`table.ts:23-25`）带有 `type`（`blind|fold|check|call|bet|raise|return`）和 `allIn` 字段。
  - `view.ts:58-62` 已经在按"最后一次发牌之后、排除 `return`"遍历日志来算 `last`，在同一个循环里就能得到 `lastAct`：`allIn ? 'allin' : type`，并把 `blind` 排除。
  - 和旧逻辑对比：全下特效仍由 `allin` 布尔值触发；盲注以前的正则匹配不到"小盲/大盲"，现在 `lastAct` 为空，两者行为一致。
- **重复。** 官网也用 `@river/engine` 的 `Table` 驱动演示桌，所以同样的日志推导会在 `view.ts` 和官网的 `toSeatView` 里各写一份。可以考虑由 engine 提供一个"各座位本街最后动作"的纯函数，两边共用。
- **职责。** engine 这次收进了 `fmt`、`signed`、`disp`、`txt`、`cardsText`，其中 `disp` 返回花色符号和红黑，属于展示。这和方案"engine 只放规则，所以 `decide` 不进 engine"的理由不一致。
  - ui 真正需要的只有 `fmt`。
  - 用户没有要求挪动 `disp`、`txt`、`cardsText`，可以留在 desktop 的 `shared/format`。
  - 这个不影响方案成立，但写 ADR 之前应该先把口径统一。

### N-new-4 "主进程只能引用 `@river/ui/types`"目前只靠 ADR 约束

- desktop 会在 devDependencies 里依赖整个 `@river/ui`。主进程如果误引根入口，electron-vite 照样能打包成功，会把 React 组件打进 main。
- 现在能拦住这种误引的，是 `tsconfig.node` 没有配置 `jsx`，typecheck 会报错。
- 建议在 ADR 里明确写上"`tsconfig.node` 不开 jsx"是守卫的一部分，免得以后有人为了别的原因打开 jsx，守卫就悄悄失效了。
- 另外，`packages/ui/package.json` 的 `exports` 需要同时列出 `"."`、`"./types"`、`"./tokens.css"`。方案里的通用示例只写了 `"."`，这点在 ui 小节提到过，但实施时容易漏。

## 小的遗留

- **R1**：英文访客访问 `/` 时要不要提示切换到英文版或自动跳转，方案没写。设计稿原本会自动检测语言，现在这个行为没了。可以在实施时定，不影响结构。
- **R2**：根 `package.json` 的 name 没写，建议取一个和 `river` 不同的名字（例如 `river-monorepo`），避免 workspace 里出现两个同名项目。

## 证据限制

- 官网 v2 所用的 `poker.js` 原件不在仓库里，"与 v1 快照是同一套规则"无法逐字比对。我只核对了 `river-site.js` 实际调用的接口和字段，它们都与 v1 吻合。
- 官网运行时用的是 `@river/engine` 而不是 `poker.js`，所以即使 v1 和 v2 有细微差异，也只会影响移植 `decide` 时的参考来源，不影响规则的正确性。
- 本轮没有实际运行打包、typecheck 或页面，结论来自对代码和配置的阅读。
