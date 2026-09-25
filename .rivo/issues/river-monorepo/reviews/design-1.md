# river-monorepo 方案审阅 · 第 1 轮

- 对象：`.rivo/issues/river-monorepo/discussion.md`（2026-09-25 版，127 行），设计稿快照 `design-source/`（River Site v2.dc.html、support.js、river-icon.png）
- 基线：`main` @ 1ece50c（v0.2.1）
- 前轮审阅：无（首轮）
- 结论：**需修改**（3 项阻塞，8 项非阻塞）

## 本期目标核对

用户要四件事：app 与官网合成 monorepo、了解 electron 有没有现成的 monorepo 脚手架、按边界拆包、牌桌和卡片等组件两边共用。方案都承接了。脚手架的查证结果写明了：electron-vite 没有官方 monorepo 模板，社区模板都用 Turborepo。拆包收窄为 engine 和 ui、Agent 不拆，这条是 AI 提的建议，用户已采纳，决定表里也有记录。框架、部署、交付范围三项都是用户自己的决定。

有几项是 AI 自己定的，不在用户决定表里，但改变了设计稿行为或用户最初设想的做法，见 N1。

## 阻塞发现

### B1 设计输入没有落盘，官网实现和差分测试无从取材

- 方案要从 `poker.js` 移植 `decide`，从 `river-site.js` 取 `viewReal`、`PERSONAS`（中英文人设名、tag、ini、描述），并规定引擎差分测试"改用本需求 `design-source/poker.js` 的快照"。
- 实际情况：`design-source/` 里只有 html、support.js 和图标。html 第 16–17 行通过 `<script src>` 引用 `poker.js` 和 `river-site.js`，这两个文件都不在仓库里。
- 官网 html 只内联了 `PROMPT_ZH/EN`。人设的名称、tag、描述和头像色相（`RS.PERSONAS`、`RS.byId`）、演示桌的座位映射和动效事件（`createSim`、`sim.events`、`animateNew`）都在缺失的文件里。
- 后果：
  - 执行者拿不到这些文件，只能凭方案里一句话描述去重写。
  - 验证第 4 条"逐区块与设计稿对比"失去对照物。
  - `engine.test.ts:448` 改指向后会读到不存在的文件，测试直接失败。
  - "与 v1 快照二选一"也没法比较。
- 需要：把两个文件落进 `design-source/`，或者明确改为继续使用 v1 的 `river-desktop/design-source/poker.js`，同时写明官网人设文案从哪里取。

### B2 共享类型的归属与依赖方向冲突，typecheck 会失败

方案把 `SeatViewPublic` 挪进 `@river/ui`，由 desktop 的 `shared/types` 重新导出。它还把 `felt.ts` 挪进 ui。实际代码有以下牵连：

- `felt.ts` 从 `shared/types` 导入 `Back`、`Felt`、`Settings`。`feltOf` 的参数类型是 `Pick<Settings,'felt'|'feltCustom'>`。`useTableFx` 还用到 `Fx`。
  - ui 不能反向依赖 desktop，所以这些类型也得搬进 ui，或者另找归属。方案没写。
- `SeatViewPublic`、`Felt`、`Back`、`Fx` 都会被主进程引用：`table/view.ts` 负责生成视图，`Settings` 在主进程的 db 和 ipc 中使用。
  - 这样主进程就依赖了 `@river/ui`，和方案画的依赖图不符（图里 main 只依赖 engine）。
- `tsconfig.node.json` 包含 `src/shared/**/*`，而且没有配置 `jsx` 和 DOM lib。
  - 类型导入也会让 TS 加载 `@river/ui` 的 `exports` 入口 `./src/index.ts` 及其下游的 TSX 文件，并对它们做类型检查。`skipLibCheck` 只跳过 `.d.ts`，挡不住这些 TSX。
  - 结果是 `tsc -p tsconfig.node.json` 报 JSX 相关错误。
- 需要：定下这组"视图/外观契约类型"放在哪里，是 ui 的纯类型子路径（例如 `@river/ui/types`）、engine，还是别处。同时同步修正依赖图和 tsconfig 的要求。这是 main、renderer、site 三方共用的契约，不能留给执行者去猜。

### B3 TableStage / useTableFx 的接口与真实输入对不上

方案写的是："TableStage 的 props 取 `seats`、`board`、`pot`、`done`、`hero.isTurn`，`useTableFx` 同步收窄入参"。对照代码后发现下列问题：

1. **缺 `handNo`**。`useTableFx` 用 `v.handNo` 判断是否新开了一手（发牌动画，`useTableFx.ts:41,109`）。按方案收窄后，发牌动效会失效。
2. **动效靠中文状态文案驱动**。
   - `useTableFx.ts:167` 用 `/^(加注|下注)/.test(s.status)` 决定是否播放加注光环和标签。
   - `status` 是主进程 `view.ts:75-83` 生成的中文文案。
   - 官网 `/en/` 传英文 status，加注特效永远不会触发，和"外观与 app 一致""ui 不含文案"两条都矛盾。
   - 设计稿用的是结构化事件（`sim.events` 的 `type: 'allin'|…`），标签再单独翻译。
   - 需要在 `SeatView` 里定一个结构化的动作字段，或者由调用方传入判定函数，这点必须写进契约。
3. **写死的文案和"座位 0 = 玩家"的假设**。
   - `Seat.tsx` 写死了"小盲""大盲"，`Table.tsx` 写死了"底池"。方案只笼统说"文字由调用方传入"，没给出 props 形态。
   - `Seat` 用 `i === 0` 判定玩家本人：蓝色头像、60×84 大牌面、`heroTurn` 高亮。设计稿演示桌是 5 个机器人（`createSim(['bai','li','k','prof','may'])`），座位 0 是否按玩家样式渲染，方案没说。
4. **外观输入与外层容器**。
   - TableStage 还需要 `felt/feltCustom`（或已算好的 `F`）、`back`、`fx`，方案只提到了 `back`。
   - app 里 `rootRef` 这一层同时承载了"公屏"按钮和"桌面外观"浮层，全下时的震屏动画作用在这一层上。抽出后，浮层放在舞台里面还是外面、是否需要 children/overlay 插槽，都得定下来。
5. **官网舞台会缩放**。
   - 设计稿把舞台固定为 1000×560，窄屏为 640×640，再用 `transform: scale(sc)` 适配，动效坐标要除以 `sc`。
   - app 的 `useTableFx` 用 `getBoundingClientRect` 算坐标，但没有补偿缩放。直接复用到官网，飞筹码和光环会错位。
   - 官网是沿用缩放还是改成响应式布局，要写进方案。

这 5 点决定了"共用一套组件"能否成立，属于核心契约。

## 非阻塞发现

- **N1 AI 自定的偏离，没有取得用户确认**。以下几项不在用户决定表里：
  - 语言从客户端切换并存 localStorage，改为 `/` 和 `/en/` 两条路由。设计稿首次访问时会按 `navigator.language` 自动选择语言，改版后英文访客落到 `/` 时是否跳转，没有说明。
  - 不用社区脚手架，也不用 Turborepo。
  - 演示桌的动效从设计稿的事件驱动改为 app 的前后视图对比。
  - 人设文案重复这个风险，写成"本期接受"。

  建议在决定表里标出"AI 建议/待确认"，或者请用户逐条确认。

- **N2 filter 与包名不一致**。
  - 根脚本写成 `pnpm --filter desktop dev`，但方案又要求 desktop 的 `name` 保持 `river`。pnpm 的 filter 按包名匹配，`desktop` 匹配不到任何包。应改为 `--filter ./apps/desktop` 或 `--filter river`。
  - 根 `package.json` 的 name 也要和 `river` 区分开。

- **N3 ui 缺的依赖没列出来**。
  - `Seat` 和 `BetChip` 用了 `fmt`，`Avatar` 用了 `avatarBg`，两者都来自 `lib/format.ts`，而这个文件 import 了 `useRiver`，ui 不能引用。
  - `PlayingCard.tsx` 里还有 `MiniCard` 和 `RichText`（被 ChatPanel、CoachPanel 使用），它们的去留要拆分清楚。
  - ui 的 `react` 应该是 peerDependency，否则 Astro 端可能打进两份 React。

- **N4 CI 与 Pages 的外部前提**。
  - 仓库设置里要把 GitHub Pages 的 Source 设为 "GitHub Actions"，需要用户手动操作，方案没列。
  - `site.yml` 的路径过滤还应包含 `pnpm-lock.yaml` 和 `pnpm-workspace.yaml`。
  - 现有 `build.yml` 只在 tag 和手动触发时运行，所以 `main` 上没有任何测试门禁。site.yml 部署前是否先跑 engine/ui 的测试，要说明。
  - 根目录 `pnpm -r typecheck` 要求 engine、ui、site 各自有 tsconfig 和 typecheck 脚本（site 用 `astro check` 还是 tsc），方案没写。

- **N5 验证第 5 条与"失败不合并"矛盾**。
  - site.yml 只在 `main` 上发布，Pages 环境默认也只允许默认分支部署。所以"发布后页面可访问"只能在合并后验证。
  - 需要写明合并前如何验证（例如只构建、上传 artifact 不部署），以及 Pages 发布失败时的回退方式（revert 后重新部署）。

- **N6 `.gitignore` 描述不准**。现有的 `out/`、`dist/`、`*.tsbuildinfo` 没带前导斜杠，本来就能匹配子目录，无需改动。真正缺的是 Astro 生成的 `.astro/`。

- **N7 下载区与打包命名耦合**。官网用正则 `\.dmg$`、`-setup\.exe$`、`\.AppImage$` 匹配 release 资产，依赖 `electron-builder.yml` 里的 `artifactName`。建议在 `artifactName` 旁边注明这层依赖；匿名 API 每小时 60 次的限流已有回退，不影响方案成立。

- **N8 知识库和既有 ADR**。
  - `.rivo/knowledge/README.md` 第 20–24 行的目录图和第 36 行的 `src/shared/types.ts` 路径会失效，方案没把它们列进交付。
  - 拆包的边界（ui 纯展示、engine 只放规则）属于跨需求的模块边界决定，可以考虑写一条 ADR。
  - ADR-001（引擎在主进程、Renderer 只拿裁剪后的视图）与本方案一致，不冲突。

## 已核实、无问题的前提

- `engine/{eval,table}.ts` 只依赖 `shared/types` 里的 `Card` 和 `Street`，没有 Node 依赖，随机数通过 `Rng` 注入。
- electron-vite 5 在 main/preload 中只把 `dependencies` 当作外部依赖（`externalizeDepsPlugin` 读的是 `pkg.dependencies`）。把 workspace 包放进 `devDependencies` 就会被打进 bundle，这一点成立。
- electron-builder 26.15.3 自带 pnpm 模块收集器。现在仓库没有 `.npmrc`，已经在用 pnpm 的隔离布局打包 libsql，迁移后的主要变化是 `node_modules/.pnpm` 移到了根目录。方案把"打包先行"放在最前，并准备了 `node-linker=hoisted` 作为退路，排序合理。
- `name`、`productName`、`appId`、`publish` 不变，userData 目录（`River`、`River-dev`，见 `index.ts:40`）和自动更新链路（ADR-005）不受影响。
- `index.ts:14` 的图标路径、`prices.mjs` 的写入路径都是相对路径，随 desktop 整体移动后仍然有效。build.yml 需要改工作目录和产物路径，方案已覆盖。
- 设计稿里牌桌色、牌背和筹码的取值与 `lib/felt.ts` 一致。注意设计稿的 `DENOM` 少了面额 1，这不影响共用。

## 证据限制

- `poker.js` 和 `river-site.js` 不在仓库里，`viewReal` 的字段、演示桌座位 0 的语义、人设数据都没法核实（见 B1）。
- 没有实际运行 pnpm workspace 下的 electron-builder 打包，libsql 收集的结论只基于配置和版本。
- 没有查证仓库是否公开、Pages 是否已开启。

## 前轮问题处理

首轮，无。
