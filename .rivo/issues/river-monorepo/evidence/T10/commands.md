# T10 验证记录

## 自动化

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck`（根目录） | 通过 |
| `pnpm test`（根目录） | 全部通过；desktop 124 个用例 |
| `pnpm build`（apps/desktop） | 通过 |
| `rg -n '\p{Han}' apps/desktop/src -g '*.ts' -g '*.tsx'` | 只命中注释 |

TDD：新用例先在旧代码上失败（5 个：ipc 仍抛 `locale is fixed after onboarding`；切换后种子跟着 `settings.locale` 变），实现后通过。

## dev 实机

1. `~/Library/Application Support/River-dev` 重命名为 `River-dev.bak-T10`，结束后删除测试库并改回原名。
2. `cd apps/desktop && npx electron-vite dev --remoteDebuggingPort 9333`，用 `cdp.mjs`（CDP 执行脚本、截图）按 `flow.sh` 操作。不开牌局，不调用模型。

| 截图 | 检查点 | 结果 |
| --- | --- | --- |
| `1-onboarding-lang-zh.png` | 新用户第一页是语言页，说明为新文案（B1） | 通过 |
| `2-onboarding-lang-en-preview.png` | 语言页点 English，英文说明同样是新文案 | 通过 |
| `3-settings-zh.png` | 选中文、点“跳过”完成引导；设置页“语言与外观”组第一行为语言 | 通过；bootstrap：locale zh、币种 cny、li=阿狸 |
| `4-settings-en.png` | 设置页点 English，界面立即变英文 | 通过；币种仍为人民币 |
| `5-opponents-en-ui-zh-presets.png` | 对手页：界面英文，对手仍是中文预设（阿狸、老K…） | 通过 |
| `6-rules-from-settings-no-lang-page.png` | 设置页打开规则介绍：1/6，没有语言页，内容为英文 | 通过 |

## 实机发现并修复的问题

第一次实机时，切到 English 后从设置页打开的规则介绍仍是中文。原因：`Onboarding` 组件常驻挂载，语言页的本地选择 `picked` 在引导结束后没有清掉，一直覆盖 `settings.locale`。T10 之前语言不能再改，所以看不出来。修复：`finishOnboarding` 完成后清空 `picked`。修复后在全新的库上重跑整个流程（本表截图都来自重跑）。
