import { beforeEach, describe, expect, it, vi } from 'vitest'

const { configure, invoke } = vi.hoisted(() => ({ configure: vi.fn(), invoke: vi.fn() }))
vi.mock('../src/renderer/src/lib/audio', () => ({ audio: { configure } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('window', { river: { invoke } })
})

describe('sound settings acknowledgements', () => {
  it('an older volume response cannot unmute a newer mute intent', async () => {
    const { updateSettings } = await import('../src/renderer/src/lib/river')
    const old = deferred(), recent = deferred()
    invoke.mockReturnValueOnce(old.promise).mockReturnValueOnce(recent.promise)
    const volume = updateSettings({ soundVolume: 20 })
    const oldSnapshot = { ...configure.mock.calls.at(-1)![0] }
    const mute = updateSettings({ soundEnabled: false })
    old.resolve(oldSnapshot)
    await volume
    expect(configure.mock.calls.at(-1)![0].soundEnabled).toBe(false)
    recent.resolve({ ...oldSnapshot, soundEnabled: false })
    await mute
    expect(configure.mock.calls.at(-1)![0].soundEnabled).toBe(false)
  })

  it('an older response cannot roll back the current slider value', async () => {
    const { updateSettings } = await import('../src/renderer/src/lib/river')
    const old = deferred(), recent = deferred()
    invoke.mockReturnValueOnce(old.promise).mockReturnValueOnce(recent.promise)
    const first = updateSettings({ soundVolume: 20 })
    const oldSnapshot = { ...configure.mock.calls.at(-1)![0] }
    const second = updateSettings({ soundVolume: 70 })
    recent.resolve({ ...oldSnapshot, soundVolume: 70 })
    await second
    old.resolve(oldSnapshot)
    await first
    expect(configure.mock.calls.at(-1)![0].soundVolume).toBe(70)
  })
})
