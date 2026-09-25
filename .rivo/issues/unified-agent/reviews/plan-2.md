# 方案审阅 plan-2：统一牌桌 Agent 与本地数值（第 2 轮）

- **对象**：`.rivo/issues/unified-agent/plan.md` 当前稿（工作区快照）。新增「Windows 顶栏」一节（功能点 8、影响面、实机验证第 5 条）。
- **基线**：`main` @ 3ba346c，另有未提交改动。
- **前轮报告**：`reviews/plan-1.md`。
- **本轮核对**：`src/main/index.ts`、`src/renderer/src/components/TopBar.tsx`、`src/renderer/src/index.css`、`src/main/table/{runner,text}.ts`，以及 ADR-004 的状态行。
- **结论**：**通过（附建议 5 条，无阻塞、无重要项）**。

plan-1 的 6 条问题都已实质解决，修订没有引入新的矛盾。新增的 Windows 顶栏一节范围小，现状描述与代码一致，平台分支清楚。剩下的都是措辞同步和可以更简单的做法，不影响评审、开发和联调。

## 前轮问题处理结果

| 前轮 | 本稿处理 | 结果 |
|---|---|---|
| P1 talk 的过期判定与中止点 | 「渲染与惰性压缩」加了「压缩即中止」，列出两个中止点；写入契约改为按 runId 和 `thread.hand` 核对，并明确「不看牌桌当前的手号」；单元测试补了两条 | **解决**。「赛后发言 · 中止」一条没有同步，见 Q1 |
| P2 `summary` 内容未定义 | 新增「往手摘要 `summary` 的内容」一节，分视角写明来源：对手用扩展后的 `publicHandResult`，含位置和 `logLines`，不读 `holeAfter`；教练用 `heroHandSummary`。赛后发言的观察改为对手 `summary` | **解决**。影响面漏列了 `text.ts` 的这项改动，见 Q2 |
| P3 游标状态 | Thread 增加 `chatSeen`（按消息 id）和 `lastSituation`（整段局面文本比较） | **解决**。按 id 记录可以避开 `MAX_CHAT` 截断造成的错位；教练的局面文本里没有公屏内容，整段比较的口径可行 |
| P4 提示词被删改 | 对手 system 恢复「别做明显送钱的离谱决定」；提问的 user 消息补上「一般不超过 150 字」 | **解决** |
| P5 ADR-004、README 的同步范围 | ADR-004 状态行注明「部分被取代」，已核实；README 的更新范围写明结构图、Agent 上下文和信息隔离三处 | **解决** |
| P6 验证缺口 | 7 个改进牌例子直接列在 plan 里，附期望值，其中 8♠7♦ 一例的 14 张已核算无误；赛后发言补了两条测试 | **解决** |

## 发现

### Q1【建议】「赛后发言 · 中止」没有和「压缩即中止」同步

- **位置**：「赛后发言」一节的「中止」条目，以及「写入契约」里「`talk` 在该对手下一次 `act` 之前会被中止」一句。
- **证据**：「渲染与惰性压缩」写了两个中止点：新一手第一次被调用前，以及写下一手 `summary` 触发压缩时。「赛后发言」一节仍只写「下一次 `act` 之前、离桌时」。
- **后果**：实施者只看「赛后发言」一节，可能漏掉「写 `summary` 触发压缩时中止」这个点。好在单元测试已经列了这一条，实施时会暴露出来，所以只是阅读上的不一致。
- **建议**：把这一条改成「压缩该手时（见『渲染与惰性压缩』）、离桌时都会 abort」。

### Q2【建议】影响面没有列出 `text.ts` 新增的对手摘要函数

- **证据**：新一节写了「`publicHandResult` 扩展位置和行动线」。但影响面里 `table/text.ts` 一行只写了 `situation` 的改动。
- **影响**：`publicHandResult` 现在还被 runner 的「本桌最近几手」使用，这个用法本期会删掉。实施者需要自己判断：是改原函数，还是新增一个函数。
- **建议**：影响面补一句。例如：「`publicHandResult` 扩展为对手视角的 `summary`，原来『本桌最近几手』的用法随之删除」。

### Q3【建议】Windows 顶栏右侧留白可以用 Window Controls Overlay 的 CSS 环境变量，不必写死 140px

- **证据**：
  - 在 Windows 上设置了 `titleBarOverlay` 后，Electron 会启用 Window Controls Overlay。页面可以用 `env(titlebar-area-x)` 和 `env(titlebar-area-width)` 读到窗口按钮以外的可用区域。
  - plan 写的是「右侧约 140px」，按 `userAgent` 判断平台。
  - 窗口按钮的宽度会随系统缩放和主题变化，写死的数值可能偏差。
- **影响**：
  - 右侧留白从 16px 增加到约 140px。在 `minWidth: 880` 下，牌桌页右侧有标题、手号、本桌花费和离桌按钮，挤压会更明显。
  - 导航区是 `min-w-0 overflow-hidden`，被挤压时会静默截断标签，不报错，也不容易发现。
- **建议**：
  - 用 `padding-right: calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 16px)` 这类写法。macOS 上没有这些变量，回退为 16px；这样也可以省掉 `userAgent` 判断中关于右侧的部分。
  - 如果保留写死的数值，也行，在实机验证第 5 条加一句「在最小窗口宽度下，牌桌页的导航和右侧按钮不被遮挡、不被截断」。

### Q4【建议】`titleBarOverlay.color` 写的是占位符，而且与 CSS 变量耦合

- **证据**：顶栏底色来自 `index.css` 中的 `--topbar: #f7f7f5`。项目目前没有深色主题。plan 写的是 `<顶栏底色>`。
- **建议**：直接写 `#f7f7f5`，并注明它与 `--topbar` 需要同步修改。以后如果做深色主题，要在切换时调用 `win.setTitleBarOverlay`。这不是本期问题，只需在方案里写明耦合关系。

### Q5【建议】Windows 顶栏的来源和「接受」的结论没有落到 discussion.md

- **证据**：
  - `discussion.md` 中搜不到「Windows」「顶栏」「菜单」。
  - plan 写「用户在本期中途追加」，并写「开发时用快捷键打开 DevTools 的功能会失效，接受」。但这条「接受」是谁决定的，没有记录。
  - 去掉菜单后，Windows 和 Linux 开发环境里的 Ctrl+R 刷新、Ctrl+Shift+I 开 DevTools 都会失效，受影响的不只是 DevTools。
- **影响**：用户目前在 macOS 上开发，实际影响很小，但把 AI 的推断写成了定论。
- **建议**：二选一。
  - 在 discussion.md 补记这项需求，以及「接受开发快捷键失效」的来源。
  - 改为只在打包版执行 `Menu.setApplicationMenu(null)`（`app.isPackaged`），开发环境保留默认菜单。这样行为差异只出现在打包版，也不需要用户做取舍。

## 其他核对（无问题）

- **窗口现状**：`index.ts` 使用 `titleBarStyle: 'hiddenInset'` 和 `trafficLightPosition: { x: 18, y: 19 }`，没有做平台分支，也没有设置菜单。所以 Windows 上是系统标题栏加默认菜单，与 plan 的描述一致。Electron 版本 `^44.4.5`，支持 Windows 上的 `titleBarStyle: 'hidden'` 加 `titleBarOverlay`。
- **高度**：`titleBarOverlay.height: 52` 与 `TopBar` 的 `h-[52px]` 一致。
- **菜单只在非 macOS 上去掉**：`Menu.setApplicationMenu(null)` 只放在 Windows、Linux 一行，macOS 保留默认菜单，Cmd+C、Cmd+V、Cmd+Q 不受影响。在 Windows 上，输入框的复制、粘贴由 Chromium 原生处理，不依赖菜单的 role，plan 的判断成立。
- **拖动**：`TopBar` 整条是 `drag`，导航区和右侧两组交互元素都是 `no-drag`。窗口按钮由系统绘制在 overlay 上，不受页面的拖动区域影响。
- **写入契约**：「不看牌桌当前的手号」对 act 没有副作用。runner 现有的 `handLog().length` 核对是用来判断能否应用行动的，会保留；act 在途时，一手也无法推进。
- **一致性**：本稿没有重新出现已被取代的条款；功能点 8 已进入影响面和实机验证。

## 检查限制

- 本轮没有运行代码，也没有在 Windows 上实测。关于 Window Controls Overlay 的 CSS 环境变量、Windows 上去掉菜单后编辑快捷键的行为，依据的是 Electron 和 Chromium 的已知行为，最终以 plan 中实机验证第 5 条为准。
- Linux 同样走 `titleBarOverlay` 分支，但验证清单只覆盖 Windows。Linux 的效果本轮没有验证。
