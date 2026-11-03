import { DEAL_CARD_INTERVAL_MS } from '@river/ui/deal-timing'

// 与桌面端同一批 Kenney 样本；开头的静音在 start(0, onset) 处跳过。
const URLS = {
  slide: new URL('./assets/card-slide-1.ogg', import.meta.url).href,
  place: new URL('./assets/card-place-1.ogg', import.meta.url).href,
  chips: new URL('./assets/chips-handle-1.ogg', import.meta.url).href
}
const ONSET = { slide: 0.131, place: 0.095, chips: 0.037 }
type Name = keyof typeof URLS

// Web 牌桌只需要发牌、翻牌和筹码三类声音；不复制桌面的音量/闪避/多人声逻辑。
export function createTableAudio() {
  let context: AudioContext | null = null
  let master: GainNode | null = null
  let enabled = true
  let loading: Promise<void> | undefined
  const buffers = new Map<Name, AudioBuffer>()
  let timers: ReturnType<typeof setTimeout>[] = []

  const ensure = () => {
    if (context) return context
    try {
      context = new AudioContext()
      master = context.createGain()
      master.gain.value = 0.32
      master.connect(context.destination)
      return context
    } catch {
      return null
    }
  }
  const load = () => {
    if (loading) return loading
    const ctx = ensure()
    if (!ctx) return Promise.resolve()
    loading = Promise.all(
      (Object.keys(URLS) as Name[]).map(async (name) => {
        try {
          const response = await fetch(URLS[name])
          buffers.set(name, await ctx.decodeAudioData(await response.arrayBuffer()))
        } catch {
          // 单个样本失败只影响这个声音
        }
      })
    ).then(() => {})
    return loading
  }
  const prepare = async () => {
    const ctx = ensure()
    if (!ctx) return
    try {
      await ctx.resume()
    } catch {
      return
    }
    await load()
  }
  const play = (name: Name, delay = 0) => {
    if (!enabled || !context || context.state !== 'running') return
    const buffer = buffers.get(name)
    if (!buffer) return
    const start = () => {
      if (!enabled || !context || context.state !== 'running') return
      const source = context.createBufferSource()
      source.buffer = buffer
      const gain = context.createGain()
      gain.gain.value = 0.5
      source.connect(gain)
      gain.connect(master!)
      source.start(0, ONSET[name])
      source.onended = () => {
        source.disconnect()
        gain.disconnect()
      }
    }
    if (delay === 0) start()
    else timers.push(setTimeout(start, delay))
  }
  const stop = () => {
    for (const timer of timers) clearTimeout(timer)
    timers = []
  }
  const deal = (count: number) => {
    stop()
    const n = Math.min(16, Math.max(0, Math.floor(count)))
    for (let i = 0; i < n; i++) {
      if (i === 0) play('slide')
      else timers.push(setTimeout(() => play('slide'), i * DEAL_CARD_INTERVAL_MS))
    }
  }
  const setEnabled = (value: boolean) => {
    enabled = value
    if (master) master.gain.value = value ? 0.32 : 0
    if (!value) stop()
  }
  return { prepare, play, deal, stop, setEnabled }
}

export type TableAudio = ReturnType<typeof createTableAudio>
