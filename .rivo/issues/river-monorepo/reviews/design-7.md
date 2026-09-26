# river-monorepo 方案审阅 · 第 7 轮

- **对象**：按 design-6 修订后的 `.rivo/issues/river-monorepo/discussion.md`。重读了决定表、依赖图、"@river/ui"开头部分、"@river/i18n 与 desktop 双语""手动检查更新"两节，以及验证第 4 条。
- **基线**：`main` @ 1ece50c。补充核对了 `runner.ts:42,264,278`、`resolve.ts:38,81`、`llm.ts:80-130`、`lib/river.ts:176-181`、`Onboarding.tsx:107-109`，以及 electron-updater 6.8.9 `AppUpdater.checkForUpdates`（它先 emit `error` 再 reject）。
- **结论：通过。** B6-1 已经解决，N6-1 至 N6-8 都已处理。本轮新发现 4 项非阻塞问题（N7-1 至 N7-4），都是修订中新写入的句子不够准确。建议在 plan 里落实，不需要再审一轮。

## 前轮问题的处理

| 编号 | 处理 | 核对 |
| --- | --- | --- |
| B6-1 locale 写入时机、跳过、重开、生效、守卫 | 预选值由主进程在加载时算好（老用户 zh，新用户取系统语言）；语言页只在未完成引导时出现；`onboarding.done(locale)` 覆盖完成、跳过、Esc；写入后重建人设缓存，并返回 `settings`、`personas`；`settings.update` 拒绝修改 locale；验证第 4 条补了对应用例 | **已解决。** 预选值在引导前就是 `settings.locale`，所以引导卡片背后的大厅和人设已经是预选语言，界面和主进程一致。即使预选值被其他 `settings.update` 顺带写进库，也只是把预选值持久化了，`onboarding.done` 会覆盖它，没有问题。并发边界见 N7-3 |
| N6-1 固定文字的遗漏 | 分类表补了桌名、下注档位、IPC 错误、提供方类型名、thread/runner 摘要、工具 describe、日期/lang/币种名；`DEFAULT_SETTINGS` 加上 locale；启动失败弹窗按 `app.getLocale()` | 已解决 |
| N6-2 自动检查的范围 | mock 补录工具定义；`TableView` 整体纳入断言 | 已解决 |
| N6-3 中文判断 | `sysKind` 注明覆盖 5 处；`needsSettings` 改为错误 code | sysKind 已解决；needsSettings 的新写法有问题，见 N7-1 |
| N6-4 预设 id | 写明两种语言的 id 必须相同；中英混杂的边界情况接受 | 已解决 |
| N6-5 update.check | 新增 `Bootstrap.packaged`；写明 downloading 的判定；新增 `update:error`；错误显示本地化短句；替身测试 | 基本解决；`update:error` 的触发条件见 N7-2 |
| N6-6 文字冲突 | 第 100、104 行改了；依赖图补了 renderer → i18n | 已解决 |
| N6-7 默认币种 | 决定表新增一行：选英文的新用户默认美元 | 已解决；"没改过币种"的判定见 N7-4 |
| N6-8 决定表措辞 | "拆包范围"一行写明追加 i18n；"语言入口"一行补上老用户 zh | 已解决。老用户 zh 在决定表里标的是"AI 建议，沿用现有行为"，而协调者转述的修订说明把它列为用户的新原则。这样标注偏保守，不构成冒充，请协调者确认按哪种来源标注 |

## 新发现的问题（非阻塞）

### N7-1 `needsSettings`"改为错误 code、不再匹配文案"：这样改会误伤外部错误

- 核实 `needsSettings` 的输入来源：runner 路径上的解密失败，会先被 resolve 标成 `needsKey`，最后变成 `'model not configured'`（`resolve.ts:48`、`runner.ts:264`）。`resolve.ts:81` 的中文 `无法解密…` 只出现在 `provider.test` 的返回值里，**根本不会进入 `needsSettings`**。所以正则里的 `解密` 本来就是死分支，删掉就行。
- 正则剩下的部分（`401|403|404|unauthorized|forbidden|invalid.*key|API key`）匹配的是**模型 SDK 抛出的英文错误**，这些错误不是我们抛出的，我们没法在抛出时给它设 code。
- 如果按方案"由抛出方设置错误类型"，把整个正则换掉，API key 失效、401 这类情况就不再提示"去设置"，会出现回归。
- 建议改成下面两种写法之一：
  - 由 `llm.ts` 在 `errorText` 的位置，根据 SDK 错误的 `statusCode`（401/403/404）和 `'model not configured'` 算出 `needsSettings`，与错误文字一起返回；
  - 保留英文正则，只删掉 `解密`。

  两种都比方案现在的写法更准确，只要写明用哪一种。

### N7-2 `update:error` 的触发条件"有手动检查进行中"会让错误重复提示

- electron-updater 检查失败时，会先 emit `error`，再 reject 返回的 promise（`AppUpdater.js:267-271`）。
- 按方案的写法，手动检查进行中如果检查失败，`error` 事件会推送一次 `update:error`（"下载失败，稍后自动重试"），`update.check` 又会返回 `{ state: 'error' }`。用户会同时看到两条提示，而且第一条的内容不对：失败的是检查，不是下载。
- 建议把条件收窄成一个明确的状态：只在 `update.check` **已经返回 `downloading`** 之后置位，收到 `update-downloaded` 或 `error` 时清除。检查阶段的失败只走 `update.check` 的返回值。
- 同时，"刚刚返回 downloading"里的"刚刚"要改成这个状态位，不能留给执行者自己定时限。
- `Events` 类型里要加上 `'update:error'`，替身测试补一条用例："检查失败时不推送 `update:error`"。

### N7-3 引导最后一页的按钮没有等写入完成就跳转

- `Onboarding.tsx:108-109` 的写法是 `void finishOnboarding(); go('settings')` 和 `void finishOnboarding(); void startGuided()`。
- 按新契约，`onboarding.done` 要在主进程里写库，并重建人设缓存（`loadPersonas` 是异步读库）。"带我打一手"的 `table.start` 可能在人设缓存重建之前就开桌，开桌快照里的人设就会是预选语言，而不是用户改选的语言。
- 目前触发的概率很低：新用户多半还没配置模型，会先被 `needModel` 拦下。但只要用户已经配置过模型（比如没完成过引导的老用户），就可能遇到。
- 建议写明：结束引导后的跳转，要等 `finishOnboarding` 返回之后再执行。改动只是把 `void` 换成 `await`。

### N7-4 "用户还没改过币种"没有可执行的判定

- `updateSettings` 会把整份 settings 写进库（`db/index.ts:202-204`），读取时又用 `DEFAULT_SETTINGS` 补齐。所以库里的 `currency: 'cny'` 分不清是默认值还是用户选的。
- 新用户在引导结束前碰不到设置页，因为 Dialog 是模态的，"去配置"会先结束引导。实际可以直接定为："`onboarding.done` 时 `locale` 为 `en` 且 `currency` 仍是 `'cny'`，就改成 `'usd'`，`fxRate` 置为 `null`"。
- 唯一的误判是：没完成过引导、又特意选了人民币的老用户，再在引导里选英文。这和 N6-4 的边界情况属于同一类，可以接受。建议把判定写成这样，不要写成"没改过"。

## 其他核对

- **依赖图**：新增的 `renderer └► @river/i18n` 与 `@river/i18n ─► @river/engine`（只用类型）方向一致，没有循环依赖。前几轮已通过的内容（包结构、ui 边界、`TableStage`、`useTableFx`、打包、CI、官网）没有受到本次修订的影响。
- **写入守卫**：`onboarding.done` "只在未完成引导时生效"，而渲染进程的 `finishOnboarding` 在 `onboarded` 为真时会直接返回（`lib/river.ts:178`）。所以在重新打开的规则卡片上按 Esc，不会再调用 `onboarding.done`，两处约束一致。
- **预选值的注入**：db 模块不能直接调用 `app.getLocale()`，要通过 `initDb` 参数传入，测试才能注入。这属于实现细节，不阻塞。

## 证据限制

只读了方案和相关代码，没有运行任何代码。electron-updater 的行为依据本地 6.8.9 版本的源码。
