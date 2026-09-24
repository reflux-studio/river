// 牌桌动效：对比前后两次视图，用 Web Animations 播放。移植自设计稿 runFx（River v2 脚本 486–588 行）。
// 完整：发牌、翻牌、气泡、筹码飞行、加注与全下特效、弃牌、赢家收筹码；精简：只保留发牌、翻牌和气泡；关闭：都不播
import { useEffect, useRef, type RefObject } from 'react'
import { backOf, chipBg, chipEdge, DENOM } from '@/lib/felt'
import type { Back, Fx, TableView } from '../../../../shared/types'

interface Snap {
  hand: number
  board: number
  bets: number[]
  folded: boolean[]
  allin: boolean[]
  status: string[]
  done: boolean
  bubbles: (string | undefined)[]
  betPos: ({ x: number; y: number } | null)[]
}

export function useTableFx(root: RefObject<HTMLDivElement | null>, layer: RefObject<HTMLDivElement | null>, v: TableView, fx: Fx, back: Back) {
  const prev = useRef<Snap | null>(null)
  const winT = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(winT.current), [])

  useEffect(() => {
    const R = root.current
    const L = layer.current
    if (!R || !L) return
    const q = (sel: string) => R.querySelector<HTMLElement>(sel)
    const rel = (el: Element) => {
      const a = R.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      return { x: b.left - a.left + b.width / 2, y: b.top - a.top + b.height / 2 }
    }
    const seatPt = (i: number) => {
      const el = q(`[data-seat="${i}"]`)
      return el ? rel(el) : null
    }
    const potPt = () => {
      const el = q('[data-pot]')
      return el ? rel(el) : null
    }
    const cur: Snap = {
      hand: v.handNo,
      board: v.board.length,
      bets: v.seats.map((s) => s.bet),
      folded: v.seats.map((s) => s.folded),
      allin: v.seats.map((s) => s.allin),
      status: v.seats.map((s) => s.status),
      done: v.done,
      bubbles: v.seats.map((s) => s.bubble),
      betPos: v.seats.map((_, i) => {
        const el = q(`[data-bet="${i}"]`)
        return el ? rel(el) : null
      })
    }
    const P = prev.current
    prev.current = cur
    if (fx === 'off' || !P) return

    const el = (css: string, html = '') => {
      const d = document.createElement('div')
      d.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;will-change:transform,opacity;' + css
      d.innerHTML = html
      L.appendChild(d)
      return d
    }
    const play = (d: HTMLElement, kf: Keyframe[], o: KeyframeAnimationOptions) => {
      const a = d.animate(kf, { fill: 'both', ...o })
      a.onfinish = a.oncancel = () => d.remove()
    }
    const chipFly = (a: { x: number; y: number } | null, b: { x: number; y: number } | null, n: number, delay: number, dur: number) => {
      if (!a || !b) return
      for (let k = 0; k < n; k++) {
        const [, c, s] = DENOM[(Math.random() * 6) | 0]
        const d = el(`width:22px;height:12px;border-radius:50%;background:${chipBg(c, s)};box-shadow:0 2px 0 ${chipEdge(c)},0 4px 6px rgba(0,0,0,0.35);`)
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
    const ring = (pt: { x: number; y: number } | null, color: string, size: number, dur: number, delay = 0, width = 3) => {
      if (!pt) return
      const d = el(`width:${size}px;height:${size}px;border-radius:50%;border:${width}px solid ${color};box-sizing:border-box;`)
      const at = `translate(${pt.x - size / 2}px,${pt.y - size / 2}px)`
      play(d, [{ transform: `${at} scale(.55)`, opacity: 0.95 }, { transform: `${at} scale(1.9)`, opacity: 0 }], { duration: dur, delay, easing: 'cubic-bezier(.2,.7,.3,1)' })
    }
    const tag = (pt: { x: number; y: number } | null, text: string, css: string, dur: number, rise: number) => {
      if (!pt) return
      const d = el(`white-space:nowrap;${css}`, text)
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

    // 发牌：新的一手，底牌从桌心飞向各座位
    if (cur.hand !== P.hand) {
      const row = q('[data-boardrow]')
      if (!row) return
      const c = rel(row)
      const boxes = [...R.querySelectorAll<HTMLElement>('[data-seat-cards]')]
      boxes.forEach((box, oi) =>
        [...box.children].forEach((child, r) => {
          const p = rel(child)
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

    const pot = potPt()
    v.seats.forEach((s, i) => {
      const pt = seatPt(i)
      if (cur.allin[i] && !P.allin[i]) {
        const red = 'oklch(0.62 0.22 27)'
        const gold = 'oklch(0.82 0.15 85)'
        ring(pt, gold, 120, 800, 0, 4)
        ring(pt, red, 120, 900, 140, 3)
        ring(pt, gold, 120, 1000, 300, 2)
        tag(pt, 'ALL IN', `padding:6px 16px;border-radius:10px;background:linear-gradient(180deg, oklch(0.66 0.22 30), oklch(0.52 0.21 25));color:#fff;font:800 24px/1 -apple-system,'SF Pro Display',sans-serif;letter-spacing:0.06em;box-shadow:0 0 0 2px ${gold},0 10px 30px oklch(0.55 0.22 25 / 0.55);`, 1800, 24)
        if (pt)
          for (let k = 0; k < 12; k++) {
            const ang = Math.random() * Math.PI * 2
            const r = 60 + Math.random() * 70
            const [, c, sc] = DENOM[(Math.random() * 6) | 0]
            const d = el(`width:18px;height:10px;border-radius:50%;background:${chipBg(c, sc)};box-shadow:0 2px 0 ${chipEdge(c)};`)
            play(d, [{ transform: `translate(${pt.x - 9}px,${pt.y - 5}px) rotate(0)`, opacity: 1 }, { transform: `translate(${pt.x - 9 + Math.cos(ang) * r}px,${pt.y - 5 + Math.sin(ang) * r}px) rotate(${Math.random() * 360}deg)`, opacity: 0 }], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.1,.8,.3,1)' })
          }
        R.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-5px,2px)' }, { transform: 'translate(5px,-2px)' }, { transform: 'translate(-3px,1px)' }, { transform: 'translate(2px,0)' }, { transform: 'translate(0,0)' }], { duration: 380, easing: 'ease-out' })
      } else if (cur.bets[i] > P.bets[i] && /^(加注|下注)/.test(s.status) && s.status !== P.status[i]) {
        const amber = 'oklch(0.78 0.15 75)'
        ring(pt, amber, 90, 650)
        tag(pt, s.status, `padding:4px 12px;border-radius:999px;background:${amber};color:#1d1d1f;font:700 13px -apple-system,'PingFang SC',sans-serif;box-shadow:0 6px 16px rgba(0,0,0,0.25);`, 1300, 18)
      }
      if (cur.bets[i] > P.bets[i]) chipFly(pt, cur.betPos[i] ?? pot, cur.allin[i] ? 6 : 3, 0, 460)
      if (cur.folded[i] && !P.folded[i] && pt && pot) {
        const bg = backOf(back)
        for (let k = 0; k < 2; k++) {
          const d = el('width:26px;height:36px;border-radius:4px;background:#fff;padding:2px;box-sizing:border-box;box-shadow:0 2px 5px rgba(0,0,0,0.3);', `<div style="width:100%;height:100%;border-radius:2px;background:${bg}"></div>`)
          play(d, [{ transform: `translate(${pt.x - 13 + k * 8}px,${pt.y - 50}px) rotate(${k ? 8 : -8}deg)`, opacity: 1 }, { transform: `translate(${pot.x - 13 + (k - 0.5) * 20}px,${pot.y + 20}px) rotate(${k ? 160 : -140}deg) scale(.6)`, opacity: 0 }], { duration: 520, delay: k * 60, easing: 'cubic-bezier(.4,0,.6,1)' })
        }
      }
      if (P.bets[i] > 0 && cur.bets[i] === 0 && P.betPos[i]) chipFly(P.betPos[i], pot, 3, 250, 480)
    })
    if (cur.done && !P.done) {
      clearTimeout(winT.current)
      winT.current = setTimeout(() => {
        v.seats.forEach((s, i) => {
          if (!s.winner) return
          const pt = seatPt(i)
          chipFly(potPt(), pt, 8, 0, 720)
          ring(pt, 'oklch(0.72 0.16 150)', 100, 900, 600)
        })
      }, 700)
    }
  }, [v, fx, back, root, layer])
}
