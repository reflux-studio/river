import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron'
import { initMastra } from './agents/mastra'
import { initDb } from './db'
import { guardQuit, registerIpc } from './ipc'
import { runSpike } from './spike'
import { TableRunner } from './table/runner'

let win: BrowserWindow | null = null

const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(import.meta.dirname, '../../build/icon.png')

function createWindow() {
  win = new BrowserWindow({
    icon: iconPath,
    width: 1280,
    height: 800,
    minWidth: 880,
    minHeight: 600,
    // 顶栏 52px 高，红绿灯需落在其垂直居中处
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 19 },
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.on('closed', () => (win = null))
  // 打包产物只加载本地文件：环境变量不能把正式应用指向外部页面
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

// 开发与打包默认共用 ~/Library/Application Support/River；依赖此路径的模块须在 whenReady 后才调用 getPath
if (!app.isPackaged) app.setPath('userData', join(app.getPath('appData'), 'River-dev'))

const decideMs = !app.isPackaged && Number(process.env.RIVER_LIMIT_DECIDE_MS)
const runner = new TableRunner({
  emit: (event, payload) => win?.webContents.send(event, payload),
  limits: decideMs ? { decide: decideMs } : {}
})

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(iconPath)
  try {
    const url = 'file:' + join(app.getPath('userData'), 'river.db')
    await initDb({ url, encrypt: (t) => safeStorage.encryptString(t), decrypt: (b) => safeStorage.decryptString(b) })
    // 必须在 initDb 成功之后、且不与之并发（T3 启动顺序）
    await initMastra({ url, onCall: (e) => runner.onCall(e) })
    await runner.init()
  } catch (e) {
    dialog.showErrorBox('River 启动失败', e instanceof Error ? e.message : String(e))
    app.exit(1)
    return
  }
  registerIpc(ipcMain, runner)
  guardQuit(app, runner)
  createWindow()
  if (process.argv.includes('--spike') || process.env.RIVER_SPIKE === '1') await runSpike()
})

app.on('window-all-closed', () => app.quit())
