# River

单人对 AI 的德州扑克教学桌面应用。每位 AI 对手由一段性格提示词驱动，轮到它时一次调用同时决定下注和台词；教练局里教练每步先讲解、可随时暂停提问、每手复盘。

技术栈：Electron（electron-vite）· React + shadcn/ui · Mastra · SQLite（libSQL）。

## 下载

在 [Releases](https://github.com/reflux-studio/river/releases) 下载对应平台的安装包：macOS（Apple Silicon）`.dmg`、Windows `-setup.exe`、Linux `.AppImage`。

安装包用开发者自签证书签名，没有经过 Apple 公证：

- **macOS**：首次打开会提示“无法验证开发者”。到“系统设置 → 隐私与安全性”底部点“仍要打开”。
- **Windows**：SmartScreen 提示时点“更多信息 → 仍要运行”。

首次启动后在设置页添加模型提供方和 API key（支持 Mastra 模型路由里的厂商，以及 OpenAI 兼容接口），并为对手和教练各选一个模型。没有配置模型时无法开桌。

应用会在后台检查 GitHub Releases 上的新版本并自动下载，下载完成后（不在牌桌上时）顶栏出现“重启更新”，退出时也会自动安装。

## 开发

```bash
pnpm install
pnpm dev        # 开发运行，数据写在 River-dev 目录
pnpm test
pnpm dist       # 打当前平台的安装包到 dist/
```

## 发布

推送 `v*` 标签（如 `v0.2.0`）会触发 GitHub Actions：版本号取自标签，在 macOS、Windows、Linux 上分别构建，并直接发布为正式 Release（含自动更新用的 `latest*.yml`）。

macOS 自动更新要求新旧版本由同一证书签名。第一次发布前需要准备一张自签代码签名证书（只做一次，之后一直用同一张）：

1. 在 Mac 上打开“钥匙串访问 → 证书助理 → 创建证书”，名称填 **River Self Signed**（必须一字不差），身份类型“自签名根证书”，证书类型“代码签名”，有效期可在“让我覆盖默认值”里设长一些（如 3650 天）。
2. 在“我的证书”里右键该证书 → 导出为 `.p12`，设一个密码。
3. `base64 -i River.p12 | pbcopy`，在仓库 Settings → Secrets and variables → Actions 中新建 `MAC_CERT_P12`（粘贴 base64）和 `MAC_CERT_PASSWORD`（导出密码）。
4. 把 `.p12` 和密码妥善备份。证书丢失后换新证书，已安装的旧版本将无法自动更新到新版本，只能手动下载一次。

本地 `pnpm dist` 使用 ad-hoc 签名，只用于自测。

设计与实施过程记录在 `.rivo/issues/river-desktop/` 和 `.rivo/issues/river-v2/`。
