# T7 第 2 轮（审阅 T7-1 后的小改）

- F1：`TableView.bb`（shared/types.ts）+ `bb: g.bb`（main/table/view.ts）；ActionBar 读 `v.bb`，删除标题解析。
- O1：`Segmented` 新增 `full`（槽 w-full、项 flex-1）；教练栏讲解深度改用它（r2-table-1440.png）。
- O4：Replays 的 BoardCard 删除，改用 `<PlayingCard w={50} h={70} />`；列表日期时间保留（r2-replays-1440.png）。
- 托管：座位去掉名字旁“托管”标签，只留状态文字“托管 · {行动}”；公屏标签保留（AutopilotTag 移入 ChatPanel）。
- 顺带修复：加注 −/+ 改为函数式更新，同一渲染内连续点击不再丢步（r2-raise-step.txt：300 →+2→ 500 →−3→ 200，夹在 minTo=200）。
- pnpm typecheck / build / test：见 r2-typecheck.txt、r2-build.txt、r2-test.txt（10 文件 111 用例通过）。
- dev 冒烟后已离桌，设置恢复（engine llm、speed 1、autoNext on）。
