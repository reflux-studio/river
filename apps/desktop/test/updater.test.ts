import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dict } from '@river/i18n'
import type { Updater } from '../src/main/updater'

const t = dict('zh').desktop.update

type Check = Awaited<ReturnType<Updater['checkForUpdates']>>

function fake(check: () => Promise<unknown>) {
  const ee = new EventEmitter()
  const u = Object.assign(ee, {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(check as () => Promise<Check>),
    quitAndInstall: vi.fn()
  })
  return u as unknown as Updater & EventEmitter
}

// ready 是模块状态：每个用例重新加载 updater
async function setup(check: () => Promise<unknown>) {
  vi.resetModules()
  const mod = await import('../src/main/updater')
  const emit = vi.fn()
  const u = fake(check)
  mod.initUpdater(emit, u)
  return { ...mod, emit, u }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const available = (downloadPromise: Promise<unknown>) => async () => ({ isUpdateAvailable: true, updateInfo: { version: '9.9.9' }, downloadPromise })

describe('checkNow', () => {
  it('没有新版本返回 latest', async () => {
    const { checkNow } = await setup(async () => ({ isUpdateAvailable: false, updateInfo: { version: '0.2.1' } }))
    expect(await checkNow()).toEqual({ state: 'latest' })
  })

  it('检查结果为 null 也是 latest', async () => {
    const { checkNow } = await setup(async () => null)
    expect(await checkNow()).toEqual({ state: 'latest' })
  })

  it('有新版本返回 downloading', async () => {
    const { checkNow, emit } = await setup(available(Promise.resolve([])))
    expect(await checkNow()).toEqual({ state: 'downloading', version: '9.9.9' })
    await vi.advanceTimersByTimeAsync(0)
    expect(emit).not.toHaveBeenCalled()
  })

  it('已下载完直接返回 ready，不再检查', async () => {
    const { checkNow, emit, u, readyVersion } = await setup(async () => null)
    u.emit('update-downloaded', { version: '9.9.9' })
    expect(emit).toHaveBeenCalledWith('update:ready', { version: '9.9.9' })
    expect(readyVersion()).toBe('9.9.9')
    expect(await checkNow()).toEqual({ state: 'ready', version: '9.9.9' })
    expect(u.checkForUpdates).not.toHaveBeenCalled()
  })

  it('检查抛错返回本地化 error，不推送 update:error', async () => {
    const { checkNow, emit } = await setup(async () => {
      throw new Error('net::ERR_INTERNET_DISCONNECTED')
    })
    expect(await checkNow()).toEqual({ state: 'error', message: t.checkFailed })
    await vi.advanceTimersByTimeAsync(0)
    expect(emit).not.toHaveBeenCalled()
  })

  it('返回 downloading 后这次下载失败，推送 update:error', async () => {
    let fail!: (e: Error) => void
    const download = new Promise((_, reject) => (fail = reject))
    const { checkNow, emit } = await setup(available(download))
    expect(await checkNow()).toEqual({ state: 'downloading', version: '9.9.9' })
    fail(new Error('boom'))
    await vi.advanceTimersByTimeAsync(0)
    expect(emit).toHaveBeenCalledWith('update:error', { message: t.downloadFailed })
  })
})

describe('后台检查', () => {
  it('updater 的 error 事件只写日志，不推送', async () => {
    const { emit, u } = await setup(async () => null)
    u.emit('error', new Error('background'))
    expect(console.error).toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  it('定时检查失败也不推送', async () => {
    const { emit, u } = await setup(async () => {
      throw new Error('offline')
    })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(u.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(emit).not.toHaveBeenCalled()
  })
})
