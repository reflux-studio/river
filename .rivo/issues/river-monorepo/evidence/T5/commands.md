# T5 验证记录

## 自动验证

```
pnpm typecheck               # engine / i18n / ui / desktop 全部 Done
pnpm test                    # engine 36、i18n 4、ui 5、desktop 110（新增 3），全部通过
cd apps/desktop && pnpm build   # main / preload / renderer 均 built
```

- engine：`handName` → `handCat`，测试中 7 处中文断言改为 key；与 `poker.js` 的差分对照用测试文件内的本地 key→中文表，2000 组通过。
- desktop 已有 107 个用例一字未改，全部通过（中文路径输出不变；只有系统提示词末尾按约定新增“请用中文回复。”）。
- 新增 `apps/desktop/test/english.test.ts`：
  - 真实 `opponentAct/opponentTalk/coachSpeak/coachAsk/coachRecap` + `callModel`，只把 `modelFor` 换成 `scriptModel` 替身（`mock-model.ts` 现可传函数按调用现场出步，并记录 `toolDefs`：name、description、inputSchema）。
  - `setup()` 后 `completeOnboarding('en')`（locale=en、英文预设）；`seeded` 随机数驱动对手（raise/fold/allin/bet/call，随机 say/note）与玩家（fold/call/raise）。
  - 自由局 4 人 20 手、教练局 3 人 20 手（含随机提问）；收集全部模型调用的 system、messages、工具定义，每次推送的 `TableView`，全部公屏消息，教练条目，以及落库的手牌记录，断言都不匹配 `/\p{Script=Han}/u`。同时断言确实出现过 act 工具定义、talk、recap、重新买入。
  - 反向自检：去掉 `completeOnboarding('en')`（即中文）时 3 个用例全部失败，说明断言有效。
  - newChat 英文用例：对手全下制造重新买入，断言对手收到的观察中有 `System: Hand N · Preflop` 与 `System: … rebought …`。

## 静态检查

```
rg -n '\p{Han}' apps/desktop/src/main -g '*.ts'
```

逐条确认：所有命中都是 `//` 注释（含 `db/index.ts:102` 行尾注释）。ipc 错误、提供方类型名、updater、启动失败弹窗、saveProvider 错误、测试连接的 ping 工具与错误都已改为字典取值。

## 未做

- 未开牌局、未调用真实模型；未运行 `pnpm dev`（只跑了 `pnpm build`）。
