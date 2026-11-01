import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationAccess, TurnNotifications, type TurnNotice } from '../src/main/notifications'
import type { ReadyDecision } from '../src/shared/types'

const decision = (overrides: Partial<ReadyDecision> = {}): ReadyDecision => ({
  tableId: 'table-1', decisionId: 'table-1:1:4', handNo: 1, canAct: true, ...overrides
})

function harness() {
  const state = { visible: true, minimized: false, focused: true, supported: true, enabled: true }
  const window = {
    isVisible: () => state.visible,
    isMinimized: () => state.minimized,
    isFocused: () => state.focused,
    restore: vi.fn(() => { state.minimized = false }),
    show: vi.fn(() => { state.visible = true }),
    focus: vi.fn(() => { state.focused = true })
  }
  const notices: Array<TurnNotice & { click(): void; shown(): void; fail(error: unknown): void; clickCallbacks: Array<() => void> }> = []
  const createNotice = vi.fn(() => {
    const clicks = new Set<() => void>()
    const failures = new Set<(error: unknown) => void>()
    const shows = new Set<() => void>()
    const n = {
      show: vi.fn(), close: vi.fn(), clickCallbacks: [] as Array<() => void>,
      click: () => clicks.forEach((cb) => cb()),
      fail: (e: unknown) => failures.forEach((cb) => cb(e)),
      shown: () => shows.forEach((cb) => cb()),
      onClick: (cb: () => void) => { clicks.add(cb); n.clickCallbacks.push(cb); return () => { clicks.delete(cb) } },
      onFailed: (cb: (e: unknown) => void) => { failures.add(cb); return () => { failures.delete(cb) } },
      onShow: (cb: () => void) => { shows.add(cb); return () => { shows.delete(cb) } }
    }
    notices.push(n)
    return n
  })
  const showTable = vi.fn()
  const onError = vi.fn()
  const onStatus = vi.fn()
  const manager = new TurnNotifications({
    enabled: () => state.enabled,
    window: () => window, isSupported: () => state.supported, createNotice,
    body: () => '轮到你了', showTable, onError, onStatus
  })
  return { manager, state, window, createNotice, notices, showTable, onError, onStatus }
}

describe('轮到你系统通知', () => {
  it('看着牌桌时不弹，失焦后同一决策首次弹出静音通知', () => {
    const h = harness()
    h.manager.setTableVisible(true)
    h.manager.setDecision(decision())
    expect(h.notices).toHaveLength(0)
    h.state.focused = false
    h.manager.refresh()
    expect(h.createNotice).toHaveBeenCalledWith({ title: 'River', body: '轮到你了', silent: true })
    expect(h.notices[0].show).toHaveBeenCalledOnce()
  })

  it('关闭后台提醒后不再发通知，已经弹出的会收起', () => {
    const h = harness()
    h.manager.setTableVisible(true)
    h.manager.setDecision(decision())
    h.state.focused = false
    h.manager.refresh()
    expect(h.notices).toHaveLength(1)
    h.state.enabled = false
    h.manager.refresh()
    expect(h.notices[0].close).toHaveBeenCalledOnce()
    h.manager.setDecision(decision({ decisionId: 'table-1:1:8' }))
    expect(h.notices).toHaveLength(1)
    h.state.enabled = true
    h.manager.refresh()
    expect(h.notices).toHaveLength(2)
  })

  it('教练未解锁不弹，解锁只弹一次，问答锁定恢复及反复焦点不重复', () => {
    const h = harness()
    h.manager.setDecision(decision({ canAct: false }))
    expect(h.notices).toHaveLength(0)
    h.manager.setDecision(decision())
    expect(h.notices).toHaveLength(1)
    h.manager.setDecision(decision({ canAct: false }))
    expect(h.notices[0].close).toHaveBeenCalledOnce()
    h.manager.setDecision(decision())
    h.manager.setTableVisible(true)
    h.state.focused = false
    h.manager.refresh()
    expect(h.notices).toHaveLength(1)
    h.manager.setDecision(decision({ decisionId: 'table-1:1:6' }))
    expect(h.notices).toHaveLength(2)
  })

  it.each(['hidden', 'minimized', 'other-page'] as const)('%s 时不依赖失焦也会通知', (mode) => {
    const h = harness()
    h.manager.setTableVisible(mode !== 'other-page')
    h.state.visible = mode !== 'hidden'
    h.state.minimized = mode === 'minimized'
    h.manager.setDecision(decision())
    expect(h.notices).toHaveLength(1)
  })

  it('点击恢复窗口并跳转当前桌；陈旧桌通知不跳旧桌', () => {
    const h = harness()
    h.manager.setDecision(decision())
    const click = h.notices[0].clickCallbacks[0]
    h.state.minimized = true
    h.notices[0].click()
    expect(h.window.restore).toHaveBeenCalledOnce()
    expect(h.window.show).toHaveBeenCalledOnce()
    expect(h.window.focus).toHaveBeenCalledOnce()
    expect(h.showTable).toHaveBeenCalledExactlyOnceWith('table-1')
    h.manager.setDecision(decision({ tableId: 'table-2', decisionId: 'table-2:1:4' }))
    click()
    expect(h.showTable).toHaveBeenCalledTimes(1)
  })

  it('不支持、show抛错或failed事件不阻塞，同决策不反复重试', () => {
    const h = harness()
    h.state.supported = false
    expect(() => h.manager.setDecision(decision())).not.toThrow()
    h.state.supported = true
    h.manager.refresh()
    expect(h.notices).toHaveLength(0)
    h.manager.setDecision(decision({ decisionId: 'next' }))
    h.notices[0].fail('denied')
    h.manager.refresh()
    expect(h.onError).toHaveBeenCalledWith('denied')
    expect(h.notices).toHaveLength(1)

    h.createNotice.mockImplementationOnce(() => { throw new Error('not allowed') })
    expect(() => h.manager.setDecision(decision({ decisionId: 'next-next' }))).not.toThrow()
    h.manager.refresh()
    expect(h.createNotice).toHaveBeenCalledTimes(2)
  })

  it('离桌及退出清理通知和监听，退出后不再创建', () => {
    const h = harness()
    h.manager.setDecision(decision())
    h.manager.setDecision(null)
    expect(h.notices[0].close).toHaveBeenCalledOnce()
    h.notices[0].click()
    expect(h.window.focus).not.toHaveBeenCalled()
    h.manager.setDecision(decision({ decisionId: 'again' }))
    h.manager.dispose()
    h.manager.setDecision(decision({ decisionId: 'after-dispose' }))
    expect(h.notices).toHaveLength(2)
    expect(h.notices[1].close).toHaveBeenCalledOnce()
  })

  it('原生show失败时清理通知，不抛错也不重试当前决策', () => {
    const h = harness()
    const original = h.createNotice.getMockImplementation()!
    h.createNotice.mockImplementationOnce(() => {
      const n = original()
      n.show.mockImplementation(() => { throw new Error('native show denied') })
      return n
    })
    expect(() => h.manager.setDecision(decision())).not.toThrow()
    h.manager.refresh()
    expect(h.notices).toHaveLength(1)
    expect(h.notices[0].close).toHaveBeenCalledOnce()
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'native show denied' }))
  })

  it('系统拒绝通知时把失败交给界面，不能只写日志', () => {
    const h = harness()
    h.manager.setDecision(decision())
    h.notices[0].fail('未能完成操作。(UNErrorDomain错误1。)')
    expect(h.onStatus).toHaveBeenCalledWith({ state: 'failed', error: '未能完成操作。(UNErrorDomain错误1。)' })
    h.manager.setDecision(decision({ decisionId: 'next' }))
    h.notices[1].shown()
    expect(h.onStatus).toHaveBeenLastCalledWith({ state: 'scheduled' })
  })
})

afterEach(() => vi.useRealTimers())

describe('原生通知准备与测试', () => {
  function accessHarness() {
    const shown = new Set<() => void>()
    const failed = new Set<(error: unknown) => void>()
    const notice: TurnNotice = {
      show: vi.fn(), close: vi.fn(), onClick: () => () => {},
      onShow: (cb) => { shown.add(cb); return () => { shown.delete(cb) } },
      onFailed: (cb) => { failed.add(cb); return () => { failed.delete(cb) } }
    }
    const onStatus = vi.fn()
    const isSupported = vi.fn(() => true)
    const createNotice = vi.fn(() => notice)
    const access = new NotificationAccess({ platform: 'darwin', isSupported, createNotice, testBody: () => '测试后台提醒', onStatus })
    return { access, notice, createNotice, onStatus, isSupported, shown, failed }
  }

  it('准备仅初始化系统授权请求，不发送通知、不虚报已获授权', () => {
    const h = accessHarness()
    expect(h.access.getStatus()).toMatchObject({ state: 'unknown', supported: null, permission: 'unknown' })
    expect(h.access.prepare()).toMatchObject({ state: 'prepared', supported: true, permission: 'unknown' })
    expect(h.isSupported).toHaveBeenCalledOnce()
    expect(h.createNotice).not.toHaveBeenCalled()
  })

  it('notAllowed失败保持权限unknown；允许后重新测试可清除错误但只称排程成功', async () => {
    vi.useFakeTimers()
    const h = accessHarness()
    const first = h.access.test()
    h.failed.forEach((cb) => cb('UNErrorDomain error 1'))
    expect(await first).toMatchObject({ state: 'failed', permission: 'unknown', error: 'UNErrorDomain error 1' })
    const second = h.access.test()
    h.shown.forEach((cb) => cb())
    expect(await second).toMatchObject({ state: 'scheduled', permission: 'unknown' })
    expect(h.access.getStatus().error).toBeUndefined()
    // 排程成功后保留横幅让用户观察，而不是 show 回调里马上关闭。
    expect(h.notice.close).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10000)
    expect(h.notice.close).toHaveBeenCalledTimes(2)
  })

  it('测试通知不接入牌桌点击，5秒无结果即返回而不悬挂', async () => {
    vi.useFakeTimers()
    const h = accessHarness()
    const first = h.access.test()
    const second = h.access.test()
    expect(h.createNotice).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(5000)
    expect(await first).toMatchObject({ state: 'failed', error: 'notification-test-timeout' })
    expect(await second).toMatchObject({ state: 'failed' })
    expect(h.notice.close).toHaveBeenCalledOnce()
  })

  it('测试发送异常或退出会完成请求并清理，超时后的旧show不能清除错误', async () => {
    vi.useFakeTimers()
    const h = accessHarness()
    const failShow = vi.fn(() => { throw new Error('cannot schedule') })
    h.notice.show = failShow
    expect(await h.access.test()).toMatchObject({ state: 'failed', error: 'cannot schedule' })
    h.notice.show = vi.fn()
    const testing = h.access.test()
    const lateShow = [...h.shown][0]
    h.access.dispose()
    expect(await testing).toMatchObject({ state: 'failed', error: 'notification-test-cancelled' })
    lateShow()
    expect(h.access.getStatus()).toMatchObject({ state: 'failed' })
  })
})
