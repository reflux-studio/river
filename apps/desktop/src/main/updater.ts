// 自动更新（ADR-005）：GitHub Releases + electron-updater。只在打包版本运行；
// 后台下载，下载完提示“重启更新”，只在不在牌桌上时安装
import electronUpdater, { type AppUpdater } from 'electron-updater'
import { dict } from '@river/i18n'
import type { UpdateCheck } from '../shared/types'
import { settingsCache } from './db'
import type { Emit } from './table/runner'

export type Updater = Pick<AppUpdater, 'autoDownload' | 'autoInstallOnAppQuit' | 'on' | 'checkForUpdates' | 'quitAndInstall'>

const CHECK_MS = 6 * 60 * 60 * 1000

let updater: Updater | null = null
let emit: Emit = () => {}
let ready: string | null = null

// electronUpdater.autoUpdater 是取值即实例化的 getter，会碰 electron；只在调用时取，测试可注入替身
export function initUpdater(e: Emit, u: Updater = electronUpdater.autoUpdater) {
  updater = u
  emit = e
  u.autoDownload = true
  u.autoInstallOnAppQuit = true
  u.on('update-downloaded', (info) => {
    ready = info.version
    emit('update:ready', { version: info.version })
  })
  // 后台检查或下载失败不打扰用户：下次定时检查再试
  u.on('error', (err) => console.error('updater', err))
  const log = (err: unknown) => console.error('updater', err)
  // 下载失败同样静默：下次定时检查会再下
  const check = () => void u.checkForUpdates().then((r) => r?.downloadPromise?.catch(log), log)
  setTimeout(check, 10_000)
  setInterval(check, CHECK_MS)
}

export async function checkNow(u: Updater | null = updater): Promise<UpdateCheck> {
  if (ready) return { state: 'ready', version: ready }
  const t = dict(settingsCache.locale).desktop.update
  if (!u) throw new Error('updater not initialized')
  try {
    const r = await u.checkForUpdates()
    if (!r?.isUpdateAvailable) return { state: 'latest' }
    // 只跟踪这次手动检查触发的下载，后台检查的失败不会误报
    r.downloadPromise?.catch((err) => {
      console.error('updater', err)
      emit('update:error', { message: t.downloadFailed })
    })
    return { state: 'downloading', version: r.updateInfo.version }
  } catch (err) {
    console.error('updater', err)
    return { state: 'error', message: t.checkFailed }
  }
}

export const readyVersion = () => ready

export function installUpdate() {
  if (!ready || !updater) throw new Error(dict(settingsCache.locale).desktop.error.noUpdate)
  updater.quitAndInstall()
}
