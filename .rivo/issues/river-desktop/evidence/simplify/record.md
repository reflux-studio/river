# 简化轮 simplify-1 验证记录

依据：reviews/simplify-1.md。基线 1e5fa45（111 测试通过）。日期 2026-09-24。

## 结果

| 检查 | 结果 | 文件 |
|------|------|------|
| `pnpm typecheck` | 通过 | typecheck.txt |
| `pnpm test` | 10 个文件，111 条用例通过 | test.txt |
| `pnpm build` | 通过 | build.txt |
| 改动量 | 38 个文件，+281 / −714 | diffstat.txt |
| UI 冒烟（pnpm dev，userData River-dev，本地引擎） | 全部步骤完成，renderer 无 error/warning/异常 | smoke.json、simplify-smoke.mjs、01–06 截图 |

## 冒烟步骤

脚本通过 `--remoteDebuggingPort` 连 CDP，按按钮文字点击，1440×900。

1. 设置页选“本地引擎”。
2. 大厅选“新手桌”，入座（3 人 10/20）。截图 01-table。
3. 第 1 手第一次轮到玩家时执行 `location.reload()`。重载后顶栏仍有“牌桌”入口，大厅出现“回到牌桌”，点回后牌桌、公屏、操作区都恢复，且可以继续操作。截图 02-after-reload。这一步验证 #4（bootstrap 直接返回 view）。
4. 打完第 1、2 手（轮到就跟注或过牌，一手结束点“下一手”）。截图 03-hand-done。
5. 离桌后回到大厅，顶栏“牌桌”入口消失。
6. 手牌回放列表出现刚打的 #1、#2。截图 04-replays。
7. 数据统计：14 手，VPIP 50%，PFR 7%，数据来自 `hands.list` 的 vpip/pfr 字段（#7）。截图 05-stats。
8. 设置页的“本桌托管次数”显示“未入座”。截图 06-settings。
9. 把引擎还原为 llm。

主进程日志只有 `sandbox_extension_issue_file failed ... (Operation not permitted)`。这条来自本次运行所在的命令沙箱，与应用代码无关。

## 测试改写说明（仍能区分对错）

- #2：“未配置教练”用例原来断言“命令返回后才推 coach:done”，这个约定已经删除。改为断言：不暂停，coachThread 不写入，并用 renderer 传入的 requestId 推送 not_configured。熔断用例同样改为同步断言。
- #3/#4：熔断与提醒的断言从 `breaker`、`coach:alert` 事件改为读推送的视图（`h.views`）。“教练晚到”用例检查所有视图里都没有 pause 提醒。IPC 用例的 bootstrap 现在包含 view，原有的“JSON 不含对手底牌”断言也覆盖到了 view。
- 新增：`provider.delete` 返回的设置里已清空引用该提供方的教练模型；先把设置改成 pro、关闭教练，再用 `table.start` 开教学桌，返回值应为 novice、coachOn=true。
- #17：座位视图的标签改为断言对手座位拿到 persona 的 tag、玩家为空。信息隔离断言（各座位看不到他人底牌）保持不变。
