# river-monorepo 技术方案审阅 · plan 第 2 轮

- **对象**：按 plan-1 修订后的 `.rivo/issues/river-monorepo/plan.md`（539 行）。重读了各处修改，以及修改所在的整节：
  - `lastActs` 的测试；
  - 特效；
  - 预选值与 `completeOnboarding`；
  - 手动检查更新；
  - 脚本与 CI；
  - 验证 1、3、5；
  - 发布与回滚；
  - 待决问题。
- **基线**：`main` @ 1ece50c。复核了 `useTableFx.ts:161`、`db/index.ts`（`getKv`、`updateSettings`、`loadCaches`）、`engine/table.ts:390-397`（盲注写入 `allIn`），以及 electron-updater 6.8.9 的 `downloadUpdate`（重复下载复用同一个 promise，失败时仍然 emit `error`）。
- **结论：通过。** B1 和 N1–N11 都已处理。本轮新发现 4 项非阻塞问题（P2-1 至 P2-4）。其中 P2-1 如果不改，会导致一条测试怎么写都通不过，建议实施前修正。其余是措辞问题，可以在实施中顺手修改，不需要再审一轮。

## 前轮问题的处理

| 编号 | 修订 | 结论 |
| --- | --- | --- |
| B1 加注触发条件 | 第 233 行写全三个条件（下注额增加、`lastAct` 为 bet/raise、`status` 变化）；验证 3 补了三种不应触发特效的情形 | 已解决 |
| N1 预选值 | `DEFAULT_SETTINGS.locale='zh'`；`loadCaches` 读原始 kv；`initDb` 增加 `systemLocale` 参数 | 已解决。“不写库”的措辞见 P2-3 |
| N2 伪代码 | 改为 db 模块导出 `completeOnboarding`，`ipc.ts` 只转发 | 已解决。函数名见 P2-3 |
| N3 `lastActs` 测试 | 改为手写用例加性质检查 | 基本解决。性质的写法与契约冲突，见 P2-1 |
| N4 CI | 根 `package.json` 保留 `packageManager`；`build.yml` 的 test job、打包步骤、签名断言和上传路径逐项写明 | 已解决。`upload-artifact` 的路径相对于仓库根目录，写成 `apps/desktop/dist/*` 是对的 |
| N5 本地打包 | 根目录增加 `dist` 脚本，README 中的命令保持可用 | 已解决 |
| N6 规则措辞 | 第 30 行改为“已完成引导的老用户是中文” | 已解决 |
| N7 hoisted | 验证 1 改为在 `pnpm-workspace.yaml` 写 `nodeLinker: hoisted`，以文档为准 | 已解决。“待决问题”一节还留着旧写法，见 P2-2 |
| N8 界面呈现 | 设置页的呈现方式（toast）和五种结果的中英文案表 | 已解决 |
| N9 误报 | 删掉 `manualDownloading`，改为只跟踪这次的 `r.downloadPromise` | 已解决。同时进行的检查拿到的是同一个下载 promise，失败只推送一次，后台检查失败不再被误报 |
| N10 回滚 | 改为只能向前修复；写明回退代码后 `locale` 会丢失，英文用户会变成中文 | 已解决 |
| N11 阶段与引用 | `handCat` 放到第二阶段；ADR-005 改为 river-v2 路径；改用 `Table.legalActions()` | 已解决 |

## 新发现的问题（非阻塞）

### P2-1 `lastActs` 的性质检查与“全下交盲注记为 allin”的契约冲突

- **位置**：第 170 行：“等于该座位本街最后一条**非盲注**、非退回记录对应的动作”。第 160 行的契约却写着：“带 `allIn` 标记的动作一律记为 `'allin'`，**包括短码玩家交盲注时全下**。”
- **证据**：短码玩家交盲注就全下时，引擎写入的是 `type: 'blind'`、`allIn: true`（`table.ts:390,397`）。之后他不会再有动作记录。
  - 按性质检查，他的结果应是 `undefined`；
  - 按契约和第 169 行的手写用例，他的结果应是 `'allin'`。
- **后果**：随机压测里短码交盲注是常见情形。无论实现遵循哪一条，另一条测试都会失败，实施者只能自己选一个。
- **建议**：把性质改成：“本街最后一条非退回记录。盲注只在 `allIn` 时计为 `'allin'`，否则不计；其他记录带 `allIn` 时计为 `'allin'`，否则按 `type` 计。”

### P2-2 “待决问题”一节还是旧的 `node-linker` 写法

- **位置**：第 527 行：“如果需要改用 `node-linker=hoisted`……”
- **证据**：第 479 行已经改成在 `pnpm-workspace.yaml` 中写 `nodeLinker: hoisted`。
- **后果**：同一件事在两处写法不同，读者可能照旧写法改 `.npmrc`。
- **建议**：第 527 行改成与第 479 行一致。

### P2-3 预选值和伪代码中有两处与现有代码不符

- **“不写库”**：第 306 行说预选值“只放在内存里，不写库”。但 `updateSettings` 每次都会把整份 `settingsCache` 写进库（`db/index.ts:202-204`），引导完成之前只要有任何一次设置写入，预选值就会被带进库。这不会造成错误结果：下次启动会读到它，而 `completeOnboarding` 会覆盖它，design-7 也确认过。问题在于，这句话容易让实施者以为要专门把 `locale` 剔除出去。
  - 建议改成：“不主动写库；被其他设置写入顺带存进去也不影响结果。”
- **`writeSettings`**：伪代码里的 `writeSettings` 在仓库里不存在。拒绝 `locale` 的守卫在 `ipc.ts` 的 `settings.update` handler 里，db 模块的 `updateSettings` 本身不做拦截，可以直接用。
  - 建议伪代码改为调用 `updateSettings(patch)`，免得实施者再多写一个函数。

### P2-4 批准来源的写法超出了已知事实

- **位置**：第 531 行：“已完成引导的老用户语言为中文（用户已看过并批准 plan）。”
- **证据**：这份 plan 是首稿，现在正在审阅中。用户批准的是 `discussion.md` 中的方案，决定表里这一行标的是“AI 建议，沿用现有行为”。
- **后果**：会把审阅中的文档写成已经获得批准，来源标注不准确。
- **建议**：改成“AI 建议，用户在方案讨论中批准（discussion.md 用户决定表）”。

## 其他核对（没有发现问题）

- 新增的设置页文案表覆盖了 `UpdateCheck` 的四种结果和 `update:error`，与 discussion 中的“下载失败，稍后自动重试”一致。
- 回滚一节对 `pick` 丢掉 `locale` 的后果描述准确。
- `build.yml` 的 test job 在根目录运行 `pnpm typecheck`/`pnpm test`，与根目录脚本 `pnpm -r` 一致。
- 修订没有改动需求范围或用户决定。

## 检查限制

- 只读了方案和相关代码，没有运行任何代码。
- 没有核实 pnpm 11 文档中 `nodeLinker` 的具体写法；方案已写明“以文档为准”。
- 第一轮已说明的限制仍然适用：官网 v2 的 `poker.js` 与设计稿没有逐区块复核。
