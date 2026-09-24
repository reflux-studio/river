import { LINES, personaOf } from '../../shared/personas'
import type { LineKind, Persona } from '../../shared/types'
import type { Player, Rng } from '../engine/poker'

export interface Say {
  text: string
  kind: 'free' | 'reply'
  replyTo?: string
  source: 'llm' | 'canned'
}

export const REPLY_COOLDOWN_MS = 10_000

// 原型 canned()：全局话痨档位改为按角色健谈度映射概率；预设台词一律按 reply 处理，不引起回应
export function canned(persona: Persona, type: LineKind, rng: Rng): Say | null {
  const prob = persona.talk < 0.2 ? 0.08 : persona.talk < 0.5 ? 0.22 : 0.45
  if (rng() > prob) return null
  const pool = persona.lines[type] ?? LINES[type] ?? []
  return pool.length ? { text: pool[(rng() * pool.length) | 0], kind: 'reply', source: 'canned' } : null
}

// 回应只看健谈度抽样；正在决策的对手不插话（它的队列会被决策抢占，闲聊白跑）
export function pickResponders(players: Player[], o: { from?: string; thinking: string | null; lastTriggered: Map<string, number>; now: number; rng: Rng }): Player[] {
  return players.filter((p) => {
    const pid = p.personaId
    if (!pid || pid === o.from || p.out || pid === o.thinking) return false
    if (o.now - (o.lastTriggered.get(pid) ?? -Infinity) < REPLY_COOLDOWN_MS) return false
    return o.rng() < personaOf(pid)!.talk
  })
}
