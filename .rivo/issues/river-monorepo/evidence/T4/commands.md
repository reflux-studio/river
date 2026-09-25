# T4 验证记录

## 自动验证

```
pnpm install                 # 新增 packages/i18n，desktop devDependencies 加 @river/i18n
pnpm typecheck               # engine / i18n / ui / desktop 全部 Done
pnpm test                    # engine 36、i18n 4、ui 5、desktop 107，全部通过
```

新增测试：
- `packages/i18n/test/i18n.test.ts`：resolveLocale；中文预设 JSON 的 sha256 与迁移前 `apps/desktop/src/shared/personas.ts` 的 `PERSONAS`（a31d4f5，用 `git show` 取出计算）一致；两种语言 id、顺序、hue 一致；英文字典与预设无空词条、无汉字。
- `apps/desktop/test/db.test.ts` 的「语言」：新库按 systemLocale 预选（缺省 zh）、库里 settings 没有 locale 时仍按系统语言、老库（已完成引导）为 zh；completeOnboarding('en') 把 cny 改 usd、fxRate 置空并换英文预设、重启后保持、重复调用无效；非 cny 不改、选中文不改币种；ipc `settings.update({locale})` 抛 `locale is fixed after onboarding`（完成前后都抛）、`onboarding.done('fr')` 被拒；英文下保存与种子相同的字段存为 NULL/空串，恢复默认回到英文预设。
- 已有断言只在三处设置字面量里补了 `locale: 'zh'`。

## 手动验证（不开牌局、不调用模型）

真实的 `~/Library/Application Support/River-dev` 先改名为 `River-dev.bak-T4`；每条路径前删除新建的 River-dev（只删测试生成的那个），结束后已改回原名并确认目录内容在。

启动：`cd apps/desktop && npx electron-vite dev --remoteDebuggingPort 9333`，用 `evidence/tools/cdp.mjs` 点击按钮、读取 `app.bootstrap`。

| 路径 | 操作 | 结果 |
| --- | --- | --- |
| 中文系统预选 | 首次启动 | 语言页「规则入门 · 1 / 7」，预选中文（01） |
| 切换即生效 | 选 English 后翻页 | 后续卡片立即英文，牌型/流程/行动均英文（02、03） |
| 跳过 | English → Next → Skip | locale en、currency usd、fxRate null、onboarded；大厅对手 chip 与对手页立即为 Foxy…Zen，无需重启（04、05） |
| 从设置页重开规则 | 设置 → 规则介绍「打开」 | 「Rules · 1 / 6」，无语言页；Esc 关闭后 locale 仍 en（06）；渲染进程调用 `settings.update({locale:'zh'})` 返回 `locale is fixed after onboarding` |
| 稍后再说 | English → 翻到最后一页 → Later | en / usd / 英文预设（07 为最后一页） |
| 去配置 | English → 最后一页 → Set up | en / usd / 英文预设，停在设置页（08） |
| Esc | English → Next → Esc | en / usd / 英文预设 |
| 点遮罩 | 语言页选 English → 在 overlay 上派发 pointerdown | en / usd / 英文预设 |
| 带我打一手 | English → 最后一页 → Play a hand with me | 先写入 en 与英文预设，未配置模型所以弹出「对手模型还没有配置」，未开桌（view 为 null） |
| 中文默认 | 不改语言直接「跳过」 | zh / cny / 中文预设 |
| 英文系统 | `npx electron-vite dev --remoteDebuggingPort 9333 -- --lang=en-US -AppleLanguages "(en-US)"` | `app.getLocale()` 为 en-US，语言页预选 English、卡片英文；直接 Skip 得 en / usd / 英文预设（09） |

说明：大厅中「对阵阿狸」等其余界面文案仍是中文，属 T6 范围。
