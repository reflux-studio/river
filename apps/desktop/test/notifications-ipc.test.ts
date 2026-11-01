import { describe, expect, it, vi } from 'vitest'
import { commandHandlers, type AppInfo } from '../src/main/ipc'
import type { TableRunner } from '../src/main/table/runner'
import type { NotificationStatus } from '../src/shared/types'

describe('通知设置 IPC', () => {
  it('状态、准备、测试和显式设置入口交给主进程适配器，不调用牌局', async () => {
    const status: NotificationStatus = { revision: 1, state: 'prepared', supported: true, permission: 'unknown', platform: 'darwin' }
    const app: AppInfo = {
      version: () => '0.3.0', update: () => null, install: () => {},
      check: async () => ({ state: 'latest' }), fx: () => null, packaged: false,
      notificationStatus: vi.fn(() => status), prepareNotifications: vi.fn(() => status),
      testNotifications: vi.fn(async () => ({ ...status, state: 'scheduled' as const })),
      openNotificationSettings: vi.fn(async () => {})
    }
    const handlers = commandHandlers({} as TableRunner, app)
    expect(handlers['notification.status']()).toMatchObject({ permission: 'unknown', platform: 'darwin' })
    expect(handlers['notification.prepare']()).toMatchObject({ state: 'prepared' })
    expect(await handlers['notification.test']()).toMatchObject({ state: 'scheduled', permission: 'unknown' })
    expect(app.openNotificationSettings).not.toHaveBeenCalled()
    await handlers['notification.openSettings']()
    expect(app.openNotificationSettings).toHaveBeenCalledOnce()
  })
})
