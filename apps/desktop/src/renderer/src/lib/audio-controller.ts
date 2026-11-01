import type { TableFeedback } from '../../../shared/types'
import { DEAL_CARD_INTERVAL_MS, DEAL_SOUND_OFFSET_MS } from '@river/ui/deal-timing'

// 样本峰值之后留一点衰减再收尾
const DEAL_SOUND_TAIL_MS = 260

export interface AudioOptions {
  urls: Record<string, string>
  // 每个样本开头的静音长度（秒）；由 scripts/audio-onsets.cjs 一次性算好
  onsets?: Record<string, number>
  createContext?: () => AudioContext
  load?: (url: string) => Promise<ArrayBuffer>
  now?: () => number
  warn?: (error: unknown) => void
}

interface Voice {
  source: AudioScheduledSourceNode
  gain: GainNode
  level: number
  priority: boolean
}

// 发牌是一段有始有终的声音序列：牌发完就收尾，不让它有尾巴
interface DealSession {
  generation: number
  timers: Set<ReturnType<typeof setTimeout>>
  voices: Set<Voice>
  end?: ReturnType<typeof setTimeout>
}

// Independent of React, visibility and IPC replay.
export function createTableAudio(options: AudioOptions) {
  const now = options.now ?? Date.now
  const buffers = new Map<string, AudioBuffer>()
  const voices: Voice[] = []
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let context: AudioContext | undefined
  let master: GainNode | undefined
  let loading: Promise<void> | undefined
  let warned = false
  let enabled = true
  let volume = 50
  let table: string | null = null
  let hand = 0
  let generation = 0
  let duckUntil = 0
  let dealing: DealSession | null = null

  const warn = (error: unknown) => {
    if (warned) return
    warned = true
    const report = options.warn ?? ((e: unknown) => console.warn('River audio unavailable', e))
    report(error)
  }
  const ensureContext = () => {
    if (context) return context
    try {
      context = (options.createContext ?? (() => new AudioContext()))()
      master = context.createGain()
      master.gain.value = enabled ? volume / 100 * 0.65 : 0
      master.connect(context.destination)
      return context
    } catch (error) { warn(error); return undefined }
  }
  const remove = (voice: Voice) => {
    const i = voices.indexOf(voice)
    if (i >= 0) voices.splice(i, 1)
    voice.source.disconnect()
    voice.gain.disconnect()
  }
  const cancel = (voice: Voice) => {
    voice.source.onended = null
    try { voice.source.stop() } catch { /* Already ended. */ }
    remove(voice)
  }
  const stopDeal = () => {
    const session = dealing
    if (!session) return
    dealing = null
    if (session.end) clearTimeout(session.end)
    for (const timer of session.timers) { clearTimeout(timer); timers.delete(timer) }
    session.timers.clear()
    for (const voice of [...session.voices]) cancel(voice)
    session.voices.clear()
  }
  const stop = () => {
    stopDeal()
    generation++
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    for (const voice of [...voices]) cancel(voice)
    duckUntil = 0
  }
  const schedule = (delay: number, action: () => void) => {
    const gen = generation
    const run = () => {
      if (gen === generation && enabled && volume > 0 && context?.state === 'running') action()
    }
    if (delay === 0) return run()
    const timer = setTimeout(() => { timers.delete(timer); run() }, delay)
    timers.add(timer)
  }
  const voice = (source: AudioScheduledSourceNode, level: number, priority = false, offset = 0) => {
    if (!context || !master) return
    if (voices.length >= 4) {
      const victim = voices.find((v) => !v.priority)
      if (!victim) return
      cancel(victim)
    }
    const gain = context.createGain()
    const ducked = !priority && context.currentTime < duckUntil
    gain.gain.value = level * (ducked ? 0.3 : 1)
    if (ducked) gain.gain.linearRampToValueAtTime(level, duckUntil)
    source.connect(gain)
    gain.connect(master)
    const active = { source, gain, level, priority }
    voices.push(active)
    source.onended = () => remove(active)
    try {
      if (offset > 0) (source as AudioBufferSourceNode).start(0, offset)
      else source.start()
    } catch (error) { remove(active); throw error }
    return active
  }
  const sample = (name: string, delay = 0, level = 0.65) => {
    // A decoder finishing later must never replay a missed event.
    const buffer = buffers.get(name)
    if (!buffer) return
    schedule(delay, () => {
      try {
        const source = context!.createBufferSource()
        source.buffer = buffer
        voice(source, level, false, options.onsets?.[name] ?? 0)
      } catch (error) { warn(error) }
    })
  }
  const turn = () => {
    if (!context) return
    duckUntil = context.currentTime + 0.22
    for (const active of voices) {
      if (active.priority) continue
      active.gain.gain.cancelScheduledValues(context.currentTime)
      active.gain.gain.setValueAtTime(active.level * 0.3, context.currentTime)
      active.gain.gain.linearRampToValueAtTime(active.level, duckUntil)
    }
    for (const [index, frequency] of [660, 880].entries()) {
      schedule(index * 100, () => {
        try {
          const oscillator = context!.createOscillator()
          oscillator.type = 'sine'
          oscillator.frequency.value = frequency
          const active = voice(oscillator, 0, true)
          if (!active) return
          const time = context!.currentTime
          active.gain.gain.setValueAtTime(0, time)
          active.gain.gain.linearRampToValueAtTime(0.24, time + 0.008)
          active.gain.gain.linearRampToValueAtTime(0, time + 0.065)
          oscillator.stop(time + 0.07)
        } catch (error) { warn(error) }
      })
    }
  }
  const preload = () => {
    if (loading) return loading
    const ctx = ensureContext()
    if (!ctx) return Promise.resolve()
    const load = options.load ?? (async (url: string) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Audio resource ${response.status}`)
      return response.arrayBuffer()
    })
    loading = Promise.all(Object.entries(options.urls).map(async ([name, url]) => {
      try { buffers.set(name, await ctx.decodeAudioData(await load(url))) }
      catch (error) { warn(error) }
    })).then(() => {})
    return loading
  }
  const prepare = async () => {
    if (!enabled || volume <= 0) return
    const ctx = ensureContext()
    if (!ctx) return
    // Called before the first await, while the user gesture is still active.
    let resumed: Promise<void>
    try { resumed = ctx.resume().catch(warn) } catch (error) { warn(error); return }
    let timeout: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      Promise.all([resumed, preload()]),
      new Promise<void>((resolve) => { timeout = setTimeout(() => { warn(new Error('Audio preparation timed out')); resolve() }, 500) })
    ])
    clearTimeout(timeout)
  }
  const configure = (settings: { soundEnabled: boolean; soundVolume: number }) => {
    enabled = settings.soundEnabled
    volume = Number.isFinite(settings.soundVolume) ? Math.max(0, Math.min(100, settings.soundVolume)) : 50
    if (!enabled || volume === 0) stop()
    if (master) master.gain.value = enabled ? volume / 100 * 0.65 : 0
  }
  const setTable = (tableId: string | null, handNo = 0) => {
    if (table !== tableId || hand !== handNo) stop()
    table = tableId
    hand = handNo
  }
  // 只播放调用方确认过的张数；最后一张落地的时刻收尾，剩余声音不会拖到发牌之后
  const deal = (event: TableFeedback, count: number) => {
    if (!enabled || volume === 0 || context?.state !== 'running' ||
      event.tableId !== table || event.handNo !== hand || now() - event.at > 1000) return
    const buffer = buffers.get('slide')
    const n = Math.min(16, Math.max(0, Math.floor(count)))
    if (!buffer || !n) return
    stopDeal()
    const session: DealSession = { generation, timers: new Set(), voices: new Set() }
    dealing = session
    const playOne = () => {
      if (session.generation !== generation) return
      try {
        const source = context!.createBufferSource()
        source.buffer = buffer
        const active = voice(source, 0.5, false, options.onsets?.slide ?? 0)
        // 已自然结束的 voice 留在集合里无妨，收尾时再取消一次是安全的
        if (active) session.voices.add(active)
      } catch (error) { warn(error) }
    }
    // 与视觉同一节奏逐张起播；样本开头的静音已跳过
    for (let i = 0; i < n; i++) {
      const delay = i * DEAL_CARD_INTERVAL_MS + DEAL_SOUND_OFFSET_MS
      if (delay === 0) { playOne(); continue }
      const timer = setTimeout(() => { session.timers.delete(timer); if (session.generation === generation) playOne() }, delay)
      session.timers.add(timer)
    }
    session.end = setTimeout(() => { if (dealing === session) stopDeal() }, (n - 1) * DEAL_CARD_INTERVAL_MS + DEAL_SOUND_OFFSET_MS + DEAL_SOUND_TAIL_MS)
  }
  const play = (event: TableFeedback) => {
    if (!enabled || volume === 0 || context?.state !== 'running' ||
      event.tableId !== table || event.handNo !== hand || now() - event.at > 1000) return
    switch (event.kind) {
      // 后台等没有牌桌 DOM 的场景只能信事件里的张数；桌面牌桌用 playDeal 传实际张数
      case 'deal': deal(event, event.count ?? 0); break
      case 'board':
        for (let i = 0; i < Math.min(5, Math.max(0, event.count ?? 0)); i++) sample(i % 2 ? 'place2' : 'place1', i * 130, 0.6)
        break
      case 'blind': case 'call': sample(event.seq % 2 ? 'lay1' : 'lay2'); break
      case 'bet': case 'raise': sample('handle'); break
      case 'allin': sample('allin', 0, 0.75); sample('collide', 120, 0.6); break
      case 'fold': sample('fold', 0, 0.55); break
      case 'check': sample('knock1', 0, 0.5); sample('knock2', 100, 0.4); break
      case 'collect': sample('handle', 0, 0.45); break
      case 'showdown': sample('place2', 0, 0.5); break
      case 'payout':
        sample('stack')
        if ((event.heroNet ?? 0) > 0) { sample('stack', 100, 0.45); sample('stack', 200, 0.35) }
        break
      case 'turn': turn(); break
    }
  }
  const preview = async () => {
    const gen = generation
    await prepare()
    if (gen !== generation || !enabled || volume === 0 || context?.state !== 'running') return
    sample('lay1')
    schedule(260, turn)
  }
  return { configure, preload, prepare, setTable, play, playDeal: deal, stop, preview }
}
