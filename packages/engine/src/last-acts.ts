import type { LogEntry } from './table'
import type { Street } from './types'

export type LastAct = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'

// 各座位在 street 这一街的最后一个动作；未全下的盲注和退回记录不算动作
export function lastActs(log: LogEntry[], street: Street): Map<number, LastAct> {
  const out = new Map<number, LastAct>()
  for (const e of log) {
    if (!('seat' in e) || e.street !== street || e.type === 'return') continue
    if (e.allIn) out.set(e.seat, 'allin')
    else if (e.type !== 'blind') out.set(e.seat, e.type)
  }
  return out
}
