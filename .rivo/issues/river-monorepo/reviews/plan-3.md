# 审阅：plan-3（设置页切换语言、对手预设在引导时快照）

- 被审版本：提交 `8ae6239` 对 `plan.md`、`discussion.md`、`task.md` 的修改（分支 `feat/monorepo-site-i18n`）
- 审阅日期：2026-09-26
- 结论：**需修改**。主体方案正确：用户的两句话已经落实，和现有代码也相容。但有 1 个阻塞问题（引导页文案仍写着“选定后不能再更改”，T10 没有列入修改位置），另有几处旧规则残留，AI 自行补定的规则也没有标明来源。

## 对用户原话的落实

| 用户要求 | 方案 | 判断 |
| --- | --- | --- |
| 设置页可以切换语言，只是不重新走引导 | 设置页新增“语言”一行；删掉 ipc 守卫，改为只校验 zh/en；规则介绍里不出现语言页 | 已落实 |
| 名字和提示词只在引导页写入一次，之后怎么切换都不变 | 新增 kv `presetLocale`，只由 `completeOnboarding` 写入；种子值取自 `presets[presetLocale]` | 已落实 |
| “恢复默认” | `resetPersona` 只把字段清空，恢复时读种子值，而种子值来自 `presetLocale` | 已落实 |
| 老用户 | 没有 `presetLocale` 且已完成引导的，按 `zh` 处理，和现有种子一致 | 已落实 |
| 新建对手的模板 | 按当前 `locale` 显示，保存后成为用户数据 | 说得通，但属于 AI 的补充，见 N1 |
| 系统提示词属于固定内容，随语言切换；不按牌局锁定 | 从下一次模型调用起用新语言，不锁桌 | 已落实，代码也支持（见下文“代码相容性”） |

## 发现

### 阻塞

**B1. 引导页的语言页文案和新规则矛盾，T10 没有列入修改**
- 证据：`packages/i18n/src/dict.ts:25` 写的是“界面、对手和教练都会使用这种语言。选定后不能再更改。”；`:452` 写的是 “The interface, opponents and coach will all use this language. It can’t be changed later.”。这段文字由 `Onboarding.tsx:47` 显示。
- 后果：T10 按现在的修改清单做完后，新用户在第一屏就会看到错误的承诺。“对手和教练都会使用这种语言”这句也没有说明：对手只在这时写入一次，界面语言之后可以改。
- 建议：在 T10 的修改位置里加上这两条字典项，改成大意为“之后可以在设置页切换界面语言；对手的名字和性格会按这里选的语言生成，之后不再改变”的文案，并在 dev 实机验证里截图语言页。

### 非阻塞

**N1. AI 自行补定的规则没有标明来源**（检查项 1）
以下几条都不是用户原话，plan、discussion 和 T10 里都没有写“AI 建议”，建议在 discussion 的“用户决定”表里补标，需要时请用户确认：
- 切换语言时不改币种（plan “默认币种：只在引导时生效”）。原来的“默认币种”一行标的是“AI 建议，用户采纳”，但当时还没有设置页切换，“切换语言时不改币种”是这次新补的。
- `presetLocale` 缺失时的取值：已完成引导的取 `zh`，未完成引导的跟随 `settings.locale`。
- 新建对手的初始模板（`dict.desktop.opponents.fresh`）按当前 `locale` 显示。用户说的是“名字/提示词只在引导时写一次”，这个模板应该跟随当前语言还是跟随 `presetLocale`，存在两种解读，应该把两种都摆出来。
- 教练的名字和风格（`p.coaches[st.coachPersona]`，见 `agents/coach.ts:16-17`）属于固定内容，会随语言切换。这和“只有对手预设是快照”一致，但 plan 没有写明“教练名随切换变化”，用户可能以为教练也是快照。

**N2. 旧规则的残留**（检查项 3）
- `task.md:25`，全局约束“i18n 原则”仍写着“语言只在引导页选择一次，之后不能再改；老用户固定为 `zh`”。这是对之后所有任务都生效的约束，必须改。
- `discussion.md` 的方案正文没有跟着改：
  - `:152`，对手预设写的是“选定前固定，选定后动态”；
  - `:165`，写入守卫仍是“`settings.update` 拒绝修改 `locale`”；
  - `:168`，“因为语言不会在运行中变化，牌局锁定……都不做”，理由已经不成立。现在不锁桌的依据是用户原则，结论不变；
  - `:190-192`，“种子值为 `presets[settings.locale]`”“语言选定后不会再变”；
  - `:265`，验证项仍是“引导完成后调用 `settings.update({ locale })` 会被拒绝”。
  - 建议直接改掉，或者在这几段前注明“已被 2026-09-26 纠正取代，以 plan 为准”。
- `task.md:276、285`（T4 契约和代码注释）属于已完成任务的记录，可以保留，但最好加一行“已被 T10 取代”。
- 代码注释（T10 会改到这些文件，建议写进修改清单，免得漏掉）：
  - `renderer/src/lib/river.ts:90`：“语言在运行期间不变（只在引导页选一次）”；
  - `main/db/index.ts:152`：“老用户（已完成引导）固定中文”；
  - `main/db/index.ts:230`：“语言只在这里写入；settings.update 的守卫在 ipc.ts”。

**N3. T10 的修改描述和现有代码对不上**（检查项 2）
- `loadPersonas`、`savePersona`、`deletePersona` 并没有直接写 `presets[settingsCache.locale]`，而是都经过 `db/index.ts:258` 的 `seeds()`。只需要把 `seeds()` 改成 `presets[presetLocale()]` 这一处。按现在的写法实施，可能会去逐处替换。
- `loadCaches` 必须在 `loadPersonas()`（`:158`）之前读取 `presetLocale`；kv 里没有这一项时，要把缓存显式置空。测试里会 `closeDb` 再 `initDb`，并删除 kv，旧缓存不能留下来。
- ipc 的校验建议沿用 `completeOnboarding` 的 `Object.hasOwn(presets, locale)`。现有测试（`db.test.ts:197`）已经覆盖了 `'constructor'` 这种原型链上的键，T10 的验证只写了 `'fr'`，建议两种都测。

**N4. 未完成引导时切换语言，对手缓存不会刷新**（边界情况）
- 场景：`finishOnboarding` 先把渲染进程的 `onboarded` 设为 true（`river.ts:188`）。如果 IPC 失败，主进程仍是未完成引导的状态，用户可以进入设置页切换语言。
- 这时 `presetLocale()` 回退为 `settingsCache.locale`，种子语言已经变了，但 `settings.update` 不会重建 `personasCache`，直到重启。
- 影响很小，建议在 plan 里写一句接受这个结果，或者让回退值不依赖 `settings.locale` 的后续变化。

**N5. T4–T7 开发库**
- 用 T4–T7 的构建完成过英文引导的开发库，没有 `presetLocale`，会按老用户回退为中文，对手从 Foxy 变回阿狸。
- 这些版本没有发布过，只影响开发者的本地库。T10 的实机验证先备份 River-dev 目录，可以规避。建议在“检查限制”或结果里注明，免得被误判为缺陷。

## 代码相容性核对（检查项 2）

- **提示词在下一次调用时生效**：成立。
  - `opponent.ts` 的 `system()` 每次调用都通过 `tr()` 读取 `settingsCache.locale`；
  - `coach.ts:15-17` 每次调用都读取 `settingsCache`；
  - `thread.ts:23、57`，`text.ts`、`runner.ts`、`view.ts` 都在用到时才取 `dict(settingsCache.locale)`，没有按桌缓存。
  - 因此“不锁桌”不需要改 runner。
- **主进程展示文字**：`ipc.ts` 的 `settings.update` 已经会调用 `runner.broadcast()`，切换后牌桌视图立即按新语言重推，比 plan 写的“下一次推送起”更快，两者不矛盾。
- **渲染进程**：
  - `updateSettings`（`river.ts:137`）先乐观更新，再用返回值覆盖，`useT` 和 `useLangTag` 随之切换，`App.tsx:21` 也会更新 `<html lang>`；
  - 对手不受语言影响，不需要刷新 personas；
  - `t.common.localeNames` 已经存在（`dict.ts:5、9、434`），`Segmented` 已经在 `Settings.tsx` 里使用，可以直接复用。
- **测试**：只有 `db.test.ts:193-201`（ipc 拒绝改语言）需要改成新的行为，T10 已经列出。其余 locale 用例（`:148-190`，以及 `:205` 起的英文种子用例）和新规则相容。
- **知识库**：`.rivo/knowledge/README.md:39` 已列入 T10。`:40` 的“对手预设种子”和 `:41` 的“选定后的对手预设”仍然成立，建议把 `:41` 改成“引导时的快照”。
- **官网**：`apps/site/src` 里没有语言固定的相关文案，没有影响。

## T10 能否执行、验证能否分辨对错（检查项 4）

可以执行。以下验证能分辨出错误实现：
- 新用户选 English 后切到 zh，对手仍是 Foxy，恢复默认后也是 Foxy，币种不变。如果种子值仍跟着 `settings.locale`，这项会失败。
- 老库切到 en 后，对手仍是中文。
- `'fr'` 被拒绝。

补充建议：
1. runner 的提示词断言：现有代码本来就按每次调用取语言，这个用例在 T10 之前就会通过，只能起回归保护作用。建议让切换经过 `commandHandlers['settings.update']`，而不是直接调 `db.updateSettings`，这样还能同时验证守卫已经删除。
2. 加一条 `deletePersona` 或 `savePersona` 在切换语言之后的用例：比如切到 zh 后保存一个和英文种子相同的字段，库里应该存为空。这样才能覆盖 `seeds()` 的所有使用方。
3. 实机验证加上引导页语言页的文案截图（对应 B1）。

## 检查限制

- 只做了静态阅读和 grep，没有运行测试，也没有启动 app。
- 没有逐行核对 plan 中与本次改动无关的章节。
- 对 N1 中“新建对手模板应该跟随哪种语言”，没有替用户下结论。
