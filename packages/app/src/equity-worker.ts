import { FULL, best, shuffle } from '@river/engine'
import type { RoomView } from '@river/protocol'

// 只在底牌全部可见（观战透视/摊牌）时计算；边池直接使用服务端视图里的 pots。
self.onmessage = ({ data: view }: MessageEvent<RoomView>) => {
  const hand = view.hand
  const players = view.participants.filter((p) => p.hole)
  const live = players.filter((p) => !p.folded)
  if (!live.length || live.some((p) => p.hole!.some((slot) => slot.visibility !== 'known'))) {
    self.postMessage({})
    return
  }
  const bySeat = new Map(
    view.participants.filter((p) => p.seatId !== null).map((p) => [p.seatId!, p] as const)
  )
  const holes = new Map(
    live.map((p) => [p.participantId, p.hole!.map((slot) => (slot.visibility === 'known' ? slot.card : ''))])
  )
  const known = new Set([
    ...(hand?.board ?? []),
    ...players.flatMap((p) => p.hole!.filter((slot) => slot.visibility === 'known').map((slot) => slot.card))
  ])
  const remaining = FULL.filter((card) => !known.has(card))
  const layers = (hand?.pots ?? [])
    .map((pot) => ({
      amount: pot.amount,
      eligible: pot.eligibleSeatIds
        .map((seatId) => bySeat.get(seatId))
        .filter((p): p is NonNullable<typeof p> => !!p && !p.folded)
    }))
    .filter((layer) => layer.amount > 0 && layer.eligible.length > 0)
  // 还没有人下注时底池为 0；用等权 1 只作为概率权重，不当作金额展示
  if (!layers.length) layers.push({ amount: 1, eligible: live })
  const total = layers.reduce((sum, layer) => sum + layer.amount, 0)
  const equity: Record<string, number> = Object.fromEntries(live.map((p) => [p.participantId, 0]))
  const board = hand?.board ?? []
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
