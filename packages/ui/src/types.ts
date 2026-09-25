// 纯类型入口：desktop 主进程只能引用这里（ADR-007），不得引入 React 或 JSX
import type { Card, LastAct } from '@river/engine'

export type { LastAct }

export type Felt = 'green' | 'blue' | 'wine' | 'graphite' | 'paper' | 'custom'
export type Back = 'red' | 'blue' | 'black' | 'green'
export type Fx = 'full' | 'lite' | 'off'

export interface SeatView {
  name: string
  personaId?: string
  tag: string
  ini: string
  hue: number
  stack: number
  bet: number
  isDealer: boolean
  isSB: boolean
  isBB: boolean
  folded: boolean
  out: boolean
  allin: boolean
  status: string
  statusTone: 'muted' | 'blue' | 'green' | 'dark' | 'red'
  thinking: boolean
  winner: boolean
  cards?: Card[]
  // 教练局一手结束亮出的弃牌者底牌
  mucked?: boolean
  hasCards: boolean
  bubble?: string
  // 本街最后一个动作（engine lastActs）；加注特效按它触发，不看状态文字
  lastAct?: LastAct
}
