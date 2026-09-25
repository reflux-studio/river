# T7 验证记录

## 自动验证

```
pnpm typecheck                  # engine / ui / i18n / desktop 全部 Done
pnpm -r test                    # engine 36、i18n 4、ui 5、desktop 118（新增 updater.test 8 条），全部通过
cd apps/desktop && pnpm build   # 通过
rg -n '\p{Han}' apps/desktop/src -g '*.ts' -g '*.tsx'   # 过滤 // 注释后只剩 CoachPanel.tsx:200 的 JSX 注释（T6 已有）
```

`apps/desktop/test/updater.test.ts` 用替身 updater（EventEmitter + vi.fn），每个用例 `vi.resetModules()` 重新加载 updater 以清掉 `ready`：

- 没有新版本 / 检查结果为 null → `latest`
- 有新版本 → `downloading`，下载成功时不推送
- 触发 `update-downloaded` 后 → 推送 `update:ready`，`checkNow` 直接返回 `ready`，不再调用 `checkForUpdates`
- 检查抛错 → `{ state: 'error', message: '检查更新失败，请稍后再试' }`，不推送 `update:error`
- 返回 `downloading` 后 `downloadPromise` 失败 → 推送 `update:error`（下载失败，稍后自动重试）
- updater 的 `error` 事件、定时检查失败 → 只写日志，不推送

变异检查：把 `if (ready) return` 改成 `if (false)`、去掉 `emit('update:error')`，对应 2 条用例失败；还原后 8 条全部通过。

i18n 测试「英文字典没有空词条也没有汉字」自动覆盖新增的 `desktop.update` 词条（函数词条两条分支都调用）。

## dev 实机（开发版本）

```
cd apps/desktop && npx electron-vite dev --remoteDebuggingPort 9335
```

用 `evidence/tools/cdp.mjs` 点击导航“设置”，滚动到“版本”行：

- `<html lang>` 为 `zh-CN`（原 River-dev 数据，只读，未开牌局、未调用模型）
- 行内容：`版本 / 开发版本不检查更新 / 0.2.1 / 检查更新`
- 按钮 `disabled: true`，`cursor: not-allowed`，`opacity: 0.5`
- 截图：`zh-settings-version-dev.png`（1440x900）
- 在渲染进程直接 `river.invoke('update.check')`：IPC 已接线，开发版未初始化 updater，返回 `updater not initialized`（界面按钮置灰，不会走到这里）

结束后停掉本次启动的 electron 进程，9335 端口已释放。

## 未做

- 打包版“已是最新 / 断网检查失败”的手动验证：需要打包并连真实发布源，本任务未做，留给整体验证。
- 英文模式下的设置页截图：未切换数据目录，英文词条只经过 i18n 测试与类型检查。
