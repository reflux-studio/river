# 整体验证：不花模型费用的部分（终审 F3）

日期：2026-09-26　代码：e040a25（未改源码，只打包验证）

## 老库兼容（v0.2.1 用户数据副本）

- 复制 `~/Library/Application Support/River/river.db` 到 scratchpad 的临时目录，启动打包版时加 `--user-data-dir=<临时目录>`。
- 用 `lsof` 确认进程打开的是临时目录里的副本，原库没有被碰。
- `app.bootstrap` 的结果：
  - version 0.2.1、packaged true、onboarded true、locale zh、currency cny；
  - 内置对手 阿狸、老K、小白 等，edited 均为 false；
  - 7 手回放。
- 界面：不出现引导页，`<html lang="zh-CN">`，大厅是中文。
- `hands.get` 能读出回放记录。

## 打包版手动检查更新（T7 审阅 F2）

| 构建方式 | 场景 | 结果 |
| --- | --- | --- |
| `electron-builder --mac --dir` | 联网 | `error`，界面弹出“检查更新失败，请稍后再试”。原因：`--dir` 构建不会生成 `Resources/app-update.yml`（日志 ENOENT）。这是构建方式造成的，正式发布用的 dmg/zip 目标会生成这个文件。 |
| `electron-builder --mac`（dmg+zip） | 联网 | `{ state: 'latest' }`（当前 0.2.1，等于线上最新版） |
| 同上 | 加 `--proxy-server=127.0.0.1:9` 模拟断网 | `{ state: 'error', message: '检查更新失败，请稍后再试' }` |

截图：`packaged-update-latest.png`。这张截的是 `--dir` 构建时的设置页，toast 用 MutationObserver 记录下来了。
