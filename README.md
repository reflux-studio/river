# River

单人对 AI 的德州扑克教学桌面应用。每位 AI 对手都是一个带人设、工具和记忆的 Mastra agent，会在公屏上聊天；教练坐在你身后，可以提醒、暂停牌局、回答问题和复盘。

技术栈：Electron（electron-vite）· React + shadcn/ui · Mastra · SQLite（libSQL）。

## 下载

在 [Releases](https://github.com/reflux-studio/river/releases) 下载对应平台的安装包：macOS（Apple Silicon）`.dmg`、Windows `-setup.exe`、Linux `.AppImage`。

安装包没有经过签名和公证：

- **macOS**：首次打开会提示“无法验证开发者”。到“系统设置 → 隐私与安全性”底部点“仍要打开”。
- **Windows**：SmartScreen 提示时点“更多信息 → 仍要运行”。

首次启动后在设置页添加模型提供方和 API key（支持 Mastra 模型路由里的厂商，以及 OpenAI 兼容接口），并为对手和教练各选一个模型。不配置也能用本地引擎打牌。

## 开发

```bash
pnpm install
pnpm dev        # 开发运行，数据写在 River-dev 目录
pnpm test
pnpm dist       # 打当前平台的安装包到 dist/
```

推送 `v*` 标签会触发 GitHub Actions，在 macOS、Windows、Linux 上分别构建，并把安装包附到一个草稿 Release 上。

设计与实施过程记录在 `.rivo/issues/river-desktop/`。
