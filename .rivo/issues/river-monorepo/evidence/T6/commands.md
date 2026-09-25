# T6 验证记录

## 自动验证

```
pnpm typecheck               # engine / i18n / ui / desktop 全部 Done
pnpm test                    # engine 36、i18n 4、ui 5、desktop 110，全部通过
cd apps/desktop && pnpm build   # 通过
```

i18n 测试「英文字典与预设没有空词条也没有汉字」自动覆盖本次新增的全部 desktop 与 common 词条（函数词条两条分支都调用）。

## 汉字检查

```
rg -n '\p{Han}' apps/desktop/src/renderer/src -g '*.ts' -g '*.tsx'
```

共 55 处，逐条确认均为注释：54 处 `//` 行注释，1 处 JSX 注释（`CoachPanel.tsx:200` 的 `{/* 概率面板固定在讲解区外… */}`）。用 `grep -vE '^\S+:[0-9]+:\s*//'` 过滤后只剩这一处 JSX 注释。

```
rg -n '\p{Han}' apps/desktop/src/shared -g '*.ts'
```

只剩注释（`currency.ts` 两行说明、`types.ts` 的字段说明）。`currency.ts` 里原来的中文 `name`、`unit` 已删除，渲染进程改从 `t.common.currency` / `t.common.currencyUnit` 取。整个 `apps/desktop/src` 过滤注释后没有汉字（`main/db/index.ts:102` 是行尾注释）。

## 英文模式实机（新用户）

1. `~/Library/Application Support/River-dev` 改名为 `River-dev.bak-T6`。
2. `cd apps/desktop && npx electron-vite dev --remoteDebuggingPort 9333 -- --lang=en-US -AppleLanguages "(en-US)"`。
3. 用 `evidence/tools/cdp.mjs` 操作：语言页预选 English（en-01）→ Next 到牌型（en-02）→ 流程（en-03）→ 最后一页（en-04）→ Later。`app.bootstrap` 返回 `locale en / currency usd / onboarded true`，对手为 Foxy…Zen，`<html lang>` 为 `en-US`。
4. 依次截图，都是 1440x900：大厅（en-lobby，单挑写着“vs Foxy”，名字取自当前对手数据）、AI 对手（en-ai-opponents）、手牌回放（en-hand-history，新用户为空）、数据统计（en-stats）、设置（en-settings、en-settings-bottom）、添加提供方弹窗（en-provider-dialog，没有保存）、清空记录确认（en-confirm-clear，按 Esc 取消）、币种下拉（en-currency-select，9 个英文名称）、入座被拦下（en-need-model：没有模型，弹出“No opponent model yet”，`view` 仍为 null，没有开桌）。
5. 每个页面和弹窗都对 `document.body.innerText` 以及 `title`/`placeholder`/`aria-label` 跑 `/\p{Script=Han}/u`：全部为空。桌布色块的 title 为 Classic green, Deep blue, Wine, Graphite, Paper, Custom color。新用户英文预设的 name/tag/desc/prompt 没有汉字。
6. 牌型表溢出（T4 F2）：修复前量得第 1、2 行例子右端超出行分隔线 4px、3px，而且“Three of a kind”（113px）本身就超出 98px 的列宽。英文时对话框改为 620 宽，名称列改为最小宽度（英文 104px，中文 74px），放不下时往后推，不再溢出。修复后 10 行右侧余量都至少 10px（en-02）。
7. 牌桌页（包括桌面外观浮层、教练面板、操作栏、公屏）：新用户没有模型开不了桌，按要求也不开牌局、不调用模型，所以**没有实机截图**；这些组件的文案只经过类型检查和逐行对照。桌面外观浮层用的色块和分段控件与设置页相同，设置页已截图。
8. 结束后停掉 dev 进程，删掉测试生成的 River-dev，把 `River-dev.bak-T6` 改回 `River-dev`，确认 `river.db` 等文件都在。

## 中文模式（原数据）

`cd apps/desktop && npx electron-vite dev --remoteDebuggingPort 9333`（不带 lang 参数），`<html lang>` 为 `zh-CN`。

| 截图 | 基线 | 像素比对（阈值 40） |
| --- | --- | --- |
| zh-lobby.png（1440x900） | T1/baseline/lobby.png | 417 个像素不同：右上角筹码 100,890 → 100,840，其余一致 |
| zh-opponents-1280.png（1280x800，与基线尺寸相同） | T1/baseline/opponents.png | 365 个像素不同，只有右上角筹码数 |
| zh-settings-1280.png（1280x800） | T1/baseline/settings.png | 365 个像素不同，只有右上角筹码数 |

`*-diff.png` 是差异掩膜。另外附 1440x900 的 zh-opponents.png、zh-settings.png。手牌回放和数据统计的中文文本也检查过：日期 `9/25 12:34`，街道、摊牌、教练局、汇率“1 美元 = 6.7143 元”都和原来一致；回放里存下的动作标签、复盘文字原样显示。
