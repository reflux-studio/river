# 最终审阅 final-1：river-monorepo 整项交付

## 方式、范围与版本

- **方式**：独立最终审阅。不派子代理，不改实现和契约（只写本报告）；没有开牌局，没有调用模型，没有 push，没有改用户数据。
- **范围**：检查整项交付组合起来的结果，不是把各任务结论加在一起。依据是 `discussion.md` 的用户决定表，`plan.md` 的本期功能点、关键规则、明确不做，`task.md` 的各任务结果和整体验证，ADR-007，`reviews/` 下的全部审阅，以及 `evidence/`。
- **版本**：分支 `feat/monorepo-site-i18n`，基线 `main` @ 1ece50c，HEAD 72d3752。工作区只有一个无关的未跟踪文件 `.rivo/issues/river-desktop/reviews/final-1.md`。
- **追加复审**：9c275d5（下载地址前缀校验、`aria-pressed`、牌背 `aria-label`）；72d3752（`ci.yml` 加 `build:site`；`site.yml` 的 paths 补上 `pnpm-workspace.yaml`、`package.json` 和 `site.yml` 本身）。

## 判断

**结论：代码层面可以合并，没有发现阻塞合并的代码缺陷。** 但按 plan“第 1～7 项有任何一项没通过就不合并”的规则，还有 3 组证据缺口（F1～F3）要先补上。其中 F1、F2 需要用户同意或操作。

### 需求与契约

逐条对照用户决定表和 plan：

| 用户决定 / plan 要点 | 落地情况 |
| --- | --- |
| monorepo：`apps/desktop` + `apps/site` + `packages/{engine,ui,i18n}`，只用 pnpm workspace，不用脚手架和 Turborepo | 已落地。根目录没有 turbo 配置，`pnpm-workspace.yaml` 保留了 `allowBuilds`、`minimumReleaseAgeExclude` |
| 拆 engine、ui、i18n；Agent 暂不拆 | 已落地。`agents/*` 仍在 `apps/desktop/src/main` |
| 牌桌、卡片等 app 和官网共用，不写两套 | 基本落地。`TableStage`、`Seat`、卡牌、`felt`、`playAllIn`、`useTableFx`、预设、术语都只有一份；官网演示桌和外观区直接用 ui 的组件和特效函数。剩下少量固定内容的重复见 F4 |
| 官网用 Astro + React 岛，`/` 中文、`/en/` 英文，部署到 GitHub Pages | 已落地。构建产物里 `<html lang>` 分别是 zh-CN 和 en，链接都带 `/river/` base |
| 演示桌复用 `useTableFx`，外观区共用特效函数 | 已落地（`DemoTable` → `TableStage`，`Effects` → `playAllIn`） |
| i18n：site 和 desktop 都做，只做固定内容；动态内容保存为快照 | 已落地。手牌记录的 `handName`、`label`、`pos` 按写入时的语言存为文字，没有 schema 迁移；老回放显示存下的原文 |
| 语言只在首次引导时选，按系统语言预选，设置页不能改；老用户是中文 | 已落地。`loadCaches` 读原始 kv 判断预选值；`settings.update` 拒绝 `locale`；`Settings.tsx` 没有语言入口；语言页只在 `!onboarded` 时挂载 |
| 预设按所选语言；“恢复默认”回到该语言 | 已落地。`seeds()` 取 `presets[locale]`；有测试守住“中文预设和旧 PERSONAS 逐字一致” |
| 系统提示词双语，并写明回复语言 | 已落地（`prompts.ts` 的 `reply`） |
| 设置页手动检查更新 | 已落地（`update.check`、`update:error`、`Bootstrap.packaged`） |
| 选英文的新用户默认美元 | 已落地（`completeOnboarding`） |
| i18n 自写类型化字典，不引入第三方库 | 已落地。i18n 只依赖 engine 的类型 |
| 明确不做的项 | 都没有越界：没有 Agent 包、Turborepo、第三种语言、设置页语言切换、历史重译、Starlight、深色模式、自定义域名 |

没有发现悄悄缩减需求的地方。T8-1 F1（演示桌一手结束后底池数字不归零、弃牌座位仍变灰）和设计稿不同，这是“复用 app 实现”带来的结果，已经记录并接受。

**依赖方向（ADR-007）**：
- `apps/desktop/src/{main,preload,shared}` 对 `@river/*` 的引用只有 engine、i18n 和 `@river/ui/types`，没有其他。
- ui 只引用 engine、`cn`、react；i18n 只引用 engine 的类型；engine 不依赖任何包。
- 守卫实测有效：我在 scratchpad 里用 `tsconfig.node.json` 的配置编译一个引用 `@river/ui` 主入口的探针文件，tsc 报 `TS6142 … '--jsx' is not set`，exit 2。

### 工程质量

- **中文老用户的关键路径**（抽查 `git diff 1ece50c..HEAD`）：
  - db：默认设置只多了 `locale: 'zh'`，没有表结构变化；老库在 `onboarded=true` 且没存 `locale` 时取 zh。
  - 引导：`finishOnboarding` 在已完成引导时直接返回；重新打开“规则介绍”不出现语言页。
  - 统计和设置：文案改为从字典取，日期按 `useLangTag` 格式化，中文仍是 `zh-CN`。
  - 牌桌：改为 `TableStage`，中文 labels 由字典提供。
  - 提示词：T5-1 对比了 461 次调用，中文模式下只多了结尾的“请用中文回复。”，这是用户决定的结果。
- **英文新用户全链路**：`english.test.ts` 在英文模式下跑教练局和自由局，断言发给模型的全部内容、工具定义、`TableView` 和公屏系统消息里都没有汉字；`newChat` 有英文用例；T4 和 T6 有英文界面截图。英文牌桌页没有实机截图，见 F2。
- **自动更新链路**：
  - `apps/desktop/package.json` 的 name `river`、productName、version 0.2.1 都没变，和基线相比只把三个 workspace 包加进 devDependencies，并把 typescript、vitest、`@types/node` 上移到根目录。
  - `electron-builder.yml` 只多了一行注释，appId、publish、签名、`asarUnpack`、`artifactName` 都没变。
  - `updater.ts` 的后台逻辑和原来等价（`isPackaged` 判断移到 `index.ts`），另外修掉了原来后台下载失败时未处理的 rejection。
- **build.yml**：prices、版本号、打包、codesign 断言四步加了 `working-directory: apps/desktop`，上传路径改为 `apps/desktop/dist/*`；安装和证书导入仍在根目录；release job 没变。`extraMetadata.version` 作用在 `apps/desktop/package.json` 上，这是对的。
- **site.yml**：和官方 Pages 示例一致（权限、concurrency、`upload-pages-artifact@v3`、`deploy-pages@v5`、`environment: github-pages`）。`base: '/river'` 写在 astro 配置里，所以不需要 `configure-pages`。
- **回滚说明**：plan 的“发布与回滚”写明了只能向前修复，以及回退代码后 `locale` 会被 `pick` 丢掉的后果，完整。

### 验收证据

- 本地可以验证的部分全部通过（见“实际验证”）。T1～T9 的独立审阅都已完成，遗留项都已转入整体验证。
- 还没有证据的是整体验证第 2、3、4 项的实机部分、T7 的打包手测，以及第 7 项 CI（见 F1～F3）。`evidence/overall/` 还不存在。

## 发现表

| 编号 | 类型 | 具体影响 | 依据与位置 | 建议 |
| --- | --- | --- | --- | --- |
| F1 | 证据缺口（阻塞合并，需用户同意推送） | `ci.yml` 还没在 PR 上跑过；`build.yml` 没在分支上手动触发过。Windows 和 Linux 在 workspace 布局下的 electron-builder 依赖收集（libsql 原生模块）从没实测过，是本期剩下最大的风险。mac 只在本地验证过（T1），没走过 CI 的自签证书流程 | task.md T9 结果、整体验证第 2 项；reviews/T9-1 F1；evidence/T9 只有本地模拟 | 用户同意后推送分支、开 PR，看 CI；用 workflow_dispatch 触发 build.yml，三平台都出包后，把链接记到 evidence/T9 |
| F2 | 证据缺口（阻塞合并，需用户同意模型费用） | 下面几项都没做：真实模型下的回复语言（中文和英文各 ≥2 手）；英文牌桌页实机截图（ActionBar、CoachPanel、ChatPanel、外观浮层）；牌桌特效实测（全下、加注、各种不触发的情形、退回、弃牌、收筹码，以及 `lite`、`off` 两档）；打包版打完一手并写入回放。mock 只能证明发出去的提示词没有汉字，证明不了模型会用所选语言回答 | task.md 整体验证第 3 项；reviews/T1-1 F1、T3-1 F4、T6-1 F3 | 按 task 的安排，用 mac 打包版接一个真实提供方，一次联调覆盖以上各项，截图和摘录放进 `evidence/overall/` |
| F3 | 证据缺口（阻塞合并，现在就能做，不花模型费用） | 打包版“检查更新”的“已是最新”和断网“检查失败”两种提示都没手测（T7 F2），macOS Squirrel 的边界情况（F4）也没观察过；用 v0.2.1 老库启动新版本（不出现引导、中文、改过的对手保持、老回放能显示）只有单元测试 | task.md T7 结果、整体验证第 4 项；evidence 里没有老库实机记录 | 用 `pnpm dist` 打 mac 包测试检查更新。老库验证要先把用户的 `river.db` 拷一份，用临时 userData 启动，不要碰原库；打包版默认读的是真实 userData，操作前要让用户知道 |
| F4 | 待对齐（低） | 官网还有少量和共享包重复的固定内容，偏离“不写两套”：外观区的牛仔座位把 name、tag、ini 写在 `site.ts`，hue 95 写在 `Effects.tsx:126`，和 `presets` 里的 `cow` 是两份，以后改预设会不同步；演示桌的 `demo.seat.thinking`、`won` 和 `dict.desktop.table` 同义；`to-seat-view.ts` 的 `label()` 和“最后一条发牌记录之后”的扫描，与 desktop `text.ts` 的 `label`、`view.ts` 的扫描是同一种推导。后两处用词和设计稿有差别，plan 也允许官网有自己的映射，所以只有牛仔这一处算真正的重复 | `apps/site/src/i18n/site.ts:108,273`、`apps/site/src/components/Effects.tsx:126`、`apps/site/src/sim/to-seat-view.ts:20-36`；reviews/T8-1 F2（当时判为可选，没有处理） | 牛仔改成从 `presets[lang].find(p => p.id === 'cow')` 取 name、tag、ini、hue，改动只有几行，建议合并前顺手改掉；其余可以保持现状 |
| F5 | 可选改进 | 9c275d5 把牌背按钮的 `aria-label` 改成 `${E.back} ${i+1}`。中文读作“牌背 1”没有问题，英文词条是 `back: 'Backs'`（它同时是行标题），读屏会读成 “Backs 1” | `apps/site/src/components/Effects.tsx:97`、`apps/site/src/i18n/site.ts:270` | 另加一个单数词条，例如 `backN: (n) => \`Card back ${n}\``；不影响合并 |
| F6 | 需用户处理 | 仓库 API 显示 `has_pages: true`，但匿名请求看不到来源是不是 “GitHub Actions”。`https://reflux-studio.github.io/river/` 现在返回 404，还没有部署。如果来源仍是分支，`deploy-pages` 会失败 | plan“外部协同”、task 整体验证第 6 项 | 合并前由用户在 Settings → Pages 确认来源是 GitHub Actions；合并后第一次 site.yml 跑完，再访问 `/river/` 和 `/river/en/` |
| F7 | 需用户处理 | 工作区里有一个和本需求无关的未跟踪文件，提交时如果用 `git add -A` 会被误带进来 | `.rivo/issues/river-desktop/reviews/final-1.md` | 由用户决定单独提交、移走还是忽略 |

对追加复审的结论：
- **9c275d5**：`safe()` 只接受 `https://github.com/reflux-studio/river/releases/download/` 开头的地址。我实际请求了 `api.github.com/.../releases/latest`（v0.2.1），所有 asset 的 `browser_download_url` 都是这个前缀，大小写也一致。三个平台的正则分别匹配 `River-0.2.1-arm64.dmg`、`River-0.2.1-x64-setup.exe`、`River-0.2.1-x86_64.AppImage`，不会误匹配 `.blockmap` 和 `.zip`。校验不通过时退回 `releases/latest`，行为正确。`aria-pressed` 加在分段按钮、牌桌色和牌背按钮上，写法正确。只有 F5 这一处英文措辞问题。
- **72d3752**：用 action-validator 校验三个 workflow，都是 exit 0（site.yml 只提示 glob 不校验）。paths 里的 `package.json` 按 GitHub 的规则只匹配根目录的那个文件，符合意图。`ci.yml` 最后一步是 `pnpm build:site`，本地按同样顺序执行通过。

## 实际验证

| 命令 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile --offline`（根目录） | exit 0，Already up to date（pnpm 11.22.0） |
| `pnpm typecheck` | exit 0；engine（src 和 test 两套配置）、i18n、ui、desktop（node 和 web）都通过；astro check 20 个文件，0 errors、0 warnings |
| `pnpm test` | exit 0；engine 36、i18n 4、ui 5、site 1、desktop 120，全部通过 |
| `pnpm build:site` | exit 0；生成 `/index.html`、`/en/index.html`；资源和内部链接都带 `/river/` 前缀 |
| `apps/desktop` 下 `pnpm build` | exit 0；生成 `out/{main,preload,renderer}`；`out/main`、`out/preload` 里没有出现 `@river/` 的 require，说明三个包都打进了 bundle |
| `rg -n '\p{Han}' apps/desktop/src packages/*/src apps/site/src -g '*.ts' -g '*.tsx' -g '*.astro'` | 排除 `dict.ts`、`prompts.ts`、`presets.ts`、`poker.ts` 和 `site.ts` 之后，不是注释的命中只有 3 类：`apps/site/src/sim/sim.ts:11-19` 的中英双份气泡台词（设计稿的 `LINES`，属于官网文案）；`Page.astro:100` 的语言切换标记“中”；`db/index.ts:102` 行尾的注释。都合理。desktop 的 renderer、main、shared 里没有不是注释的中文 |
| 主进程守卫探针（scratchpad 临时 tsconfig 继承 `tsconfig.node.json`，引用 `@river/ui` 主入口） | 按预期失败：TS6142 `--jsx is not set`，exit 2 |
| `npx @action-validator/cli` 校验 build、ci、site 三个 yml | 都是 exit 0 |
| 请求 GitHub API 的 latest release | asset URL 前缀和 `safe()` 一致，见上 |
| 匿名请求仓库 API 和 Pages 地址 | 仓库公开，`has_pages: true`；`/river/` 返回 404（还没部署） |
| 依赖方向 rg 和 `git diff 1ece50c..HEAD` 抽查 | 结果见“判断”一节 |

没有做的：开牌局、调用模型、启动打包版、push、触发 workflow。

## 后续

**合并前必须完成（按 plan 的规则）**：

1. F1：推送分支，`ci.yml` 通过；手动触发 `build.yml`，三个平台都产出安装包。**需要用户同意推送。**
2. F2：用 mac 打包版接真实模型做中英双语联调，覆盖回复语言、英文牌桌页、特效三档和写入回放，证据放进 `evidence/overall/`。**需要用户同意产生模型费用。**
3. F3：打包版手测检查更新（“已是最新”和断网两种情况）；用老库副本启动做兼容验证。**现在就能做**，但要用老库副本和临时 userData，不能动用户的原库。
4. F6：用户在 Settings → Pages 确认来源是 GitHub Actions。**需要用户操作。**

**建议合并前顺手处理（可以现在做，不阻塞）**：F4 牛仔座位改为从 `presets` 取值；F5 英文牌背的 `aria-label`。

**需要用户决定**：F7，无关的未跟踪文件怎么处理。

**合并后**：第一次 `site.yml` 跑完，访问线上的 `/river/` 和 `/river/en/`；按现有流程打 tag 发版，确认已安装 v0.2.1 的用户能收到自动更新（包名、appId 和发布配置都没变，理论上不受影响）。
