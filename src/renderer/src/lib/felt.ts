// 桌面外观与筹码的取值，照搬设计稿 River v2（脚本 395–415 行）
import type { Back, Felt, Settings } from '../../../shared/types'

export const FELTS: { k: Exclude<Felt, 'custom'>; n: string; felt: string; rail: string; dark: boolean }[] = [
  { k: 'green', n: '经典绿', felt: 'oklch(0.47 0.1 158)', rail: '#3a2a1f', dark: true },
  { k: 'blue', n: '深海蓝', felt: 'oklch(0.43 0.09 248)', rail: '#1b1e26', dark: true },
  { k: 'wine', n: '酒红', felt: 'oklch(0.42 0.12 18)', rail: '#2b1b18', dark: true },
  { k: 'graphite', n: '石墨', felt: 'oklch(0.35 0.012 260)', rail: '#131315', dark: true },
  { k: 'paper', n: '素白', felt: '#eeeeea', rail: '#dcdcd7', dark: false }
]

export const BACKS: { k: Back; c: string }[] = [
  { k: 'red', c: 'oklch(0.5 0.17 25)' },
  { k: 'blue', c: 'oklch(0.45 0.13 255)' },
  { k: 'black', c: '#2a2a2e' },
  { k: 'green', c: 'oklch(0.48 0.1 160)' }
]

export const backPattern = (c: string) =>
  `repeating-linear-gradient(45deg, rgba(255,255,255,0.17) 0 1.5px, transparent 1.5px 5px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.17) 0 1.5px, transparent 1.5px 5px), ${c}`

const hexLum = (h: string) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h || '')
  if (!m) return 0.3
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function feltOf(st: Pick<Settings, 'felt' | 'feltCustom'>) {
  if (st.felt === 'custom') return { felt: st.feltCustom, rail: `color-mix(in oklch, ${st.feltCustom}, black 62%)`, dark: hexLum(st.feltCustom) < 0.62 }
  return FELTS.find((f) => f.k === st.felt) ?? FELTS[0]
}

export const backOf = (k: Back) => backPattern((BACKS.find((b) => b.k === k) ?? BACKS[0]).c)

export const RAINBOW = 'conic-gradient(oklch(0.6 0.15 25), oklch(0.75 0.15 90), oklch(0.6 0.12 160), oklch(0.55 0.12 250), oklch(0.55 0.15 320), oklch(0.6 0.15 25))'

// 面额、主色、镶边色
export const DENOM: [number, string, string][] = [
  [5000, 'oklch(0.52 0.14 250)', '#fff'], [1000, 'oklch(0.78 0.14 80)', '#fff'], [500, 'oklch(0.46 0.16 300)', '#fff'],
  [100, '#26262a', '#fff'], [25, 'oklch(0.55 0.14 150)', '#fff'], [5, 'oklch(0.55 0.2 27)', '#fff'], [1, '#f2efe8', 'oklch(0.5 0.15 250)']
]
export const chipBg = (c: string, s: string) =>
  `radial-gradient(ellipse at center, ${c} 0 38%, ${s} 38% 45%, ${c} 45% 58%, transparent 59%), repeating-conic-gradient(${c} 0deg 30deg, ${s} 30deg 45deg)`
export const chipEdge = (c: string) => `color-mix(in oklch, ${c}, black 38%)`

// 按面额拆成最多 4 堆、每堆最多 8 枚
export function stacks(amount: number) {
  let left = Math.max(0, Math.round(amount))
  const out: { c: string; s: string; n: number }[] = []
  for (const [v, c, s] of DENOM) {
    const n = Math.floor(left / v)
    if (!n) continue
    left -= n * v
    out.push({ c, s, n: Math.min(n, 8) })
  }
  return out.slice(0, 4)
}
