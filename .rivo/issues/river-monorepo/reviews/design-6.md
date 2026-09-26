# river-monorepo 方案审阅 · 第 6 轮（i18n 重写 + 手动检查更新）

- **对象**：`.rivo/issues/river-monorepo/discussion.md` 全文（2026-09-25 14:03 版）。重点是整节重写的"@river/i18n 与 desktop 双语"、新增的"手动检查更新"，以及它们对前几轮已通过部分的影响。
- **基线**：`main` @ 1ece50c。核对的代码：`src/main/**`、`src/renderer/src/**`、`src/shared/**`、`test/**`，以及 `node_modules/electron-updater@6.8.9` 的 `AppUpdater.js`。
- **前轮**：design-5 结论为通过。design-4/5 审的是旧的 i18n 设计（按牌局锁定、结构化渲染、posKey/handCat 字段等），这些已被用户推翻，相关的前轮问题随之作废，本轮不再追踪。
- **结论：需修改。** 阻塞 1 项（B6-1），非阻塞 8 项。

## 是否承接了用户思路

- 新原则"固定内容做双语，动态内容保存快照"已经落实到分类表、语言入口、对手预设三处，和用户的决定一致。旧设计的锁定、重渲染、`posKey` 等内容已经全部删除，没有残留在验证清单里。
- 决定表里标为"用户决定"的几行（固定与动态、语言入口、对手预设、系统提示词），和本次修订说明中的用户原话一致，没有把 AI 的建议写成用户的选择。`sysKind`、`update.check` 的四种状态、老用户默认 `zh` 都写在方案正文里，属于实现设计，没有标成用户决定，这样处理正确。
- 因为"语言选定后不再改变"，旧设计的难点都不存在了。我核对了一遍：历史记录、`HandRecord` 快照（`label`/`pos`/`handName`/`name`）、`river_memory`、复盘，对同一位用户来说永远是同一种语言。`text.ts` 用这些快照拼接局面描述时，也不会出现中英混杂。这个简化成立。

## 阻塞

### B6-1 locale 何时写入、跳过引导怎么办、引导页重开时怎么办，都没有写明；处理不当会让英文系统的新用户永久停在中文

现状（`Onboarding.tsx`、`lib/river.ts`）：

- "引导页"就是规则卡片 Dialog（`rulesOpen: !b.onboarded`），它有三种关闭方式：
  - 右上角"跳过"（`Onboarding.tsx:49`）；
  - Esc 或点击遮罩（`onOpenChange` → `finishOnboarding`，第 120 行）；
  - 最后一页的三个按钮。
- 这个 Dialog 还会被 `openRules` 重新打开，入口有两个：**设置页**"规则介绍 · 打开"（`Settings.tsx:272`）和大厅"规则介绍"（`Lobby.tsx:177`）。
- `settingsCache` 来自 `pick(DEFAULT_SETTINGS, getKv(...))`（`db/index.ts:147`）。新用户在选语言之前，`locale` 也是默认值 `zh`。
- `personasCache` 在 `initDb` 时按种子构建（`db/index.ts:152`），`updateSettings` 不会重建它，也不会推送 `personas` 事件。

方案只写了"引导页第一步选语言，按 `app.getLocale()` 预选"，下面这些问题都留给了执行者去猜：

1. **跳过或 Esc 的后果**：如果只有点击"下一步"才写入 locale，英文系统的新用户在第一页按下"跳过"或 Esc 后，`onboarded=true` 会被写入，而 `locale` 没有写入，读取时就会落到默认的 `zh`。设置页又不能改语言，这位用户只能删除 userData 才能恢复。
2. **重新打开规则卡片**：如果语言选择页作为 Dialog 的第一页，在设置页点"规则介绍"时也会出现这一页，这就违背了"设置页不提供切换"。
3. **预选值从哪里来、界面在选择前用哪种语言**：`app.getLocale()` 只能在主进程调用，而 `Bootstrap` 里没有系统语言字段。选择之前，Dialog 背后的大厅和对手列表按 `settings.locale='zh'` 渲染，Dialog 本身却应该显示预选语言，两者不一致。
4. **选完之后的生效链路**：选择语言后，必须重建 `personasCache`（种子换成 `presets[locale]`）并推送 `personas` 事件，否则大厅和对手页仍然显示中文预设，直到重启才会变。`coach.ts` 这类直接读 `settingsCache` 的地方会立即生效，不受影响。
5. **写入口的约束**：`settings.update` 可以接收任意 patch。如果 locale 也通过它写入，引导完成后仍然可以通过 IPC 修改，"选定后不再改变"就没有了守卫。

建议在方案里写明下面几条。这些都是规则和契约，不是实现细节：

- 语言选择只在 `!onboarded` 时显示，`openRules` 重新打开时不显示。
- **任何结束引导的路径**（跳过、Esc、最后一页的三个按钮）都会写入当前选中的语言，默认值就是预选值。可行的做法：把 `onboarding.done` 改成 `onboarding.done(locale)`，由主进程写入 locale、重建人设缓存并推送事件；或者让语言页不能跳过。两种做法任选其一，但要写明。
- 预选值的来源。建议由主进程在 `loadCaches` 时计算：库里没有 `locale` 时，如果 `onboarded` 为真就用 `zh`（老用户），否则用 `resolveLocale(系统语言)`。这样首次启动时界面和预设都已经是预选语言，第一步只是确认或修改。注意 db 模块不能直接调用 `app.getLocale()`，需要通过 `initDb` 的参数传进去，否则测试无法注入。
- 引导完成后，主进程拒绝修改 `locale`：`settings.update` 忽略或拒绝 `locale` 字段，只有引导命令能写。
- 验证清单补充几项：英文系统下的新用户在第一页直接按 Esc，之后仍然是英文；从设置页打开"规则介绍"时没有语言页；选择英文后不重启，大厅里的对手名立刻变成英文。

## 非阻塞

### N6-1 固定文字的清单有遗漏（建议在 plan 里按文件列出）

用 grep 查出、方案表格没有明确点名的固定中文：

- **主进程发给界面的**：
  - `ipc.ts:89` 提供方注册表里的 `'OpenAI 兼容接口'`；
  - `ipc.ts:61,124`、`updater.ts:30`、`runner.ts:101-104,278,374,376,417,496` 抛出的错误和兜底文案；
  - `resolve.ts:76,81,87`、`db/index.ts:443,447` 的错误；
  - `llm.ts:126` 的 `'调用超时'`；
  - `view.ts:117` 的下注档位（`⅓ 池`…`全下`）、`:129` 的 `教练复盘见右侧`、`:136` 的桌名 `title`。

  这些大多可以归入"报错弹窗、主进程展示文字"，但表格里只列了"状态行、行动标签、街道、位置、结果横幅、称呼"，建议把 `TableView` 的全部文字字段和 IPC 抛出的错误都写进去。
- **启动失败弹窗**（`index.ts:53`）：这时 db 可能还没有初始化成功，读不到 `settings.locale`，只能按 `app.getLocale()` 选择语言。需要写明这一点。
- **发给模型、但不在"提示词"一行里的内容**：
  - 工具的 `description` 和 zod `.describe()`（`opponent.ts:7-22`、`coach.ts:48-54`）会作为工具 schema 发给模型，是固定内容，需要做双语；
  - `thread.ts:21,55` 的 `【往手回顾】`、`[第 N 手]`、`你本手`；
  - `runner.ts:292-293,454,460,484,586,596` 的摘要、工具结果的 key（`实际`/`公屏`）、`（被打断）`、`讲解`/`答玩家`。
- **渲染进程里写死的区域设置**：
  - `Replays.tsx:186`、`Stats.tsx:49` 的 `toLocaleString('zh-CN')`；
  - `index.html` 的 `lang="zh-CN"`；
  - `shared/currency.ts` 的币种名称（渲染进程在用）。
- **渲染进程的初始 settings**（`lib/river.ts:41`）：这里复制了一份 `DEFAULT_SETTINGS`，要同步加上 `locale`。
- **`DEFAULT_SETTINGS`**：`locale` 必须写进 `DEFAULT_SETTINGS`，否则 `pick()` 会把库里存的 `locale` 丢掉（`db/index.ts:144`）。方案写了"默认 `zh`"，隐含了这一点，建议明确写出来。

### N6-2 无汉字自动检查截取不到工具 schema

- `test/mock-model.ts` 的 `next()` 只记录了 `system`、`prompt` 和工具**名称**，没有记录工具的 `description` 和 `inputSchema`。
- 按验证 4 的写法"在 mock 模型入口截取发给模型的全部内容"，需要顺带把 `options.tools` 整体序列化后纳入断言，否则 N6-1 中工具描述的遗漏测不出来。
- `TableView` 也建议整体 `JSON.stringify` 后断言，不要只查状态文字，这样 `title`、下注档位、横幅都能覆盖到。

### N6-3 依赖中文文案的判断：sysKind 已经覆盖全部 sys 写入点，但还有两处

- `runner.ts` 的 `this.sys(` 共 5 处：入座（125）、重新买入（196）、第 N 手（203）、街道（244）、赢得（544）。它们和 `sysKind` 的 `seat | rebuy | hand | street | win` 一一对应，`newChat` 需要的 `hand`、`rebuy` 都在里面。**覆盖完整。**
- `useTableFx.ts:161` 的 `/^(加注|下注)/` 已经由 `lastAct` 替代（前轮已通过）。
- 其余匹配中文的逻辑：
  - `runner.ts:42` 的 `needsSettings` 正则含 `解密`，它匹配的是 `resolve.ts:81` 的中文错误。英文版只要仍然包含 "API key" 就能命中，所以现在不会出错，但属于同一类隐患。建议改成按错误类型或错误码判断，至少在 plan 里注明。
  - `text.ts:133,141` 的 `name === '你'` 是旧记录的兜底，新记录会先命中 `seat === 0`，英文用户不受影响，可以保留。
- 测试里的中文断言（`runner.test.ts:65,301,547-552` 等）在"测试默认中文"的前提下不用改。

### N6-4 对手预设与 db 逻辑的兼容性：成立，但有两点要写清楚

- `loadPersonas`、`savePersona`、`deletePersona`、`resetPersona` 都通过 `PERSONAS` 取种子或判断是否内置（`db/index.ts:242,274,289`）。改成 `presets[settingsCache.locale]` 之后：
  - 按 id 判断内置的逻辑不受影响，前提是中英两份预设的 **id 必须一致**。方案只写了"hue 等非文本字段不分语言"，建议把 id 也点名写进去。
  - `edited` 的判定、`diff` 置空、`resetPersona` 置空，都和同一语言的种子比较，逻辑自洽，不需要迁移。
- 边界情况：v0.2.1 用户如果没有完成过引导（`onboarded=false`），但改过内置对手（可以通过大厅或对手页修改），升级后会看到语言页。如果这时选择英文，没改过的字段会变成英文，改过的字段保持中文，同一个对手中英混杂。这种情况少见，写明"可以接受"或"`onboarded=false` 但已有人设改动时预选中文"即可。

### N6-5 `update.check` 与现有 updater：基本相容，契约还缺三处

我按 electron-updater 6.8.9 的源码核对了以下几点：

- **复用实例、防重复下载**：`checkForUpdates()` 在检查进行中会返回同一个 promise（`AppUpdater.js:257-260`）。`autoDownload=true` 时，`doCheckForUpdates` 会调用 `downloadUpdate`，而下载进行中会直接返回已有的 `downloadPromise`（第 442-444 行）。所以手动检查与后台定时检查同时发生，或者重复点击，都不会重复下载。**相容。**
- **"downloading" 怎么判定**：返回值的 `isUpdateAvailable === true` 就是 `downloading`，为 `false` 就是 `latest`。检查失败时 promise 会 reject，同时触发 `error` 事件，现有监听只记日志，手动检查的一方 catch 后返回 `error`。**可行**，建议在方案里写出这条映射规则。
- **ready 时直接返回**：这样也避免了对已下载的版本再走一次检查和缓存校验。顶栏的"重启更新"只在 `!view` 时显示（`TopBar.tsx:79`），安装时仍然由 `update.install` 拦截"在牌桌上"（`ipc.ts:124`），不受影响。

还缺的三点：

1. **开发版本的契约**：`initUpdater` 在未打包时直接返回，而 `checkForUpdates()` 在 `isUpdaterActive()` 为假时 resolve 为 `null`。方案说"按钮不可用并说明原因"，但渲染进程拿不到"是否已打包"：`Bootstrap` 里没有这个字段，四种状态里也没有 `unavailable`。需要二选一：在 `Bootstrap` 加一个类似 `updatable` 的字段，或者增加第五种状态。`AppInfo`（`ipc.ts:14`）也要加上 `check`。
2. **返回 `downloading` 之后下载失败**：失败只会走 `error` 监听、记日志，用户看到的是"正在下载"，之后就再没有下文。这与"手动检查时结果和错误都要明确告诉用户"有出入。建议写明取舍：要么接受（等下次定时检查再试），要么手动检查时在 `downloadPromise` 上挂一个 catch，失败后推送事件。
3. **`error.message` 的内容**：electron-updater 的错误信息可能很长，比如 404 时会带上完整的响应头，而且是英文。建议界面显示本地化的"检查失败"加上简短原因，完整错误写进日志。

另外建议：请求进行中按钮置为不可用；在牌桌上检查到 `ready` 时，提示"离桌后可在顶栏重启更新"。验证第 4 条只覆盖了"已是最新"和"检查失败"，建议给 `update.check` 的状态映射加一个替身 `autoUpdater` 的单元测试，覆盖 `downloading` 和 `ready`。

### N6-6 与前几轮已通过的内容不一致（需要改文字）

- **第 100 行**："组件里需要的文字由调用方传入（官网中英双语，**app 只有中文**）"。这是 i18n 之前留下的旧描述，现在 app 也是双语，应该删除括号里的内容。
- **第 104 行**：`FELTS` 名称"按 key 由调用方映射，或拆成中英两套名称，实施时二选一"，与第 171 行"牌桌色和牌背的名称按 key 放在 `common` 里，`FELTS` 中不再带名称"冲突，应该改成以第 171 行为准。
- **依赖图（第 71-77 行）**：没有 `apps/desktop renderer ─► @river/i18n` 这条边（渲染进程要用字典），应该补上。`desktop` 的 `devDependencies` 也要包含 `@river/i18n`。第 81 行写的是"workspace 包"，已经涵盖，但依赖图应该一致。
- 其余已通过的内容（engine、ui 边界、`@river/ui/types` 守卫、`TableStage`、`useTableFx`、`lastAct`、打包、CI、site 工作流的触发路径 `packages/**`）都没有被本次改动破坏。`@river/i18n → @river/engine`（只用类型）和 engine 测试里的本地映射表，也不会形成循环依赖。

### N6-7 DB 里与语言有关的默认值：需要用户确认，不要由 AI 决定

- `DEFAULT_SETTINGS.currency = 'cny'`（`db/index.ts:18`）。英文新用户的花费默认也显示人民币。
- 这不是文字，不属于固定/动态的分类，但会直接影响英文用户的第一印象。选择英文时要不要把默认币种设为 `usd`，请交给用户决定，方案里写明结论即可。

### N6-8 决定表的措辞

- "i18n 实现"一行写着"取代拆包只拆 engine 和 ui 的决定"，但"拆包范围"一行仍然写着"只拆 engine 和 ui"。建议在"拆包范围"一行直接注明"后由 i18n 一行补充 `@river/i18n`"，避免读者只看其中一行。
- 另外，"语言入口"一行没有提到"老用户默认 zh"。修订说明里这是用户的决定，方案正文写了（第 158 行），但决定表里没有，建议补进去。

## 证据限制

- 只读了代码，没有运行任何测试或应用。electron-updater 的行为是按本地 `node_modules/electron-updater@6.8.9/out/AppUpdater.js` 源码推断的，没有在打包版本中实际测试。
- 固定中文的清单是用 grep 查找非注释行中的汉字得到的（`src/main`、`src/shared`、`src/preload`）。渲染进程的界面文案数量太多，没有逐条列出，只核查了与语言相关的逻辑判断和区域设置。
- 没有查看官网设计稿中与 i18n 相关的部分，只沿用了前几轮的结论。
