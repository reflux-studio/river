import type { Card } from '../../shared/types'

// 规则取自原型（River.dc.html 第 589–590 行）。先截断再检查：截断会在末尾造出新的词边界
// （底牌 5 时“加50”截成“加5”），检查的必须是最终发出的文本。
export function filterSay(text: string, hole: Card[]): string | null {
  const say = text.trim().slice(0, 40)
  const leaks = hole.some((c) => {
    const r = c[0] === 'T' ? '10' : c[0]
    // 字母点数前一字符为“老”时是称呼（老K），不算泄牌
    return /\d/.test(r)
      ? new RegExp(`(^|[^\\d])${r}([^\\d]|$)`).test(say)
      : new RegExp(`(^|[^A-Za-z老])${r}([^A-Za-z]|$)`).test(say)
  })
  if (leaks || /[♠♥♦♣]|口袋|底牌是|我有一对|对子/.test(say)) return null
  return say || null
}
