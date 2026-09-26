# T8 验证记录

## 自动检查

```
pnpm build:site              # astro build，生成 /index.html 与 /en/index.html
pnpm --filter ./apps/site typecheck   # astro check：20 个文件 0 errors / 0 warnings / 0 hints
pnpm typecheck               # engine（两个 tsconfig）、i18n、ui、desktop、site 全部通过
pnpm test                    # engine 36、i18n 4、ui 5、site 1、desktop 120，全部通过
cd apps/desktop && pnpm build   # 通过（lockfile 中 vitest 的 vite peer 随 astro 解析到 vite 8，desktop 仍用 vite 7.3.6，构建与测试不受影响）
```

site 的测试 `apps/site/test/sim.test.ts`：用固定种子驱动 `step` 跑满 40 手，每一步检查
英文视图（`toSeatView(sim, 'en')`）没有汉字、中文视图能生成、筹码守恒（含重新买入）。

## engine tsconfig 拆分（T2 审阅 F3）

`tsconfig.json` 只含 src、`types: []`；`tsconfig.test.json` 继承它，加入 test 与 Node 类型；
typecheck 脚本依次检查两个配置。在 `src/format.ts` 临时追加 `export const leak = Buffer.from("x")`：

```
src/format.ts(3,21): error TS2591: Cannot find name 'Buffer'. ...
[ELIFECYCLE] Command failed with exit code 2.
```

撤回后 typecheck 通过。

## 浏览器验证

```
cd apps/site && pnpm preview --port 4321
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9444 \
  --user-data-dir=<scratch> --lang=en-US --accept-lang=en-US http://localhost:4321/river/
node check.mjs 9444 <scenario>      # 本目录的 check.mjs，收集 Runtime 异常、console.error/warning 与 Log 错误
```

| 场景 | 结果 |
| --- | --- |
| `hands`（/river/ 连续 20 手） | 325 秒到第 21 手，无控制台报错；`zh-demo-after-20-hands.png` |
| `handsEn`（/river/en/ 连续 20 手） | 330 秒到第 21 手，无控制台报错；座位状态全为英文（BB 100、Folded、Raise to 300、Thinking…）；`en-demo-after-20-hands.png` |
| `pause` | 暂停 6 秒内座位、公共牌、底池不变，按钮变“继续”；继续后桌面推进，按钮变回“暂停” |
| `appearance` | 选“酒红”桌布、绿色牌背：全下展示与首屏演示桌同步变化（演示桌 HTML 含 `oklch(0.42 0.12 18)`）；“完整”档下展示区出现 ALL IN 标签；切到“关闭”后 3.5 秒内不再出现。`zh-effects-wine-green-allin.png`、`zh-demo-wine-green.png` |
| `offline`（`Network.setBlockedURLs` 屏蔽 `*api.github.com*`） | 首屏、下载区、结尾三个下载按钮都指向 `…/releases/latest`，版本行显示“最新版本”；恢复后指向 `releases/download/v0.2.1/River-0.2.1-arm64.dmg`，版本行“最新版本 v0.2.1”。`zh-download-blocked.png` |
| `hint`（`navigator.language` 为 en-US） | 清空 localStorage 后打开 /river/ 显示 English 提示（`zh-en-hint.png`）；点 × 关闭，刷新后不再出现；页头 EN 链接为 `/river/en/`，打开后 `<html lang="en">`、英文标题；“中”链接回到 `/river/`，`lang="zh-CN"` |
| `pages` 375px | 中英文 `scrollWidth` 都是 375，与 `clientWidth` 相同，无横向滚动；`zh-full-375.png`、`en-full-375.png` |

注：调试期间 GitHub API 未认证请求一度返回 403（限流），页面按设计退回 releases/latest，
这是浏览器网络日志，不是脚本错误；限流恢复后 `offline` 场景的“恢复后”一行取得了真实版本。

## 与设计稿对比

设计稿 `design-source/River Site v2.dc.html` 连同 support.js、river-site.js 与
`river-desktop/design-source/poker.js` 复制到临时目录，用同一个 headless Chrome（英文）打开：
`design-en-full-1280.png`（1280 宽全页）。官网对应 `en-full-1280.png`、`zh-full-1280.png`，
逐区块截图 `{zh,en}-01-hero.png` … `{zh,en}-11-end.png`。

逐区块对照结果：页头导航、首屏与演示桌外框、牌友八张卡与“新对手”、记仇笔记、公屏、教练面板、
复盘卡、动效深色卡与全下展示、模型提供方与用量卡、还有这些、下载、FAQ、结尾与页脚，文字、
配色、尺寸一致；全页高度 8613 vs 设计稿 8594。

有意保留的差别：

- 演示桌用 app 的 `TableStage`：底池显示已收进的筹码堆（app 的做法，设计稿只显示数字），
  一手结束后底池数字保留（设计稿归零），座位弃牌后变灰在一手结束时也保留（ui `Seat` 的行为）。
- 480px 以下演示桌顶栏隐藏“River”字样，避免与“第 N 手”挤在一起。
- `/` 页顶新增 English 提示条（任务要求，设计稿没有）。

注：1280 宽全页截图（`captureBeyondViewport`）最底部一段会重绘出页面顶部，是截图方式的伪影；
结尾区与页脚以 `{zh,en}-11-end.png` 为准。
