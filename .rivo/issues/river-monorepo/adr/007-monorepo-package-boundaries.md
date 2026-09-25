# 007：monorepo 的包边界与依赖方向

状态：接受
日期与确认依据：2026-09-25。用户在方案讨论中选定“只拆 engine 和 ui，Agent 暂不拆”，后来追加 i18n，并采纳新增 `@river/i18n`；另外确认不用 Turborepo。过程见 `discussion.md`“用户决定”表。

## 背景与问题

River 要从单包的 Electron 应用改成 monorepo，并加入 Astro 官网。官网首页有一张自动对局的演示牌桌，外观和动效要与 app 牌桌一致；还有中英双语的对手预设和术语。用户希望这些共用的东西只写一份。

需要决定四件事：拆出哪些包、各包负责什么、谁可以依赖谁，以及主进程能引用哪些包。约束有三条：

- **主进程**：用 electron-vite 构建。`tsconfig.node.json` 不开 `jsx`；`dependencies` 里的包会被 externalize，不会打进 bundle。
- **打包**：electron-builder 只从 `dependencies` 收集运行时依赖；libsql 是原生模块。
- **现有耦合**：`agents/*` 依赖 `db`（`settingsCache`）和 `models/resolve`，使用方只有主进程。

## 可行选项

| 选项 | 包 | 代价 |
| --- | --- | --- |
| A 按用户最初的设想全部拆开 | engine、ui、agents、shared | agents 要先抽出 settings、secret、usage 的注入层，而它只有一个使用方 |
| B 只拆有多个使用方的部分 | engine、ui、i18n | agents、db、models 仍留在 desktop |
| C 不拆包，官网直接引用 desktop 的源码 | 无 | 应用之间互相引用，边界不清，官网构建会连带引入 Electron 相关代码 |

选项 B 下，各包的使用方如下：

- **engine**（规则、牌型评估、`lastActs`、`fmt`）：desktop 主进程和官网演示桌都用。
- **ui**（牌桌舞台、座位、卡牌、筹码、特效、样式变量）：desktop 渲染进程和官网都用。
- **i18n**（字典、扑克术语、对手预设、系统提示词）：主进程、渲染进程和官网都用。

## 决定与理由

采用 B。依赖只能向下：

```
apps/desktop main/shared ─► @river/engine、@river/i18n、@river/ui/types（仅类型）
apps/desktop renderer    ─► @river/ui、@river/i18n、@river/engine
apps/site                ─► @river/ui、@river/i18n、@river/engine
@river/ui                ─► @river/engine
@river/i18n              ─► @river/engine（仅类型）
@river/engine            ─► 无
```

- **拆包的标准是出现第二个使用方。** agents 目前只有主进程一个使用方，拆出去只会多出一层注入接口，暂不拆。
- **engine 只放规则相关的内容。** 官网演示桌的启发式机器人属于官网自己的出牌策略，放在 `apps/site`。
  - `fmt`、`signed` 本身不是规则，但主进程和 ui 都要用。主进程不能引用 ui 的主入口，engine 是两边都能引用的唯一位置，所以放在 engine。
  - `lastActs` 只读引擎自己的日志、输出动作枚举，和 `winners()` 属于同一类查询。
- **ui 只放纯展示组件。** 数据全部走 props，不接触 IPC 和 store，也不含文案，文字由调用方从 i18n 取好后传入。ui 的类型放在纯 TS 子路径 `@river/ui/types` 中，主进程只能引用这个子路径。
- **i18n 只放固定内容。** 包括界面词条、扑克术语、对手预设种子和系统提示词。动态内容（用户数据、模型输出、历史记录）不进这个包。
- **库以 TS 源码形式发布，没有构建步骤。** desktop 把它们写进 `devDependencies`：electron-vite 会把它们打进 bundle，electron-builder 的运行时依赖清单保持原样。
- **不用 Turborepo。** 只有 2 个应用和 3 个不需要构建的库，`pnpm -r` 和 `--filter` 就够了。

放弃了什么：选项 A 的“每层一个包”更整齐，但要为只有一个调用方的代码增加抽象；选项 C 省事，但会让官网依赖 app 的内部结构。

## 后果与重新考虑条件

- **收益**：牌桌、卡牌、特效、术语、预设都只有一份，官网演示桌和 app 的外观、动效一致。engine 和 i18n 可以在浏览器中运行。
- **代价**：desktop 的 `shared/types`、`shared/format` 要从各包重新导出类型，import 路径多了一层；库的改动会同时影响两个应用，所以 CI 在 PR 上跑全仓的 typecheck 和 test。
- **守卫**：“主进程只引用 `@river/ui/types`”这条约束，实际靠 `tsconfig.node.json` 不开 `jsx` 来保证：误引 ui 主入口时，typecheck 会在 TSX 上报错。以后如果要给 `tsconfig.node` 打开 jsx，必须先换一种守卫方式，例如 lint 规则。
- **需要重新考虑的情况**：
  - agents 出现第二个使用方，例如 CLI 或服务端对局：把 agents 拆成包，并抽出 settings、secret、usage 的注入层。
  - 库需要产出构建产物（比如发布到 npm），或 CI 时间明显变长：引入构建步骤或 Turborepo。
  - ui 需要 store 或 IPC：说明边界划错了，应当把有状态的部分留在应用里。

## 依据

- 讨论与用户决定：`../discussion.md`
- 审阅：`../reviews/design-1.md` 至 `design-7.md`
- 相关旧决定：river-desktop ADR-001（引擎在主进程）、ADR-003（单一 SQLite 存储）；unified-agent ADR-006（Agent 本桌 thread）
- 工程证据：`src/main/engine/*` 只依赖 `shared/types` 中的 `Card`、`Street`；`src/main/agents/coach.ts` 引用 `../db` 的 `settingsCache`；electron-vite 5 的依赖处理文档（`build.externalizeDeps`）
