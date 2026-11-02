# River

支持浏览器与 Electron 的好友德州扑克牌桌，最多十座位，也可在 Electron 本地开 AI 对局。每位 AI 对手由一段性格提示词驱动，轮到它时一次调用同时决定下注和台词；教练局里教练每步先讲解、可随时暂停提问、每手复盘。

技术栈：Electron（electron-vite）· React + shadcn/ui · Mastra · SQLite（libSQL）。

官网：<https://reflux-studio.github.io/river/>（中文）、[/en/](https://reflux-studio.github.io/river/en/)（英文）。

## 下载

在 [Releases](https://github.com/reflux-studio/river/releases) 下载对应平台的安装包：macOS（Apple Silicon）`.dmg`、Windows `-setup.exe`、Linux `.AppImage`。

安装包用开发者自签证书签名，没有经过 Apple 公证：

- **macOS**：首次打开会提示“无法验证开发者”。到“系统设置 → 隐私与安全性”底部点“仍要打开”。
- **Windows**：SmartScreen 提示时点“更多信息 → 仍要运行”。

首次启动后在设置页添加模型提供方和 API key（支持 Mastra 模型路由里的厂商，以及 OpenAI 兼容接口），并为对手和教练各选一个模型。没有配置模型时无法开桌。

应用会在后台检查 GitHub Releases 上的新版本并自动下载，下载完成后（不在牌桌上时）顶栏出现“重启更新”，退出时也会自动安装。

## 开发

```bash
pnpm install      # 在仓库根目录执行，安装整个 workspace
pnpm dev          # 开发运行桌面端（apps/desktop），数据写在 River-dev 目录
pnpm typecheck    # 所有包的类型检查
pnpm test         # 所有包的测试
pnpm dist         # 打当前平台的安装包到 apps/desktop/dist/
pnpm dev:site     # 开发运行官网（apps/site）
pnpm build:site   # 构建官网到 apps/site/dist/
pnpm dev:server   # 联机服务，默认 8787；SQLite 保存房间
pnpm dev:web      # Web 开发入口 /play/，代理到本机 8787
pnpm build:web   # 构建共享 Web 端
pnpm build:server # 构建 Node 服务
```

仓库是 pnpm workspace：桌面应用在 `apps/desktop`，官网在 `apps/site`（Astro），共享包在 `packages/`（`@river/engine`、`@river/ui`、`@river/i18n`）。只针对某个包执行命令时可用 `pnpm --filter ./apps/desktop <脚本>`。

## 发布

推送 `v*` 标签（如 `v0.2.0`）会触发 GitHub Actions：版本号取自标签，在 macOS、Windows、Linux 上分别构建，并直接发布为正式 Release（含自动更新用的 `latest*.yml`）。

macOS 自动更新要求新旧版本由同一证书签名。第一次发布前需要准备一张自签代码签名证书（只做一次，之后一直用同一张）：

1. 在 Mac 上打开“钥匙串访问 → 证书助理 → 创建证书”，名称填 **River Self Signed**（必须一字不差），身份类型“自签名根证书”，证书类型“代码签名”，有效期可在“让我覆盖默认值”里设长一些（如 3650 天）。
2. 在“我的证书”里右键该证书 → 导出为 `.p12`，设一个密码。
3. `base64 -i River.p12 | pbcopy`，在仓库 Settings → Secrets and variables → Actions 中新建 `MAC_CERT_P12`（粘贴 base64）和 `MAC_CERT_PASSWORD`（导出密码）。
4. 把 `.p12` 和密码妥善备份。证书丢失后换新证书，已安装的旧版本将无法自动更新到新版本，只能手动下载一次。

本地 `pnpm dist` 使用 ad-hoc 签名，只用于自测。

官网由 `.github/workflows/site.yml` 在 `main` 上自动发布到 GitHub Pages（仓库 Settings → Pages 的来源需设为 GitHub Actions）；PR 和 `main` 上的检查见 `ci.yml`。

设计与实施过程记录在 `.rivo/issues/` 下（`river-desktop`、`river-v2`、`river-monorepo` 等）。

## 好友房与本地对局

Web 开发时同时运行 `pnpm dev:server` 和 `pnpm dev:web`。也可先 `pnpm build:web`，再运行 `pnpm dev:server`，访问 `http://localhost:8787/play/`；邀请路径为 `/play/join/<roomId>`。

Electron 默认进入同一套牌桌页面。本地运行时位于 Electron Node；切换大厅的连接地址可加入同一联机服务。模型、角色、Key 和旧历史继续使用桌面原有设置与存储。Web 玩家可由房主授权已加入的 Electron 玩家提供 AI。

服务配置：`PORT`（默认 8787）、`RIVER_DATA_DIR`（默认服务工作目录的 data）、`RIVER_WEB_DIR`（默认 apps/web/dist）。单进程运行；房间快照和命令回执保存在本地 SQLite，全部真人离开后关房。服务重启恢复未关闭房间。个人资料与战绩分别存于浏览器 IndexedDB 或 Electron SQLite。

官网部署时可设置 `PUBLIC_PLAY_URL` 指向实际游戏服务的 `/play/`，首页显示浏览器开桌入口。官网静态托管本身不运行 WS 服务。

当前技术方案：[River Web 与好友联机 v2](.rivo/issues/river-web-multiplayer/plan.md)。
