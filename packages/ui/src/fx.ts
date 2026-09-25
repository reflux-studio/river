// 牌桌动效：对比前后两次视图，用 Web Animations 播放。移植自设计稿 runFx（River v2 脚本 486–588 行）。
// 完整：发牌、翻牌、气泡、筹码飞行、加注与全下特效、弃牌、赢家收筹码；精简：只保留发牌、翻牌和气泡；关闭：都不播
import type { Card } from '@river/engine'
import { useEffect, useRef, type RefObject } from 'react'
import { backOf, chipBg, chipEdge, DENOM } from './felt'
import type { Back, Fx, SeatView } from './types'

type Pt = { x: number; y: number }
// 元素，或已换算好的舞台坐标（如上一帧记下的下注位置）
type Where = Element | Pt | null

// 舞台可能被外层 transform: scale 缩放；特效层在舞台内部，位移要用缩放前的坐标
const scaleOf = (root: HTMLElement) => (root.offsetWidth ? root.getBoundingClientRect().width / root.offsetWidth : 1)

// 元素中心相对舞台左上角的坐标（缩放前）
export function stagePt(root: HTMLElement, el: Element): Pt {
  const k = scaleOf(root)
  const a = root.getBoundingClientRect()
  const b = el.getBoundingClientRect()
  return { x: (b.left - a.left + b.width / 2) / k, y: (b.top - a.top + b.height / 2) / k }
}

const at = (root: HTMLElement, w: Where) => (!w ? null : w instanceof Element ? stagePt(root, w) : w)

const spawn = (layer: HTMLElement, css: string, html = '') => {
  const d = layer.ownerDocument.createElement('div')
  d.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;will-change:transform,opacity;' + css
  d.innerHTML = html
  layer.appendChild(d)
  return d
}
const play = (d: HTMLElement, kf: Keyframe[], o: KeyframeAnimationOptions) => {
  const a = d.animate(kf, { fill: 'both', ...o })
  a.onfinish = a.oncancel = () => d.remove()
}

export function flyChips(root: HTMLElement, layer: HTMLElement, from: Where, to: Where, n: number, delay: number, dur: number) {
  const a = at(root, from)
  const b = at(root, to)
  if (!a || !b) return
  for (let k = 0; k < n; k++) {
    const [, c, s] = DENOM[(Math.random() * 6) | 0]
    const d = spawn(layer, `width:22px;height:12px;border-radius:50%;background:${chipBg(c, s)};box-shadow:0 2px 0 ${chipEdge(c)},0 4px 6px rgba(0,0,0,0.35);`)
    const jx = (Math.random() - 0.5) * 16
    const jy = (Math.random() - 0.5) * 8
    const mx = (a.x + b.x) / 2
    const my = Math.min(a.y, b.y) - 30
    play(d, [
      { transform: `translate(${a.x - 11}px,${a.y - 6}px) scale(.8)`, opacity: 0 },
      { transform: `translate(${mx - 11 + jx / 2}px,${my - 6}px) scale(1.1)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${b.x - 11 + jx}px,${b.y - 6 + jy}px) scale(1)`, opacity: 1, offset: 0.88 },
      { transform: `translate(${b.x - 11 + jx}px,${b.y - 6 + jy}px) scale(1)`, opacity: 0 }
    ], { duration: dur, delay: delay + k * 55, easing: 'cubic-bezier(.35,.6,.3,1)' })
  }
}

export function playRing(root: HTMLElement, layer: HTMLElement, where: Where, color: string, size: number, dur: number, delay = 0, width = 3) {
  const pt = at(root, where)
  if (!pt) return
  const d = spawn(layer, `width:${size}px;height:${size}px;border-radius:50%;border:${width}px solid ${color};box-sizing:border-box;`)
  const t = `translate(${pt.x - size / 2}px,${pt.y - size / 2}px)`
  play(d, [{ transform: `${t} scale(.55)`, opacity: 0.95 }, { transform: `${t} scale(1.9)`, opacity: 0 }], { duration: dur, delay, easing: 'cubic-bezier(.2,.7,.3,1)' })
}

export function playTag(root: HTMLElement, layer: HTMLElement, where: Where, text: string, css: string, dur: number, rise: number) {
  const pt = at(root, where)
  if (!pt) return
  const d = spawn(layer, `white-space:nowrap;${css}`)
  d.textContent = text
  const x = pt.x - d.offsetWidth / 2
  const y = pt.y - d.offsetHeight / 2 - 40
  play(d, [
    { transform: `translate(${x}px,${y + 10}px) scale(.4)`, opacity: 0 },
    { transform: `translate(${x}px,${y}px) scale(1.12)`, opacity: 1, offset: 0.18 },
    { transform: `translate(${x}px,${y}px) scale(1)`, opacity: 1, offset: 0.3 },
    { transform: `translate(${x}px,${y - rise}px) scale(1)`, opacity: 1, offset: 0.8 },
    { transform: `translate(${x}px,${y - rise - 8}px) scale(.96)`, opacity: 0 }
  ], { duration: dur, easing: 'ease-out' })
}

export function playAllIn(root: HTMLElement, layer: HTMLElement, seatEl: Element | null) {
  const pt = at(root, seatEl)
  const red = 'oklch(0.62 0.22 27)'
  const gold = 'oklch(0.82 0.15 85)'
  playRing(root, layer, pt, gold, 120, 800, 0, 4)
  playRing(root, layer, pt, red, 120, 900, 140, 3)
  playRing(root, layer, pt, gold, 120, 1000, 300, 2)
  playTag(root, layer, pt, 'ALL IN', `padding:6px 16px;border-radius:10px;background:linear-gradient(180deg, oklch(0.66 0.22 30), oklch(0.52 0.21 25));color:#fff;font:800 24px/1 -apple-system,'SF Pro Display',sans-serif;letter-spacing:0.06em;box-shadow:0 0 0 2px ${gold},0 10px 30px oklch(0.55 0.22 25 / 0.55);`, 1800, 24)
  if (pt)
    for (let k = 0; k < 12; k++) {
      const ang = Math.random() * Math.PI * 2
      const r = 60 + Math.random() * 70
      const [, c, sc] = DENOM[(Math.random() * 6) | 0]
      const d = spawn(layer, `width:18px;height:10px;border-radius:50%;background:${chipBg(c, sc)};box-shadow:0 2px 0 ${chipEdge(c)};`)
      play(d, [{ transform: `translate(${pt.x - 9}px,${pt.y - 5}px) rotate(0)`, opacity: 1 }, { transform: `translate(${pt.x - 9 + Math.cos(ang) * r}px,${pt.y - 5 + Math.sin(ang) * r}px) rotate(${Math.random() * 360}deg)`, opacity: 0 }], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.1,.8,.3,1)' })
    }
  // 震屏改写的是舞台根节点的 transform，所以缩放只能加在舞台外层
  root.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-5px,2px)' }, { transform: 'translate(5px,-2px)' }, { transform: 'translate(-3px,1px)' }, { transform: 'translate(2px,0)' }, { transform: 'translate(0,0)' }], { duration: 380, easing: 'ease-out' })
}

export function playRaise(root: HTMLElement, layer: HTMLElement, seatEl: Element | null, text: string) {
  const pt = at(root, seatEl)
  const amber = 'oklch(0.78 0.15 75)'
  playRing(root, layer, pt, amber, 90, 650)
  playTag(root, layer, pt, text, `padding:4px 12px;border-radius:999px;background:${amber};color:#1d1d1f;font:700 13px -apple-system,'PingFang SC',sans-serif;box-shadow:0 6px 16px rgba(0,0,0,0.25);`, 1300, 18)
}

export function playFold(root: HTMLElement, layer: HTMLElement, seatEl: Element | null, potEl: Element | null, back: Back) {
  const pt = at(root, seatEl)
  const pot = at(root, potEl)
  if (!pt || !pot) return
  const bg = backOf(back)
  for (let k = 0; k < 2; k++) {
    const d = spawn(layer, 'width:26px;height:36px;border-radius:4px;background:#fff;padding:2px;box-sizing:border-box;box-shadow:0 2px 5px rgba(0,0,0,0.3);', `<div style="width:100%;height:100%;border-radius:2px;background:${bg}"></div>`)
    play(d, [{ transform: `translate(${pt.x - 13 + k * 8}px,${pt.y - 50}px) rotate(${k ? 8 : -8}deg)`, opacity: 1 }, { transform: `translate(${pot.x - 13 + (k - 0.5) * 20}px,${pot.y + 20}px) rotate(${k ? 160 : -140}deg) scale(.6)`, opacity: 0 }], { duration: 520, delay: k * 60, easing: 'cubic-bezier(.4,0,.6,1)' })
  }
}

export function playWin(root: HTMLElement, layer: HTMLElement, potEl: Element | null, seatEl: Element | null) {
  flyChips(root, layer, potEl, seatEl, 8, 0, 720)
  playRing(root, layer, seatEl, 'oklch(0.72 0.16 150)', 100, 900, 600)
}

interface Snap {
  hand: number
  board: number
  bets: number[]
  folded: boolean[]
  allin: boolean[]
  status: string[]
  done: boolean
  bubbles: (string | undefined)[]
  betPos: (Pt | null)[]
}

// 各字段取自同一次视图推送；按字段依赖，调用方重渲染但视图没变时不会重复对比
export function useTableFx(
  root: RefObject<HTMLDivElement | null>,
  layer: RefObject<HTMLDivElement | null>,
  { handNo, board, seats, done }: { handNo: number; board: Card[]; seats: SeatView[]; done: boolean },
  fx: Fx,
  back: Back
) {
  const prev = useRef<Snap | null>(null)
  const winT = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(winT.current), [])

  useEffect(() => {
    const R = root.current
    const L = layer.current
    if (!R || !L) return
    const q = (sel: string) => R.querySelector<HTMLElement>(sel)
    const seatEl = (i: number) => q(`[data-seat="${i}"]`)
    const cur: Snap = {
      hand: handNo,
      board: board.length,
      bets: seats.map((s) => s.bet),
      folded: seats.map((s) => s.folded),
      allin: seats.map((s) => s.allin),
      status: seats.map((s) => s.status),
      done,
      bubbles: seats.map((s) => s.bubble),
      betPos: seats.map((_, i) => {
        const el = q(`[data-bet="${i}"]`)
        return el ? stagePt(R, el) : null
      })
    }
    const P = prev.current
    prev.current = cur
    if (fx === 'off' || !P) return

    // 发牌：新的一手，底牌从桌心飞向各座位
    if (cur.hand !== P.hand) {
      const row = q('[data-boardrow]')
      if (!row) return
      const c = stagePt(R, row)
      const boxes = [...R.querySelectorAll<HTMLElement>('[data-seat-cards]')]
      boxes.forEach((box, oi) =>
        [...box.children].forEach((child, r) => {
          const p = stagePt(R, child)
          const end = getComputedStyle(child).transform
          child.animate(
            [{ transform: `translate(${c.x - p.x}px,${c.y - p.y}px) rotate(-40deg) scale(.5)`, opacity: 0 }, { transform: end === 'none' ? 'none' : end, opacity: 1 }],
            { duration: 420, delay: (r * boxes.length + oi) * 85, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'backwards' }
          )
        })
      )
      return
    }
    if (cur.board > P.board) {
      ;[...R.querySelectorAll<HTMLElement>('[data-board-card]')].slice(P.board).forEach((c, k) =>
        c.animate(
          [{ transform: 'translateY(-46px) rotateY(95deg) scale(.8)', opacity: 0 }, { transform: 'translateY(-8px) rotateY(30deg) scale(1.04)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }],
          { duration: 520, delay: k * 130, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'backwards' }
        )
      )
    }
    cur.bubbles.forEach((b, i) => {
      if (!b || b === P.bubbles[i]) return
      const d = q(`[data-bubble-in="${i}"]`)
      d?.animate([{ transform: 'scale(.3) translateY(8px)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.3,1.3,.5,1)' })
    })
    if (fx !== 'full') return

    const pot = q('[data-pot]')
    seats.forEach((s, i) => {
      const seat = seatEl(i)
      if (cur.allin[i] && !P.allin[i]) playAllIn(R, L, seat)
      else if (cur.bets[i] > P.bets[i] && (s.lastAct === 'bet' || s.lastAct === 'raise') && s.status !== P.status[i]) playRaise(R, L, seat, s.status)
      if (cur.bets[i] > P.bets[i]) flyChips(R, L, seat, cur.betPos[i] ?? pot, cur.allin[i] ? 6 : 3, 0, 460)
      if (cur.folded[i] && !P.folded[i]) playFold(R, L, seat, pot, back)
      if (P.bets[i] > 0 && cur.bets[i] === 0 && P.betPos[i]) flyChips(R, L, P.betPos[i], pot, 3, 250, 480)
    })
    if (cur.done && !P.done) {
      clearTimeout(winT.current)
      winT.current = setTimeout(() => {
        seats.forEach((s, i) => {
          if (s.winner) playWin(R, L, q('[data-pot]'), seatEl(i))
        })
      }, 700)
    }
  }, [handNo, board, seats, done, fx, back, root, layer])
}
