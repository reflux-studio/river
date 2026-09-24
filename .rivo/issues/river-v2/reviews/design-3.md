# 设计审阅 3：River v2 方案（第 4 轮）

## 审阅对象

| 项 | 版本 / 位置 |
| --- | --- |
| 方案 | `discussion.md`（第 4 轮快照，202 行；§1 的 U1–U4、A1–A10 是用户决定，以此为准） |
| ADR | `adr/004-no-mastra-storage.md`（33 行）、`adr/005-self-signed-auto-update.md`（32 行） |
| 调查笔记 | `note.md`（80 行） |
| 前两轮审阅 | `reviews/design-1.md`、`reviews/design-2.md`（修改清单第 200–210 行） |
| 设计稿 | `design-source/River v2.dc.html`（1338 行） |
| 代码基线 | `5d874b2`（代码同 `1369867`）：`src/main/engine/poker.ts`、`table/runner.ts`、`agents/{mastra,opponent,coach,tools}.ts`、`db/index.ts`、`models/resolve.ts`、`shared/types.ts`；`.github/workflows/build.yml`、`electron-builder.yml`、`package.json` |
| 依赖核对 | `@mastra/core` 1.69.0 dist；`app-builder-lib` 26.15.3（`codeSign/macCodeSign.js`、`mac/MacTargetHelper.js`、`codeSign/windowsSignToolManager.js`、`platformPackager.js`、`publish/PublishManager.js`）；`@electron/osx-sign` 1.3.3。`electron-updater` 未安装 |
| 本审阅的临时脚本 | `/tmp/rv3/m.mjs`（Mastra：独立 Agent 的重试、`toolChoice: 'required'` + `maxSteps: 1`、消息数组、流式中途错误、中止时的用量）、`/tmp/rv3/eng.ts`（现有引擎的不完整加注） |

## 结论：需修改（改动量小）

方向与主体契约都成立。用户决定 U1–U4、A1–A9 都已落地，A10 授权内的 AI 决定都做了标注。审阅 2 的 9 条修改清单逐条核对后都已处理（见“审阅 2 修改清单逐条核验”），剩下的只是几处不影响实现的小遗漏。引擎 API、Mastra 用法、用量契约这三块，这一轮已经能直接交给 plan。

需要修改的是一处 **中高** 问题和两处 **中** 问题，各补一两句话就能解决：

1. **（F1，中高）ADR-005 在 electron-builder 流水线里有三个会“静默成功”的陷阱。** 按 §7 的字面做法实现，结果可能是：macOS 仍然 ad-hoc 签名，或者干脆不签名，构建只打一条警告；自签身份被 electron-builder 过滤掉以后，执行者会误以为“签名工具拒绝自签身份”，按 ADR 退回选项 B；Windows 安装包被同一张自签证书签上，electron-updater 在 Windows 上会因为签名不受信任拒绝安装更新。而“检查或下载失败静默”，这一点没人会发现。
2. **（F2，中）“同一时刻最多一个教练调用”在三条路径上没有规定该怎么做：** 提问跨越对手回合，一手在提问中结束，复盘「重试」进行中玩家点「下一手」。设计稿的“暂停并提问”被 §9 改成了“提问”，原来的“提问时牌局暂停”就没了着落。不会死锁，但执行者要在“等待 / 跳过 / 中止”之间自己选。
3. **（F3，中）`act` 参数没通过 schema 校验时，`maxSteps: 1` 下模型没有机会自己纠正，只能停下。** 规范化只处理校验通过之后的动作。模型写成 `action: 'bet'` 这种很常见的错误，也会让牌桌停下。

教练局的状态机逐条推演过，没有发现死锁，也没有无法恢复的状态（见下方路径图）。

```
主要场景检查路径（【】为本审阅发现编号，✓ 为已闭合）
自由局一手      : 轮到对手 ─► act（maxRetries 2 ✓ 实测 3 次调用）─► schema 不合法【F3】/ 合法 ─► 规范化 ✓ ─► actionTaken
                 ─► endBettingRound 逐街 ✓（语义需一句话澄清，低）─► showdown / 弃牌结束 ✓ ─► 落库 ─► 对手 setStack 重新买入 ✓
教练局轮到玩家  : 锁定 ─► 教练发言（流式、无工具、maxSteps 1 ✓；20s、maxRetries 1 ✓）─► 说完 / 失败 / 不等了 ─► 解锁 ✓
提问            : 教练空闲时可发 ✓ ─► 回答中锁操作区 ✓ ─► 对手继续行动 ─► 轮到玩家时教练忙【F2】；一手结束时教练忙【F2】
一手结束        : 落库 ─► 亮全部底牌 ✓ ─► recap（required + maxSteps 1 ✓ 实测工具在该步执行）─► 结束 / 失败 / 跳过 ─► 下一手 / 重新买入 ✓
                 复盘失败 + 玩家破产：失败即可重新买入 ✓；点「重试」后又点「下一手」【F2】
对手失败        : stalled ─► 重试 / 去设置 / 离桌（abortHand ✓，作废手用量入总量不入柱状图 ✓）
离桌            : 对手、教练在途调用中止 ✓；已落库未复盘的手可在回放页复盘 ✓；作废手不落库，也就不会出现在回放 ✓
自动更新        : publish 配置 + --publish never 仍生成 latest*.yml ✓ ─► macOS 自签签名【F1】─► Windows 签名校验【F1】
用量            : (table_id, hand_no) ✓；原始 token + 显示时计价 ✓；部分无价 ✓；清空记录不清用量 ✓
```

## 发现（按严重程度）

### F1【中高】自签证书接入 electron-builder 有三个静默失败的陷阱，退路的触发条件也会误判

依据：
- **macOS 仍按 ad-hoc 签名。** `electron-builder.yml` 第 21 行现在是 `identity: '-'`。`MacTargetHelper.findSigningIdentity`（`app-builder-lib/out/mac/MacTargetHelper.js` 第 20–51 行）的逻辑是：按这个 qualifier 找不到身份、而 qualifier 是 `"-"` 时，直接构造 ad-hoc 身份（第 37–44 行）。只加 `CSC_LINK` 而不删掉 `identity: '-'`，产物仍然是 ad-hoc 签名，构建不报错。
- **未受信任的自签身份会被过滤掉，构建只打一条警告。** 查找身份用的是 `security find-identity -v` 和 `find-identity -v -p codesigning`（`codeSign/macCodeSign.js` 第 183–215 行）。`-v` 只列“有效”身份，`@electron/osx-sign` 的 `util-identities.js` 第 13–14 行注释写明，它会排除 `CSSMERR_TP_NOT_TRUSTED`。自签证书只导入到 electron-builder 临时建的钥匙串里（`createKeychain`/`importCerts`，第 118–175 行只做 `security import` 和 `set-key-partition-list`，没有设置信任），通常就会被判为不受信任。找不到身份时，`reportError`（第 46–79 行）只有在 `isMas || forceCodeSigning` 时才抛错，否则只打印一条警告“skipped macOS application code signing”。于是产物完全没有签名。按 `electron-builder.yml` 第 19–20 行的注释，下载后的未签名应用会被 macOS 直接判定为“已损坏”。
- **Windows 也会被签上这张自签证书，electron-updater 随后拒绝更新。** Windows 签名读的是 `getCscLink("WIN_CSC_LINK")`（`codeSign/windowsSignToolManager.js` 第 75 行），`platformPackager.js` 第 81–85 行在 `WIN_CSC_LINK` 没设置时会退回读 `CSC_LINK`。`build.yml` 第 38 行的 `pnpm dist` 在三个平台的 matrix 上都会运行。如果把 Secret 作为这一步的环境变量注入（最自然的写法），NSIS 安装包就会被自签证书签名；`publish/PublishManager.js` 第 202–204 行还会把证书的 CN 写进 `app-update.yml` 的 `publisherName`。按 electron-updater 公开源码的逻辑，NSIS 更新会用 `Get-AuthenticodeSignature` 校验，要求状态为 Valid 且发布者匹配。自签证书在用户机器上不受信任，所以校验失败、更新被拒。（本仓库没有安装 electron-updater，这一条依据的是其公开实现，未实测。）§7 第 127 行又规定“检查或下载失败静默”，所以这个问题会一直潜伏。
- **退路的触发条件会误判。** ADR-005 第 54 行写的是“签名工具拒绝未受信任的自签身份……退回 B”。按上面第二点，“electron-builder 找不到身份”几乎是预期会发生的。但这可以在 CI 里解决：把证书设为受信任（例如 `security authorizationdb write com.apple.trust-settings.admin allow` 之后 `sudo security add-trusted-cert -d -r trustRoot -p codeSign …`），或者用 `mac.sign` 自定义钩子直接调用 `codesign -s <SHA-1>`。它不等于“自签方案不可行”。照现在的写法，执行者很可能在方案 A 本来可行的情况下退到 B，而 B 正是 ADR 自己说“边界多”的自写替换方案，也更偏离 A9。
- 另外，`@electron/osx-sign` 默认会加 `--timestamp`（`sign.js` 第 229–233 行），要连 Apple 的时间戳服务。自签证书能不能拿到时间戳，我没有核实；如果不行，可以设 `mac.timestamp`（`scheme.json` 第 3233 行）。

影响：A9 的核心诉求是自动更新。macOS 上可能产出未签名或 ad-hoc 签名的发布版，把更新链断掉；Windows 上所有自动更新都会静默失败；首个验证任务还可能因为误判退回选项 B。

建议（§7 和 ADR-005 各补几句）：
1. `electron-builder.yml` 删掉 `mac.identity: '-'`，加上顶层 `forceCodeSigning: true`：找不到身份时构建直接失败，不会静默降级。只对 macOS 生效这一点，可以在 Linux/Windows 的构建里核实；如果会影响它们，就改成只在 macOS 那一步通过命令行传入。
2. Secret 只注入 macOS 那一步（`if: runner.os == 'macOS'`，或者按 matrix 条件设置 env），或者显式设 `WIN_CSC_LINK: ''`（`getCscLink` 允许空字符串，第 82 行注释）。写明 Windows 与 Linux 不签名。
3. CI 里先把证书设为受信任，再构建；构建后加一步断言：`codesign -dvv` 的 Authority 是这张证书，`codesign --verify -R '<旧版 DR>'` 通过。
4. ADR-005 的退路条件改成：“CI 里把证书设为受信任、或用自定义 sign 钩子之后，`codesign --verify -R` 仍不满足，或 Squirrel.Mac 实测拒绝”，才退回 B。并写明 B 只用于 macOS，Windows 和 Linux 仍然用 electron-updater。

### F2【中】教练调用互斥：提问与教练发言、复盘、下一手的先后没有规定

依据：
- 设计稿第 189、193 行：“你也可以随时提问，提问时牌局会暂停”，按钮是“暂停并提问”；设计稿第 725 行和现有 `runner.ts` 第 424 行，都是在提问时设 `paused`，让对手停下。§9 第 154 行把按钮改成“提问（教练空闲时可用）”，并删掉了暂停遮罩；§3 第 56 行只写了“回答期间操作区同样锁定”。所以提问时牌局是否暂停，方案里没有写。
- 牌局不暂停时，有三条路径会与 §3 第 54 行“同一时刻最多一个教练调用”冲突：
  1. 对手行动时提问 → 回答还没结束就轮到玩家。此时教练发言（A8“每步说话”）应该排队等、跳过，还是中止问答？
  2. 回答进行中，一手结束（例如玩家已弃牌）→ 复盘应该排队，还是中止问答？
  3. 复盘失败后点卡片上的「重试」，这时「下一手」/「重新买入」是否重新锁上？§3 第 57 行只写了“失败……后可点”。如果不锁，新一手里轮到玩家时，复盘和教练发言会同时进行。复盘「重试」+ 玩家破产，也走这条路径。
- 这几条路径都不会死锁（不论选哪种做法都能走通），但不同做法对用户的体验差别明显。其中“跳过教练发言”会违反 A8。

建议：在 §3 加一条规则。推荐最简单的做法：**提问期间牌局暂停**（对手不行动，也不能发下一手；这与现有代码和设计稿一致，只是不再显示遮罩），按钮文案保持“提问”；复盘「重试」进行中重新进入“教练复盘中… · 跳过”状态，「下一手」/「重新买入」随之再次锁上。这样三条路径都不会出现第二个教练调用。另外，“同一时刻最多一个”的范围是本桌；回放页发起的复盘不受这条限制（现有代码是独立队列，且离桌不中止）。

### F3【中】`act` 参数校验失败时牌桌停下，规范化覆盖不到

依据：`/tmp/rv3/m.mjs` 的 B3 段做了实测。工具参数不符合 `inputSchema` 时，Mastra 不执行工具，只返回一个 `Tool input validation failed…` 的工具结果。`maxSteps: 1` 下模型没有下一步可以纠正。按 §2 第 36 行，这就是“模型没调用 act → 停下”。现有实现是 `maxSteps: 6`，模型还能自己改；v2 改成单步以后，这条路没了。§2 第 30 行的规范化（`fold`/`check`/`raise` 互相改写、`to` 夹紧），只作用于校验已经通过的参数。

影响：模型写出 `action: 'bet'`、`'allin'`、`'all-in'`，或者把 `to` 写成字符串，这些都是常见错误，每一次都会把牌桌停下。U2 的“出错自动重试”也管不到这里：这不是请求错误，不会触发重试。

建议：§2 写明 `act` 的 schema 要宽松（`action` 接受任意字符串，`to` 用 `z.coerce.number()`，或者在 schema 上做 preprocess），由规范化把 `bet`→`raise`、`allin`/`all-in`/`shove`→`raise` 到最大值；无法识别的动作按“需跟注为 0 时 check，否则 fold”处理，或者视为没调用 `act` 而停下，二选一写死。压测和单测要覆盖“schema 边缘输入”。

## 低优先级建议（不影响结论，可在 plan 阶段细化）

1. **§4.1 `endBettingRound` 在全下后的语义。** poker-ts 原版在“最多一人还能行动”时，会在 `endBettingRound` 里一次把剩下的公共牌发完。§4.1 第 81 行“按规则推进”加上第 93 行“逐街发完，挂在这里”，意思是“每次调用只发一街”，建议明写，避免照搬 poker-ts。
2. **`winners().amount` 的口径。** 是“从底池收回的筹码（含自己被跟注的部分）”还是净赢，没写；同一座位赢多个边池时会出现多条，显示“赢得 x”要先合并。
3. **`raise` 的 `to` 不大于当前下注额时怎么处理。** 现有 `apply`（`poker.ts` 第 200 行）按跟注处理；§2 的“越界夹紧”会把它变成最小加注。行为有变化，建议二选一写明。
4. **单挑时的盲注顺序（按钮位下小盲、翻牌前先行动）。** §4.2 的测试列表里有，§4.1 的 `startHand` 注释没写。
5. **recap 的边角：** `toolChoice: 'required'` 在提供方不支持时退回 `auto` 吗？模型只回文字时（实测 B2：`finishReason: 'stop'`，没有错误）按失败处理并显示「重试」；同一步多次调用 recap 只取第一次（实测 B：两次调用都会执行）。
6. **问答的时限和 `maxRetries` 没写**（现有时限 30 秒）。另外写明问答不开工具。§2 删除了 `view_hero`、`estimate_equity`、`recent_hands`，这只是隐含了这一点。
7. **中止时的用量。** 实测 E：中止后 `totalUsage` 是 `{"totalTokens":0}`，不是空值。要满足 §6“中止记次数、token 为空”，得按中止状态判断，而不是看用量对象是否存在。
8. **§8 表名。** 设置不在 `river_settings` 表里，而是 `river_kv` 里 `settings` 这个键（`db/index.ts` 第 124、177 行）。大厅的“对局类型”要记住上次选择的话，`lobby` 也要加 `mode` 字段。
9. **文案。** 设计稿第 189 行，教练栏空状态里的“教练会自己判断：保持沉默、提醒你，还是暂停牌局……提问时牌局会暂停”，与 A8 和 §9 冲突，§9 没有列出，需要改写。
10. **ADR-005 的依据。** “Squirrel.Mac 的签名校验机制来自公开文档”这句，建议补上验证方式：两个版本签名后，在 macOS runner 上真实跑一次 `quitAndInstall`，或者至少用 `codesign --verify -R`，并说明 `-R` 只是替代手段。
11. **残留和清单。** note 第 67 行“花费只能来自用户填写的单价”已被 §6 取代，没有更正。`river-desktop/adr/003` 的状态没有标“被 004 取代”，ADR-001/002 也没有加注，ADR-004 自己写了这些后果，但原文件没动。删除清单漏了 `closeMastra` 里关闭 storage 的部分、`db/index.ts` 第 50–57、108 行关于 Mastra 争锁的注释、`package.json` 里的 `@mastra/memory` 和 `@mastra/libsql`（ADR-004 选项 A 写了，§2 没写）。
12. **玩家破产后的「下一手」。** §3 表格写“下一手 / 重新买入 手动”。建议写明玩家筹码为 0 时只能「重新买入」（沿用现有 `nextHand` 第 233 行）；否则会出现玩家空位，与 §4.2 第 103 行“桌上不会出现空位”矛盾。

## 已核实、成立的部分

- **Mastra 重试（A1）。** `agent-DwtTO5Px.js` 第 34812 行 `this.maxRetries = config.maxRetries ?? 0`，第 38720 行逐步取它。实测（`m.mjs` A/A0）：独立 Agent 默认只调用 1 次；构造时设 `maxRetries: 2` 后调用 3 次，约 3.07 秒后成功。非 `APICallError` 一律算可重试（第 24965–24968 行）。§2 的写法正确，note 第 76 行已更正。
- **不注册 Mastra、直接传消息数组（ADR-004）。** 实测 C：独立 Agent 的 `stream([user, assistant, user], { maxSteps: 1 })` 送给模型的 prompt 依次是 system、user、assistant、user，`totalUsage` 可以取到。`agent.d.ts` 第 1230–1245 行的签名与 ADR 所引一致。
- **`toolChoice: 'required'` + `maxSteps: 1`。** 实测 B：模型收到 `{"type":"required"}`；工具在这一步执行完，没有第二次模型调用，`finishReason` 为 `tool-calls`。§2 的 `act` 和 §3 的 `recap` 都可以这样用。
- **流式中途错误不重试。** 实测 D：`maxRetries: 2` 时，流开始后出错，模型只被调用 1 次，`out.error` 为该错误，`finishReason` 为 `error`。§3 第 56 行的描述正确。
- **教练局状态机。** 轮到玩家、提问、复盘、下一手、离桌、停下这几条路径都有出口：每个锁定态都有「不等了」或「跳过」，要么就是失败自动解锁；复盘失败时「重新买入」可点；离桌时中止所有在途调用。没有死锁，也没有无法恢复的状态。唯一的缺口见 F2。
- **§4.2 的规则问题属实。** 我用 `/tmp/rv3/eng.ts` 做了复现：翻牌圈下注 1000，短码不完整全下到 1200，下注者再次轮到时 `legal` 仍返回 `canRaise: true, minTo: 2200`（`poker.ts` 第 207 行重置了所有人的 `acted`）。未跟注部分和余数分配这两条，审阅 1、2 已经复现过，代码没有变，结论仍然成立。
- **§4.1 能否支撑 runner。** 规范化、`abortHand`（恢复到 `startStack`）、`setStack`、`holeCards` 返回全部底牌、结构化的 `handLog`（含 `return` 条目）、`totalPot`、弃牌结束走 `showdown` 判给唯一剩下的人、`winners` 不含退回的部分：runner 现有的每项需求（`runner.ts` 第 208–233 行的重新买入、第 224 行的弃牌结束、`record` 的统计）都有对应的接口。只剩 F3 和低优先级 1–4 需要补。
- **发布产物。** 配了 `publish` 之后，即使用 `--publish never`，`artifactCreatedWithoutExplicitPublishConfig` 仍会生成 `latest*.yml`（`PublishManager.js` 第 135–164 行），`app-update.yml` 也会写进资源目录（第 87–89 行）。所以 CI 保持 `--publish never`、由 `softprops/action-gh-release` 上传，这条路可行。`build.yml` 第 62 行的 `draft: true` 和上传路径要按 §7 改，方案已写。
- **用量、价格与存储表一致。** `river_hands` 本来就有 `table_id` 和 `hand_no`（`db/index.ts` 第 23–24 行），所以按 `(table_id, hand_no)` 关联成立。作废的手不落库，按连接查询自然不会进每手柱状图。“清空记录”（第 263 行，清手牌、复盘、余额）不清用量，与 §6 一致。§8 的 `river_usage`、`river_prices` 与 §6 对得上。
- **仓库地址。** `publish` 的 `owner`/`repo` 与 `git remote`（`reflux-studio/river`）一致；仓库公开（A7），GitHub provider 不需要 token。
- **用户决定逐条对照。** U1（单次 `act`，只在自己回合发言，删泄牌过滤）、U2（停下 + 手动恢复）、U3（教练局是对局类型，一手结束亮弃牌）、U4（已答复）、A2（近 3 手 + 自维护记忆）、A3、A4（纯手动下一手 + 先听教练）、A5、A6（models.dev 价格）、A7、A8（每步说话、流式、无工具）、A9（electron-updater + 自签），都有对应章节。A10 下的 AI 决定都标注了，也都向用户说明过（§1 第 24 行）。

## 审阅 2 修改清单逐条核验

| 审阅 2 清单 | 第 4 轮位置 | 核验结果 |
| --- | --- | --- |
| 1 F1 重试 | §2 第 36 行；§3 第 55、57 行；note 第 76 行 | 已处理。对手 `maxRetries: 2`，教练发言 1、复盘 2；note 已更正；流式中途不重试写在 §3 第 56 行。“计次测试”只出现在 §13 的对照表里，plan 要记得带上。问答的 `maxRetries` 没写（低 6） |
| 2 F2 引擎 API | §4.1 第 71–93 行；§2 第 30 行；§4.2 第 105 行 | 已处理：`standUp`/`setStack`、`abortHand`、`holeCards` 的范围、`handLog` 的结构、`pots`/`totalPot`、弃牌结束、规范化规则、`act` 的动作枚举、压测覆盖“规范化后必被接受”，都在。面对下注时 `check` 定为 `call`。新发现 F3 与低 1–4 |
| 3 F3 AI 推断 | §1 第 24 行；§3 第 57 行；§8 第 143 行 | 已处理。每手必复盘加「跳过」兜底，不删 `mastra_*` 表，都已向用户说明 |
| 4 F4 去存储细节 | ADR-004；§8 第 145 行；§2 第 40 行 | 已处理：新 ADR、WAL、写链保留、不降级、不注册 Mastra、删除清单补了 `db-mastra.test.ts`/`appendThreadMessage`/`resetMemories`/`appendResult`。ADR-001/002/003 原文件没加注，`closeMastra` 和注释没列入清单（低 11） |
| 5 F5 教练时序 | §3 第 54–61 行；§3 表第 52 行 | 基本处理：发言时限、「不等了」、提问时锁定、问答的输入与历史上限（6 轮，不含发言和复盘）、复盘中能否重新买入、硬核模式只在教练局、回放页可复盘，都写了。“只回文字”的问题因 A8 已不存在。问答不开工具只是隐含的（低 6）。**提问与牌局推进的关系没写，见 F2** |
| 6 F6 用量契约 | §6 第 118–121 行 | 已处理：按 `table_id`+`hand_no` 归属、作废手的用量、部分无价的显示、按原始 token 在显示时计价、缓存 token 先按输入价估算、清空记录的语义 |
| 7 F7 价格前提 | §6 第 117 行；§9 第 159 行 | 已处理：CI 快照 + 运行时刷新；首个任务核实 `cost` 字段；“≈ ¥”和说明文字按 §6 改 |
| 8 F8 记忆与快照 | §2 第 34 行；§5 第 109–112 行 | 已处理：每手最多追加 1 条、`note` 截断到 30 字、`say` 截断到 40 字；决策时读最新提示词，角色被删时用快照；副标题已改 |
| 9 F9 文案与发布 | §9 第 153、156、159 行；§7 第 126–127 行；§1 第 12 行 | 已处理：引导页“暂停”、“思考速度”、“按字符数估算”、发布为正式 Release、开发环境跳过检查、U4 已注明。另有设计稿第 189 行的空状态文案遗漏（低 9） |

## 证据限制

- Mastra 的结论来自 mock 模型（v2 规范）实测，没有接真实提供方；schema 校验失败的行为（F3）也是用 mock 模型测的。
- F1 里 macOS 的两条（`identity: '-'` 退回 ad-hoc、`find-identity -v` 过滤掉不受信任的身份）来自 app-builder-lib 和 osx-sign 的源码阅读，没有在 macOS 上实跑。“自签证书在临时钥匙串里被判为不受信任”是基于 `-v` 语义的推断。Windows 那条中，electron-builder 一侧（读 `CSC_LINK`、写 `publisherName`）已在源码核实；electron-updater 一侧的 Authenticode 校验，依据的是它的公开实现（本仓库没有安装）。
- Squirrel.Mac 能否接受自签证书签出的更新、`--timestamp` 对自签证书是否可用，都没有核实，仍依赖首个任务在 macOS runner 上验证。
- 引擎只复现了不完整加注这一条，其余两条沿用审阅 1、2 的复现（代码没有变化）。

## 修改清单

1. **F1**：§7 和 ADR-005 写明：删掉 `mac.identity: '-'`，开 `forceCodeSigning: true`（或者用等效的 CI 断言，确保签名失败时构建失败）；`CSC_LINK`/`CSC_KEY_PASSWORD` 只注入 macOS 构建（或设 `WIN_CSC_LINK: ''`），Windows 与 Linux 不签名；CI 先把自签证书设为受信任（或用自定义 `mac.sign` 钩子），构建后断言 Authority 和 `codesign --verify -R`；退回选项 B 的条件改成“做完上述处理后仍不满足”，并写明 B 只用于 macOS。
2. **F2**：§3 写明提问与牌局推进的关系。推荐：提问期间牌局暂停，对手不行动，也不能发下一手；复盘「重试」进行中重新锁住「下一手」和「重新买入」；互斥范围限于本桌，回放页的复盘不受限。
3. **F3**：§2 写明 `act` 用宽松的 schema，`bet`、`allin` 等别名和字符串形式的 `to` 由规范化处理；无法识别的动作怎么处理，二选一写死；测试覆盖这些边缘输入。
