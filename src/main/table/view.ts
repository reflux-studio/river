// Renderer 能看到的一切都经这里裁剪：未摊牌的对手底牌不得离开主进程。
import { PERSONAS } from '../../shared/personas'
import type { BreakerState, CoachAlert, TableView } from '../../shared/types'
import { fmt, signed } from '../../shared/format'
import { legal, pot, type Game } from '../engine/poker'

export interface Nums {
  eq: number
  need: number
  outs: number | null
  handName: string
  sugg: string
}

export interface ViewState {
  game: Game
  thinking: string | null
  paused: boolean
  bubbles: Map<string, { text: string; until: number }>
  autopilotIds: Set<string>
  defaultRaiseTo: number
  nums: Nums | null
  numsKey: string | null
  coachLoading: boolean
  autopilotCount: number
  breaker: BreakerState
  alert: CoachAlert | null
  guided: boolean
  autoNext: boolean
  now: number
}

const persona = (pid?: string) => PERSONAS.find((p) => p.id === pid)

// 摊牌时未弃牌者亮牌（原型 renderVals 第 697 行 reveal 规则）
const revealed = (g: Game, i: number) => g.players[i].isHero || (g.street === 'showdown' && g.showdown && !g.players[i].folded)

export function buildTableView(s: ViewState): TableView {
  const g = s.game
  const hero = g.players[0]
  const heroTurn = !g.done && !g.runout && g.toAct === 0
  const L = legal(g, 0)
  const total = pot(g)
  const bets = g.players.reduce((a, p) => a + p.bet, 0)
  const seats = g.players.map((p, i) => {
    const per = persona(p.personaId)
    const win = g.done ? g.winners?.find((w) => w.id === p.id) : undefined
    const thinking = !!p.personaId && s.thinking === p.personaId
    const myTurn = p.isHero && heroTurn
    let status = ''
    let statusTone: 'muted' | 'blue' | 'green' = 'muted'
    let autopilot = false
    if (thinking) (status = '思考中…'), (statusTone = 'blue')
    else if (win) (status = `赢得 ${fmt(win.amount)}${win.handName ? ' · ' + win.handName : ''}`), (statusTone = 'green')
    else if (p.out) status = '旁观'
    else if (p.folded) status = '已弃牌'
    else if (myTurn) (status = '轮到你'), (statusTone = 'blue')
    else if (g.street === 'showdown' && p.handName) status = p.handName
    else {
      autopilot = !!p.last && s.autopilotIds.has(p.id)
      status = autopilot ? `托管 · ${p.last}` : p.last
    }
    const bubble = p.personaId ? s.bubbles.get(p.personaId) : undefined
    const show = revealed(g, i) && p.hole.length > 0
    return {
      name: p.name,
      ...(p.personaId && { personaId: p.personaId }),
      tag: per?.tag ?? '',
      ini: per?.ini ?? '你',
      hue: per?.hue ?? 255,
      stack: p.stack,
      bet: p.bet,
      isDealer: i === g.dealer,
      folded: p.folded,
      out: p.out,
      allin: p.allin,
      status,
      statusTone,
      autopilot,
      thinking,
      winner: !!win,
      ...(show && { cards: p.hole.slice() }),
      hasCards: !p.folded && !p.out && p.hole.length > 0,
      ...(bubble && bubble.until > s.now && { bubble: bubble.text })
    }
  })
  const r = (x: number) => Math.round(x / g.bb) * g.bb
  const clamp = (x: number) => Math.max(L.minTo, Math.min(L.maxTo, x))
  const presets = (
    [['⅓ 池', 0.33], ['½ 池', 0.5], ['¾ 池', 0.75], ['满池', 1], ['全下', null]] as const
  ).map(([label, f]) => ({ label, to: f === null ? L.maxTo : clamp(g.currentBet + r((total + L.toCall) * f)) }))
  const hw = g.done ? g.winners?.find((w) => w.id === hero.id) : undefined
  const net = hero.stack - hero.startStack
  const nameOf = (id: string) => g.players.find((p) => p.id === id)?.name ?? ''
  return {
    title: `无限注 · ${g.sb}/${g.bb} · ${g.players.length} 人桌`,
    bb: g.bb,
    handNo: g.hand,
    street: g.street,
    board: g.board.slice(),
    pot: total - bets,
    seats,
    hero: { legal: L, toCall: L.toCall, isTurn: heroTurn, defaultRaiseTo: s.defaultRaiseTo, presets },
    paused: s.paused,
    done: g.done,
    runout: g.runout,
    result: g.done && g.winners
      ? {
          text: hw ? `你赢得 ${fmt(hw.amount)}${hw.handName ? ' · ' + hw.handName : ''}` : `${g.winners.map((w) => nameOf(w.id)).join('、')} 赢下这一手`,
          sub: `本手 ${signed(net)} · ${s.autoNext && hero.stack > 0 ? '4 秒后自动发下一手' : '准备好了就发下一手'}`,
          heroWon: !!hw,
          net
        }
      : null,
    heroBust: g.done && hero.stack <= 0,
    // 不是当前决策点算出的数据标 stale（界面显示“数据来自你上一次决策”）
    nums: s.nums && { ...s.nums, stale: !(heroTurn && s.numsKey === `${g.hand}-${g.log.length}`) },
    coachLoading: s.coachLoading,
    autopilotCount: s.autopilotCount,
    breaker: s.breaker,
    alert: s.alert,
    guided: s.guided
  }
}
