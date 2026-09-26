// 生成内置价格快照（CI 构建前运行）：只保留 models.dev 中每个模型的输入、输出、缓存读取单价（美元 / 百万 token）
import { writeFileSync } from 'node:fs'

const res = await fetch('https://models.dev/api.json')
if (!res.ok) throw new Error(`models.dev ${res.status}`)
const api = await res.json()
const prices = {}
for (const [kind, p] of Object.entries(api)) {
  for (const [id, m] of Object.entries(p.models ?? {})) {
    const c = m.cost
    if (!c || typeof c.input !== 'number' || typeof c.output !== 'number') continue
    ;(prices[kind] ??= {})[id] = typeof c.cache_read === 'number' ? [c.input, c.output, c.cache_read] : [c.input, c.output]
  }
}
writeFileSync(new URL('../src/main/models/prices.json', import.meta.url), JSON.stringify({ at: Date.now(), prices }) + '\n')
console.log('priced models:', Object.values(prices).reduce((a, x) => a + Object.keys(x).length, 0))
