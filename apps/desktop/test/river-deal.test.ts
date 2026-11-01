import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bootstrap, TableFeedback, TableView } from '../src/shared/types'

const { audio, callbacks } = vi.hoisted(() => ({
  audio: { configure: vi.fn(), setTable: vi.fn(), play: vi.fn(), playDeal: vi.fn(), prepare: vi.fn(async () => {}), preload: vi.fn(async () => {}) },
  callbacks: new Map<string, (value: unknown) => void>()
}))
vi.mock('../src/renderer/src/lib/audio', () => ({ audio }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const view = { tableId: 'new', handNo: 1 } as TableView
const deal: TableFeedback = { tableId: 'new', handNo: 1, seq: 1, at: Date.now(), kind: 'deal', count: 6 }
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  callbacks.clear()
  const bootstrap = { ready: true, view: null, viewRevision: 0, feedback: { tableId: null, seq: 0 },
    settings: { soundEnabled: true, soundVolume: 50, notificationsEnabled: true, locale: 'zh', models: {} }, chat: [], coachThread: [], onboarded: true
  } as unknown as Bootstrap
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    river: { on: (name: string, cb: (data: unknown) => void) => { callbacks.set(name, cb); return () => {} }, invoke: async (name: string) => name === 'app.bootstrap' ? bootstrap : undefined }
  })
})

describe('dealing sound follows the mounted table animation', () => {
  it('waits for the first-hand visual start, then consumes it once', async () => {
    const river = await import('../src/renderer/src/lib/river')
    await river.init()
    river.go('table')
    callbacks.get('table:view')!({ revision: 1, view })
    callbacks.get('table:feedback')!({ ...deal, at: Date.now() })
    expect(audio.play).not.toHaveBeenCalled()
    river.startDealSound('new:1', 6)
    expect(audio.playDeal).toHaveBeenCalledTimes(1)
    expect(audio.playDeal).toHaveBeenCalledWith(expect.objectContaining({ tableId: 'new', handNo: 1, count: 6 }), 6)
    river.startDealSound('new:1', 6)
    river.go('settings')
    river.go('table')
    expect(audio.playDeal).toHaveBeenCalledTimes(1)
  })

  it('plays background deals immediately and does not replay them on page return', async () => {
    const river = await import('../src/renderer/src/lib/river')
    await river.init()
    callbacks.get('table:view')!({ revision: 1, view })
    callbacks.get('table:feedback')!({ ...deal, at: Date.now() })
    expect(audio.play).toHaveBeenCalledTimes(1)
    river.go('table')
    river.startDealSound('new:1', 6)
    // 后台已经播过，回到牌桌时不再补一声
    expect(audio.playDeal).not.toHaveBeenCalled()
  })

  it('does not lose a live deal when the page is left before React mounts it', async () => {
    const river = await import('../src/renderer/src/lib/river')
    await river.init()
    river.go('table')
    callbacks.get('table:view')!({ revision: 1, view })
    callbacks.get('table:feedback')!({ ...deal, at: Date.now() })
    expect(audio.play).not.toHaveBeenCalled()
    river.go('settings')
    expect(audio.play).toHaveBeenCalledTimes(1)
    river.startDealSound('new:1', 6)
    expect(audio.playDeal).not.toHaveBeenCalled()
  })
})
