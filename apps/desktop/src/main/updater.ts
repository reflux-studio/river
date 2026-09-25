// 自动更新（ADR-005）：GitHub Releases + electron-updater。只在打包版本运行；
// 后台下载，下载完提示“重启更新”，只在不在牌桌上时安装
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { dict } from '@river/i18n'
import { settingsCache } from './db'
import type { Emit } from './table/runner'

const { autoUpdater } = electronUpdater
const CHECK_MS = 6 * 60 * 60 * 1000

let ready: string | null = null

export function initUpdater(emit: Emit) {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', (info) => {
    ready = info.version
    emit('update:ready', { version: info.version })
  })
  // 检查或下载失败不打扰用户：下次定时检查再试
  autoUpdater.on('error', (e) => console.error('updater', e))
  const check = () => void autoUpdater.checkForUpdates().catch((e) => console.error('updater', e))
  setTimeout(check, 10_000)
  setInterval(check, CHECK_MS)
}

export const readyVersion = () => ready

export function installUpdate() {
  if (!ready) throw new Error(dict(settingsCache.locale).desktop.error.noUpdate)
  autoUpdater.quitAndInstall()
}
