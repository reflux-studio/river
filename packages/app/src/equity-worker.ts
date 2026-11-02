import { FULL, best, shuffle } from '@river/engine'
import type { RoomView } from '@river/protocol'

self.onmessage = ({ data: view }: MessageEvent<RoomView>) => {
  const board = view.hand?.board ?? []
  const players = view.participants.filter((p) => p.hole)
  const live = players.filter((p) => !p.folded)
  if (!live.length || players.some((p) => p.hole!.some((slot) => slot.visibility !== 'known'))) {
    self.postMessage({})
    return
  }
  const holes = new Map(
    players.map((p) => [p.participantId, p.hole!.map((slot) => (slot.visibility === 'known' ? slot.card : ''))])
  )
  const known = new Set([...board, ...[...holes.values()].flat()])
  const remaining = FULL.filter((card) => !known.has(card))
  const layers: Array<{ amount: number; eligible: typeof live }> = []
  let previous = 0
  for (const level of [...new Set(players.map((p) => p.totalIn).filter(Boolean))].sort((a, b) => a - b)) {
    const amount = players.reduce((sum, p) => sum + Math.max(0, Math.min(level, p.totalIn) - previous), 0)
    const eligible = live.filter((p) => p.totalIn >= level)
    layers.push({ amount, eligible: eligible.length ? eligible : live })
    previous = level
  }
  if (!layers.length) layers.push({ amount: 1, eligible: live })
  const total = layers.reduce((sum, layer) => sum + layer.amount, 0)
  const equity: Record<string, number> = Object.fromEntries(live.map((p) => [p.participantId, 0]))
  const iterations = board.length === 5 ? 1 : 500
  for (let i = 0; i < iterations; i++) {
    const runout = [...board, ...shuffle(remaining.slice(), Math.random).slice(0, 5 - board.length)]
    const scores = new Map(live.map((p) => [p.participantId, best([...holes.get(p.participantId)!, ...runout])]))
    for (const layer of layers) {
      const maximum = Math.max(...layer.eligible.map((p) => scores.get(p.participantId)!))
      const winners = layer.eligible.filter((p) => scores.get(p.participantId) === maximum)
      for (const p of winners) equity[p.participantId] += layer.amount / total / winners.length / iterations
    }
  }
  self.postMessage(equity)
}
