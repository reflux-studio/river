import type { NotificationStatus, ReadyDecision } from '../shared/types'

export interface NoticeWindow {
  isVisible(): boolean
  isMinimized(): boolean
  isFocused(): boolean
  restore(): void
  show(): void
  focus(): void
}

export interface TurnNotice {
  show(): void
  close(): void
  onClick(callback: () => void): () => void
  onFailed(callback: (error: unknown) => void): () => void
  onShow?(callback: () => void): () => void
}

export interface TurnNotificationDeps {
  // 设置页关闭后台提醒后不再发通知，已经在显示的那条也要收起
  enabled?(): boolean
  window(): NoticeWindow | null
  isSupported(): boolean
  createNotice(options: { title: string; body: string; silent: boolean }): TurnNotice
  body(): string
  showTable(tableId: string): void
  onError(error: unknown): void
  onStatus?(status: { state: 'scheduled' | 'failed' | 'unsupported'; error?: string }): void
}

export interface NotificationAccessDeps {
  platform: string
  isSupported(): boolean
  createNotice(options: { title: string; body: string; silent: boolean }): TurnNotice
  testBody(): string
  onStatus(status: NotificationStatus): void
}

export class NotificationAccess {
  private status: NotificationStatus
  private testing: Promise<NotificationStatus> | null = null
  private cancelTest: (() => void) | null = null
  private disposed = false
  private deliveredTests = new Map<TurnNotice, ReturnType<typeof setTimeout>>()
  constructor(private deps: NotificationAccessDeps) {
    this.status = { revision: 0, state: 'unknown', supported: null, permission: 'unknown', platform: deps.platform }
  }
  getStatus() { return { ...this.status } }

  prepare() {
    if (this.disposed) return this.getStatus()
    try {
      // macOS 上首次调用会初始化 Electron presenter，启动其原生异步授权请求。
      // 返回 true 只说明系统支持通知，不说明 UNUserNotificationCenter 已获授权。
      const supported = this.deps.isSupported()
      this.status = { ...this.status, supported }
      if (!supported) this.report({ state: 'unsupported' })
      else if (this.status.state === 'unknown' || this.status.state === 'unsupported') this.publish({ state: 'prepared' })
    } catch (error) {
      this.report({ state: 'failed', error: errorText(error) })
    }
    return this.getStatus()
  }

  test(): Promise<NotificationStatus> {
    if (this.testing) return this.testing
    const prepared = this.prepare()
    if (this.disposed || !prepared.supported) return Promise.resolve(prepared)
    let resolve!: (status: NotificationStatus) => void
    const promise = new Promise<NotificationStatus>((done) => { resolve = done })
    this.testing = promise
    let notice: TurnNotice | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanup: Array<() => void> = []
    let finished = false
    const finish = (result: { state: 'scheduled' | 'failed'; error?: string }) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      for (const unsubscribe of cleanup) unsubscribe()
      if (notice && result.state === 'scheduled') {
        const delivered = notice
        this.deliveredTests.set(delivered, setTimeout(() => {
          this.deliveredTests.delete(delivered)
          try { delivered.close() } catch { /* 系统已移除时无需影响状态。 */ }
        }, 10000))
      } else {
        try { notice?.close() } catch { /* 清理失败也必须完成测试请求。 */ }
      }
      this.testing = null
      this.cancelTest = null
      this.report(result)
      resolve(this.getStatus())
    }
    this.cancelTest = () => finish({ state: 'failed', error: 'notification-test-cancelled' })
    try {
      notice = this.deps.createNotice({ title: 'River', body: this.deps.testBody(), silent: true })
      const unsubscribeShow = notice.onShow?.(() => finish({ state: 'scheduled' }))
      if (unsubscribeShow) cleanup.push(unsubscribeShow)
      cleanup.push(notice.onFailed((error) => finish({ state: 'failed', error: errorText(error) })))
      timer = setTimeout(() => finish({ state: 'failed', error: 'notification-test-timeout' }), 5000)
      // 测试没有 onClick，也不使用 ReadyDecision，避免跳入牌局或消费轮次提醒。
      notice.show()
    } catch (error) {
      finish({ state: 'failed', error: errorText(error) })
    }
    return promise
  }

  report(status: { state: 'scheduled' | 'failed' | 'unsupported'; error?: string }) {
    this.publish(status)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.cancelTest?.()
    for (const [notice, timer] of this.deliveredTests) {
      clearTimeout(timer)
      try { notice.close() } catch { /* 退出不能等待系统通知清理。 */ }
    }
    this.deliveredTests.clear()
  }

  private publish(status: { state: NotificationStatus['state']; error?: string }) {
    this.status = { ...this.status, ...status, revision: this.status.revision + 1, error: status.error }
    this.deps.onStatus(this.getStatus())
  }
}

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

export class TurnNotifications {
  private decision: ReadyDecision | null = null
  private tableVisible = false
  private notified: string | null = null
  private active: { notice: TurnNotice; cleanup: Array<() => void> } | null = null
  private disposed = false

  constructor(private deps: TurnNotificationDeps) {}

  setDecision(decision: ReadyDecision | null) {
    if (this.disposed) return
    const changed = this.key(decision) !== this.key(this.decision)
    if (changed || !decision?.canAct) this.clearNotice()
    if (changed) this.notified = null
    this.decision = decision
    this.refresh()
  }

  setTableVisible(visible: boolean) {
    this.tableVisible = visible
    this.refresh()
  }

  refresh() {
    if (this.disposed) return
    if (this.deps.enabled?.() === false) {
      // 关掉开关后清掉当前那条；重新打开时同一个决策点还能再提醒
      this.notified = null
      this.clearNotice()
      return
    }
    const decision = this.decision
    if (!decision?.canAct) return
    const key = this.key(decision)
    if (this.notified === key) return
    try {
      const window = this.deps.window()
      if (!window) return
      if (this.tableVisible && window.isVisible() && !window.isMinimized() && window.isFocused()) return
      // 一次尝试即消费该决策；权限失败或后台反复切换不能形成通知风暴。
      this.notified = key
      if (!this.deps.isSupported()) {
        this.deps.onStatus?.({ state: 'unsupported' })
        return
      }
      const notice = this.deps.createNotice({ title: 'River', body: this.deps.body(), silent: true })
      const cleanup = [
        notice.onClick(() => {
          if (this.disposed) return
          try {
            const currentWindow = this.deps.window()
            if (!currentWindow) return
            if (currentWindow.isMinimized()) currentWindow.restore()
            currentWindow.show()
            currentWindow.focus()
            // 系统可能延迟派发点击。旧桌只能恢复应用，不能打开已经失效的桌。
            if (this.decision?.tableId === decision.tableId) this.deps.showTable(decision.tableId)
          } catch (error) {
            this.deps.onError(error)
          }
        }),
        notice.onFailed((error) => {
          this.deps.onError(error)
          this.deps.onStatus?.({ state: 'failed', error: errorText(error) })
          if (this.active?.notice === notice) this.clearNotice()
        })
      ]
      const unsubscribeShow = notice.onShow?.(() => this.deps.onStatus?.({ state: 'scheduled' }))
      if (unsubscribeShow) cleanup.push(unsubscribeShow)
      this.active = { notice, cleanup }
      notice.show()
    } catch (error) {
      this.clearNotice()
      this.deps.onError(error)
      this.deps.onStatus?.({ state: 'failed', error: errorText(error) })
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.decision = null
    this.notified = null
    this.clearNotice()
  }

  private key(decision: ReadyDecision | null) {
    return decision ? `${decision.tableId}:${decision.decisionId}` : null
  }

  private clearNotice() {
    const active = this.active
    this.active = null
    if (!active) return
    for (const cleanup of active.cleanup) cleanup()
    try {
      active.notice.close()
    } catch (error) {
      this.deps.onError(error)
    }
  }
}
