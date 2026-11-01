import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, safeStorage, shell } from 'electron'
import { dict, resolveLocale } from '@river/i18n'
import { initDb, settingsCache } from './db'
import { guardQuit, registerIpc } from './ipc'
import { fxRates, loadFx, refreshFx } from './models/fx'
import { loadPrices, refreshPrices } from './models/prices'
import { TableRunner } from './table/runner'
import { NotificationAccess, TurnNotifications, type TurnNotice } from './notifications'
import { checkNow, initUpdater, installUpdate, readyVersion } from './updater'

let win: BrowserWindow | null = null

function createNotice(options: { title: string; body: string; silent: boolean }): TurnNotice {
  const notice = new Notification(options)
  return {
    show: () => notice.show(),
    close: () => notice.close(),
    onClick: (callback) => {
      notice.on('click', callback)
      return () => { notice.removeListener('click', callback) }
    },
    onFailed: (callback) => {
      const failed = (_event: Electron.Event, error: string) => callback(error)
      notice.on('failed', failed)
      return () => { notice.removeListener('failed', failed) }
    },
    onShow: (callback) => {
      notice.on('show', callback)
      return () => { notice.removeListener('show', callback) }
    }
  }
}

const notificationAccess = new NotificationAccess({
  platform: process.platform,
  isSupported: () => Notification.isSupported(),
  createNotice,
  testBody: () => dict(settingsCache.locale).desktop.audio.notificationTestBody,
  onStatus: (status) => win?.webContents.send('notification:status', status)
})

const turnNotifications = new TurnNotifications({
  enabled: () => settingsCache.notificationsEnabled,
  window: () => win && !win.isDestroyed() ? win : null,
  isSupported: () => Notification.isSupported(),
  createNotice,
  body: () => dict(settingsCache.locale).desktop.audio.yourTurn,
  showTable: (tableId) => win?.webContents.send('app:showTable', { tableId }),
  onError: (error) => console.error('turn notification failed', error),
  onStatus: (status) => notificationAccess.report(status)
})

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
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  win.on('closed', () => (win = null))
  const refreshNotifications = () => turnNotifications.refresh()
  win.on('focus', refreshNotifications)
    .on('blur', refreshNotifications)
    .on('minimize', refreshNotifications)
    .on('restore', refreshNotifications)
    .on('show', refreshNotifications)
    .on('hide', refreshNotifications)
  // 打包产物只加载本地文件：环境变量不能把正式应用指向外部页面
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

// 开发与打包默认共用 ~/Library/Application Support/River；依赖此路径的模块须在 whenReady 后才调用 getPath
if (!app.isPackaged) app.setPath('userData', join(app.getPath('appData'), 'River-dev'))

// 只允许一个实例：重复启动时把已有窗口带到前台，而不是再开一个
const instanceLock = app.requestSingleInstanceLock()
if (!instanceLock) app.quit()
else {
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
}

const runner = new TableRunner({
  emit: (event, payload) => win?.webContents.send(event, payload),
  onDecision: (decision) => turnNotifications.setDecision(decision)
})

if (instanceLock) app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('app.river.desktop')
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
  registerIpc(ipcMain, runner, {
    version: () => app.getVersion(), update: readyVersion, install: installUpdate,
    check: checkNow, fx: fxRates, packaged: app.isPackaged,
    setTableVisible: (visible) => turnNotifications.setTableVisible(visible),
    notificationStatus: () => notificationAccess.getStatus(),
    // 关掉后台提醒后不再触发系统授权请求
    prepareNotifications: () => settingsCache.notificationsEnabled ? notificationAccess.prepare() : notificationAccess.getStatus(),
    testNotifications: () => notificationAccess.test(),
    openNotificationSettings: async () => {
      // 固定系统 URI，仅由设置页显式点击调用；不接收任意外部地址。
      if (process.platform === 'darwin') await shell.openExternal('x-apple.systempreferences:com.apple.Notifications-Settings.extension')
      else if (process.platform === 'win32') await shell.openExternal('ms-settings:notifications')
    },
    notificationsChanged: () => turnNotifications.refresh()
  })
  guardQuit(app, runner)
  // 默认菜单带 Ctrl+R 刷新、Ctrl+Shift+I DevTools 等快捷键，正式包不应暴露；开发时保留
  if (process.platform !== 'darwin' && app.isPackaged) Menu.setApplicationMenu(null)
  createWindow()
  if (app.isPackaged) initUpdater(runner.emit)
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  turnNotifications.dispose()
  notificationAccess.dispose()
})
