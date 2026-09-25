import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage } from 'electron'
import { dict, resolveLocale } from '@river/i18n'
import { initDb } from './db'
import { guardQuit, registerIpc } from './ipc'
import { fxRates, loadFx, refreshFx } from './models/fx'
import { loadPrices, refreshPrices } from './models/prices'
import { TableRunner } from './table/runner'
import { initUpdater, installUpdate, readyVersion } from './updater'

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
    // 顶栏 52px 高，红绿灯/窗口按钮需与其对齐；overlay 颜色须与 renderer index.css 的 --topbar 同步
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 19 } }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#f7f7f5', symbolColor: '#1d1d1f', height: 52 } }),
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

const runner = new TableRunner({ emit: (event, payload) => win?.webContents.send(event, payload) })

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(iconPath)
  try {
    const url = 'file:' + join(app.getPath('userData'), 'river.db')
    await initDb({ url, encrypt: (t) => safeStorage.encryptString(t), decrypt: (b) => safeStorage.decryptString(b), systemLocale: app.getLocale() })
    await loadPrices()
    await loadFx()
    await runner.init()
  } catch (e) {
    // 这时可能读不到库：按系统语言
    dialog.showErrorBox(dict(resolveLocale(app.getLocale())).desktop.error.startFailed, e instanceof Error ? e.message : String(e))
    app.exit(1)
    return
  }
  void refreshPrices()
  void refreshFx().then((fx) => fx && runner.emit('fx', fx))
  registerIpc(ipcMain, runner, { version: () => app.getVersion(), update: readyVersion, install: installUpdate, fx: fxRates, packaged: app.isPackaged })
  guardQuit(app, runner)
  // 默认菜单带 Ctrl+R 刷新、Ctrl+Shift+I DevTools 等快捷键，正式包不应暴露；开发时保留
  if (process.platform !== 'darwin' && app.isPackaged) Menu.setApplicationMenu(null)
  createWindow()
  initUpdater(runner.emit)
})

app.on('window-all-closed', () => app.quit())
