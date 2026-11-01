import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEAL_SOUND_OFFSET_MS } from '@river/ui/deal-timing'
import { createTableAudio } from '../src/renderer/src/lib/audio-controller'
import type { TableFeedback } from '../src/shared/types'

class Param {
  value = 1
  ramps: { value: number; time: number }[] = []
  setValueAtTime(value: number) { this.value = value }
  linearRampToValueAtTime(value: number, time = 0) { this.value = value; this.ramps.push({ value, time }) }
  cancelScheduledValues() {}
}
class Source {
  buffer?: { name: string }
  frequency = new Param()
  type = 'sine'
  stopped = false
  started = false
  startArgs: unknown[] = []
  onended: (() => void) | null = null
  connect() {}
  disconnect() {}
  start(...args: unknown[]) { this.started = true; this.startArgs = args }
  stop(at?: number) { if (at !== undefined) return; this.stopped = true; this.onended?.() }
}
class Context {
  state = 'running'
  currentTime = 0
  destination = {}
  sources: Source[] = []
  gains: { gain: Param }[] = []
  resume = vi.fn(async () => { this.state = 'running' })
  createGain() { const g = { gain: new Param(), connect() {}, disconnect() {} }; this.gains.push(g); return g }
  createBufferSource() { const s = new Source(); this.sources.push(s); return s }
  createOscillator() { return this.createBufferSource() }
  async decodeAudioData(data: ArrayBuffer) { return { name: String(new Uint8Array(data)[0]) } }
}

const names = ['slide', 'place1', 'place2', 'lay1', 'lay2', 'handle', 'allin', 'collide', 'fold', 'stack', 'knock1', 'knock2']
const urls = Object.fromEntries(names.map((name, i) => [name, String(i)]))
const event = (kind: TableFeedback['kind'], extra: Partial<TableFeedback> = {}): TableFeedback => ({
  tableId: 'table', handNo: 1, seq: 1, at: Date.now(), kind, ...extra
})
function harness(load = async (url: string) => new Uint8Array([Number(url)]).buffer, onsets?: Record<string, number>) {
  const context = new Context()
  const warn = vi.fn()
  const audio = createTableAudio({ urls, onsets, createContext: () => context as unknown as AudioContext, load, warn })
  audio.setTable('table', 1)
  return { audio, context, warn }
}

afterEach(() => vi.useRealTimers())

describe('牌桌音频', () => {
  it('发牌声随起飞立即起音，逐张间隔170ms', async () => {
    vi.useFakeTimers()
    const { audio, context } = harness()
    await audio.preload()
    audio.play(event('deal', { count: 6 }))
    // 样本开头的静音已在解码时跳过，第一张立即发声
    expect(context.sources).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(169)
    expect(context.sources).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(context.sources).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(680)
    expect(context.sources).toHaveLength(6)
  })

  it('按常量跳过样本开头的静音，发牌和其他音效都生效', async () => {
    const { audio, context } = harness(undefined, { slide: 0.131, lay1: 0.042 })
    await audio.preload()
    audio.playDeal(event('deal'), 1)
    expect(context.sources[0].startArgs).toEqual([0, 0.131])
    audio.play(event('blind'))
    expect(context.sources.at(-1)!.startArgs).toEqual([0, 0.042])
  })
  it('桌面发牌只按实际飞出的牌数播放，并在最后一张落地后收尾', async () => {
    vi.useFakeTimers()
    const { audio, context } = harness()
    await audio.preload()
    // 事件里的 count 是主进程算的，桌面以 UI 实际动画张数为准
    audio.playDeal(event('deal', { count: 12 }), 3)
    await vi.advanceTimersByTimeAsync(DEAL_SOUND_OFFSET_MS + 340)
    expect(context.sources).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(2000)
    expect(context.sources).toHaveLength(3)
    expect(context.sources.every(s => s.stopped)).toBe(true)
  })

  it('静音立即停止在播声音并取消发牌序列，恢复后不补播', async () => {
    vi.useFakeTimers()
    const { audio, context } = harness()
    await audio.preload()
    audio.play(event('deal', { count: 12 }))
    await vi.advanceTimersByTimeAsync(DEAL_SOUND_OFFSET_MS)
    expect(context.sources.filter(s => s.started)).toHaveLength(1)
    audio.configure({ soundEnabled: false, soundVolume: 50 })
    expect(context.sources.every(s => s.stopped)).toBe(true)
    await vi.runAllTimersAsync()
    audio.configure({ soundEnabled: true, soundVolume: 50 })
    expect(context.sources).toHaveLength(1)
  })

  it('切手和离桌取消旧序列，同一牌桌视图更新不会打断声音', async () => {
    vi.useFakeTimers()
    const { audio, context } = harness()
    await audio.preload()
    audio.play(event('board', { count: 3 }))
    audio.setTable('table', 1)
    expect(context.sources[0].stopped).toBe(false)
    await vi.advanceTimersByTimeAsync(130)
    expect(context.sources).toHaveLength(2)
    audio.setTable('table', 2)
    await vi.runAllTimersAsync()
    expect(context.sources).toHaveLength(2)
    expect(context.sources.every(s => s.stopped)).toBe(true)
    audio.play(event('call', { handNo: 2 }))
    expect(context.sources).toHaveLength(3)
    audio.setTable(null)
    expect(context.sources.every(s => s.stopped)).toBe(true)
  })

  it('过期、非当前桌、旧手、静音和0音量事件都不播放', async () => {
    const { audio, context } = harness()
    await audio.preload()
    audio.play(event('call', { at: Date.now() - 1001 }))
    audio.play(event('call', { tableId: 'old' }))
    audio.play(event('call', { handNo: 0 }))
    audio.configure({ soundEnabled: true, soundVolume: 0 })
    audio.play(event('call'))
    audio.configure({ soundEnabled: false, soundVolume: 100 })
    audio.play(event('call'))
    expect(context.sources).toHaveLength(0)
    audio.configure({ soundEnabled: true, soundVolume: 50 })
    audio.play(event('call'))
    expect(context.sources).toHaveLength(1)
  })

  it('All-in只使用加强筹码组合；平分和亏损没有获胜点缀', async () => {
    vi.useFakeTimers()
    const { audio, context } = harness()
    await audio.preload()
    audio.play(event('allin'))
    await vi.advanceTimersByTimeAsync(120)
    expect(context.sources.map(s => s.buffer?.name)).toEqual(['6', '7'])
    audio.stop()
    context.sources = []
    audio.play(event('payout', { heroNet: 0 }))
    await vi.runAllTimersAsync()
    expect(context.sources).toHaveLength(1)
    audio.stop()
    context.sources = []
    audio.play(event('payout', { heroNet: -100 }))
    await vi.runAllTimersAsync()
    expect(context.sources).toHaveLength(1)
    audio.stop()
    context.sources = []
    audio.play(event('payout', { heroNet: 100 }))
    await vi.runAllTimersAsync()
    expect(context.sources).toHaveLength(3)
  })

  it('并发最多4个声音，优先保留操作提醒', async () => {
    vi.useFakeTimers()
    const { audio, context } = harness()
    await audio.preload()
    for (let i = 0; i < 4; i++) audio.play(event('call', { seq: i }))
    audio.play(event('turn'))
    const firstTone = context.sources.at(-1)!
    audio.play(event('raise'))
    await vi.advanceTimersByTimeAsync(100)
    expect(firstTone.stopped).toBe(false)
    expect(context.sources.filter(s => s.started && !s.stopped)).toHaveLength(4)
    expect(context.sources.filter(s => !s.buffer && s.started)).toHaveLength(2)
  })

  it('操作提醒期间新开始的桌面声只临时压低，随后恢复正常增益', async () => {
    const { audio, context } = harness()
    await audio.preload()
    audio.play(event('turn'))
    audio.play(event('raise'))
    expect(context.gains.at(-1)!.gain.ramps).toContainEqual({ value: 0.65, time: 0.22 })
    audio.stop()
  })

  it('声音准备同步resume，在500ms内解码完成后可播放首手', async () => {
    vi.useFakeTimers()
    const { audio, context } = harness(url => new Promise(resolve => setTimeout(() => resolve(new Uint8Array([Number(url)]).buffer), 200)))
    const ready = vi.fn()
    const prepared = audio.prepare().then(ready)
    expect(context.resume).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(199)
    expect(ready).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await prepared
    audio.play(event('deal', { count: 2 }))
    await vi.advanceTimersByTimeAsync(DEAL_SOUND_OFFSET_MS)
    expect(context.sources).toHaveLength(1)
  })

  it('超时和失败不阻塞，迟到的解码不补播旧声音，失败日志限量', async () => {
    vi.useFakeTimers()
    const { audio, context, warn } = harness(url => new Promise(resolve => setTimeout(() => resolve(new Uint8Array([Number(url)]).buffer), 800)))
    const prepared = audio.prepare()
    await vi.advanceTimersByTimeAsync(500)
    await prepared
    audio.play(event('deal', { count: 2 }))
    await vi.advanceTimersByTimeAsync(300)
    expect(context.sources).toHaveLength(0)
    audio.play(event('call'))
    expect(context.sources).toHaveLength(1)
    expect(warn).toHaveBeenCalledTimes(1)
    const failed = harness(async () => { throw new Error('missing') })
    await failed.audio.prepare()
    failed.audio.play(event('call'))
    expect(failed.context.sources).toHaveLength(0)
    expect(failed.warn).toHaveBeenCalledTimes(1)
  })

  it('系统暂停时不发声，下一手势恢复后只播放新事件', async () => {
    const { audio, context } = harness()
    await audio.preload()
    context.state = 'suspended'
    audio.play(event('call'))
    expect(context.sources).toHaveLength(0)
    await audio.prepare()
    expect(context.sources).toHaveLength(0)
    audio.play(event('check'))
    expect(context.sources).toHaveLength(1)
    audio.stop()
  })

  it('试听遵守声音开关并可被静音立即取消', async () => {
    vi.useFakeTimers()
    const { audio, context } = harness()
    await audio.preload()
    await audio.preview()
    expect(context.sources).toHaveLength(1)
    audio.configure({ soundEnabled: false, soundVolume: 50 })
    await vi.runAllTimersAsync()
    await audio.preview()
    expect(context.sources).toHaveLength(1)
    expect(context.sources[0].stopped).toBe(true)
  })
})
